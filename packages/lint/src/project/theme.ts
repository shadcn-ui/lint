// Reads what a project's Tailwind theme declares: the --color-* tokens
// inside @theme, the scales, and the classes its CSS defines.
// See docs/how-it-works.md.

import * as fs from "node:fs"
import * as path from "node:path"

import { normalizeClass, OPACITY_MODIFIER } from "../grammar/classes"
import { parseColor, type Lab } from "../grammar/colors"
import { lengthInPx } from "../grammar/lengths"
import { FONT_SIZES, RADII } from "../grammar/tailwind-theme"
import { projectFor } from "./components-json"
import { isFile, mtimeOf, TTL } from "./fs"
import { packageRoot, resolveFile } from "./resolve"
import { warnOnce } from "./warn"

export type ScaleKind = "radius" | "text"

// What a project's own CSS names: the @theme declarations, the color
// tokens among them, and its @utility names. One object per theme read,
// replaced when the CSS changes, so callers can memo against its identity.
export type ThemeVocabulary = {
  names: Set<string>
  tokens: Set<string>
  utilities: Set<string>
}

type Declaration = { name: string; value: string; theme: boolean }

type ThemeRead = {
  tokens: Set<string>
  utilities: Set<string>
  classes: Set<string>
  // Every custom property the project declares, in light mode, last
  // declaration winning: what tokens resolve to.
  values: Map<string, string>
  themeNames: Set<string>
  // In cascade order, resets included: what the scales are built from.
  declarations: Declaration[]
  // The mark of a project's entry stylesheet.
  tailwind: boolean
  files: string[]
  // Retried with the signature, so a corrected alias invalidates too.
  missingImports: { spec: string; fromDir: string; rootDir: string }[]
  colors?: Map<string, Lab>
  scales?: Record<ScaleKind, Map<string, number>>
  spacing?: number | null
  vocabulary?: ThemeVocabulary
}

const cache = new Map<
  string,
  { signature: string; checkedAt: number; read: ThemeRead }
>()

// Removes /* */ comments the way a CSS tokenizer would: a "/*" inside a
// string or an unquoted url() is text, so an @source glob such as
// "dist/*.js" does not swallow the theme declared after it.
export function stripComments(css: string) {
  const parts: string[] = []
  let start = 0
  let i = 0
  while (i < css.length) {
    const char = css[i]
    if (char === "/" && css[i + 1] === "*") {
      parts.push(css.slice(start, i))
      const end = css.indexOf("*/", i + 2)
      i = end === -1 ? css.length : end + 2
      start = i
    } else if (char === '"' || char === "'") {
      i++
      while (i < css.length && css[i] !== char) {
        i += css[i] === "\\" ? 2 : 1
      }
      i++
    } else if (css.startsWith("url(", i)) {
      const end = css.indexOf(")", i + 4)
      i = end === -1 ? css.length : end + 1
    } else {
      i++
    }
  }
  parts.push(css.slice(start))
  return parts.join("")
}

export function parseColorTokens(css: string) {
  const tokens = new Set<string>()
  applyColorTokens(css, tokens)
  return tokens
}

function applyColorTokens(css: string, tokens: Set<string>) {
  applyTokenDeclarations(parseDeclarations(css).declarations, tokens)
}

// In cascade order: `--color-x: initial` drops x, `--color-*: initial`
// and `--*: initial` drop everything declared so far.
function applyTokenDeclarations(
  declarations: Declaration[],
  tokens: Set<string>
) {
  for (const { name, value, theme } of declarations) {
    if (!theme) continue
    const reset = value.trim() === "initial"
    if (name === "*") {
      if (reset) tokens.clear()
      continue
    }
    if (!name.startsWith("color-")) continue
    const token = name.slice("color-".length)
    if (token === "*") {
      if (reset) tokens.clear()
    } else if (reset) tokens.delete(token)
    else tokens.add(token)
  }
}

