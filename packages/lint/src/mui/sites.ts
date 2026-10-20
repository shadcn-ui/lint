import { componentOf, variableOf } from "./imports"
import { propertiesOf } from "./properties"

// Names that do not collide with CSS properties or System aliases.
const typeSelectors = new Set(
  "a abbr address article aside audio b bdi bdo blockquote body br button canvas caption circle code col colgroup dd defs details dialog div dl dt ellipse em fieldset figcaption figure footer foreignObject form g h1 h2 h3 h4 h5 h6 head header hr html i iframe img input label legend li line link main marker nav ol optgroup option path polygon polyline rect s section select small source span strong sub summary sup svg symbol table tbody td template textarea tfoot th thead title tr tspan u ul use video *".split(
    " "
  )
)
const breakpoints = new Set(["xs", "sm", "md", "lg", "xl"])

export type StyleSite = {
  component: string
  source: string
  channel: string
  property: string
  properties: string[]
  node: any
  values: unknown[]
  unknown: boolean
  nesting: string[]
}
export type Collection = {
  sites: StyleSite[]
  unknown: any[]
  owner: ReturnType<typeof componentOf>
}

function unwrap(node: any): any {
  return [
    "TSAsExpression",
    "TSSatisfiesExpression",
    "TSNonNullExpression",
    "TSTypeAssertion",
    "ChainExpression",
  ].includes(node?.type)
    ? unwrap(node.expression)
    : node
}

function keyOf(property: any): string | null {
  if (
    property.type !== "Property" ||
    property.kind !== "init" ||
    property.method
  )
    return null
  if (property.computed && property.key.type !== "Literal") return null
  return property.key.type === "Identifier"
    ? property.key.name
    : typeof property.key.value === "string"
      ? property.key.value
      : null
}

function callbackResult(node: any) {
  if (node.async || node.generator) return null
  if (node.body.type !== "BlockStatement") return unwrap(node.body)
  const statements = node.body.body
  return statements.length === 1 && statements[0].type === "ReturnStatement"
    ? unwrap(statements[0].argument)
    : null
}

const isCallback = (node: any) =>
  node?.type === "ArrowFunctionExpression" ||
  node?.type === "FunctionExpression"

// An object passed to arbitrary code can be mutated even when its binding is const.
function safeConstant(variable: any, context: any): boolean {
  const def = variable?.defs?.[0]
  if (
    def?.type !== "Variable" ||
    def.parent?.kind !== "const" ||
    def.node.id.type !== "Identifier"
  )
    return false
  if (def.parent.parent?.type?.startsWith("Export")) return false
  const init = unwrap(def.node.init)
  const primitive =
    init?.type === "Literal" ||
    (init?.type === "TemplateLiteral" && !init.expressions.length)
  return (variable.references ?? []).every((ref: any) => {
    if (ref.init) return true
    if (ref.isWrite?.()) return false
    if (primitive) return true
    let current = ref.identifier
    while (
      [
        "TSAsExpression",
        "TSSatisfiesExpression",
        "TSNonNullExpression",
      ].includes(current.parent?.type)
    )
      current = current.parent
    const parent = current.parent
    if (
      parent?.type === "JSXExpressionContainer" &&
      parent.parent?.type === "JSXAttribute" &&
      parent.parent.name.name === "sx"
    )
      return Boolean(componentOf(context, parent.parent.parent.name))
    if (
      parent?.type === "SpreadElement" &&
      parent.parent?.type === "ObjectExpression"
    ) {
      let object = parent.parent
      while (
        object.parent?.type === "ObjectExpression" ||
        object.parent?.type === "Property" ||
        ["TSAsExpression", "TSSatisfiesExpression"].includes(
          object.parent?.type
        )
      )
        object = object.parent
      return (
        object.parent?.type === "JSXExpressionContainer" &&
        object.parent.parent?.name?.name === "sx" &&
        Boolean(componentOf(context, object.parent.parent.parent.name))
      )
    }
    return false
  })
}

