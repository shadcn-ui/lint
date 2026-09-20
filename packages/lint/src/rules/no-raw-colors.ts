// no-raw-colors: color utilities use the theme's declared tokens, never
// the raw palette. See docs/rules/no-raw-colors.md.

import { categoryOf } from "../grammar/categories"
import {
  COLOR_PREFIX,
  isArbitraryValue,
  isPaletteClass,
  normalizeClass,
  OPACITY_MODIFIER,
  splitClasses,
  withBase,
} from "../grammar/classes"
import { isNamedColor, parseColor } from "../grammar/colors"
import { projectClassifierFor } from "../project/namespaces"
import {
  colorTokensFor,
  colorValuesFor,
  declaresUtility,
  scopedColorTokensFor,
  tailwindEntryFor,
  themeFileFor,
} from "../project/theme"
import { classSiteVisitors } from "../sites/collect"
import { unknownClasses } from "../tailwind/client"
import { compileVocabularyPolicy, configErrorVisitors } from "./contracts"
import { classSuggestions } from "./fixes"
import { displayPath, fileOf, listTokens, reporter } from "./messages"
import { policySchema, recognitionSchema } from "./policy-schema"
import { withSettings } from "./settings"
import { didYouMean, nearestColorTokens, paletteColor, roleOf } from "./suggest"

const NAMED = new Set(["white", "black", "transparent", "current", "inherit"])

// JSX attributes that take a color directly.
const COLOR_ATTRIBUTES = new Set([
  "fill",
  "stroke",
  "color",
  "stopColor",
  "floodColor",
  "lightingColor",
])

// Attribute values that defer to the cascade or to a token.
const ATTRIBUTE_ALLOWED = new Set([
  "currentColor",
  "currentcolor",
  "none",
  "inherit",
  "transparent",
  "initial",
  "unset",
])

const COLOR_FUNCTION =
  /^(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla|hwb|oklch|oklab|lab|lch|color|color-mix)\(.*\))$/

export function isRawColorValue(value: string) {
  const trimmed = value.trim()
  if (ATTRIBUTE_ALLOWED.has(trimmed)) return false
  if (COLOR_FUNCTION.test(trimmed)) return true
  return isNamedColor(trimmed)
}

// "hover:bg-zinc-100/50" as prefix "bg-", value "zinc-100", opacity
// "/50". Null when the class carries no color value to judge.
export function splitColorClass(token: string) {
  const base = normalizeClass(token)
  const match = base.match(COLOR_PREFIX)
  if (!match) return null
  const rest = base.slice(match[0].length)
  const opacity = rest.match(OPACITY_MODIFIER)?.[0] ?? ""
  const value = rest.slice(0, rest.length - opacity.length)
  if (!value || value.startsWith("[") || value.startsWith("(")) return null
  return { prefix: match[0], value, opacity }
}

export function colorValueOf(token: string) {
  return splitColorClass(token)?.value ?? null
}

const PREFIX_NAMESPACES: Record<string, string> = {
  bg: "background-color",
  text: "text-color",
  border: "border-color",
  divide: "divide-color",
  ring: "ring-color",
  outline: "outline-color",
  accent: "accent-color",
  caret: "caret-color",
  placeholder: "placeholder-color",
  decoration: "text-decoration-color",
  "text-shadow": "text-shadow-color",
  "drop-shadow": "drop-shadow-color",
  fill: "fill",
  stroke: "stroke",
}

// The @theme namespace a color utility reads before --color-*: "bg-"
// reads --background-color-*, "border-t-" reads --border-color-*. Null
// for a utility that reads --color-* only.
export function colorNamespaceOf(prefix: string) {
  const base = prefix.replace(/-$/, "")
  return (
    PREFIX_NAMESPACES[base] ??
    PREFIX_NAMESPACES[base.replace(/-(?:[trblxyse]|[bi][se])$/, "")] ??
    null
  )
}

type Verdict = {
  messageId: string
  data: Record<string, string>
  replacements?: string[]
} | null

// A project's class vocabulary repeats on every file, so each token is
// judged once per theme read.
const NO_THEME = {}
const verdicts = new WeakMap<object, Map<string, Map<string, Verdict>>>()

function verdictMemo(theme: object, key: string) {
  let byKey = verdicts.get(theme)
  if (!byKey) {
    byKey = new Map()
    verdicts.set(theme, byKey)
  }
  let memo = byKey.get(key)
  if (!memo) {
    memo = new Map()
    byKey.set(key, memo)
  }
  return memo
}