const DARK_PRELUDE =
  /\.dark(?![\w-])|prefers-color-scheme\s*:\s*dark|data-(?:theme|mode)=["']?dark|@variant\s+dark\b/

// Dark-mode blocks are skipped, so the values are the light theme's.
// Later declarations win, as in CSS.
export function parseDeclarations(css: string) {
  const values = new Map<string, string>()
  const themeNames = new Set<string>()
  const declarations: { name: string; value: string; theme: boolean }[] = []
  const stripped = stripComments(css)
  const stack: { theme: boolean; dark: boolean }[] = []
  let start = 0
  for (let i = 0; i < stripped.length; i++) {
    const char = stripped[i]
    if (char === "{") {
      const prelude = stripped.slice(start, i).trim()
      const outer = stack[stack.length - 1]
      stack.push({
        theme: (outer?.theme ?? false) || /^@theme\b/.test(prelude),
        dark: (outer?.dark ?? false) || DARK_PRELUDE.test(prelude),
      })
      start = i + 1
    } else if (char === "}" || char === ";") {
      const statement = stripped.slice(start, i)
      const match = statement.match(
        /^\s*--((?:[\w-]+\*?)|\*)\s*:\s*([\s\S]+?)\s*$/
      )
      const scope = stack[stack.length - 1]
      if (match && !scope?.dark) {
        values.set(match[1], match[2])
        if (scope?.theme) themeNames.add(match[1])
        declarations.push({
          name: match[1],
          value: match[2],
          theme: scope?.theme ?? false,
        })
      }
      if (char === "}") stack.pop()
      start = i + 1
    }
  }
  return { values, themeNames, declarations }
}

// Null when a variable has no value and no fallback.
export function resolveVariables(
  value: string,
  values: Map<string, string>,
  depth = 0
): string | null {
  if (!value.includes("var(")) return value
  if (depth > 6) return null
  let failed = false
  const out = value.replace(
    /var\(\s*--([\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g,
    (_, name: string, fallback: string | undefined) => {
      const inner = values.get(name) ?? fallback
      if (inner === undefined) {
        failed = true
        return ""
      }
      const resolved = resolveVariables(inner.trim(), values, depth + 1)
      if (resolved === null) failed = true
      return resolved ?? ""
    }
  )
  return failed ? null : out
}

export function parseImports(css: string) {
  const out: string[] = []
  const re = /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?[^;]*;/g
  for (const match of css.matchAll(re)) out.push(match[1])
  return out
}

export function parseUtilities(css: string) {
  const out = new Set<string>()
  for (const match of css.matchAll(/@utility\s+([\w-]+\*?)\s*\{/g)) {
    out.add(match[1])
  }
  return out
}

// A class that exists in CSS (.legacy-card) is not an unknown class.
export function parseClassSelectors(css: string) {
  const out = new Set<string>()
  // A "dist/*.js" in a string is a glob, not a .js selector.
  const stripped = stripComments(css).replace(
    /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g,
    '""'
  )
  for (const match of stripped.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
    out.add(match[1])
  }
  return out
}

function isPackageFile(file: string) {
  return file.includes(`${path.sep}node_modules${path.sep}`)
}

// Files under node_modules contribute @utility names and class selectors
// (tw-animate-css declares animate-in that way) but not color tokens:
// Tailwind's own palette is not the project's vocabulary. Workspace
// packages resolve past node_modules and count as the project's own.
function readTheme(
  cssFile: string,
  seen: Set<string>,
  read: ThemeRead,
  fromPackage = false
) {
  if (seen.has(cssFile) || seen.size > 64) return
  seen.add(cssFile)
  // Recorded before reading, so a missing file is seen when it appears.
  read.files.push(cssFile)
  let css: string
  try {
    css = fs.readFileSync(cssFile, "utf-8")
  } catch {
    return
  }
  for (const name of parseUtilities(css)) read.utilities.add(name)
  for (const name of parseClassSelectors(css)) read.classes.add(name)
  // Imports come first in the cascade.
  const dir = path.dirname(cssFile)
  const root = packageRoot(cssFile) ?? dir
  for (const spec of parseImports(css)) {
    if (spec === "tailwindcss" || spec.startsWith("tailwindcss/")) {
      read.tailwind = true
    }
    const target = resolveFile(spec, dir, root, [".css"])
    if (!target) {
      read.missingImports.push({ spec, fromDir: dir, rootDir: root })
      continue
    }
    readTheme(target, seen, read, fromPackage || isPackageFile(target))
  }
  if (!fromPackage) {
    const { values, themeNames, declarations } = parseDeclarations(css)
    applyTokenDeclarations(declarations, read.tokens)
    for (const [name, value] of values) read.values.set(name, value)
    for (const name of themeNames) read.themeNames.add(name)
    read.declarations.push(...declarations)
  }
}

function signatureOf(read: ThemeRead) {
  return [
    ...read.files.map((file) => `${file}:${mtimeOf(file) ?? "missing"}`),
    ...read.missingImports.map(
      ({ spec, fromDir, rootDir }) =>
        `${fromDir}:${spec}:${resolveFile(spec, fromDir, rootDir, [".css"]) ?? "missing"}`
    ),
  ].join("|")
}

function themeAt(cssFile: string) {
  const cached = cache.get(cssFile)
  const now = Date.now()
  if (cached && now - cached.checkedAt < TTL) return cached.read
  if (cached && signatureOf(cached.read) === cached.signature) {
    cached.checkedAt = now
    return cached.read
  }
  const read: ThemeRead = {
    tokens: new Set(),
    utilities: new Set(),
    classes: new Set(),
    values: new Map(),
    themeNames: new Set(),
    declarations: [],
    tailwind: false,
    files: [],
    missingImports: [],
  }
  readTheme(cssFile, new Set(), read)
  cache.set(cssFile, {
    signature: signatureOf(read),
    checkedAt: now,
    read,
  })
  return read
}

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "public",
  ".next",
  ".git",
  ".turbo",
  ".registry",
])

function cssFilesUnder(dir: string, depth: number, out: string[]) {
  if (depth > 5 || out.length > 200) return
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) cssFilesUnder(full, depth + 1, out)
    } else if (entry.name.endsWith(".css")) {
      out.push(full)
    }
  }
}

