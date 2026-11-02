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

// A UNC path reaches the network on Windows: stat one and the OS sends
// the user's credentials to whatever host it names.
export function isUncPath(file: string) {
  return /^[\\/]{2}/.test(file)
}

export function isInside(dir: string, file: string) {
  const relative = path.relative(dir, file)
  return (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

// A UNC path outside the directories being linted. A project that lives
// on a share still reaches its own files.
export function isStrayUncPath(file: string, ...within: string[]) {
  return isUncPath(file) && !within.some((dir) => isInside(dir, file))
}

const BAD_SEGMENT = /^(?:\.|%2e){1,2}$|^node_modules$/i

// What Node refuses in a target or a `*` capture: walking up, reaching
// into node_modules, and percent-encoded separators.
function safeSegments(text: string) {
  return (
    !/%2f|%5c/i.test(text) &&
    !text.split(/[\\/]/).some((segment) => BAD_SEGMENT.test(segment))
  )
}

// An exports or imports target Node accepts as a file: "./" relative.
export function isPackageTarget(target: string) {
  return target.startsWith("./") && safeSegments(target.slice(2))
}

// The file a target names, expanded with its `*` capture, or null when
// either would leave the package. Node treats that as no match.
export function packageTarget(dir: string, target: string, captured = "") {
  if (!isPackageTarget(target) || !safeSegments(captured)) return null
  const file = path.resolve(dir, expand(target, captured))
  return isInside(dir, file) ? file : null
}

// An imports target may also name a package, never a path or a URL.
function isBareTarget(target: string) {
  return /^[^./\\#][^:\\]*$/.test(target)
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
  // TypeScript rejects a baseUrl, paths map or target that is not the
  // type it expects; here it is ignored, since path.resolve throws on a
  // non-string baseUrl.
  const base =
    typeof options.baseUrl === "string" && options.baseUrl
      ? path.resolve(dir, options.baseUrl)
      : dir
  const paths =
    options.paths &&
    typeof options.paths === "object" &&
    !Array.isArray(options.paths)
      ? options.paths
      : {}
  const own: PathEntry[] = Object.entries(paths).map(([pattern, targets]) => ({
    pattern,
    targets: Array.isArray(targets)
      ? targets.filter((target) => typeof target === "string")
      : [],
    base,
  }))
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

// Real exports nest conditions a few levels deep. Past this a manifest
// has no target, rather than one that overflows the stack to find.
export const MAX_CONDITION_DEPTH = 32

const PREFERRED_CONDITIONS = ["import", "default", "require", "node", "types"]

// The first target `valid` accepts, so an invalid one falls through to
// the next fallback. Each condition is tried once: tried again among the
// rest, a chain of `import` conditions with no target doubles the walk at
// every level.
function pickTarget(
  value: any,
  valid: (target: string) => boolean,
  depth = 0
): string | null {
  if (typeof value === "string") return valid(value) ? value : null
  if (depth >= MAX_CONDITION_DEPTH) return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const picked = pickTarget(item, valid, depth + 1)
      if (picked) return picked
    }
    return null
  }
  if (value && typeof value === "object") {
    for (const key of PREFERRED_CONDITIONS) {
      if (key in value) {
        const picked = pickTarget(value[key], valid, depth + 1)
        if (picked) return picked
      }
    }
    for (const key of Object.keys(value)) {
      if (key.startsWith(".") || PREFERRED_CONDITIONS.includes(key)) continue
      const picked = pickTarget(value[key], valid, depth + 1)
      if (picked) return picked
    }
  }
  return null
}

// Through an exports/imports map, longest key first: files inside `dir`,
// or with `bare`, package specifiers an imports map points at.
function mapSubpath(
  map: Record<string, any>,
  subpath: string,
  dir: string,
  bare = false
) {
  const keys = Object.keys(map)
    .filter((key) => key.startsWith(".") || key.startsWith("#"))
    .sort((a, b) => b.length - a.length)
  const out: { file?: string; spec?: string }[] = []
  for (const key of keys) {
    const captured = matchPattern(key, subpath)
    if (captured === null || !safeSegments(captured)) continue
    const target = pickTarget(
      map[key],
      (t) => isPackageTarget(t) || (bare && isBareTarget(t))
    )
    if (!target) continue
    if (!target.startsWith("./")) {
      out.push({ spec: expand(target, captured) })
      continue
    }
    const file = packageTarget(dir, target, captured)
    if (file) out.push({ file })
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
  return collectCandidates(spec, fromDir, rootDir, options).filter(
    (candidate) => !isStrayUncPath(candidate, rootDir, fromDir)
  )
}

function collectCandidates(
  spec: string,
  fromDir: string,
  rootDir: string,
  options: ResolveOptions
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
      for (const target of mapSubpath(imports, spec, rootDir, true)) {
        if (target.file) out.push(target.file)
        // A package target resolves as a package, never as a path.
        else if (target.spec) packageCandidates(target.spec, rootDir, out)
      }
      // A directory alias against a wildcard key ("#components/*").
      for (const target of mapSubpath(imports, `${spec}/*`, rootDir)) {
        if (target.file) out.push(path.dirname(target.file))
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
  packageCandidates(spec, rootDir, out, fromDir)
  return out
}

function packageCandidates(
  spec: string,
  rootDir: string,
  out: string[],
  fromDir = rootDir
) {
  const pkg = splitPackageSpecifier(spec)
  if (!pkg) return
  const dir =
    selfPackageDirectory(pkg.name, rootDir) ??
    selfPackageDirectory(pkg.name, fromDir) ??
    packageDirectory(pkg.name, rootDir) ??
    packageDirectory(pkg.name, fromDir)
  if (!dir) return
  const subpath = pkg.subpath ? `./${pkg.subpath}` : "."
  const exportsMap = readPackageJson(dir)?.exports
  if (exportsMap && typeof exportsMap === "object") {
    for (const target of mapSubpath(exportsMap, subpath, dir)) {
      if (target.file) out.push(target.file)
    }
    // A directory alias against a wildcard key ("./components/*").
    for (const target of mapSubpath(exportsMap, `${subpath}/*`, dir)) {
      if (target.file) out.push(path.dirname(target.file))
    }
  }
  // The package's own files, never a path that walks out of it.
  const own = pkg.subpath
    ? [path.join(dir, pkg.subpath), path.join(dir, "src", pkg.subpath)]
    : [dir, path.join(dir, "src")]
  for (const file of own) {
    if (isInside(dir, file)) out.push(file)
  }
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