const MESSAGES = {
  paletteClass:
    '"{{className}}" uses the raw Tailwind palette. Use a theme token, or define one for this color.',
  paletteClassNear:
    '"{{className}}" uses the raw Tailwind palette. Nearest theme tokens: {{suggestions}}. Use one of those, or declare --color-<name> in {{file}} for a new color.',
  paletteClassFar:
    '"{{className}}" uses the raw Tailwind palette and no declared theme color is close to it. Use one of: {{tokens}}, or declare --color-<name> in {{file}} for a new color.',
  paletteClassListed:
    '"{{className}}" uses the raw Tailwind palette. Use one of the theme colors: {{tokens}}, or declare --color-<name> in {{file}} for a new color.',
  undeclaredToken:
    '"{{className}}" is not a declared theme color. Use one of: {{tokens}}. To add a color, declare --color-<name> in {{file}} first.',
  undeclaredTokenTypo:
    '"{{className}}" is not a declared theme color. Did you mean "{{suggestion}}"? Declared colors: {{tokens}}.',
  rawColorAttribute:
    '{{attribute}}="{{value}}" hardcodes a color. Use currentColor with a text color class, or var(--color-<token>).',
  rawColorAttributeNear:
    '{{attribute}}="{{value}}" hardcodes a color. Use currentColor with a text color class, or the nearest theme token: var(--color-{{suggestion}}).',
  useToken: 'Replace with "{{replacement}}".',
}

