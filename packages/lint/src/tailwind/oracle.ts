// Asks the project's own Tailwind whether a class generates CSS, from a
// design system built the way Tailwind builds it, imports and plugins
// included. Runs in a worker thread (worker.ts), reached synchronously
// through client.ts; everything here is async and thread-agnostic.

import * as fs from "node:fs"
import { createRequire } from "node:module"
import * as path from "node:path"
import { pathToFileURL } from "node:url"

import { splitVariants } from "../grammar/classes"
import { didYouMean } from "../grammar/similar"

type DesignSystem = {
  theme?: { prefix?: string | null }
  candidatesToCss(candidates: string[]): (string | null)[]
  getClassList(): (string | [string, unknown])[]
  getVariants(): {
    name: string
    hasDash: boolean
    isArbitrary: boolean
    values: string[]
  }[]
}

type Tailwind = {
  __unstable__loadDesignSystem(
    css: string,
    options: {
      base: string
      loadStylesheet(
        id: string,
        base: string
      ): Promise<{ base: string; content: string }>
      loadModule(
        id: string,
        base: string,
        hint: string
      ): Promise<{ base: string; module: unknown }>
    }
  ): Promise<DesignSystem>
}

type Loaded = {
  ds: DesignSystem
  files: string[]
  modules: number
  prefix: string | null
  signature: string
  checkedAt: number
  generation: number
  classNames: string[] | null
  staticVariants: string[]
  functionalVariants: string[]
}

export type Unknown = {
  token: string
  suggestion: string | null
  // True means the utility is valid and a variant is at fault.
  baseKnown: boolean
}

export type Answer =
  | {
      ok: true
      generation: number
      // @plugin or @config: rebuilt in a fresh worker so modules reload.
      hasModules: boolean
      unknown: Unknown[]
    }
  | { ok: false; reason: string }

const SIGNATURE_TTL = 1000

const loaded = new Map<string, Loaded>()
let generations = 0

function resolveFrom(base: string, id: string) {
  return createRequire(path.join(base, "noop.js")).resolve(id)
}

// Resolved from the stylesheet outward: ours is not a substitute for the
// version that actually generates the project's CSS.
async function loadTailwind(dir: string): Promise<Tailwind | null> {
  for (const from of [dir, process.cwd()]) {
    let resolved: string
    try {
      resolved = resolveFrom(from, "tailwindcss")
    } catch {
      continue
    }
    // Tailwind's entry is CommonJS: its API may sit on `default`.
    const mod = (await import(pathToFileURL(resolved).href)) as {
      default?: Partial<Tailwind>
    } & Partial<Tailwind>
    const api =
      typeof mod.__unstable__loadDesignSystem === "function"
        ? mod
        : typeof mod.default?.__unstable__loadDesignSystem === "function"
          ? mod.default
          : null
    if (api) return api as Tailwind
    throw new Error(
      `${resolved} is not Tailwind v4 (no __unstable__loadDesignSystem)`
    )
  }
  return null
}

function existingFile(candidate: string) {
  try {
    return fs.statSync(candidate).isFile() ? candidate : null
  } catch {
    return null
  }
}

function stylesheetAt(dir: string, name: string) {
  const base = path.join(dir, name)
  return (
    existingFile(base) ??
    existingFile(`${base}.css`) ??
    existingFile(path.join(base, "index.css"))
  )
}

function styleTarget(entry: unknown): string | null {
  if (typeof entry === "string") return entry
  if (!entry || typeof entry !== "object") return null
  const record = entry as Record<string, unknown>
  for (const key of ["style", "default"]) {
    const target = styleTarget(record[key])
    if (target) return target
  }
  return null
}

// The exports entry for a subpath: the exact key, else the longest
// pattern key whose `*` matches, expanded the way Node expands it, so
// `"./*.css": "./dist/*.css"` serves `demo-widgets/styles.css`.
function exportedStyle(exports: Record<string, unknown>, subpath: string) {
  const exact = styleTarget(exports[`./${subpath}`])
  if (exact) return exact
  const patterns = Object.keys(exports)
    .filter((key) => key.startsWith("./") && key.includes("*"))
    .sort((a, b) => b.length - a.length)
  for (const key of patterns) {
    const star = key.indexOf("*")
    const prefix = key.slice(2, star)
    const suffix = key.slice(star + 1)
    if (
      subpath.length < prefix.length + suffix.length ||
      !subpath.startsWith(prefix) ||
      !subpath.endsWith(suffix)
    )
      continue
    const target = styleTarget(exports[key])
    if (!target) continue
    return target.replace(
      "*",
      subpath.slice(prefix.length, subpath.length - suffix.length)
    )
  }
  return null
}

