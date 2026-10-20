import * as path from "node:path"

import { editDistance } from "../grammar/similar"
import { memoize } from "../project/fs"
import { warnOnce } from "../project/warn"

const LISTED = 12
const listed = new WeakMap<Set<string>, string>()
const PLACEHOLDER = /\{\{\s*([^{}|]+?)\s*(?:\|([^{}]*))?\}\}/g
// The slots every finding offers, whatever the rule.
const UNIVERSAL_KEYS = [
  "className",
  "property",
  "component",
  "suggestions",
  "file",
]
const MESSAGE_KEYS = new Set([
  ...UNIVERSAL_KEYS,
  "category",
  "channel",
  "variants",
  "wrapper",
  "sizes",
  "entries",
  "tokens",
  "suggestion",
  "replacement",
  "attribute",
  "value",
  "around",
  "where",
  "variantsSuffix",
])

// `physicalFilename` is what both linters set; the getter is older.
export function fileOf(context: any) {
  return context.physicalFilename ?? context.getFilename?.() ?? ""
}

export function displayPath(file: string, context: any) {
  const cwd = context.cwd ?? process.cwd()
  return memoize(`display-path:${cwd}\u0000${file}`, () => {
    const relative = path.relative(cwd, file)
    return (relative.startsWith("..") ? file : relative).replace(/\\/g, "/")
  })
}

export function listTokens(declared: Set<string>) {
  const cached = listed.get(declared)
  if (cached !== undefined) return cached
  const text = formatTokens(declared)
  listed.set(declared, text)
  return text
}

function formatTokens(declared: Set<string>) {
  const sorted = [...declared].sort((a, b) => {
    const fa = a.endsWith("-foreground") ? 1 : 0
    const fb = b.endsWith("-foreground") ? 1 : 0
    return fa - fb || a.localeCompare(b)
  })
  const shown = sorted.slice(0, LISTED)
  const rest = sorted.length - shown.length
  return rest > 0 ? `${shown.join(", ")} (+${rest} more)` : shown.join(", ")
}

function noteFor(context: any, namespace = "shadcn") {
  const note = context.settings?.[namespace]?.note
  if (note == null) return ""
  if (typeof note !== "string") {
    warnOnce(
      `${namespace === "shadcn" ? "settings" : namespace}:note`,
      `settings.${namespace}.note must be a string; it is ignored.`
    )
    return ""
  }
  return note.trim()
}

// Literal braces stay valid: warn only on a near-miss, and change neither
// the rendering nor the verdict.
export function checkMessage(message: string, label: string) {
  for (const [, key] of message.matchAll(PLACEHOLDER)) {
    if (MESSAGE_KEYS.has(key) || !/^[A-Za-z_$][\w$]*$/.test(key)) {
      continue
    }
    let nearest: string | null = null
    let closest = 3
    for (const candidate of MESSAGE_KEYS) {
      const d = editDistance(key.toLowerCase(), candidate.toLowerCase())
      if (d < closest) {
        nearest = candidate
        closest = d
      } else if (d === closest) {
        nearest = null
      }
    }
    if (nearest) {
      warnOnce(
        `placeholder:${JSON.stringify([label, key])}`,
        `Unknown message placeholder "{{${key}}}" in ${/^(shadcn|mui)\//.test(label) ? label : `contract "${label}"`}. Did you mean "{{${nearest}}}"? It will remain literal.`
      )
    }
  }
}

// {{key|fallback}} covers an empty slot, so a message reads well for a
// component with no variants. An unknown key is left as written.
function interpolate(text: string, data: Record<string, unknown>) {
  return text.replace(
    PLACEHOLDER,
    (match, key: string, fallback: string | undefined) => {
      if (!Object.hasOwn(data, key)) {
        return match
      }
      const value = data[key] == null ? "" : String(data[key])
      return value !== "" ? value : (fallback?.trim() ?? "")
    }
  )
}

function ruleMessageFor(rule: string, option: unknown) {
  if (option == null) return ""
  if (typeof option !== "string") {
    warnOnce(
      `${rule}:message`,
      `${rule}: the message option must be a string; it is ignored.`
    )
    return ""
  }
  checkMessage(option, rule)
  return option.trim()
}

// The data a rule reports stays in place for its own templates.
function withUniversalSlots(data: Record<string, unknown>) {
  const first = (...keys: string[]) => {
    for (const key of keys) {
      const value = data[key]
      if (value != null && String(value) !== "") return String(value)
    }
    return ""
  }
  return {
    ...data,
    className:
      first("className") ||
      (data.attribute ? `${data.attribute}="${data.value ?? ""}"` : ""),
    property: first("property"),
    component: first("component"),
    suggestions: first("suggestions", "replacement", "suggestion"),
    file: first("file"),
  }
}

// `override` is the project's own text for this finding: a contract's
// message, per call. With no words of the project's, the descriptor is
// reported as it is, by message id.
export function reporter(
  context: any,
  messages: Record<string, string>,
  options: { rule?: string; message?: unknown; namespace?: string } = {}
) {
  const note = noteFor(context, options.namespace)
  const ruleMessage = ruleMessageFor(options.rule ?? "shadcn", options.message)
  return (descriptor: any, override?: string | null) => {
    const text =
      typeof override === "string" && override.trim() !== ""
        ? override.trim()
        : ruleMessage
    if (!text && !note) {
      context.report(descriptor)
      return
    }
    const data = withUniversalSlots(descriptor.data ?? {})
    const { messageId, ...rest } = descriptor
    const base = interpolate(text || (messages[messageId] ?? ""), data)
    const parts = [base, note].filter((p) => p !== "")
    context.report({ ...rest, message: parts.join(" ") })
  }
}
