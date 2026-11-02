// Resolves a stylesheet's @import the way Tailwind's bundler does, for
// the theme reader and the oracle alike. A package's script entry is not
// a stylesheet: tailwindcss exports dist/lib.mjs under `import` and its
// CSS under `style`.

import * as fs from "node:fs"
import * as path from "node:path"

import { realpath } from "./fs"
import {
  isInside,
  isPackageTarget,
  isStrayUncPath,
  MAX_CONDITION_DEPTH,
  packageRoot,
  packageTarget,
  resolveFile,
} from "./resolve"

// The project's bundler resolves its aliases in CSS too: Vite builds
// `@import "@/styles/type.css"` through the same paths as a script. That
// resolver prefers a script condition, so only a stylesheet counts. A
// workspace package resolves past its node_modules link, as a script does.
export function resolveStylesheetImport(base: string, id: string) {
  const resolved = resolveStylesheet(base, id)
  if (resolved) return realpath(resolved)
  const file = resolveFile(
    id,
    base,
    packageRoot(path.join(base, "index.css")) ?? base,
    [".css"]
  )
  return file && isStylesheet(file) ? file : null
}

// Resolves an @import the way Tailwind's bundler does. Node's own
// resolver cannot: tw-animate-css exports only a style condition.
export function resolveStylesheet(base: string, id: string): string | null {
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
  // `main` names a script unless it names a stylesheet.
  const main =
    typeof pkg.main === "string" && isStylesheet(pkg.main) ? pkg.main : null
  for (const target of [pkg.style, main]) {
    if (typeof target !== "string") continue
    const joined = path.join(pkgDir, target)
    if (!isInside(pkgDir, joined)) continue
    const file = existingFile(joined)
    if (file) return file
  }
  return stylesheetAt(pkgDir, "index")
}

function isStylesheet(file: string) {
  return path.extname(file).toLowerCase() === ".css"
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
function styleTarget(entry: unknown, depth = 0): string | null {
  if (typeof entry === "string") return isPackageTarget(entry) ? entry : null
  if (!entry || typeof entry !== "object") return null
  if (depth >= MAX_CONDITION_DEPTH) return null
  const record = entry as Record<string, unknown>
  for (const key of ["style", "default"]) {
    const target = styleTarget(record[key], depth + 1)
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
