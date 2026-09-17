// A component's variant axes, from its cva/tv definitions and from props
// typed as a union of string literals, which is the same shape written
// without a factory. Messages list these so reuse is the first option.

import * as fs from "node:fs"

import { walk } from "./ast"
import { mtimeOf } from "./fs"
import { parseSource } from "./parser"

export type VariantDefinition = {
  // buttonVariants, or the component whose props declare the axes.
  name: string | null
  axes: Record<string, string[]>
  // A factory stands in for any component in its file; props do not.
  source: "factory" | "props"
}

const cache = new Map<
  string,
  { mtimeMs: number; definitions: VariantDefinition[] }
>()

const VARIANT_FACTORIES = new Set(["cva", "tv"])

function keyName(node: any) {
  if (node.type === "Identifier") return node.name
  if (node.type === "Literal" && typeof node.value === "string")
    return node.value
  return null
}

function axesOf(config: any) {
  const axes: Record<string, string[]> = {}
  if (config?.type !== "ObjectExpression") return axes
  const variants = config.properties.find(
    (p: any) => p.type === "Property" && keyName(p.key) === "variants"
  )
  if (variants?.value?.type !== "ObjectExpression") return axes
  for (const axis of variants.value.properties) {
    if (axis.type !== "Property") continue
    const axisName = keyName(axis.key)
    if (!axisName || axis.value?.type !== "ObjectExpression") continue
    axes[axisName] = axis.value.properties
      .filter((p: any) => p.type === "Property")
      .map((p: any) => keyName(p.key))
      .filter((k: any): k is string => typeof k === "string")
  }
  return axes
}

