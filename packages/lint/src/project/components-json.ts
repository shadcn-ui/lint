// Reads a project's components.json, falling back to the nearest
// package.json. Everything the linter knows about a project derives from
// here, so there is nothing to configure.

import * as path from "node:path"

import { dirOf, findUp, isDirectory, memoize, mtimeOf } from "./fs"
import { packageRoot, readJsonc, resolveDirectory } from "./resolve"
import { warnOnce } from "./warn"

export type Project = {
  dir: string
  file: string | null
  // Owns tsconfig paths and package imports.
  root: string
  aliases: Record<string, string>
  cssFile: string | null
}

const cache = new Map<string, { mtimeMs: number; project: Project | null }>()

function readProject(file: string): Project | null {
  const dir = path.dirname(file)
  const json = readJsonc(file)
  if (!json || typeof json !== "object") {
    warnOnce(
      `parse:${file}`,
      `${file} could not be parsed, so its aliases and theme are ignored and the project is read from package.json instead. Fix the JSON.`
    )
    return null
  }
  const css = json.tailwind?.css
  return {
    dir,
    file,
    root: packageRoot(file) ?? dir,
    aliases: readAliases(file, json.aliases),
    cssFile: typeof css === "string" && css ? path.resolve(dir, css) : null,
  }
}

// A `"ui": true` must not crash every rule: report it once and read the
// project as if the alias were absent.
function readAliases(file: string, aliases: unknown) {
  if (
    aliases === undefined ||
    aliases === null ||
    typeof aliases !== "object" ||
    Array.isArray(aliases)
  ) {
    if (aliases !== undefined && aliases !== null) {
      warnOnce(
        `aliases:${file}`,
        `The aliases in ${file} are not an object, so they are ignored and design-system components are looked for at the default alias. Make aliases an object like { "ui": "@/components/ui" }.`
      )
    }
    return {}
  }
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(aliases)) {
    if (typeof value === "string") {
      out[key] = value
      continue
    }
    if (key !== "ui" && key !== "components") continue
    warnOnce(
      `aliases.${key}:${file}`,
      `aliases.${key} in ${file} is not a string, so it is ignored. Set it to an import path like "@/components${key === "ui" ? "/ui" : ""}".`
    )
  }
  return out
}

// Every rule asks this for every file, so it is memoized per directory.
export function findProject(fromFile: string) {
  const dir = dirOf(fromFile)
  return memoize(`project:${dir}`, () => {
    const file = findUp(dir, "components.json")
    if (!file) return null
    const mtimeMs = mtimeOf(file) ?? 0
    const cached = cache.get(file)
    if (cached && cached.mtimeMs === mtimeMs) return cached.project
    const project = readProject(file)
    cache.set(file, { mtimeMs, project })
    return project
  })
}

export function projectFor(fromFile: string): Project | null {
  const project = findProject(fromFile)
  if (project) return project
  const root = packageRoot(fromFile)
  if (!root) return null
  return { dir: root, file: null, root, aliases: {}, cssFile: null }
}

// An alias to a directory that exists, through tsconfig paths, package
// imports and exports, and the "@/" convention. Failing those, a bare
// "src/" is a directory beside components.json, as the shadcn CLI reads it.
export function resolveAlias(project: Project, alias: string) {
  const resolved =
    resolveDirectory(alias, project.dir, project.root) ??
    (project.dir === project.root
      ? null
      : resolveDirectory(alias, project.dir, project.dir))
  if (resolved || path.isAbsolute(alias)) return resolved
  return resolveDirectory(`./${alias}`, project.dir, project.dir)
}

// Where the design-system components live. An alias that resolves to
// nothing is reported once: silently recognizing no components is the
// failure mode an enforcement tool must never have.
export function uiDirectory(project: Project) {
  if (project.file) {
    const alias =
      project.aliases.ui ?? `${project.aliases.components ?? "@/components"}/ui`
    const dir = resolveAlias(project, alias)
    if (dir) return dir
    warnOnce(
      `ui:${project.file}`,
      `The ui alias "${alias}" in ${project.file} does not resolve to a directory, so design-system components are not recognized in this project. Fix aliases.ui, add the alias to tsconfig paths or package exports, or set componentImports.`
    )
    return null
  }
  for (const candidate of ["components/ui", "src/components/ui"]) {
    const dir = path.join(project.dir, candidate)
    if (isDirectory(dir)) return dir
  }
  return null
}
