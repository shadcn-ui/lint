// no-unknown-classes: a class Tailwind does not know generates no CSS and
// fails silently. The project's own Tailwind answers, through the worker
// in src/tailwind; without it, the cn grammar and the project's CSS do.
// See docs/rules/no-unknown-classes.md.

import { categoryOf } from "../grammar/categories"
import { isMarkerClass, normalizeClass, splitClasses } from "../grammar/classes"
import { didYouMean } from "../grammar/similar"
import { projectClassifierFor } from "../project/namespaces"
import {
  colorTokensFor,
  knownClassesFor,
  tailwindEntryFor,
  themeFileFor,
  utilityPrefixesOf,
} from "../project/theme"
import { classSiteVisitors } from "../sites/collect"
import { unknownClasses } from "../tailwind/client"
import { compileVocabularyPolicy, configErrorVisitors } from "./contracts"
import { classSuggestions } from "./fixes"
import { displayPath, fileOf, reporter } from "./messages"
import { colorValueOf } from "./no-raw-colors"
import { policySchema, recognitionSchema } from "./policy-schema"
import { withSettings } from "./settings"

const MESSAGES = {
  unknownClass:
    '"{{className}}" is not a class this project\'s Tailwind knows, so no CSS is generated for it. Fix the spelling, or declare it with @utility in {{file}}.',
  unknownClassSuggest:
    '"{{className}}" is not a class this project\'s Tailwind knows, so no CSS is generated for it. Did you mean "{{suggestion}}"?',
  unknownVariant:
    '"{{className}}" uses a variant this project\'s Tailwind does not know, so no CSS is generated for it. Use an existing variant, or declare it with @custom-variant in {{file}}.',
  useSuggestion: 'Replace with "{{suggestion}}".',
}

export const noUnknownClasses = {
  meta: {
    type: "problem" as const,
    hasSuggestions: true,
    docs: {
      description:
        "Disallow classes Tailwind does not know; no CSS is generated for them.",
      url: "https://github.com/shadcn-ui/lint/blob/main/docs/rules/no-unknown-classes.md",
    },
    schema: [
      {
        type: "object",
        properties: {
          ...policySchema,
          ...recognitionSchema,
        },
        additionalProperties: false,
      },
    ],
    messages: MESSAGES,
  },
  create(context: any) {
    const options = withSettings(context, context.options?.[0] ?? {})
    const emit = reporter(context, MESSAGES, {
      rule: "shadcn/no-unknown-classes",
      message: options.message,
    })
    const filename = fileOf(context)
    let policy: ReturnType<typeof compileVocabularyPolicy>
    try {
      policy = compileVocabularyPolicy(
        { ...options, uncheckedEntries: true, fromFile: filename },
        "shadcn/no-unknown-classes"
      )
    } catch (error) {
      return configErrorVisitors(context, error)
    }
    const { groupOf } = projectClassifierFor(filename)
    const known = knownClassesFor(filename)
    const themeFile = themeFileFor(filename)
    const file = themeFile ? displayPath(themeFile, context) : "your theme CSS"
    // A theme file that does not import Tailwind knows no base utilities,
    // so the grammar answers instead of a half-built design system.
    const entry = tailwindEntryFor(filename)
    const utilityPrefixes = utilityPrefixesOf(known.utilities)

    // What the project's CSS settles without asking Tailwind.
    const settled = (token: string) => {
      const base = normalizeClass(token)
      if (!base) return true
      if (base.startsWith("[")) return true
      if (isMarkerClass(token)) return true
      return known.classes.has(base.replace(/\/[\w.%]+$/, ""))
    }

    // Without Tailwind: the cn grammar plus @utility names.
    const knownByGrammar = (token: string) => {
      if (groupOf(token)) return true
      const bare = normalizeClass(token).replace(/\/[\w.%]+$/, "")
      if (known.utilities.has(bare)) return true
      return utilityPrefixes.some((prefix) => bare.startsWith(prefix))
    }

    const report = (
      node: any,
      token: string,
      suggestion: string | null,
      words: string | null,
      component: string,
      variantOnly = false
    ) => {
      emit(
        {
          node,
          messageId: suggestion
            ? "unknownClassSuggest"
            : variantOnly
              ? "unknownVariant"
              : "unknownClass",
          data: {
            className: token,
            component,
            file,
            suggestion: suggestion ?? "",
          },
          suggest: suggestion
            ? classSuggestions(
                node,
                context,
                token,
                [suggestion],
                "useSuggestion",
                "suggestion"
              )
            : undefined,
        },
        words
      )
    }

    const isColor = (token: string) => categoryOf(groupOf(token)) === "color"

    // Who owns a class the grammar files under a color that generates no
    // CSS: an undeclared token or a near-miss of one is no-raw-colors'
    // finding, a typo of another utility (text-smal) is this rule's.
    // no-raw-colors applies the same test, so it is reported once.
    let declared: ReturnType<typeof colorTokensFor> | undefined
    const ownsColorTypo = (token: string, suggestion: string | null) => {
      if (!suggestion || isColor(suggestion)) return false
      const value = colorValueOf(token)
      if (!value) return true
      declared ??= colorTokensFor(filename)
      return !declared || !didYouMean(value, declared)
    }

    return classSiteVisitors(context, options, (site) => {
      for (const { value, node } of site.vocabularyStrings) {
        const wordsFor = new Map<string, string | null>()
        const tokens = splitClasses(value).filter((token) => {
          if (settled(token)) return false
          const exemption = policy.decide(site.component, token)
          if (exemption.kind === "ok") return false
          wordsFor.set(token, exemption.message)
          return true
        })
        if (!tokens.length) continue
        // The worker tells a misspelled variant on a real color from a
        // utility that only looks like one, prefix and all.
        const asked = entry ? unknownClasses(entry, tokens) : null
        if (asked) {
          for (const { token, suggestion, baseKnown } of asked) {
            if (
              isColor(token) &&
              !baseKnown &&
              !ownsColorTypo(token, suggestion)
            )
              continue
            report(
              node,
              token,
              suggestion,
              wordsFor.get(token) ?? null,
              site.component ?? "",
              baseKnown && token.includes(":")
            )
          }
          continue
        }
        for (const token of tokens) {
          if (!knownByGrammar(token))
            report(
              node,
              token,
              null,
              wordsFor.get(token) ?? null,
              site.component ?? ""
            )
        }
      }
    })
  },
}
