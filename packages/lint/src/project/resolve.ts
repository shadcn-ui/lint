// Resolves specifiers the way the project's own tooling does, so a
// project the bundler understands is one the linter understands.

import * as fs from "node:fs"
import * as path from "node:path"

import {
  dirOf,
  findUp,
  isDirectory,
  isFile,
  memoize,
  mtimeOf,
  realpath,
} from "./fs"

// Single-file components last: an extensionless import of one is rare
// (Svelte and Vite want the extension) and never shadows a script.
const EXTENSIONS = [
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".mjs",
  ".cjs",
  ".css",
  ".svelte",
  ".vue",
]

// nodenext and bundler resolution import "./button.js" for button.tsx.
const SOURCE_FOR_JS: Record<string, string[]> = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts", ".ts"],
  ".cjs": [".cts", ".ts"],
}

export function readJsonc(file: string) {
  let text: string
  try {
    text = fs.readFileSync(file, "utf-8")
  } catch {
    return null
  }
  let out = ""
  let i = 0
  let quote: string | null = null
  while (i < text.length) {
    const ch = text[i]
    const next = text[i + 1]
    if (quote) {
      out += ch
      if (ch === "\\") {
        out += next ?? ""
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i++
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      out += ch
      i++
      continue
    }
    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++
      continue
    }
    if (ch === "/" && next === "*") {
      i += 2
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++
      i += 2
      continue
    }
    out += ch
    i++
  }
  out = out.replace(/,(\s*[}\]])/g, "$1")
  try {
    return JSON.parse(out)
  } catch {
    return null
  }
}

export { findUp }

export function packageRoot(fromFile: string) {
  const file = findUp(dirOf(fromFile), "package.json")
  return file ? path.dirname(file) : null
}

// The text `*` captured, "" for an exact match, or null.
function matchPattern(pattern: string, value: string) {
  const star = pattern.indexOf("*")
  if (star === -1) return pattern === value ? "" : null
  const prefix = pattern.slice(0, star)
  const suffix = pattern.slice(star + 1)
  if (
    value.length < prefix.length + suffix.length ||
    !value.startsWith(prefix) ||
    !value.endsWith(suffix)
  )
    return null
  return value.slice(prefix.length, value.length - suffix.length)
}

function expand(target: string, captured: string) {
  return target.replace("*", captured)
}

// Each entry keeps the directory its own tsconfig resolves against, and
// the signature covers the whole `extends` chain.
type PathEntry = { pattern: string; targets: string[]; base: string }

const tsconfigCache = new Map<
  string,
  { signature: string; files: string[]; entries: PathEntry[] }
>()

function signatureOf(files: string[]) {
  return files.map((file) => `${file}:${mtimeOf(file) ?? "missing"}`).join("|")
}

function readTsconfigChain(
  file: string,
  visiting: Set<string>,
  files: string[]
): PathEntry[] {
  if (visiting.has(file) || visiting.size > 8) return []
  visiting.add(file)
  files.push(file)
  const json = readJsonc(file)
  if (!json || typeof json !== "object") return []
  const dir = path.dirname(file)
  const options = json.compilerOptions ?? {}
  const base = options.baseUrl ? path.resolve(dir, options.baseUrl) : dir
  const own: PathEntry[] = Object.entries(options.paths ?? {}).map(
    ([pattern, targets]) => ({
      pattern,
      targets: Array.isArray(targets) ? targets.map(String) : [],
      base,
    })
  )
  const parents = ([] as string[]).concat(json.extends ?? [])
  const inherited = parents.flatMap((parent) => {
    // A tsconfig's own `paths` never apply to its `extends`.
    const resolved = resolveFile(String(parent), dir, dir, [".json"], {
      skipPaths: true,
    })
    return resolved ? readTsconfigChain(resolved, visiting, files) : []
  })
  return [...own, ...inherited]
}

export function tsconfigPaths(rootDir: string) {
  const file = ["tsconfig.json", "jsconfig.json"]
    .map((name) => path.join(rootDir, name))
    .find((candidate) => isFile(candidate))
  if (!file) return []
  // An empty file list is the seed below, which never validates.
  const cached = tsconfigCache.get(file)
  if (cached?.files.length && signatureOf(cached.files) === cached.signature) {
    return cached.entries
  }
  // Seed before reading so a cycle through `extends` terminates.
  tsconfigCache.set(file, { signature: "", files: [], entries: [] })
  const files: string[] = []
  const entries = readTsconfigChain(file, new Set(), files)
  tsconfigCache.set(file, { signature: signatureOf(files), files, entries })
  return entries
}

const packageJsonCache = new Map<string, { mtimeMs: number; json: any }>()

function readPackageJson(dir: string) {
  const file = path.join(dir, "package.json")
  const mtimeMs = mtimeOf(file)
  if (mtimeMs === null) return null
  const cached = packageJsonCache.get(file)
  if (cached && cached.mtimeMs === mtimeMs) return cached.json
  const json = readJsonc(file)
  packageJsonCache.set(file, { mtimeMs, json })
  return json
}

function pickTarget(value: any): string | null {
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    for (const item of value) {
      const picked = pickTarget(item)
      if (picked) return picked
    }
    return null
  }
  if (value && typeof value === "object") {
    for (const key of ["import", "default", "require", "node", "types"]) {
      if (key in value) {
        const picked = pickTarget(value[key])
        if (picked) return picked
      }
    }
    for (const key of Object.keys(value)) {
      if (key.startsWith(".")) continue
      const picked = pickTarget(value[key])
      if (picked) return picked
    }
  }
  return null
}