const discovered = new Map<string, { at: number; file: string | null }>()
const DISCOVERY_TTL = 5000

// Without components.json: the stylesheet importing Tailwind, the way the
// shadcn CLI finds it. When several do, the one declaring the most color
// tokens wins, then the one nearest the root. Rescanned every few seconds
// so a theme added mid-session is picked up.
export function discoverThemeFile(root: string) {
  const cached = discovered.get(root)
  if (
    cached &&
    Date.now() - cached.at < DISCOVERY_TTL &&
    (cached.file === null || isFile(cached.file))
  ) {
    return cached.file
  }
  const files: string[] = []
  cssFilesUnder(root, 0, files)
  let best: { file: string; tokens: number; depth: number } | null = null
  for (const file of files.sort()) {
    const read = themeAt(file)
    if (!read.tailwind) continue
    const tokens = read.tokens.size
    const depth = path.relative(root, file).split(path.sep).length
    if (
      !best ||
      tokens > best.tokens ||
      (tokens === best.tokens && depth < best.depth)
    ) {
      best = { file, tokens, depth }
    }
  }
  const file = best?.file ?? null
  discovered.set(root, { at: Date.now(), file })
  return file
}

// The path a warning shows, as the project would write it.
function relativeTo(root: string, file: string) {
  return path.relative(root, file).replace(/\\/g, "/")
}

// A components.json naming a stylesheet that is not there is a wrong
// path, not the absence of a theme: say so once and fall back to
// discovery, so the token check does not go quiet meanwhile.
export function themeFileFor(fromFile: string) {
  const project = projectFor(fromFile)
  if (!project) return null
  if (project.cssFile) {
    if (isFile(project.cssFile)) return project.cssFile
    const discovered = discoverThemeFile(project.root)
    warnOnce(
      `theme:missing:${project.cssFile}`,
      `components.json sets tailwind.css to ${relativeTo(project.root, project.cssFile)}, which does not exist. ${
        discovered
          ? `Using ${relativeTo(project.root, discovered)} until the path is fixed.`
          : "No stylesheet importing Tailwind was found under the project, so no-raw-colors cannot check declared tokens until the path is fixed."
      }`
    )
    return discovered
  }
  return discoverThemeFile(project.root)
}

// The stylesheet whose Tailwind answers which classes exist. A
// components.json can point tailwind.css at a partial that declares tokens
// without importing Tailwind, the normal shape for a component package in
// a monorepo. A theme built from that file holds no base utilities, so
// every stock class would read as unknown: say so once and ask a
// discovered entry meanwhile, so the theme's own tokens still name the
// file a token belongs in.
export function tailwindEntryFor(fromFile: string) {
  const file = themeFileFor(fromFile)
  if (!file || themeAt(file).tailwind) return file
  const project = projectFor(fromFile)
  if (!project) return file
  const discovered = discoverThemeFile(project.root)
  warnOnce(
    `theme:no-tailwind:${file}`,
    `components.json sets tailwind.css to ${relativeTo(project.root, file)}, which does not import Tailwind. ${
      discovered
        ? `Using ${relativeTo(project.root, discovered)} to read the classes Tailwind knows until the path is fixed.`
        : "No stylesheet importing Tailwind was found under the project, so no-unknown-classes is using the grammar bundled with @shadcn/lint until the path is fixed."
    }`
  )
  return discovered
}

export function colorTokensFor(fromFile: string) {
  const cssFile = themeFileFor(fromFile)
  if (!cssFile) return null
  const { tokens } = themeAt(cssFile)
  return tokens.size ? tokens : null
}

// Empty when the values cannot be read (color-mix, JS-set variables).
function colorsOf(read: ThemeRead) {
  if (read.colors) return read.colors
  const colors = new Map<string, Lab>()
  for (const token of read.tokens) {
    const raw = read.values.get(`color-${token}`)
    if (!raw) continue
    const resolved = resolveVariables(raw, read.values)
    const lab = resolved ? parseColor(resolved) : null
    if (lab) colors.set(token, lab)
  }
  read.colors = colors
  return colors
}