export function collectSx(context: any, element: any): Collection {
  const owner = componentOf(context, element.name)
  const result: Collection = { sites: [], unknown: [], owner }
  const sx = element.attributes
    .filter(
      (attribute: any) =>
        attribute.type === "JSXAttribute" && attribute.name.name === "sx"
    )
    .at(-1)
  if (!owner) {
    if (sx) result.unknown.push(sx)
    return result
  }
  const path = new Set<any>()
  const resolve = (input: any): any => {
    const node = unwrap(input)
    if (node?.type !== "Identifier") return node
    const variable = variableOf(context, node, node.name)
    if (!safeConstant(variable, context) || path.has(variable)) return null
    path.add(variable)
    const found = resolve(variable.defs[0].node.init)
    path.delete(variable)
    return found
  }
  const leaves = (
    input: any,
    visited = new Set<any>(),
    allowCallback = true
  ): { values: unknown[]; unknown: boolean } => {
    if (visited.has(input)) return { values: [], unknown: true }
    visited.add(input)
    const node = resolve(input)
    if (!node) return { values: [], unknown: true }
    if (isCallback(node)) {
      const returned = allowCallback && callbackResult(node)
      return returned
        ? leaves(returned, new Set(visited), false)
        : { values: [], unknown: true }
    }
    if (node.type === "Literal") return { values: [node.value], unknown: false }
    if (node.type === "TemplateLiteral")
      return node.expressions.length
        ? { values: [], unknown: true }
        : { values: [node.quasis[0].value.cooked], unknown: false }
    if (node.type === "ConditionalExpression")
      return combine([
        leaves(node.consequent, new Set(visited), allowCallback),
        leaves(node.alternate, new Set(visited), allowCallback),
      ])
    if (node.type === "ArrayExpression")
      return combine(
        node.elements
          .filter(Boolean)
          .map((value: any) => leaves(value, new Set(visited), false))
      )
    if (node.type === "ObjectExpression") {
      const effective = entries(node)
      if (
        effective.entries.some(
          (property: any) => !breakpoints.has(keyOf(property)!)
        )
      )
        return { values: [], unknown: true }
      const values = combine(
        effective.entries.map((property: any) =>
          leaves(property.value, new Set(visited), false)
        )
      )
      return {
        values: values.values,
        unknown: effective.unknown || values.unknown,
      }
    }
    return { values: [], unknown: true }
  }
  const entries = (
    input: any,
    visited = new Set<any>()
  ): { entries: any[]; unknown: boolean } => {
    const node = resolve(input)
    if (!node || node.type !== "ObjectExpression" || visited.has(node))
      return { entries: [], unknown: true }
    visited.add(node)
    const effective = new Map<string, any>()
    let unknown = false
    for (const property of node.properties) {
      if (property.type === "SpreadElement") {
        const spread = entries(property.argument, new Set(visited))
        if (spread.unknown) {
          effective.clear()
          unknown = true
          result.unknown.push(property)
        }
        for (const entry of spread.entries) effective.set(keyOf(entry)!, entry)
      } else {
        const key = keyOf(property)
        if (key === null) {
          effective.clear()
          unknown = true
          result.unknown.push(property)
        } else effective.set(key, property)
      }
    }
    return { entries: [...effective.values()], unknown }
  }
  const visit = (
    input: any,
    nesting: string[] = [],
    visited = new Set<any>(),
    allowCallback = true
  ) => {
    const node = resolve(input)
    if (!node || visited.has(node)) {
      result.unknown.push(input)
      return
    }
    visited.add(node)
    if (isCallback(node)) {
      const returned = allowCallback && callbackResult(node)
      if (!returned || returned.type === "ArrayExpression")
        result.unknown.push(node)
      else visit(returned, nesting, new Set(visited), false)
      return
    }
    if (
      node.type === "Literal" &&
      (node.value === false || node.value === null)
    )
      return
    if (node.type === "ConditionalExpression") {
      visit(node.consequent, nesting, new Set(visited), allowCallback)
      visit(node.alternate, nesting, new Set(visited), allowCallback)
      return
    }
    if (node.type === "LogicalExpression" && node.operator === "&&") {
      visit(node.right, nesting, new Set(visited), allowCallback)
      return
    }
    if (node.type === "ArrayExpression") {
      if (!allowCallback) {
        result.unknown.push(node)
        return
      }
      for (const child of node.elements)
        if (child) visit(child, nesting, new Set(visited))
      return
    }
    if (node.type !== "ObjectExpression") {
      result.unknown.push(node)
      return
    }
    const collected = entries(node)
    for (const entry of collected.entries) {
      const property = keyOf(entry)!
      // Selector context is retained; its target never becomes a new contract owner.
      if (
        property.startsWith("&") ||
        property.startsWith("@") ||
        typeSelectors.has(property) ||
        /[ .:#>[\]]/.test(property)
      ) {
        visit(entry.value, [...nesting, property], new Set(visited))
        continue
      }
      const values = leaves(entry.value)
      if (values.unknown) result.unknown.push(entry.value)
      result.sites.push({
        ...owner,
        channel: "sx",
        property,
        properties: propertiesOf(property),
        node: entry.key,
        ...values,
        nesting,
      })
    }
  }
  const spreads = element.attributes.filter(
    (attribute: any) => attribute.type === "JSXSpreadAttribute"
  )
  const followsSpread = (authored: any) =>
    spreads.some((attribute: any) => attribute.range[0] > authored.range[0])
  if (sx) {
    if (followsSpread(sx)) result.unknown.push(sx)
    else
      visit(
        sx.value?.type === "JSXExpressionContainer" ? sx.value.expression : null
      )
  } else {
    result.unknown.push(...spreads)
  }
  for (const [prop, css] of Object.entries(owner.styleProps ?? {})) {
    const authored = element.attributes
      .filter(
        (attribute: any) =>
          attribute.type === "JSXAttribute" && attribute.name.name === prop
      )
      .at(-1)
    if (!authored) continue
    if (followsSpread(authored)) {
      result.unknown.push(authored)
      continue
    }
    const expression =
      authored.value?.type === "JSXExpressionContainer"
        ? authored.value.expression
        : authored.value
    const values = leaves(expression)
    if (values.unknown) result.unknown.push(expression ?? authored)
    result.sites.push({
      ...owner,
      channel: `${prop} prop`,
      property: prop,
      properties: propertiesOf(css),
      node: authored.name,
      nesting: [],
      ...values,
    })
  }
  return result
}

function combine(parts: { values: unknown[]; unknown: boolean }[]) {
  return {
    values: parts.flatMap((part) => part.values),
    unknown: parts.some((part) => part.unknown),
  }
}
