// cn's grammar reads a class by its shape, with the project's theme scales
// applied: a declared --text-stat-label makes text-stat-label a font-size
// and --shadow-card-glow a box-shadow before any lookup here. What cn
// does not read is what this module adds: bg-stripes comes from a
// --background-image-* the grammar has no scale for, so it reads as a
// color, and a project's animations live in @utility as often as @theme.

import { categoryOf } from "../grammar/categories"
import { normalizeClass, OPACITY_MODIFIER } from "../grammar/classes"
import { classifierFor } from "../grammar/classifier"
import {
  declaresClass,
  themeVocabularyFor,
  type ThemeVocabulary,
} from "./theme"

const NAMESPACES: {
  // The prefix as written in the class.
  prefix: string
  // The @theme namespace the utility reads, which is not the prefix:
  // bg-stripes comes from --background-image-stripes.
  namespace: string
  // The cn group the class belongs to when the namespace answers.
  group: string
}[] = [
  {
    prefix: "bg-",
    namespace: "background-image-",
    group: "bg-image",
  },
]

const ANIMATE_PREFIX = "animate-"

const memos = new WeakMap<ThemeVocabulary, Map<string, string | null>>()

function memoFor(vocabulary: ThemeVocabulary) {
  let memo = memos.get(vocabulary)
  if (!memo) {
    memo = new Map()
    memos.set(vocabulary, memo)
  }
  if (memo.size > 50_000) memo.clear()
  return memo
}

// The value a utility looks up, without the opacity or line-height
// modifier. Null when there is nothing a namespace could name.
function valueOf(base: string, prefix: string) {
  const rest = base.slice(prefix.length)
  const modifier = rest.match(OPACITY_MODIFIER)?.[0] ?? ""
  const value = rest.slice(0, rest.length - modifier.length)
  if (!value || value.startsWith("[") || value.startsWith("(")) return null
  return value
}

// A --color-* of the same name wins over the namespace, the way Tailwind
// reads bg-*. Verified against Tailwind 4.3.3, not inferred from the docs.
function lookup(vocabulary: ThemeVocabulary, token: string) {
  const base = normalizeClass(token)
  const entry = NAMESPACES.find((n) => base.startsWith(n.prefix))
  if (!entry) return null
  const value = valueOf(base, entry.prefix)
  if (!value) return null
  if (vocabulary.tokens.has(value)) return null
  return vocabulary.names.has(`${entry.namespace}${value}`) ? entry.group : null
}

// The cn group a project's own @theme gives this class, or null when the
// theme says nothing about it.
export function themeGroupFor(fromFile: string | undefined, token: string) {
  if (!fromFile) return null
  const vocabulary = themeVocabularyFor(fromFile)
  if (!vocabulary) return null
  const memo = memoFor(vocabulary)
  let group = memo.get(token)
  if (group === undefined) {
    group = lookup(vocabulary, token)
    memo.set(token, group)
  }
  return group
}

// cn groups Tailwind's own animations and the --animate-* names a theme
// declares, so that merging never drops a plugin's animate-once. The rest
// of a project's animations come from its CSS: animate-in from an
// @utility or selector.
export function animationGroupFor(fromFile: string | undefined, token: string) {
  if (!fromFile) return null
  const base = normalizeClass(token)
  if (!base.startsWith(ANIMATE_PREFIX)) return null
  const value = valueOf(base, ANIMATE_PREFIX)
  if (!value) return null
  if (themeVocabularyFor(fromFile)?.names.has(base)) return "animate"
  return declaresClass(fromFile, token) ? "animate" : null
}

// The classifier the rules use: cn's grammar, then the project's theme
// wherever the grammar's answer was a color it could not have known was
// something else, or no answer for an animation the project declares.
// Nothing else can be shadowed this way, so the grammar answers first and
// the theme is read only when it could change the verdict.
export function projectClassifierFor(fromFile?: string) {
  const { groupOf: grammarGroupOf } = classifierFor(fromFile)
  const groupOf = (token: string) => {
    const group = grammarGroupOf(token)
    if (!group) return animationGroupFor(fromFile, token)
    if (categoryOf(group) !== "color") return group
    return themeGroupFor(fromFile, token) ?? group
  }
  return { groupOf }
}
