// vue-eslint-parser keeps the template outside Program.body and outside
// the scope analysis. Its visitors are registered through the parser's
// own service (see `withTemplates`), and an identifier in the template
// is looked up in the script by name, the way Vue itself binds it.

import type { TemplateReader } from "./types"

// `:class` and `v-bind:class` name their attribute in the argument. A
// dynamic argument (`:[name]`) names nothing.
function bindingOf(node: any) {
  const key = node?.key
  return node?.directive && key?.name?.name === "bind" ? key : null
}

function pascalCase(name: string) {
  return name
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
}

export const vueReader: TemplateReader = {
  // A `v-bind="object"` spread is a VAttribute too: each visitor takes
  // the nodes that are its own.
  attributes: ["VAttribute"],
  spreads: ["VAttribute"],
  classObjects: true,
  staticStyles: true,
  attributeName(node) {
    if (!node?.directive) {
      return typeof node?.key?.name === "string" ? node.key.name : ""
    }
    const argument = bindingOf(node)?.argument
    return argument?.type === "VIdentifier" ? argument.name : ""
  },
  attributeValue: (node) => node?.value ?? null,
  spreadArgument(node) {
    const binding = bindingOf(node)
    return binding && !binding.argument
      ? (node.value?.expression ?? null)
      : null
  },
  elementOf(node) {
    const element = node?.parent?.parent
    return element?.type === "VElement" ? element : null
  },
  nameOf(element) {
    const text: string = element?.rawName ?? ""
    if (!text) return null
    const [root, ...rest] = text.split(".")
    const kebab = root.includes("-")
    return {
      root,
      property: rest.length ? rest.join(".") : null,
      text,
      component: rest.length > 0 || kebab || /^[A-Z]/.test(root),
      // `<card-title>` is the CardTitle the script imported.
      ...(kebab ? { alias: pascalCase(root) } : {}),
    }
  },
  // A `<template>` wrapper renders nothing of its own.
  parentElementOf(element) {
    for (let node = element?.parent; node; node = node.parent) {
      if (node.type === "VElement" && node.rawName !== "template") return node
    }
    return null
  },
  variableOf(node, context) {
    const scopes: any[] = context.sourceCode?.scopeManager?.scopes ?? []
    const scope = scopes.find((s) => s.type === "module") ?? scopes[0]
    return scope?.set?.get(node.name) ?? null
  },
}
