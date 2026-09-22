// The opening tags of a single-file component's template, read as text.
// The project model parses scripts with the parser it already has and
// never loads a framework compiler, so a wrapper's markup is scanned for
// the one thing asked of it: which element the received class lands on.

export type TemplateTag = {
  name: string
  // A Svelte `{...rest}` has no name; its value keeps the braces.
  attributes: { name: string; value: string }[]
  // Zero for an element at the template's root.
  depth: number
}

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
])

const blank = (text: string) => text.replace(/[^\n\r]/g, " ")

// Svelte's markup is the file without its script and style blocks; Vue's
// is the inside of the root <template>.
function markupOf(source: string, file: string) {
  if (/\.vue$/i.test(file)) {
    const open = source.match(/<template\b[^>]*>/)
    const close = source.lastIndexOf("</template")
    if (!open || open.index === undefined || close < open.index) return ""
    const start = open.index + open[0].length
    return blank(source.slice(0, start)) + source.slice(start, close)
  }
  return source.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, (block) =>
    blank(block)
  )
}

// The index past a quoted string or a balanced `{...}` starting at `i`.
function skipValue(text: string, i: number) {
  const quote = text[i]
  if (quote === '"' || quote === "'" || quote === "`") {
    const end = text.indexOf(quote, i + 1)
    return end === -1 ? text.length : end + 1
  }
  if (quote !== "{") {
    while (i < text.length && !/[\s>]/.test(text[i])) i++
    return i
  }
  let depth = 0
  for (; i < text.length; i++) {
    const char = text[i]
    if (char === '"' || char === "'" || char === "`") {
      i = skipValue(text, i) - 1
    } else if (char === "{") {
      depth++
    } else if (char === "}" && --depth === 0) {
      return i + 1
    }
  }
  return i
}

export function templateTags(source: string, file: string) {
  const text = markupOf(source, file)
  const tags: TemplateTag[] = []
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "<") continue
    if (text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i)
      i = end === -1 ? text.length : end + 2
      continue
    }
    if (text[i + 1] === "/") {
      depth = Math.max(0, depth - 1)
      continue
    }
    const name = text.slice(i + 1).match(/^[A-Za-z][\w:.-]*/)?.[0]
    if (!name) continue
    const tag: TemplateTag = { name, attributes: [], depth }
    let selfClosing = false
    i += 1 + name.length
    while (i < text.length) {
      while (i < text.length && /\s/.test(text[i])) i++
      if (text[i] === ">") break
      if (text[i] === "/") {
        selfClosing = true
        i++
        continue
      }
      if (text[i] === "{") {
        const end = skipValue(text, i)
        tag.attributes.push({ name: "", value: text.slice(i, end) })
        i = end
        continue
      }
      const start = i
      while (i < text.length && !/[\s=>/]/.test(text[i])) i++
      const attribute = { name: text.slice(start, i), value: "" }
      if (text[i] === "=") {
        const end = skipValue(text, i + 1)
        attribute.value = text.slice(i + 1, end)
        i = end
      }
      if (i === start) i++
      else tag.attributes.push(attribute)
    }
    tags.push(tag)
    if (!selfClosing && !VOID.has(name)) depth++
  }
  return tags
}
