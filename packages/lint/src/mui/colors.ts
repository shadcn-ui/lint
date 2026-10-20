import { parseColor } from "../grammar/colors"

const keywords = new Set([
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
  "currentcolor",
  "transparent",
])

const paintFunctions = new Set([
  "var",
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "oklch",
  "oklab",
  "lab",
  "lch",
  "color",
  "color-mix",
  "light-dark",
  "calc",
  "min",
  "max",
  "clamp",
  "linear-gradient",
  "radial-gradient",
  "conic-gradient",
  "repeating-linear-gradient",
  "repeating-radial-gradient",
  "repeating-conic-gradient",
  "image",
  "image-set",
  "-webkit-image-set",
  "cross-fade",
])

// CSS strings and opaque image/function arguments are not color operands.
function withoutReferences(text: string): string {
  let output = ""
  let cursor = 0
  for (const match of text.matchAll(/\/\*|(["'])|([a-z_-][\w-]*)\(/g)) {
    if (match.index < cursor) continue
    if (match[2] && paintFunctions.has(match[2])) continue
    output += text.slice(cursor, match.index)
    if (match[0] === "/*") {
      const close = text.indexOf("*/", match.index + 2)
      if (close < 0) return output
      output += " "
      cursor = close + 2
      continue
    }
    let end = match.index + match[0].length
    let depth = match[1] ? 0 : 1
    let quote = match[1] ?? ""
    for (; end < text.length && (depth || quote); end++) {
      const char = text[end]
      if (char === "\\") {
        end++
      } else if (quote) {
        if (char === quote) quote = ""
      } else if (char === "/" && text[end + 1] === "*") {
        const close = text.indexOf("*/", end + 2)
        if (close < 0) return output
        end = close + 1
      } else if (char === '"' || char === "'") {
        quote = char
      } else if (char === "(") {
        depth++
      } else if (char === ")") {
        depth--
      }
    }
    if (depth || quote) return output
    output += " "
    cursor = end
  }
  return output + text.slice(cursor)
}

export function isRawColor(value: unknown): boolean {
  if (typeof value !== "string") return false
  const text = value.trim().toLowerCase()
  if (keywords.has(text) || /^[\w-]+(?:\.[\w-]+)+$/.test(text)) return false
  if (parseColor(text)) return true
  const clean = withoutReferences(text).replace(/--[\w-]+/g, " ")
  if (/#[0-9a-f]{3,8}\b/.test(clean)) return true
  if (/\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch)\(\s*[-+\d.]/.test(clean))
    return true
  if (/\bcolor\(\s*[\w-]+\s+[-+\d.]/.test(clean)) return true
  for (const match of clean.matchAll(
    /\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\(/g
  )) {
    let depth = 1
    let end = match.index + match[0].length
    const start = end
    while (end < clean.length && depth > 0) {
      if (clean[end] === "(") depth++
      if (clean[end] === ")") depth--
      end++
    }
    const body = clean.slice(start, end - 1)
    if (depth === 0 && !/\bvar\(|\bfrom\b|\bcurrentcolor\b/.test(body))
      return true
  }
  return (clean.match(/[a-z][a-z-]*/g) ?? []).some(
    (word) => !keywords.has(word) && parseColor(word) !== null
  )
}
