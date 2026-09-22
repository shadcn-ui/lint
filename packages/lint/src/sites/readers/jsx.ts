import type { TemplateReader } from "./types"

// Astro's `class:list` parses as a namespaced name.
export function attributeNameOf(attribute: any) {
  const name = attribute?.name
  if (name?.type === "JSXNamespacedName") {
    return `${name.namespace?.name}:${name.name?.name}`
  }
  return typeof name?.name === "string" ? name.name : ""
}

function jsxNameText(jsxName: any): string {
  if (jsxName?.type === "JSXMemberExpression") {
    return `${jsxNameText(jsxName.object)}.${jsxName.property?.name ?? ""}`
  }
  return jsxName?.name ?? ""
}

// The `Dialog` of `<Dialog.Content>`.
export function jsxRootOf(jsxName: any) {
  return jsxName?.type === "JSXMemberExpression"
    ? jsxName.object?.name
    : jsxName?.name
}

export function jsxElementNameOf(name: any) {
  if (!name) return null
  const root = jsxRootOf(name)
  const member = name.type === "JSXMemberExpression"
  return {
    root: typeof root === "string" ? root : "",
    property: member ? (name.property?.name ?? "") : null,
    text: jsxNameText(name),
    component:
      member || (name.type === "JSXIdentifier" && /^[A-Z]/.test(name.name)),
  }
}

// The name a spread of the function's own props would carry: `props` in
// `(props) => ...`, `rest` in `({ className, ...rest }) => ...`.
function propsSpreadNameOf(fn: any) {
  const param = fn.params?.[0]
  if (param?.type === "Identifier") return param.name
  if (param?.type === "ObjectPattern") {
    const rest = param.properties.find((p: any) => p.type === "RestElement")
    if (rest?.argument?.type === "Identifier") return rest.argument.name
  }
  return null
}

// Base UI renders another element in a component's place through
// `render`, and the className goes with it: `<DialogTrigger
// render={<Button />} className="bg-primary" />` is a Button. Returns
// the element the classes reach, or undefined when the element itself
// wears them: no render prop, a value that cannot be read, or a function
// that renders without spreading its props, the way a list renders an
// item. The element's own contract is the nearest judge then.
function renderedElementOf(element: any) {
  const attribute = (element.openingElement?.attributes ?? []).find(
    (candidate: any) =>
      candidate.type === "JSXAttribute" && candidate.name?.name === "render"
  )
  const expression = attribute?.value?.expression
  if (expression?.type === "JSXElement") return expression
  if (expression?.type !== "ArrowFunctionExpression") return undefined
  // `render={(props) => <Button {...props} />}` hands the classes to the
  // same component the element form does, through the spread.
  const body = expression.body
  const spread = propsSpreadNameOf(expression)
  if (body?.type !== "JSXElement" || !spread) return undefined
  const forwards = (body.openingElement.attributes ?? []).some(
    (candidate: any) =>
      candidate.type === "JSXSpreadAttribute" &&
      candidate.argument?.type === "Identifier" &&
      candidate.argument.name === spread
  )
  return forwards ? body : undefined
}

export const jsxReader: TemplateReader = {
  attributes: ["JSXAttribute"],
  spreads: ["JSXSpreadAttribute"],
  attributeName: attributeNameOf,
  attributeValue: (node) => node.value,
  spreadArgument: (node) => node.argument,
  elementOf(node) {
    const opening = node?.parent
    return opening?.type === "JSXOpeningElement" ? opening.parent : null
  },
  nameOf: (element) => jsxElementNameOf(element?.openingElement?.name),
  // Fragments and expression containers are not layout parents.
  parentElementOf(element) {
    for (let node = element?.parent; node; node = node.parent) {
      if (node.type === "JSXElement") return node
    }
    return null
  },
  renderedElementOf,
}