// Through an exports/imports map, longest key first.
function mapSubpath(map: Record<string, any>, subpath: string) {
  const keys = Object.keys(map)
    .filter((key) => key.startsWith(".") || key.startsWith("#"))
    .sort((a, b) => b.length - a.length)
  const out: string[] = []
  for (const key of keys) {
    const captured = matchPattern(key, subpath)
    if (captured === null) continue
    const target = pickTarget(map[key])
    if (target) out.push(expand(target, captured))
  }
  return out
}

function packageDirectory(name: string, fromDir: string) {
  const found = findUp(fromDir, path.join("node_modules", name))
  return found ? realpath(found) : null
}

// A package that refers to itself by name, the way a monorepo's ui
// package points aliases.ui at "@workspace/ui/components": Node reads
// that through the enclosing package.json, so the linter does too.
function selfPackageDirectory(name: string, fromDir: string) {
  const manifest = findUp(fromDir, "package.json")
  if (!manifest) return null
  const dir = path.dirname(manifest)
  return readPackageJson(dir)?.name === name ? realpath(dir) : null
}

function splitPackageSpecifier(spec: string) {
  const parts = spec.split("/")
  const nameLength = spec.startsWith("@") ? 2 : 1
  if (parts.length < nameLength) return null
  return {
    name: parts.slice(0, nameLength).join("/"),
    subpath: parts.slice(nameLength).join("/"),
  }
}

type ResolveOptions = {
  skipPaths?: boolean
}

// In priority order, before extension probing. `rootDir` is the project
// root that owns tsconfig and package.json.
export function candidatesFor(
  spec: string,
  fromDir: string,
  rootDir: string,
  options: ResolveOptions = {}
) {
  const out: string[] = []
  if (
    spec.startsWith("./") ||
    spec.startsWith("../") ||
    spec === "." ||
    spec === ".."
  ) {
    out.push(path.resolve(fromDir, spec))
    return out
  }
  if (path.isAbsolute(spec)) {
    out.push(spec)
    return out
  }
  if (!options.skipPaths) {
    for (const entry of tsconfigPaths(rootDir)) {
      const captured = matchPattern(entry.pattern, spec)
      if (captured === null) continue
      for (const target of entry.targets) {
        out.push(path.resolve(entry.base, expand(target, captured)))
      }
    }
  }
  if (spec.startsWith("#")) {
    const imports = readPackageJson(rootDir)?.imports
    if (imports && typeof imports === "object") {
      for (const target of mapSubpath(imports, spec)) {
        out.push(path.resolve(rootDir, target))
      }
    }
    return out
  }
  const convention = spec.match(/^[@~]\/(.*)$/)
  if (convention) {
    out.push(path.join(rootDir, convention[1]))
    out.push(path.join(rootDir, "src", convention[1]))
    return out
  }
  // SvelteKit's `$lib`, when no generated tsconfig maps it.
  const kit = spec.match(/^\$lib(?:\/(.*))?$/)
  if (kit) {
    out.push(path.join(rootDir, "src/lib", kit[1] ?? ""))
    return out
  }
  const pkg = splitPackageSpecifier(spec)
  if (!pkg) return out
  const dir =
    selfPackageDirectory(pkg.name, rootDir) ??
    selfPackageDirectory(pkg.name, fromDir) ??
    packageDirectory(pkg.name, rootDir) ??
    packageDirectory(pkg.name, fromDir)
  if (!dir) return out
  const subpath = pkg.subpath ? `./${pkg.subpath}` : "."
  const exportsMap = readPackageJson(dir)?.exports
  if (exportsMap && typeof exportsMap === "object") {
    for (const target of mapSubpath(exportsMap, subpath)) {
      out.push(path.resolve(dir, target))
    }
    // A directory alias against a wildcard key ("./components/*").
    for (const target of mapSubpath(exportsMap, `${subpath}/*`)) {
      out.push(path.dirname(path.resolve(dir, target)))
    }
  }
  if (pkg.subpath) {
    out.push(path.join(dir, pkg.subpath))
    out.push(path.join(dir, "src", pkg.subpath))
  } else {
    out.push(dir)
    out.push(path.join(dir, "src"))
  }
  return out
}

export function resolveDirectory(
  spec: string,
  fromDir: string,
  rootDir: string
) {
  return memoize(`resolve-dir:${fromDir}\u0000${rootDir}\u0000${spec}`, () => {
    for (const candidate of candidatesFor(spec, fromDir, rootDir)) {
      if (isDirectory(candidate)) {
        return realpath(candidate)
      }
    }
    return null
  })
}

function resolveFileUncached(
  spec: string,
  fromDir: string,
  rootDir: string,
  extensions = EXTENSIONS,
  options: ResolveOptions = {}
) {
  for (const candidate of candidatesFor(spec, fromDir, rootDir, options)) {
    if (isFile(candidate)) return realpath(candidate)
    const ext = path.extname(candidate)
    for (const source of SOURCE_FOR_JS[ext] ?? []) {
      const swapped = candidate.slice(0, -ext.length) + source
      if (isFile(swapped)) return realpath(swapped)
    }
    for (const suffix of extensions) {
      if (isFile(candidate + suffix)) return realpath(candidate + suffix)
    }
    for (const suffix of extensions) {
      const index = path.join(candidate, `index${suffix}`)
      if (isFile(index)) return realpath(index)
    }
  }
  return null
}

// Every file in a directory imports the same specifiers.
export function resolveFile(
  spec: string,
  fromDir: string,
  rootDir: string,
  extensions = EXTENSIONS,
  options: ResolveOptions = {}
) {
  const key = `resolve:${fromDir}|${rootDir}|${spec}|${extensions.join(",")}|${options.skipPaths ? 1 : 0}`
  return memoize(key, () =>
    resolveFileUncached(spec, fromDir, rootDir, extensions, options)
  )
}