export const noRawColors = {
  meta: {
    type: "problem" as const,
    hasSuggestions: true,
    docs: {
      description:
        "Require theme tokens for color utilities instead of the raw Tailwind palette.",
      url: "https://github.com/shadcn-ui/lint/blob/main/docs/rules/no-raw-colors.md",
    },
    schema: [
      {
        type: "object",
        properties: {
          ...policySchema,
          ...recognitionSchema,
          scanAllStrings: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    messages: MESSAGES,
  },
  create(context: any) {
    const options = withSettings(context, context.options?.[0] ?? {})
    const emit = reporter(context, MESSAGES, {
      rule: "shadcn/no-raw-colors",
      message: options.message,
    })
    const filename = fileOf(context)
    let policy: ReturnType<typeof compileVocabularyPolicy>
    try {
      policy = compileVocabularyPolicy(
        { ...options, fromFile: filename },
        "shadcn/no-raw-colors"
      )
    } catch (error) {
      return configErrorVisitors(context, error)
    }
    const { groupOf } = projectClassifierFor(filename)
    let theme: ReturnType<typeof readTheme> | undefined
    function readTheme() {
      const declared = colorTokensFor(filename)
      const themeFile = themeFileFor(filename)
      const file = themeFile
        ? displayPath(themeFile, context)
        : "your theme CSS"
      return {
        declared,
        scoped: scopedColorTokensFor(filename),
        // The stylesheet the oracle can build: not every theme file
        // imports Tailwind.
        entry: tailwindEntryFor(filename),
        file,
        memo: verdictMemo(declared ?? NO_THEME, file),
      }
    }
    const themeFor = () => (theme ??= readTheme())
    let listed: string | undefined
    const tokenList = () =>
      (listed ??= themeFor().declared ? listTokens(themeFor().declared!) : "")

    let colors: ReturnType<typeof colorValuesFor> | undefined
    const suggestionColors = () => {
      if (colors === undefined) {
        colors = themeFor().declared ? colorValuesFor(filename) : null
      }
      return colors
    }
    const nearest = (token: string) => {
      const parts = splitColorClass(token)
      const lab = parts && paletteColor(parts.value)
      const values = suggestionColors()
      if (!parts || !lab || !values) return []
      return nearestColorTokens(lab, values, roleOf(parts.prefix)).map((name) =>
        withBase(token, `${parts.prefix}${name}${parts.opacity}`)
      )
    }

    const paletteVerdict = (token: string): Verdict => {
      const { declared, file } = themeFor()
      if (!declared)
        return { messageId: "paletteClass", data: { className: token } }
      if (!suggestionColors()?.size) {
        return {
          messageId: "paletteClassListed",
          data: { className: token, tokens: tokenList(), file },
        }
      }
      const suggestions = nearest(token)
      return {
        messageId: suggestions.length ? "paletteClassNear" : "paletteClassFar",
        data: {
          className: token,
          suggestions: suggestions.join(", "),
          tokens: tokenList(),
          file,
        },
        replacements: suggestions,
      }
    }

    // cn's color groups take any value, so text-smal classifies as a
    // color here. When Tailwind's nearest real class is not a color, the
    // typo belongs to no-unknown-classes and this rule stays quiet, so
    // the class is reported once.
    const isTypoOfAnotherUtility = (token: string) => {
      const { entry } = themeFor()
      const asked = entry ? unknownClasses(entry, [token]) : null
      const suggestion = asked?.[0]?.suggestion
      return !!suggestion && categoryOf(groupOf(suggestion)) !== "color"
    }

    // The tokens this utility can name: --color-* plus its own namespace.
    const tokensFor = (prefix: string) => {
      const { declared, scoped } = themeFor()
      const namespace = colorNamespaceOf(prefix)
      const own = namespace ? scoped?.get(namespace) : null
      if (!own?.size) return declared
      return new Set([...(declared ?? []), ...own])
    }

    const undeclaredVerdict = (token: string): Verdict => {
      const { file } = themeFor()
      const parts = splitColorClass(token)
      const declared = parts ? tokensFor(parts.prefix) : null
      const meant = parts && declared ? didYouMean(parts.value, declared) : null
      if (!meant && isTypoOfAnotherUtility(token)) return null
      if (parts && meant) {
        const suggestion = withBase(
          token,
          `${parts.prefix}${meant}${parts.opacity}`
        )
        return {
          messageId: "undeclaredTokenTypo",
          data: { className: token, suggestion, tokens: tokenList(), file },
          replacements: [suggestion],
        }
      }
      return {
        messageId: "undeclaredToken",
        data: { className: token, tokens: tokenList(), file },
      }
    }

    const judge = (token: string): Verdict => {
      if (isArbitraryValue(token)) return null
      const { declared } = themeFor()
      const parts = splitColorClass(token)
      const colorValue = parts?.value ?? null
      // A palette name the theme declares is one of its tokens.
      if (colorValue && declared?.has(colorValue)) return null
      // --background-color-surface declares bg-surface, and only that.
      if (parts && tokensFor(parts.prefix)?.has(parts.value)) return null
      if (isPaletteClass(token)) return paletteVerdict(token)
      if (!declared) return null
      if (categoryOf(groupOf(token)) !== "color") return null
      if (!colorValue || NAMED.has(colorValue)) return null
      // A class the project's CSS declares with @utility is its
      // vocabulary, whatever the name looks like: "not a declared theme
      // color" is false about a name the theme declares. A plain class
      // selector is not, so a raw color behind `.text-danger` still reports.
      if (declaresUtility(filename, token)) return null
      return undeclaredVerdict(token)
    }

    const verdictOf = (token: string) => {
      const { memo } = themeFor()
      let verdict = memo.get(token)
      if (verdict === undefined) {
        if (memo.size > 50_000) memo.clear()
        verdict = judge(token)
        memo.set(token, verdict)
      }
      return verdict
    }

    const visitors = classSiteVisitors(context, options, (site) => {
      for (const { value, node } of site.vocabularyStrings) {
        for (const token of splitClasses(value)) {
          const verdict = verdictOf(token)
          if (!verdict) continue
          const exemption = policy.decide(site.component, token)
          if (exemption.kind === "ok") continue
          const { replacements, ...report } = verdict
          emit(
            {
              node,
              ...report,
              data: { ...report.data, component: site.component ?? "" },
              suggest: classSuggestions(
                node,
                context,
                token,
                replacements ?? [],
                "useToken",
                "replacement"
              ),
            },
            exemption.message
          )
        }
      }
    })

    const classAttribute = visitors.JSXAttribute
    return {
      ...visitors,
      JSXAttribute(node: any) {
        classAttribute?.(node)
        const name = node.name?.name
        if (typeof name !== "string" || !COLOR_ATTRIBUTES.has(name)) return
        // On a component, color="red" is an enum prop.
        const tag = node.parent?.name
        if (tag?.type !== "JSXIdentifier" || !/^[a-z]/.test(tag.name)) return
        const value =
          node.value?.type === "Literal"
            ? node.value.value
            : node.value?.type === "JSXExpressionContainer" &&
                node.value.expression?.type === "Literal"
              ? node.value.expression.value
              : null
        if (typeof value !== "string" || !isRawColorValue(value)) return
        const values = suggestionColors()
        const lab = values?.size ? parseColor(value) : null
        const [suggestion] = lab
          ? nearestColorTokens(lab, values!, "text", 1)
          : []
        emit({
          node,
          messageId: suggestion ? "rawColorAttributeNear" : "rawColorAttribute",
          data: { attribute: name, value, suggestion: suggestion ?? "" },
        })
      },
    }
  },
}
