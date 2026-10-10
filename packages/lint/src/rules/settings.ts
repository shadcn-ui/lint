// settings.shadcn: the recognition options written once instead of once
// per rule, with a rule's own option winning. `ui` is an import prefix,
// what components.json's aliases.ui is for projects without that file.
// `themeImports` is the project's, not a rule's: it goes to the theme
// reader rather than into the options.

import { setThemeImports } from "../project/theme"
import { warnOnce } from "../project/warn"
import { fileOf } from "./messages"

const SHARED = [
  "componentImports",
  "ignoreImports",
  "mergeFunctions",
  "variantFunctions",
] as const

function strings(value: unknown, key: string) {
  const list = Array.isArray(value) ? value : value == null ? [] : [value]
  if (!list.every((v) => typeof v === "string")) {
    warnOnce(
      `settings:${key}`,
      `settings.shadcn.${key} must be a string or an array of strings; it is ignored.`
    )
    return null
  }
  return list as string[]
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const themePatterns = new Map<string, RegExp | null>()

function themePatternOf(pattern: string) {
  let re = themePatterns.get(pattern)
  if (re === undefined) {
    try {
      re = new RegExp(pattern)
    } catch {
      re = null
      warnOnce(
        `settings:themeImports:${pattern}`,
        `settings.shadcn.themeImports has an invalid pattern, ${pattern}; it is ignored.`
      )
    }
    themePatterns.set(pattern, re)
  }
  return re
}

// Stylesheets whose @import specifier matches count as the project's own
// theme, though they resolve into node_modules: a design system published
// as a package.
function recordThemeImports(context: any, settings: any) {
  const value =
    settings && typeof settings === "object" ? settings.themeImports : null
  const list = value == null ? [] : (strings(value, "themeImports") ?? [])
  setThemeImports(
    fileOf(context),
    list.map(themePatternOf).filter((re): re is RegExp => re !== null)
  )
}

export function withSettings<T extends Record<string, unknown>>(
  context: any,
  options: T
) {
  const settings = context.settings?.shadcn
  recordThemeImports(context, settings)
  if (!settings || typeof settings !== "object") return options
  const merged: Record<string, unknown> = { ...options }
  for (const key of SHARED) {
    if (merged[key] !== undefined || settings[key] === undefined) continue
    const list = strings(settings[key], key)
    if (list) merged[key] = list
  }
  if (settings.ui !== undefined) {
    const prefixes = strings(settings.ui, "ui") ?? []
    if (prefixes.length) {
      // The prefixes name directories too: a tag with no import, such as
      // an auto-imported <UiButton>, is matched by name there.
      merged.ui = prefixes
      merged.componentImports = [
        ...((merged.componentImports as string[] | undefined) ?? []),
        ...prefixes.map((prefix) => `^${escapeRegExp(prefix)}(/|$)`),
      ]
    }
  }
  return merged as T
}
