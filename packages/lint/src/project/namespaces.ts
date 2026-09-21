// cn's grammar reads a class by its shape, so every text-* and shadow-*
// with a name it does not know is a color. Tailwind reads the same class
// against the project's theme, where a declared --text-stat-label makes
// it a font-size and --shadow-card-glow a box-shadow. This is the theme's
// half of that answer: the grammar with the project's namespaces applied.

import { categoryOf } from "../grammar/categories"
import { normalizeClass, OPACITY_MODIFIER } from "../grammar/classes"
import { classifierFor } from "../grammar/classifier"
import {
  declaresClass,
  themeVocabularyFor,
  type ThemeVocabulary,
} from "./theme"

// Longest prefix first: text-shadow-crisp is a text-shadow, not text
// "shadow-crisp".
const NAMESPACES: {
  // The prefix as written in the class.
  prefix: string
  // The @theme namespace the utility reads, which is not always the
  // prefix: bg-stripes comes from --background-image-stripes.
  namespace: string
  // The cn group the class belongs to when the namespace answers.
  group: string
  // Whether the namespace wins over a --color-* of the same name. The
  // shadow family takes its own first; text- and bg- take the color.
  // Verified against Tailwind 4.3.3, not inferred from the docs.
  overColor: boolean
}[] = [
  {
    prefix: "text-shadow-",
    namespace: "text-shadow-",
    group: "text-shadow",
    overColor: true,
  },
  {
    prefix: "inset-shadow-",
    namespace: "inset-shadow-",
    group: "inset-shadow",
    overColor: true,
  },
  {
    prefix: "drop-shadow-",
    namespace: "drop-shadow-",
    group: "drop-shadow",
    overColor: true,
  },
  { prefix: "shadow-", namespace: "shadow-", group: "shadow", overColor: true },
  { prefix: "text-", namespace: "text-", group: "font-size", overColor: false },
  {
    prefix: "bg-",
    namespace: "background-image-",
    group: "bg-image",
    overColor: false,
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

function lookup(vocabulary: ThemeVocabulary, token: string) {
  const base = normalizeClass(token)
  const entry = NAMESPACES.find((n) => base.startsWith(n.prefix))
  if (!entry) return null
  const value = valueOf(base, entry.prefix)
  if (!value) return null
  if (!entry.overColor && vocabulary.tokens.has(value)) return null
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

// cn groups only Tailwind's own animations, so that merging never drops a
// plugin's animate-once. A project's animation is one its CSS declares:
// --animate-shimmer in @theme, or animate-in from an @utility or selector.
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
