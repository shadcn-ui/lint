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
import {
  isInside,
  isPackageTarget,
  isStrayUncPath,
  packageRoot,
  packageTarget,
  resolveFile,
} from "../project/resolve"
import { parseImports } from "../project/theme"

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

type LoadModule = (
  id: string,
  base: string,
  onDependency: (file: string) => void
) => Promise<{ path: string; base: string; module: unknown }>

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
      // Known candidates that set a font size: text-body from an @config
      // fontSize reads as a color to a grammar that only knows the name.
      fontSizes: string[]
    }
  | { ok: false; reason: string }

const SIGNATURE_TTL = 1000

const FONT_SIZE = /(?:^|[;{\s])font-size\s*:/

// Far past any real class. Tailwind parses a candidate recursively, once
// per variant, and slows quadratically on a long value, so one hostile
// token could stall the worker or overflow its stack. A class past
// either limit is not judged, the way an arbitrary property is not.
const MAX_CANDIDATE_LENGTH = 10_000
const MAX_VARIANTS = 64

const loaded = new Map<string, Loaded>()
let generations = 0

function resolveFrom(base: string, id: string) {
  return createRequire(path.join(base, "noop.js")).resolve(id)
}

// The directories of the stylesheets that import Tailwind, reached
// through the entry's @imports. In a workspace the app's stylesheet may
// import a UI package's, and only that package depends on Tailwind.
function* tailwindImporters(cssFile: string) {
  const seen = new Set<string>()
  const queue = [cssFile]
  while (queue.length) {
    const file = queue.shift()!
    if (seen.has(file)) continue
    seen.add(file)
    let css: string
    try {
      css = fs.readFileSync(file, "utf-8")
    } catch {
      continue
    }
    for (const id of parseImports(css)) {
      if (id === "tailwindcss" || id.startsWith("tailwindcss/")) {
        yield path.dirname(file)
        continue
      }
      const resolved = resolveImport(path.dirname(file), id)
      if (resolved) queue.push(realpathOf(resolved))
    }
  }
}

function* tailwindBases(cssFile: string) {
  yield path.dirname(cssFile)
  yield* tailwindImporters(cssFile)
  yield process.cwd()
}

// Resolved from the stylesheet outward: ours is not a substitute for the
// version that actually generates the project's CSS.
async function loadTailwind(cssFile: string) {
  for (const from of tailwindBases(cssFile)) {
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
    if (api) return { api: api as Tailwind, resolved }
    throw new Error(
      `${resolved} is not Tailwind v4 (no __unstable__loadDesignSystem)`
    )
  }
  return null
}

// The loader the CLI, Vite and PostCSS plugins use for @config and
// @plugin. Its jiti takes what native import() refuses: extensionless
// relative imports and TypeScript beyond type stripping. Installed
// beside whichever of them the project uses, so it is looked for where
// Tailwind was found and in the directory Tailwind really lives in.
async function loadNodeLoader(cssFile: string, tailwind: string) {
  const bases = [...tailwindBases(cssFile), path.dirname(realpathOf(tailwind))]
  for (const from of bases) {
    let resolved: string
    try {
      resolved = resolveFrom(from, "@tailwindcss/node")
    } catch {
      continue
    }
    try {
      const mod = (await import(pathToFileURL(resolved).href)) as {
        loadModule?: unknown
        default?: { loadModule?: unknown }
      }
      const loader = mod.loadModule ?? mod.default?.loadModule
      if (typeof loader === "function") return loader as LoadModule
    } catch {
      // A broken install falls back to native import().
    }
  }
  return null
}

// Without @tailwindcss/node, Node's own import(). The module cache never
// forgets: key the URL by mtime.
async function importModule(id: string, base: string) {
  const resolved = resolveFrom(base, id)
  const url = pathToFileURL(resolved)
  url.searchParams.set("mtime", String(mtimeOf(resolved)))
  const mod = (await import(url.href)) as { default?: unknown }
  return {
    path: resolved,
    base: path.dirname(resolved),
    module: mod.default ?? mod,
  }
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

// Only a target Node accepts: one that would leave the package falls
// through to the next condition.
function styleTarget(entry: unknown): string | null {
  if (typeof entry === "string") return isPackageTarget(entry) ? entry : null
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
function exportedStyle(
  pkgDir: string,
  exports: Record<string, unknown>,
  subpath: string
) {
  const exact = styleTarget(exports[`./${subpath}`])
  if (exact) return packageTarget(pkgDir, exact)
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
    const file = packageTarget(
      pkgDir,
      target,
      subpath.slice(prefix.length, subpath.length - suffix.length)
    )
    if (file) return file
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
    const file = path.resolve(base, id)
    if (isStrayUncPath(id, base) || isStrayUncPath(file, base)) return null
    return stylesheetAt(path.dirname(file), path.basename(id))
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
        ? exportedStyle(pkgDir, exports as Record<string, unknown>, subpath)
        : null
    if (target) return existingFile(target)
    const file = path.join(pkgDir, subpath)
    if (!isInside(pkgDir, file)) return null
    return stylesheetAt(path.dirname(file), path.basename(subpath))
  }
  const root =
    typeof exports === "string"
      ? exports
      : exports && typeof exports === "object"
        ? styleTarget((exports as Record<string, unknown>)["."] ?? exports)
        : null
  const rootFile = root ? packageTarget(pkgDir, root) : null
  if (rootFile && existingFile(rootFile)) return rootFile
  for (const target of [pkg.style, pkg.main]) {
    if (typeof target !== "string") continue
    const joined = path.join(pkgDir, target)
    if (!isInside(pkgDir, joined)) continue
    const file = existingFile(joined)
    if (file) return file
  }
  return stylesheetAt(pkgDir, "index")
}

// The project's bundler resolves its aliases in CSS too: Vite builds
// `@import "@/styles/type.css"` through the same paths as a script.
function resolveImport(base: string, id: string) {
  return (
    resolveStylesheet(base, id) ??
    resolveFile(id, base, packageRoot(path.join(base, "index.css")) ?? base, [
      ".css",
    ])
  )
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
  const tailwind = await loadTailwind(cssFile)
  if (!tailwind) {
    throw new Error(`tailwindcss v4 could not be resolved from ${dir}`)
  }
  let loader: LoadModule | null | undefined
  const files = [cssFile]
  let modules = 0
  const css = fs.readFileSync(cssFile, "utf-8")
  const ds = await tailwind.api.__unstable__loadDesignSystem(css, {
    base: dir,
    async loadStylesheet(id, base) {
      if (/^(?:https?:|data:)/.test(id)) return { base, content: "" }
      const resolved = resolveImport(base, id)
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
      modules++
      if (loader === undefined) {
        loader = await loadNodeLoader(cssFile, tailwind.resolved)
      }
      // The files a config imports change its theme too.
      const result = loader
        ? await loader(id, base, (file) => files.push(file))
        : await importModule(id, base)
      files.push(result.path)
      return { base: result.base, module: result.module }
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

function checkable(candidate: string) {
  return (
    candidate.length <= MAX_CANDIDATE_LENGTH &&
    splitVariants(candidate).variants.length <= MAX_VARIANTS
  )
}

// Undefined when Tailwind throws on this one candidate, from a plugin or
// its own parser: that costs the candidate its answer, not the theme.
function cssOf(system: Loaded, candidate: string) {
  try {
    return system.ds.candidatesToCss([candidate])[0]
  } catch {
    return undefined
  }
}

function cssOfAll(system: Loaded, candidates: string[]) {
  try {
    return system.ds.candidatesToCss(candidates)
  } catch {
    return candidates.map((candidate) => cssOf(system, candidate))
  }
}

// A base utility that exists on its own means the variant is misspelled;
// otherwise the utility is, matched against every class Tailwind knows.
function suggestionFor(system: Loaded, candidate: string) {
  const { variants, base } = splitVariants(candidate)
  // With a prefix, the bare utility is only valid as tw:flex.
  const prefixed = system.prefix !== null && variants[0] === system.prefix
  const probe = prefixed ? `${system.prefix}:${base}` : base
  if (variants.length && typeof cssOf(system, probe) === "string") {
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
  return typeof cssOf(system, bare) === "string"
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
  const checked = candidates.filter(checkable)
  const css = cssOfAll(system, checked)
  const unknown: Unknown[] = []
  const fontSizes: string[] = []
  for (let i = 0; i < checked.length; i++) {
    if (css[i] === undefined) continue
    if (css[i] !== null) {
      if (FONT_SIZE.test(css[i]!)) fontSizes.push(checked[i])
      continue
    }
    unknown.push({
      token: checked[i],
      suggestion: suggestionFor(system, checked[i]),
      baseKnown: baseKnownOf(system, checked[i]),
    })
  }
  return {
    ok: true,
    generation: system.generation,
    hasModules: system.modules > 0,
    unknown,
    fontSizes,
  }
}

export function resetOracle() {
  loaded.clear()
}
