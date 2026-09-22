// The project's components by NAME, from the files in its ui directory,
// so a re-exported Button is still a Button.

import * as fs from "node:fs"
import * as path from "node:path"

import { projectFor, uiDirectory } from "./components-json"
import { isFile, mtimeOf, realpath, TTL } from "./fs"
import { exportsOf } from "./modules"
import { isSfc } from "./parser"

export type ComponentIndex = {
  dir: string | null
  files: Map<string, string>
  has: (name: string) => boolean
  // Under the ui directory, or reached from it through a re-export.
  owns: (file: string) => boolean
}

const EMPTY: ComponentIndex = {
  dir: null,
  files: new Map(),
  has: () => false,
  owns: () => false,
}

const cache = new Map<
  string,
  {
    signature: string
    deps: string[]
    checkedAt: number
    index: ComponentIndex
  }
>()

const BARRELS = ["index.tsx", "index.ts", "index.jsx"]

const SOURCE_RE = /\.(tsx|jsx|ts|js|svelte|vue)$/

// A directory of single-file components may keep its barrel in plain
// JavaScript; elsewhere `index.js` was never read and still is not.
export function barrelOf(dir: string) {
  for (const index of BARRELS) {
    const candidate = path.join(dir, index)
    if (isFile(candidate)) return candidate
  }
  const candidate = path.join(dir, "index.js")
  if (!isFile(candidate)) return null
  try {
    return fs.readdirSync(dir).some(isSfc) ? candidate : null
  } catch {
    return null
  }
}

function componentFiles(dir: string) {
  const files: string[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return files
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isFile() && SOURCE_RE.test(entry.name)) {
      files.push(full)
    } else if (entry.isDirectory()) {
      const barrel = barrelOf(full)
      if (barrel) files.push(barrel)
    }
  }
  return files.sort()
}

function signatureOf(files: string[]) {
  return files.map((file) => `${file}:${mtimeOf(file) ?? "missing"}`).join("|")
}

function buildIndex(dir: string) {
  const cached = cache.get(dir)
  const now = Date.now()
  if (cached && now - cached.checkedAt < TTL) return cached.index

  const entries = componentFiles(dir)
  // Covers the directory's entries and every file the export closure
  // reads, so a component moved behind a barrel is seen too.
  if (cached && signatureFor(entries, cached.deps) === cached.signature) {
    cached.checkedAt = now
    return cached.index
  }

  const files = new Map<string, string>()
  const deps = new Set<string>(entries)
  for (const file of entries) {
    for (const [name, binding] of exportsOf(file, new Set(), deps)) {
      // `export default memo(Button)` is still a Button by name.
      const component = name === "default" ? binding.name : name
      if (/^[A-Z]/.test(component) && !files.has(component)) {
        files.set(component, binding.file)
      }
    }
  }
  const owned = new Set([...deps].map(realpath))
  const root = realpath(dir) + path.sep
  const index: ComponentIndex = {
    dir,
    files,
    has: (name) => files.has(name),
    owns: (file) => {
      const real = realpath(file)
      return real.startsWith(root) || owned.has(real)
    },
  }
  const depList = [...deps]
  cache.set(dir, {
    signature: signatureFor(entries, depList),
    deps: depList,
    checkedAt: now,
    index,
  })
  return index
}

function signatureFor(entries: string[], deps: string[]) {
  return `${entries.join(",")}||${signatureOf(deps)}`
}

// A project without a ui directory gets an empty index and relies on
// componentImports.
export function componentsFor(fromFile: string) {
  const project = projectFor(fromFile)
  if (!project) return EMPTY
  const dir = uiDirectory(project)
  if (!dir) return EMPTY
  try {
    return buildIndex(dir)
  } catch {
    return EMPTY
  }
}
