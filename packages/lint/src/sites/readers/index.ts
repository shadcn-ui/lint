import { isSfc } from "../../project/parser"
import { warnOnce } from "../../project/warn"
import { fileOf } from "../../rules/messages"
import { jsxReader } from "./jsx"
import { svelteReader } from "./svelte"
import type { Visitors } from "./types"
import { vueReader } from "./vue"

export type { ElementName, ExtraSite, TemplateReader, Visitors } from "./types"

const readers = [jsxReader, svelteReader, vueReader]

// The parser decides: each template language has its own node types, so
// a reader only ever meets the nodes it was written for.
export function readerFor(context: any) {
  const services = context?.sourceCode?.parserServices
  if (services?.isSvelte) return svelteReader
  if (typeof services?.defineTemplateBodyVisitor === "function") {
    return vueReader
  }
  return jsxReader
}

// The node that wraps an expression in an attribute, by the attribute
// type that holds it.
const CONTAINERS: Record<string, string> = {
  JSXExpressionContainer: "JSXAttribute",
  SvelteMustacheTag: "SvelteAttribute",
  VExpressionContainer: "VAttribute",
}

const LITERALS = new Set(["Literal", "SvelteLiteral", "VLiteral"])

// One node type can carry two roles (Vue's VAttribute is an attribute
// and a spread), so a second visitor joins the first.
export function addVisitor(
  visitors: Visitors,
  type: string,
  visit: (node: any) => void
) {
  const existing = visitors[type]
  visitors[type] = existing
    ? (node) => {
        existing(node)
        visit(node)
      }
    : visit
}

export function isContainer(node: any) {
  return typeof node?.type === "string" && node.type in CONTAINERS
}

// The attribute an expression container is the value of.
export function attributeOfContainer(container: any) {
  const attribute = container?.parent
  return attribute && CONTAINERS[container.type] === attribute.type
    ? attribute
    : null
}

export function attributeNameIn(attribute: any) {
  const reader = readers.find((r) => r.attributes.includes(attribute?.type))
  return reader ? reader.attributeName(attribute) : ""
}

// A class or style string as the markup spells it.
export function isMarkupLiteral(node: any) {
  return node?.type !== "Literal" && LITERALS.has(node?.type)
}

// A string written in the attribute, bare or inside a container.
export function staticStringOf(value: any) {
  const node = isContainer(value) ? value.expression : value
  return LITERALS.has(node?.type) && typeof node.value === "string"
    ? (node.value as string)
    : null
}

// What every rule's visitors go through before the linter gets them.
//
// Vue's template visitors only run when they are registered through the
// parser. The same handlers serve both halves: a node type belongs to
// one half or the other, and a call or a string can sit in either. The
// parser writes its trigger onto the script half, so each half gets an
// object of its own.
//
// A .svelte or .vue file that arrives without its framework's parser has
// only its script blocks in the AST (Oxlint does this). Passing quietly
// would read as "checked", so it says so once.
export function withTemplates<T extends { create: (context: any) => any }>(
  rule: T
) {
  return {
    ...rule,
    create(context: any) {
      const visitors = rule.create(context)
      const services = context.sourceCode?.parserServices
      const define = services?.defineTemplateBodyVisitor
      if (typeof define === "function") {
        return define({ ...visitors }, { ...visitors })
      }
      if (!services?.isSvelte && isSfc(fileOf(context) ?? "")) {
        warnOnce(
          "templates:unread",
          "Templates in .svelte and .vue files are read under ESLint with svelte-eslint-parser or vue-eslint-parser. This run has no template parser, so only their script blocks are linted. See https://github.com/shadcn-ui/lint/blob/main/docs/vue.md and https://github.com/shadcn-ui/lint/blob/main/docs/svelte.md."
        )
      }
      return visitors
    },
  }
}
