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
  // Tokens a color utility reads from its own namespace before
  // --color-*: --background-color-surface declares bg-surface only.
  scoped: Map<string, Set<string>>
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
  // The tw of `@import "tailwindcss" prefix(tw)`: only tw:flex is Tailwind.
  prefix: string | null
  // An @config or @plugin: JavaScript adds to the theme, and only
  // Tailwind itself can say what.
  modules: boolean
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

// The namespaces Tailwind reads a color utility from before --color-*,
// verified against Tailwind 4.3.3. Shadows, inset rings and gradient
// stops read --color-* only.
export const COLOR_NAMESPACES = [
  "background-color",
  "text-color",
  "border-color",
  "divide-color",
  "ring-color",
  "outline-color",
  "accent-color",
  "caret-color",
  "placeholder-color",
  "text-decoration-color",
  "text-shadow-color",
  "drop-shadow-color",
  "fill",
  "stroke",
]

// In cascade order: `--color-x: initial` drops x, `--color-*: initial`
// and `--*: initial` drop everything declared so far. A scoped
// namespace resets on its own.
function applyTokenDeclarations(
  declarations: Declaration[],
  tokens: Set<string>,
  scoped?: Map<string, Set<string>>
) {
  for (const { name, value, theme } of declarations) {
    if (!theme) continue
    const reset = value.trim() === "initial"
    if (name === "*") {
      if (reset) {
        tokens.clear()
        scoped?.clear()
      }
      continue
    }
    const namespace = name.startsWith("color-")
      ? "color"
      : COLOR_NAMESPACES.find((candidate) => name.startsWith(`${candidate}-`))
    if (!namespace) continue
    const token = name.slice(namespace.length + 1)
    let set = tokens
    if (namespace !== "color") {
      if (!scoped) continue
      set = scoped.get(namespace) ?? new Set()
      scoped.set(namespace, set)
    }
    if (token === "*") {
      if (reset) set.clear()
    } else if (reset) set.delete(token)
    else set.add(token)
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

// Comments go first: a partial whose comment spells out the consumer's
// `@import "tailwindcss"` does not import Tailwind.
export function parseImports(css: string) {
  const out: string[] = []
  const re = /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?[^;]*;/g
  for (const match of stripComments(css).matchAll(re)) out.push(match[1])
  return out
}

// The prefix a Tailwind import declares, if any.
export function parseTailwindPrefix(css: string) {
  const re =
    /@import\s+(?:url\(\s*)?["']tailwindcss(?:\/[^"']*)?["']\s*\)?[^;]*?\bprefix\(\s*([\w-]+)\s*\)/g
  for (const match of stripComments(css).matchAll(re)) return match[1]
  return null
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

// The installed package a file belongs to: the directory after the last
// node_modules, two segments for a scope. Null outside node_modules.
function packageDirOf(file: string) {
  const marker = `${path.sep}node_modules${path.sep}`
  const at = file.lastIndexOf(marker)
  if (at === -1) return null
  const start = at + marker.length
  const segments = file.slice(start).split(path.sep)
  const depth = segments[0].startsWith("@") ? 2 : 1
  return file.slice(0, start) + segments.slice(0, depth).join(path.sep)
}

// The package whose tokens an import contributes: one settings.shadcn
// .themeImports names, or the same package a counted file imports from
// within. A kit's own `@import "tailwindcss"` is another package, so
// Tailwind's palette stays out.
function ownPackageOf(
  spec: string,
  target: string,
  imports: readonly RegExp[],
  current: string | null
) {
  const dir = packageDirOf(target)
  if (!dir) return null
  if (imports.some((pattern) => pattern.test(spec))) return dir
  return dir === current ? dir : null
}

// Files under node_modules contribute @utility names and class selectors
// (tw-animate-css declares animate-in that way) but not color tokens:
// Tailwind's own palette is not the project's vocabulary. Workspace
// packages resolve past node_modules and count as the project's own, and
// so does a design system published as a package once themeImports
// names it.
function readTheme(
  cssFile: string,
  seen: Set<string>,
  read: ThemeRead,
  imports: readonly RegExp[],
  fromPackage = false,
  ownPackage: string | null = null
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
  if (!fromPackage) read.prefix ??= parseTailwindPrefix(css)
  if (/@(?:config|plugin)\s/.test(stripComments(css))) read.modules = true
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
    const own = ownPackageOf(spec, target, imports, ownPackage)
    readTheme(
      target,
      seen,
      read,
      imports,
      own ? false : fromPackage || isPackageFile(target),
      own
    )
  }
  if (!fromPackage) {
    const { values, themeNames, declarations } = parseDeclarations(css)
    applyTokenDeclarations(declarations, read.tokens, read.scoped)
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

const NO_IMPORTS: readonly RegExp[] = []

// settings.shadcn.themeImports, by project root. A theme belongs to the
// project, not to a rule, so the rules record it as they start and every
// read for that project's files sees it.
const themeImports = new Map<string, readonly RegExp[]>()

export function setThemeImports(fromFile: string, patterns: RegExp[]) {
  if (!patterns.length && !themeImports.size) return
  const root = fromFile ? projectFor(fromFile)?.root : null
  if (!root) return
  if (patterns.length) themeImports.set(root, patterns)
  else themeImports.delete(root)
}

function themeImportsOf(root: string | undefined) {
  return (root && themeImports.get(root)) || NO_IMPORTS
}

// The theme a linted file reads, with its project's themeImports.
function themeOf(fromFile: string, cssFile: string) {
  if (!themeImports.size) return themeAt(cssFile)
  return themeAt(cssFile, themeImportsOf(projectFor(fromFile)?.root))
}

function themeAt(cssFile: string, imports: readonly RegExp[] = NO_IMPORTS) {
  const key = imports.length
    ? [cssFile, ...imports.map((pattern) => pattern.source)].join("\u0000")
    : cssFile
  const cached = cache.get(key)
  const now = Date.now()
  if (cached && now - cached.checkedAt < TTL) return cached.read
  if (cached && signatureOf(cached.read) === cached.signature) {
    cached.checkedAt = now
    return cached.read
  }
  const read: ThemeRead = {
    tokens: new Set(),
    scoped: new Map(),
    utilities: new Set(),
    classes: new Set(),
    values: new Map(),
    themeNames: new Set(),
    declarations: [],
    tailwind: false,
    prefix: null,
    modules: false,
    files: [],
    missingImports: [],
  }
  readTheme(cssFile, new Set(), read, imports)
  cache.set(key, {
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
    const read = themeAt(file, themeImportsOf(root))
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
  if (!file || themeOf(fromFile, file).tailwind) return file
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

export function tailwindPrefixFor(fromFile: string) {
  const entry = tailwindEntryFor(fromFile)
  return entry ? themeAt(entry).prefix : null
}

// The Tailwind entry when its theme loads JavaScript, the one case the
// CSS alone cannot answer. Null otherwise.
export function moduleThemeEntryFor(fromFile: string) {
  const file = tailwindEntryFor(fromFile)
  return file && themeAt(file).modules ? file : null
}

export function colorTokensFor(fromFile: string) {
  const cssFile = themeFileFor(fromFile)
  if (!cssFile) return null
  const { tokens } = themeOf(fromFile, cssFile)
  return tokens.size ? tokens : null
}

// Tokens declared under a color utility's own namespace, by namespace.
// Null outside a theme.
export function scopedColorTokensFor(fromFile: string) {
  const cssFile = themeFileFor(fromFile)
  if (!cssFile) return null
  return themeOf(fromFile, cssFile).scoped
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
  const read = themeOf(fromFile, cssFile)
  return read.tokens.size ? colorsOf(read) : null
}

// Tailwind's 0.25rem unless the theme sets --spacing. Null when the theme
// removes it or sets it unreadably: no exact step can be named then.
export function spacingBaseFor(fromFile: string) {
  const cssFile = themeFileFor(fromFile)
  if (!cssFile) return 4
  const read = themeOf(fromFile, cssFile)
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
  return scaleOf(themeOf(fromFile, cssFile), kind)
}

// Null when the project has no theme to read.
export function themeVocabularyFor(fromFile: string) {
  const cssFile = themeFileFor(fromFile)
  if (!cssFile) return null
  const read = themeOf(fromFile, cssFile)
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

// Whether the project's CSS declares this class with @utility, by name
// or by prefix: Tailwind generates it, so it is the project's vocabulary
// whatever the name looks like. A plain selector is not: `.text-danger
// { color: #f00 }` is the raw color no-raw-colors exists to report.
export function declaresUtility(fromFile: string, token: string) {
  const base = normalizeClass(token).replace(OPACITY_MODIFIER, "")
  if (!base) return false
  const { utilities } = knownClassesFor(fromFile)
  if (utilities.has(base)) return true
  return utilityPrefixesOf(utilities).some((prefix) => base.startsWith(prefix))
}

// Whether the project's own CSS declares this class: an @utility name,
// an @utility prefix, or a class selector. Tailwind generates such a
// class, so no-restyle must not report it as a misspelling.
export function declaresClass(fromFile: string, token: string) {
  if (declaresUtility(fromFile, token)) return true
  const base = normalizeClass(token).replace(OPACITY_MODIFIER, "")
  return !!base && knownClassesFor(fromFile).classes.has(base)
}

// What a project's CSS declares beyond Tailwind's own.
export function knownClassesFor(fromFile: string) {
  const cssFile = themeFileFor(fromFile)
  if (!cssFile)
    return { utilities: new Set<string>(), classes: new Set<string>() }
  const { utilities, classes } = themeOf(fromFile, cssFile)
  return { utilities, classes }
}
