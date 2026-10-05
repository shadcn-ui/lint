// Classifies classes into cn's class groups, using cn's config as the
// grammar. Mirrors tailwind-merge's class map: a trie keyed by "-"-split
// path parts, built in config order, first match winning.

import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import * as path from "node:path"
import { mergeConfigs } from "cn/compiler"
import { defaultConfig, type ClassGroupDef, type CnConfig } from "cn/config"

import { dirOf, mtimeOf, TTL } from "../project/fs"
import { themeFileFor } from "../project/theme"
import { themeScalesFromCss } from "../project/theme-scales"
import { warnOnce } from "../project/warn"
import { GROUP_CATEGORY } from "./categories"
import { splitVariants } from "./classes"
import * as cnValidators from "./validators"

// The grammar this package is written against. An older cn in the project
// is linted with the bundled copy instead, with a one-time warning.
export const BUNDLED_CN = "0.4.0"

function cnVersionAt(resolvedConfigPath: string) {
  let dir = path.dirname(resolvedConfigPath)
  for (let i = 0; i < 6; i++) {
    const file = path.join(dir, "package.json")
    try {
      const pkg = JSON.parse(readFileSync(file, "utf8")) as {
        name?: string
        version?: string
      }
      if (pkg.name === "cn" && pkg.version) return pkg.version
    } catch {
      // No manifest at this level; keep walking up.
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function olderThan(version: string, than: string) {
  const parts = (v: string) => v.split(/[.-]/, 3).map((n) => Number(n) || 0)
  const [a, b] = [parts(version), parts(than)]
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i]
  }
  return false
}

const configCache = new Map<string, CnConfig>()
let bundledConfig: CnConfig | null = null

function bundled() {
  bundledConfig ??= defaultConfig()
  return bundledConfig
}

// The project's installed cn is the grammar it actually merges with, so
// it wins over the bundled copy. Keyed by the resolved package path, so
// every file in a project shares one config and one classifier.
export function resolveCnConfig(fromFile?: string) {
  if (!fromFile) return bundled()
  const dir = dirOf(fromFile)
  const cached = configCache.get(dir)
  if (cached) return cached
  let config: CnConfig
  try {
    const require = createRequire(path.join(dir, "index.js"))
    const resolvedPath = require.resolve("cn/config")
    const byPath = configCache.get(resolvedPath)
    if (byPath) {
      config = byPath
    } else {
      const version = cnVersionAt(resolvedPath)
      if (version && olderThan(version, BUNDLED_CN)) {
        warnOnce(
          `cn-version:${resolvedPath}`,
          `This project's cn is ${version}. The linter's grammar needs cn ${BUNDLED_CN} or later, so it used its bundled cn ${BUNDLED_CN} instead. Update cn to lint with the grammar your app merges with.`
        )
        config = bundled()
      } else {
        const resolved = require(resolvedPath) as {
          defaultConfig: () => CnConfig
        }
        config = resolved.defaultConfig()
      }
      configCache.set(resolvedPath, config)
    }
  } catch {
    config = bundled()
  }
  configCache.set(dir, config)
  return config
}

type ThemedConfig = {
  config: CnConfig
  files: string[]
  signature: string
  checkedAt: number
}

const themedByConfig = new WeakMap<CnConfig, Map<string, ThemedConfig>>()

function signatureOf(files: string[]) {
  return files.map((file) => `${file}:${mtimeOf(file) ?? "missing"}`).join("|")
}

// The grammar with the project's theme scales applied, the way `cn build`
// registers them: a declared --radius-card makes rounded-card a radius,
// and --radius-*: initial replaces the default names. One config per
// grammar and theme file, so every file in a project shares one
// classifier, re-read when a stylesheet changes so a watcher run sees an
// edited theme. A stylesheet that cannot be read leaves the grammar alone.
export function themedCnConfig(fromFile?: string) {
  const config = resolveCnConfig(fromFile)
  const themeFile = fromFile ? themeFileFor(fromFile) : null
  if (!themeFile) return config
  let byFile = themedByConfig.get(config)
  if (!byFile) {
    byFile = new Map()
    themedByConfig.set(config, byFile)
  }
  const cached = byFile.get(themeFile)
  const now = Date.now()
  if (cached && now - cached.checkedAt < TTL) return cached.config
  if (cached && signatureOf(cached.files) === cached.signature) {
    cached.checkedAt = now
    return cached.config
  }
  let themed = config
  let files = [themeFile]
  try {
    const theme = themeScalesFromCss([themeFile])
    files = theme.files
    themed = mergeConfigs(config, theme.extension)
  } catch (error) {
    warnOnce(
      `theme-scales:${themeFile}`,
      `The theme scales in ${themeFile} could not be read (${(error as Error).message}), so classes such as rounded-card that it declares are unclassified until the stylesheet is fixed.`
    )
  }
  byFile.set(themeFile, {
    config: themed,
    files,
    signature: signatureOf(files),
    checkedAt: now,
  })
  return themed
}

type Node = {
  next: Map<string, Node>
  validators: { test: (value: string) => boolean; group: string }[] | null
  group: string | null
}

const validatorByName: Record<
  string,
  ((value: string) => boolean) | undefined
> = cnValidators

// tailwind-merge's prefix; two dots cannot collide with a plugin group.
const ARBITRARY_PROPERTY_PREFIX = "arbitrary.."

function createNode() {
  const node: Node = { next: new Map(), validators: null, group: null }
  return node
}

function isMarker(def: object, key: string) {
  const keys = Object.keys(def)
  return (
    keys.length === 1 &&
    keys[0] === key &&
    typeof (def as Record<string, unknown>)[key] === "string"
  )
}

function getPart(node: Node, path: string) {
  for (const part of path.split("-")) {
    let next = node.next.get(part)
    if (!next) {
      next = createNode()
      node.next.set(part, next)
    }
    node = next
  }
  return node
}

function buildTrie(config: CnConfig) {
  const root = createNode()

  const addValidator = (
    node: Node,
    test: (value: string) => boolean,
    group: string
  ) => {
    ;(node.validators ??= []).push({ test, group })
  }

  const process = (def: ClassGroupDef, node: Node, group: string) => {
    if (typeof def === "string") {
      const target = def === "" ? node : getPart(node, def)
      target.group = group
      return
    }
    if (typeof def === "function") {
      // tailwind-merge passes these as functions; cn uses the markers.
      if ((def as { isThemeGetter?: boolean }).isThemeGetter === true) {
        const getTheme = def as unknown as (theme: object) => ClassGroupDef[]
        for (const inner of getTheme(config.theme)) process(inner, node, group)
        return
      }
      addValidator(node, def, group)
      return
    }
    if (isMarker(def, "$t")) {
      for (const inner of config.theme[(def as { $t: string }).$t] ?? []) {
        process(inner, node, group)
      }
      return
    }
    if (isMarker(def, "$v")) {
      const name = (def as { $v: string }).$v
      const test = validatorByName[name]
      if (!test) throw new Error(`cn-classifier: unknown validator "${name}"`)
      addValidator(node, test, group)
      return
    }
    for (const [key, value] of Object.entries(
      def as { [key: string]: ClassGroupDef[] }
    )) {
      const child = getPart(node, key)
      for (const inner of value) process(inner, child, group)
    }
  }

  for (const [group, defs] of Object.entries(config.classGroups)) {
    for (const def of defs) process(def, root, group)
  }
  return root
}

// tailwind-merge's search order: exact parts as deep as they go, then
// validators on the tail, from the deepest node back up.
function walk(parts: string[], start: number, root: Node) {
  const path = [root]
  let node = root
  let index = start
  while (index < parts.length) {
    const next = node.next.get(parts[index])
    if (!next) break
    node = next
    path.push(node)
    index++
  }

  let level = path.length - 1
  if (index === parts.length) {
    if (node.group) return node.group
    // An exact match with no group has an empty tail to validate.
    level--
  }
  for (; level >= 0; level--) {
    const validators = path[level].validators
    if (!validators) continue
    const rest = parts.slice(start + level).join("-")
    for (const { test, group } of validators) {
      if (test(rest)) return group
    }
  }
  return null
}

function arbitraryPropertyGroup(base: string) {
  const content = base.slice(1, -1)
  const colon = content.indexOf(":")
  return colon > 0 ? ARBITRARY_PROPERTY_PREFIX + content.slice(0, colon) : null
}

// Only a slash outside brackets starts a modifier like bg-primary/90.
function postfixIndex(base: string) {
  let depth = 0
  let index = -1
  for (let i = 0; i < base.length; i++) {
    const char = base[i]
    if (char === "[" || char === "(") depth++
    else if (char === "]" || char === ")") depth--
    else if (char === "/" && depth === 0) index = i
  }
  return index
}

// Tailwind still generates these utilities under the names they had in
// Tailwind 3, so a project that has not renamed them is writing real
// classes. cn's config carries the current names only, and reads
// `decoration-clone` as a text-decoration color, so the rename happens
// before the lookup.
const RENAMED = new Map([
  ["flex-grow", "grow"],
  ["flex-shrink", "shrink"],
  ["overflow-ellipsis", "text-ellipsis"],
  ["decoration-slice", "box-decoration-slice"],
  ["decoration-clone", "box-decoration-clone"],
])

const RENAMED_SCALE = /^flex-(grow|shrink)-(.+)$/

function currentName(base: string) {
  const renamed = RENAMED.get(base)
  if (renamed) return renamed
  const scale = RENAMED_SCALE.exec(base)
  return scale ? `${scale[1]}-${scale[2]}` : base
}

export function createClassifier(config = resolveCnConfig()) {
  const root = buildTrie(config)
  const postfixLookupGroups = new Set(config.postfixLookupClassGroups ?? [])

  const lookup = (base: string) => {
    if (base.startsWith("[") && base.endsWith("]")) {
      return arbitraryPropertyGroup(base)
    }
    const parts = base.split("-")
    return walk(parts, parts[0] === "" && parts.length > 1 ? 1 : 0, root)
  }

  // A few thousand distinct tokens, repeated everywhere.
  const memo = new Map<string, string | null>()
  const groupOf = (token: string) => {
    const hit = memo.get(token)
    if (hit !== undefined) return hit
    if (memo.size > 50_000) memo.clear()
    const group = classify(token)
    memo.set(token, group)
    return group
  }

  const classify = (token: string) => {
    let base = splitVariants(token.trim()).base
    if (base.endsWith("!")) base = base.slice(0, -1)
    else if (base.startsWith("!")) base = base.slice(1)
    if (!base) return null
    base = currentName(base)

    const slash = postfixIndex(base)
    if (slash === -1) return lookup(base)

    // tailwind-merge's order: without the modifier first, so text-sm/6
    // stays font-size instead of reaching text-color's catch-all.
    const group = lookup(base.slice(0, slash))
    if (group && postfixLookupGroups.has(group)) {
      return lookup(base) ?? group
    }
    return group ?? lookup(base)
  }

  return { groupOf }
}

const classifierByConfig = new WeakMap<
  CnConfig,
  ReturnType<typeof createClassifier>
>()

// Groups the category table does not know classify as layout, which is
// the permissive direction: worth a warning rather than silence.
export function unknownGroups(config: CnConfig) {
  return Object.keys(config.classGroups).filter(
    (group) => !(group in GROUP_CATEGORY)
  )
}

// One trie per distinct config, built lazily.
export function classifierFor(fromFile?: string) {
  const config = themedCnConfig(fromFile)
  let classifier = classifierByConfig.get(config)
  if (!classifier) {
    try {
      classifier = createClassifier(config)
    } catch (error) {
      // A newer cn with a validator this version does not know.
      warnOnce(
        "classifier:fallback",
        `The installed cn's grammar could not be loaded (${(error as Error).message}); using the grammar bundled with @shadcn/lint. Update @shadcn/lint.`
      )
      const fallback = bundled()
      classifier =
        classifierByConfig.get(fallback) ?? createClassifier(fallback)
      classifierByConfig.set(fallback, classifier)
    }
    classifierByConfig.set(config, classifier)
    const unknown = unknownGroups(config)
    if (unknown.length) {
      warnOnce(
        `groups:${unknown.join(",")}`,
        `The installed cn declares class groups this version of @shadcn/lint has no category for: ${unknown.join(", ")}. They are treated as layout. Update @shadcn/lint.`
      )
    }
  }
  return classifier
}

export function groupOf(token: string, fromFile?: string) {
  return classifierFor(fromFile).groupOf(token)
}
