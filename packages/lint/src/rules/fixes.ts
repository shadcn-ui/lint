// A suggestion rewrites one class inside a literal's own source text,
// never re-serializing it, so quotes, escapes and entities survive. A
// class not found verbatim there gets no suggestion rather than a wrong
// one.

import { replaceClass } from "../grammar/classes"
import { isMarkupLiteral } from "../sites/readers"

// Markup text is its own source: nothing is escaped, and the quotes, if
// the node has them at all, stay where they are.
function replaceInMarkup(
  node: any,
  context: any,
  token: string,
  replacement: string
) {
  const raw: string = context.sourceCode?.getText?.(node) ?? ""
  const quote = raw[0] === '"' || raw[0] === "'" ? raw[0] : ""
  const inner = quote ? raw.slice(1, -1) : raw
  if (quote && raw[raw.length - 1] !== quote) return null
  const replaced = replaceClass(inner, token, replacement)
  return replaced === inner ? null : `${quote}${replaced}${quote}`
}

export function replaceInLiteral(
  node: any,
  context: any,
  token: string,
  replacement: string
) {
  if (isMarkupLiteral(node) && typeof node.value === "string") {
    return replaceInMarkup(node, context, token, replacement)
  }
  if (node?.type !== "Literal" || typeof node.value !== "string") return null
  const raw: string = node.raw ?? context.sourceCode?.getText?.(node) ?? ""
  const quote = raw[0]
  if ((quote !== '"' && quote !== "'") || raw[raw.length - 1] !== quote) {
    return null
  }
  const inner = raw.slice(1, -1)
  // Escapes and line continuations move classes between source and value;
  // a JSX attribute decodes entities without moving anything.
  const inJsx = node.parent?.type === "JSXAttribute"
  if (!inJsx && inner !== node.value) return null
  const replaced = replaceClass(inner, token, replacement)
  return replaced === inner ? null : `${quote}${replaced}${quote}`
}

export function classSuggestion(
  node: any,
  context: any,
  token: string,
  replacement: string,
  messageId: string,
  data: Record<string, string>
) {
  const text = replaceInLiteral(node, context, token, replacement)
  if (text === null) return null
  return {
    messageId,
    data,
    fix: (fixer: any) => fixer.replaceText(node, text),
  }
}

// Undefined rather than an empty list, so a report carries none.
export function classSuggestions(
  node: any,
  context: any,
  token: string,
  replacements: string[],
  messageId: string,
  key: string
) {
  const list = replacements
    .map((replacement) =>
      classSuggestion(node, context, token, replacement, messageId, {
        [key]: replacement,
      })
    )
    .filter((s) => s !== null)
  return list.length ? list : undefined
}
