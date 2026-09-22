// svelte-eslint-parser puts the template in Program.body, and its scope
// analysis covers it, so identifiers in a mustache tag resolve to the
// script the way JSX expressions do.

import type { TemplateReader } from "./types"

const templates = new WeakMap<object, any>()

// `class="p-4 {active ? 'a' : ''}"` is a template literal written in
// markup: the text parts are its quasis, the mustache tags its
// expressions. Built once per attribute so every rule sees one node.
function templateOf(attribute: any) {
  let template = templates.get(attribute)
  if (template) return template
  const parts: any[] = attribute.value
  template = {
    type: "TemplateLiteral",
    quasis: [] as any[],
    expressions: [] as any[],
    range: [parts[0].range[0], parts[parts.length - 1].range[1]],
    loc: { start: parts[0].loc.start, end: parts[parts.length - 1].loc.end },
    parent: attribute,
  }
  let text = ""
  let first: any = null
  let last: any = null
  const flush = (at: any) => {
    const from = first ?? at
    const to = last ?? at
    template.quasis.push({
      type: "TemplateElement",
      value: { cooked: text, raw: text },
      tail: false,
      range: first ? [from.range[0], to.range[1]] : [at.range[0], at.range[0]],
      loc: first
        ? { start: from.loc.start, end: to.loc.end }
        : { start: at.loc.start, end: at.loc.start },
      parent: template,
    })
    text = ""
    first = last = null
  }
  for (const part of parts) {
    if (part.type === "SvelteLiteral") {
      text += part.value
      first ??= part
      last = part
    } else {
      flush(part)
      template.expressions.push(part.expression)
    }
  }
  flush(parts[parts.length - 1])
  template.quasis[template.quasis.length - 1].tail = true
  templates.set(attribute, template)
  return template
}

function valueOf(attribute: any) {
  const parts: any[] = attribute?.value ?? []
  if (!parts.length) return null
  if (parts.length === 1) return parts[0]
  return templateOf(attribute)
}

function nameText(name: any): string {
  if (name?.type === "SvelteMemberExpressionName") {
    return `${nameText(name.object)}.${name.property?.name ?? ""}`
  }
  return name?.name ?? ""
}

export const svelteReader: TemplateReader = {
  attributes: ["SvelteAttribute"],
  spreads: ["SvelteSpreadAttribute"],
  classObjects: true,
  staticStyles: true,
  attributeName: (node) =>
    typeof node?.key?.name === "string" ? node.key.name : "",
  attributeValue: valueOf,
  spreadArgument: (node) => node.argument,
  elementOf(node) {
    const element = node?.parent?.parent
    return element?.type === "SvelteElement" ? element : null
  },
  nameOf(element) {
    const name = element?.name
    if (!name) return null
    const member = name.type === "SvelteMemberExpressionName"
    const root = member ? name.object?.name : name.name
    return {
      root: typeof root === "string" ? root : "",
      property: member ? (name.property?.name ?? "") : null,
      text: nameText(name),
      component: element.kind === "component",
    }
  },
  // Blocks and snippets are not layout parents.
  parentElementOf(element) {
    for (let node = element?.parent; node; node = node.parent) {
      if (node.type === "SvelteElement") return node
    }
    return null
  },
  extraSites: {
    // `class:active={cond}`: the class is the directive's own name.
    SvelteDirective(node) {
      if (node.kind !== "Class") return null
      const name = node.key?.name
      return typeof name?.name === "string"
        ? { names: [{ value: name.name, node: name }], anchor: node }
        : null
    },
  },
  styleProperties: {
    // `style:color={value}` sets one property.
    SvelteStyleDirective(node) {
      const property = node.key?.name?.name
      return typeof property === "string"
        ? { property, value: valueOf(node) ?? node.key.name }
        : null
    },
  },
}