function packageDirectory(base: string, name: string) {
  let dir = base
  for (let depth = 0; depth < 32; depth++) {
    const candidate = path.join(dir, "node_modules", name)
    if (existingFile(path.join(candidate, "package.json"))) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

// Resolves an @import the way Tailwind's bundler does. Node's own
// resolver cannot: tw-animate-css exports only a style condition.
export function resolveStylesheet(base: string, id: string) {
  if (id === "tailwindcss")
    return resolveStylesheet(base, "tailwindcss/index.css")
  if (id.startsWith(".") || path.isAbsolute(id)) {
    return stylesheetAt(path.dirname(path.resolve(base, id)), path.basename(id))
  }
  const match = id.match(/^(@[^/]+\/[^/]+|[^/]+)(?:\/(.*))?$/)
  if (!match) return null
  const [, name, subpath] = match
  const pkgDir = packageDirectory(base, name)
  if (!pkgDir) return null
  let pkg: Record<string, unknown> = {}
  try {
    pkg = JSON.parse(
      fs.readFileSync(path.join(pkgDir, "package.json"), "utf-8")
    )
  } catch {
    // A package without a readable manifest still has files.
  }
  const exports = pkg.exports
  if (subpath) {
    const target =
      exports && typeof exports === "object"
        ? exportedStyle(exports as Record<string, unknown>, subpath)
        : null
    if (target) return existingFile(path.join(pkgDir, target))
    return stylesheetAt(
      path.dirname(path.join(pkgDir, subpath)),
      path.basename(subpath)
    )
  }
  const root =
    typeof exports === "string"
      ? exports
      : exports && typeof exports === "object"
        ? styleTarget((exports as Record<string, unknown>)["."] ?? exports)
        : null
  for (const target of [root, pkg.style, pkg.main]) {
    if (typeof target !== "string") continue
    const file = existingFile(path.join(pkgDir, target))
    if (file) return file
  }
  return stylesheetAt(pkgDir, "index")
}

// The real path of a file reached through a symlink: what its own
// imports resolve from.
function realpathOf(file: string) {
  try {
    return fs.realpathSync.native(file)
  } catch {
    return file
  }
}

function mtimeOf(file: string) {
  try {
    return fs.statSync(file).mtimeMs
  } catch {
    return null
  }
}

function signatureOf(files: string[]) {
  return files.map((file) => `${file}:${mtimeOf(file) ?? "missing"}`).join("|")
}

async function build(cssFile: string): Promise<Loaded> {
  const dir = path.dirname(cssFile)
  const tailwind = await loadTailwind(dir)
  if (!tailwind) {
    throw new Error(`tailwindcss v4 could not be resolved from ${dir}`)
  }
  const files = [cssFile]
  let modules = 0
  const css = fs.readFileSync(cssFile, "utf-8")
  const ds = await tailwind.__unstable__loadDesignSystem(css, {
    base: dir,
    async loadStylesheet(id, base) {
      if (/^(?:https?:|data:)/.test(id)) return { base, content: "" }
      const resolved = resolveStylesheet(base, id)
      // Refusing to judge beats judging against half a theme.
      if (!resolved) {
        throw new Error(`@import "${id}" could not be resolved from ${base}`)
      }
      // A pnpm-installed package is a link into node_modules/.pnpm and its
      // own dependencies sit beside the real file, so the base for the
      // imports inside it is the directory that file really lives in.
      const file = realpathOf(resolved)
      files.push(file)
      return {
        base: path.dirname(file),
        content: fs.readFileSync(file, "utf-8"),
      }
    },
    async loadModule(id, base) {
      const resolved = resolveFrom(base, id)
      files.push(resolved)
      modules++
      // The module cache never forgets: key the URL by mtime.
      const url = pathToFileURL(resolved)
      url.searchParams.set("mtime", String(mtimeOf(resolved)))
      const mod = (await import(url.href)) as { default?: unknown }
      return { base: path.dirname(resolved), module: mod.default ?? mod }
    },
  })
  const variants = ds.getVariants()
  return {
    ds,
    files,
    modules,
    prefix: ds.theme?.prefix ?? null,
    signature: signatureOf(files),
    checkedAt: Date.now(),
    generation: ++generations,
    classNames: null,
    staticVariants: variants
      .filter((v) => !v.isArbitrary && !v.values.length)
      .map((v) => v.name),
    functionalVariants: variants
      .filter((v) => v.isArbitrary || v.values.length)
      .map((v) => v.name),
  }
}

async function designSystemFor(cssFile: string) {
  const cached = loaded.get(cssFile)
  const now = Date.now()
  if (cached) {
    if (now - cached.checkedAt < SIGNATURE_TTL) return cached
    if (signatureOf(cached.files) === cached.signature) {
      cached.checkedAt = now
      return cached
    }
  }
  const fresh = await build(cssFile)
  loaded.set(cssFile, fresh)
  return fresh
}

function classNamesOf(system: Loaded) {
  if (!system.classNames) {
    system.classNames = system.ds
      .getClassList()
      .map((entry) => (Array.isArray(entry) ? entry[0] : entry))
  }
  return system.classNames
}

function variantKnown(system: Loaded, variant: string) {
  const name = variant.replace(/\/.*$/, "")
  if (name.startsWith("[") || name.startsWith("@")) return true
  if (system.staticVariants.includes(name)) return true
  return system.functionalVariants.some(
    (prefix) => name === prefix || name.startsWith(`${prefix}-`)
  )
}

// A base utility that exists on its own means the variant is misspelled;
// otherwise the utility is, matched against every class Tailwind knows.
function suggestionFor(system: Loaded, candidate: string) {
  const { variants, base } = splitVariants(candidate)
  // With a prefix, the bare utility is only valid as tw:flex.
  const prefixed = system.prefix !== null && variants[0] === system.prefix
  const probe = prefixed ? `${system.prefix}:${base}` : base
  if (variants.length && system.ds.candidatesToCss([probe])[0] !== null) {
    let changed = false
    const fixed = variants.map((variant, i) => {
      if (prefixed && i === 0) return variant
      if (variantKnown(system, variant)) return variant
      const meant = didYouMean(variant, system.staticVariants, 1)
      if (!meant) return variant
      changed = true
      return meant
    })
    return changed ? [...fixed, base].join(":") : null
  }
  const bare = base.replace(/^!/, "").replace(/!$/, "").replace(/^-/, "")
  const meant = didYouMean(bare, classNamesOf(system))
  if (!meant) return null
  const rebuilt = base.replace(bare, meant)
  return [...variants, rebuilt].join(":")
}

// The project's prefix is a variant segment in source (tw:hover:flex) and
// must stay on the bare utility (tw:flex).
function baseKnownOf(system: Loaded, candidate: string) {
  const { variants, base } = splitVariants(candidate)
  if (!variants.length) return false
  const bare =
    system.prefix && variants[0] === system.prefix
      ? `${system.prefix}:${base}`
      : base
  if (variants.length === (bare === base ? 0 : 1)) return false
  return system.ds.candidatesToCss([bare])[0] !== null
}

export async function query(
  cssFile: string,
  candidates: string[]
): Promise<Answer> {
  let system: Loaded
  try {
    system = await designSystemFor(cssFile)
  } catch (error) {
    return { ok: false, reason: (error as Error).message }
  }
  const css = system.ds.candidatesToCss(candidates)
  const unknown: Unknown[] = []
  for (let i = 0; i < candidates.length; i++) {
    if (css[i] !== null) continue
    unknown.push({
      token: candidates[i],
      suggestion: suggestionFor(system, candidates[i]),
      baseKnown: baseKnownOf(system, candidates[i]),
    })
  }
  return {
    ok: true,
    generation: system.generation,
    hasModules: system.modules > 0,
    unknown,
  }
}

export function resetOracle() {
  loaded.clear()
}
