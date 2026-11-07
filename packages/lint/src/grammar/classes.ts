// Brackets and parens keep their inner colons, so an arbitrary variant
// and font-(family-name:--code-font) survive.
export function splitVariants(token: string) {
  if (!token.includes(":")) return { variants: [], base: token }
  const segments: string[] = []
  let bracketDepth = 0
  let parenDepth = 0
  let current = ""
  for (const char of token) {
    if (char === "[") {
      bracketDepth++
    } else if (char === "]") {
      bracketDepth--
    } else if (bracketDepth === 0) {
      if (char === "(") {
        parenDepth++
      } else if (char === ")") {
        parenDepth--
      }
    }
    if (char === ":" && bracketDepth === 0 && parenDepth === 0) {
      segments.push(current)
      current = ""
      continue
    }
    current += char
  }
  segments.push(current)
  return {
    variants: segments.slice(0, -1),
    base: segments[segments.length - 1],
  }
}

export function splitClasses(value: string) {
  return value.split(/\s+/).filter(Boolean)
}

// Marker classes style nothing and have no group; they count as layout.
const MARKERS = new Set(["group", "peer", "dark", "light"])

export function isMarkerClass(token: string) {
  return MARKERS.has(normalizeClass(token).split("/")[0])
}

// What contracts and classification match against.
export function normalizeClass(token: string) {
  const { base } = splitVariants(token)
  return base.replace(/^!/, "").replace(/!$/, "").replace(/^-/, "")
}

// mt-[13px], bg-[#333]. The v4 paren shorthand bg-(--x) is deliberately
// NOT arbitrary: it names a CSS variable, which is almost always a real
// token. Raw colors laundered through one are caught where they are set.
// Searched for rather than matched, so a token of a thousand unclosed
// brackets costs one pass, not one per bracket.
export function isArbitraryValue(token: string) {
  if (!token.includes("[")) return false
  const { base } = splitVariants(token)
  const open = base.indexOf("-[")
  if (open !== -1 && base.includes("]", open + 2)) return true
  // An arbitrary property keeps its important marker on either side
  // ([color:red]!, legacy ![color:red]); it is not part of the property.
  const property = base.replace(/^!/, "").replace(/!$/, "")
  return /^\[[^\]]+\]$/.test(property) && property.slice(2, -2).includes(":")
}

// The utilities that take a color. Longest alternatives first, so
// text-shadow-primary is a text-shadow color, not text "shadow-primary".
export const COLOR_PREFIX =
  /^(?:text-shadow|inset-shadow|inset-ring|drop-shadow|scrollbar-(?:thumb|track)|ring-offset|border(?:-[trblxyse]|-[bi][se])?|divide(?:-[xy])?|mask-(?:linear|radial|conic|[trblxy])-(?:from|to)|bg|text|ring|outline|fill|stroke|from|via|to|accent|caret|decoration|placeholder|shadow)-/

const PALETTE = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "mauve",
  "olive",
  "mist",
  "taupe",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
]

// A bracket or paren holds no other: each match attempt then stops at
// the next one, so /[/[/[ is not searched once per slash.
export const OPACITY_MODIFIER = /\/(?:[\w.%]+|\[[^[\]]*\]|\([^()]*\))$/

const PALETTE_RE = new RegExp(
  `${COLOR_PREFIX.source}(?:${PALETTE.join("|")})-\\d{2,3}(?:${OPACITY_MODIFIER.source})?$`
)

export function isPaletteClass(token: string) {
  return PALETTE_RE.test(normalizeClass(token))
}

// hover:!bg-zinc-100 with "bg-muted" is hover:!bg-muted.
export function withBase(token: string, base: string) {
  const { variants, base: original } = splitVariants(token)
  const leadingBang = original.startsWith("!") ? "!" : ""
  const trailingBang = !leadingBang && original.endsWith("!") ? "!" : ""
  const stripped = original.replace(/^!/, "").replace(/!$/, "")
  const negative = stripped.startsWith("-") ? "-" : ""
  const prefix = variants.length ? `${variants.join(":")}:` : ""
  return `${prefix}${leadingBang}${negative}${base}${trailingBang}`
}

// Whole tokens only, so replacing bg-zinc-100 leaves bg-zinc-1000 alone.
export function replaceClass(
  value: string,
  token: string,
  replacement: string
) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return value.replace(
    new RegExp(`(^|\\s)${escaped}(?=\\s|$)`),
    (_, lead: string) => `${lead}${replacement}`
  )
}