const MAY_DEFINE_VARIANTS = /\b(?:cva|tv)\s*\(|\|\s*["']|\bkeyof\s+typeof\b/

// How far a type is followed through parentheses, aliases and unions
// before it is given up as unreadable.
const MAX_TYPE_DEPTH = 8

// oxc keeps parentheses in the type AST; @typescript-eslint drops them.
function unwrapType(type: any) {
  let out = type
  for (
    let depth = 0;
    out?.type === "TSParenthesizedType" && depth < MAX_TYPE_DEPTH;
    depth++
  ) {
    out = out.typeAnnotation
  }
  return out
}

// The keys of `const VARIANTS = { ... } as const`, the axis a lookup
// object declares. Null when a spread or a computed key hides one: a
// partial list of variants is worse than none.
function objectKeys(object: any) {
  if (object?.type !== "ObjectExpression") return null
  const keys: string[] = []
  for (const property of object.properties) {
    if (property.type !== "Property" || property.computed) return null
    const key = keyName(property.key)
    if (!key) return null
    keys.push(key)
  }
  return keys.length ? keys : null
}

// Null unless every member is a string literal (or undefined, for `?:`).
// A same-file alias and `keyof typeof` a lookup object name the same axis
// as an inline union, which is how a design system without cva writes it.
function literalValues(
  input: any,
  declared: ReturnType<typeof declarationsIn>,
  depth = 0
) {
  const type = unwrapType(input)
  if (!type || depth > MAX_TYPE_DEPTH) return null
  if (type.type === "TSTypeReference" && type.typeName?.type === "Identifier") {
    return literalValues(
      declared.types.get(type.typeName.name),
      declared,
      depth + 1
    )
  }
  if (
    type.type === "TSTypeOperator" &&
    type.operator === "keyof" &&
    type.typeAnnotation?.type === "TSTypeQuery" &&
    type.typeAnnotation.exprName?.type === "Identifier"
  ) {
    return objectKeys(declared.objects.get(type.typeAnnotation.exprName.name))
  }
  if (type.type === "TSUnionType") {
    const values: string[] = []
    for (const member of type.types) {
      if (member.type === "TSUndefinedKeyword") continue
      const nested = literalValues(member, declared, depth + 1)
      if (!nested) return null
      values.push(...nested)
    }
    return values.length ? values : null
  }
  if (
    type.type === "TSLiteralType" &&
    type.literal?.type === "Literal" &&
    typeof type.literal.value === "string"
  ) {
    return [type.literal.value as string]
  }
  return null
}

// Follows intersections, unions and same-file aliases, so
// `React.ComponentProps<"div"> & Props` resolves.
function axesOfPropsType(
  input: any,
  declared: ReturnType<typeof declarationsIn>,
  depth = 0
) {
  const axes: Record<string, string[]> = {}
  const type = unwrapType(input)
  if (!type || depth > MAX_TYPE_DEPTH) return axes
  if (type.type === "TSIntersectionType") {
    for (const member of type.types) {
      Object.assign(axes, axesOfPropsType(member, declared, depth + 1))
    }
    return axes
  }
  // A props union (an anchor or a button, one set of variants): only what
  // every member accepts is a variant of the component.
  if (type.type === "TSUnionType") {
    const [first, ...rest]: Record<string, string[]>[] = type.types.map(
      (member: any) => axesOfPropsType(member, declared, depth + 1)
    )
    for (const [name, values] of Object.entries(first ?? {})) {
      const shared = values.filter((value) =>
        rest.every((other) => other[name]?.includes(value))
      )
      if (shared.length) axes[name] = shared
    }
    return axes
  }
  if (type.type === "TSTypeReference" && type.typeName?.type === "Identifier") {
    return axesOfPropsType(
      declared.types.get(type.typeName.name),
      declared,
      depth + 1
    )
  }
  const members =
    type.type === "TSTypeLiteral"
      ? type.members
      : type.type === "TSInterfaceBody"
        ? type.body
        : null
  if (!members) return axes
  for (const member of members) {
    if (member.type !== "TSPropertySignature") continue
    const key = keyName(member.key)
    const values = literalValues(
      member.typeAnnotation?.typeAnnotation,
      declared
    )
    if (key && values) axes[key] = values
  }
  return axes
}

// The file's aliases and interfaces, plus the object literals a
// `keyof typeof` can name. `as const` and `satisfies` wrap the object.
function declarationsIn(ast: any) {
  const types = new Map<string, any>()
  const objects = new Map<string, any>()
  walk(ast, (node) => {
    if (
      node.type === "TSTypeAliasDeclaration" &&
      node.id?.type === "Identifier"
    ) {
      types.set(node.id.name, node.typeAnnotation)
    } else if (
      node.type === "TSInterfaceDeclaration" &&
      node.id?.type === "Identifier"
    ) {
      types.set(node.id.name, node.body)
    } else if (
      node.type === "VariableDeclarator" &&
      node.id?.type === "Identifier"
    ) {
      const init =
        node.init?.type === "TSAsExpression" ||
        node.init?.type === "TSSatisfiesExpression"
          ? node.init.expression
          : node.init
      if (init?.type === "ObjectExpression") objects.set(node.id.name, init)
    }
  })
  return { types, objects }
}

// A component's first parameter and its name, for function declarations
// and `const X = (props) => ...`.
function componentSignature(node: any) {
  if (node.type === "FunctionDeclaration" && node.id?.type === "Identifier") {
    return { name: node.id.name as string, param: node.params?.[0] }
  }
  if (
    node.type === "VariableDeclarator" &&
    node.id?.type === "Identifier" &&
    (node.init?.type === "ArrowFunctionExpression" ||
      node.init?.type === "FunctionExpression")
  ) {
    return { name: node.id.name as string, param: node.init.params?.[0] }
  }
  return null
}

export function extractVariantDefinitions(source: string, file = "x.tsx") {
  const definitions: VariantDefinition[] = []
  if (!MAY_DEFINE_VARIANTS.test(source)) return definitions
  let ast: any
  try {
    ast = parseSource(source, file)
  } catch {
    return definitions
  }
  const declared = declarationsIn(ast)
  walk(ast, (node, parent) => {
    if (node.type === "CallExpression") {
      if (node.callee?.type !== "Identifier") return
      if (!VARIANT_FACTORIES.has(node.callee.name)) return
      // cva(base, config); tv(config) or tv(base, config).
      const [first, second] = node.arguments
      const config =
        node.callee.name === "tv" && first?.type === "ObjectExpression"
          ? first
          : second
      const axes = axesOf(config)
      if (!Object.keys(axes).length) return
      const name =
        parent?.type === "VariableDeclarator" &&
        parent.id?.type === "Identifier"
          ? parent.id.name
          : null
      definitions.push({ name, axes, source: "factory" })
      return
    }
    const signature = componentSignature(node)
    if (!signature) return
    // `{ variant = "default" }: Props` or `props: Props`; the annotation
    // sits on the pattern either way.
    const type = signature.param?.typeAnnotation?.typeAnnotation
    const axes = axesOfPropsType(type, declared)
    if (!Object.keys(axes).length) return
    definitions.push({ name: signature.name, axes, source: "props" })
  })
  return definitions
}

export function variantDefinitionsOf(file: string) {
  const mtimeMs = mtimeOf(file)
  if (mtimeMs === null) return []
  const cached = cache.get(file)
  if (cached && cached.mtimeMs === mtimeMs) return cached.definitions
  let definitions: VariantDefinition[] = []
  try {
    definitions = extractVariantDefinitions(
      fs.readFileSync(file, "utf-8"),
      file
    )
  } catch {
    definitions = []
  }
  cache.set(file, { mtimeMs, definitions })
  return definitions
}

// The definition for a component: the cva named after it
// (buttonVariants for Button), else the component's own props (Text),
// else the file's first cva. Another component's props never apply.
function definitionFor(file: string, component: string) {
  const definitions = variantDefinitionsOf(file)
  if (!definitions.length) return null
  const expected =
    component.charAt(0).toLowerCase() + component.slice(1) + "Variants"
  return (
    definitions.find((d) => d.name === expected) ??
    definitions.find((d) => d.name === component && d.source === "props") ??
    definitions.find((d) => d.source === "factory") ??
    null
  )
}

export function variantNamesFor(file: string, component: string) {
  const values = definitionFor(file, component)?.axes.variant
  return values?.length ? values : null
}

// The values of the component's size axis. Spacing findings offer them,
// because padding on a button usually means size.
export function sizeNamesFor(file: string, component: string) {
  const values = definitionFor(file, component)?.axes.size
  return values?.length ? values : null
}