const SCALE_DEFAULTS: Record<ScaleKind, Record<string, string>> = {
  radius: RADII,
  text: FONT_SIZES,
}

// The theme's own --radius-* / --text-* declarations over Tailwind's
// defaults, in cascade order, the way Tailwind reads them.
function scaleOf(read: ThemeRead, kind: ScaleKind) {
  read.scales ??= {
    radius: buildScale(read, "radius"),
    text: buildScale(read, "text"),
  }
  return read.scales[kind]
}

// Tailwind's own steps, in pixels.
function defaultScale(kind: ScaleKind) {
  const scale = new Map<string, number>()
  for (const [name, value] of Object.entries(SCALE_DEFAULTS[kind])) {
    const px = lengthInPx(value)
    if (px !== null) scale.set(name, px)
  }
  return scale
}

function buildScale(read: ThemeRead, kind: ScaleKind) {
  const scale = defaultScale(kind)
  const prefix = `${kind}-`
  for (const { name, value, theme } of read.declarations) {
    if (!theme) continue
    const reset = value.trim() === "initial"
    if (name === "*") {
      if (reset) scale.clear()
      continue
    }
    if (!name.startsWith(prefix) || name.includes("--")) continue
    const step = name.slice(prefix.length)
    if (step === "*") {
      if (reset) scale.clear()
      continue
    }
    if (reset) {
      scale.delete(step)
      continue
    }
    const resolved = resolveVariables(value, read.values)
    const px = resolved ? lengthInPx(resolved) : null
    if (px !== null) scale.set(step, px)
    else scale.delete(step)
  }
  return scale
}

export const DEFAULT_SCALES: Record<ScaleKind, Map<string, number>> = {
  radius: defaultScale("radius"),
  text: defaultScale("text"),
}

export function colorValuesFor(fromFile: string) {
  const cssFile = themeFileFor(fromFile)
  if (!cssFile) return null
  const read = themeAt(cssFile)
  return read.tokens.size ? colorsOf(read) : null
}

// Tailwind's 0.25rem unless the theme sets --spacing. Null when the theme
// removes it or sets it unreadably: no exact step can be named then.
export function spacingBaseFor(fromFile: string) {
  const cssFile = themeFileFor(fromFile)
  if (!cssFile) return 4
  const read = themeAt(cssFile)
  if (read.spacing !== undefined) return read.spacing
  let raw: string | null = "0.25rem"
  for (const { name, value, theme } of read.declarations) {
    if (!theme) continue
    if (name === "*" && value.trim() === "initial") raw = null
    else if (name === "spacing") raw = value.trim() === "initial" ? null : value
  }
  const resolved = raw === null ? null : resolveVariables(raw, read.values)
  const px = resolved ? lengthInPx(resolved) : null
  return (read.spacing = px && px > 0 ? px : null)
}

export function scaleFor(fromFile: string, kind: ScaleKind) {
  const cssFile = themeFileFor(fromFile)
  if (!cssFile) return DEFAULT_SCALES[kind]
  return scaleOf(themeAt(cssFile), kind)
}

// Null when the project has no theme to read.
export function themeVocabularyFor(fromFile: string) {
  const cssFile = themeFileFor(fromFile)
  if (!cssFile) return null
  const read = themeAt(cssFile)
  return (read.vocabulary ??= {
    names: read.themeNames,
    tokens: read.tokens,
    utilities: read.utilities,
  })
}

const utilityPrefixes = new WeakMap<Set<string>, string[]>()

// The `tab-` of an `@utility tab-*`, computed once per theme read.
export function utilityPrefixesOf(utilities: Set<string>) {
  let list = utilityPrefixes.get(utilities)
  if (!list) {
    list = [...utilities]
      .filter((name) => name.endsWith("*"))
      .map((name) => name.slice(0, -1))
    utilityPrefixes.set(utilities, list)
  }
  return list
}

// Whether the project's own CSS declares this class: an @utility name,
// an @utility prefix, or a class selector. Tailwind generates such a
// class, so a rule must not report it as a misspelling.
export function declaresClass(fromFile: string, token: string) {
  const base = normalizeClass(token).replace(OPACITY_MODIFIER, "")
  if (!base) return false
  const { utilities, classes } = knownClassesFor(fromFile)
  if (utilities.has(base) || classes.has(base)) return true
  return utilityPrefixesOf(utilities).some((prefix) => base.startsWith(prefix))
}

// What a project's CSS declares beyond Tailwind's own.
export function knownClassesFor(fromFile: string) {
  const cssFile = themeFileFor(fromFile)
  if (!cssFile)
    return { utilities: new Set<string>(), classes: new Set<string>() }
  const { utilities, classes } = themeAt(cssFile)
  return { utilities, classes }
}
