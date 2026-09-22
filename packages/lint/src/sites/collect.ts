// Finds every place a class string enters the program and resolves each
// to the component it belongs to. Tailwind only generates CSS for class
// text present in source, so text plus one hop covers every class that
// can render; what the hop cannot read is reported as dynamic, never
// treated as empty. See docs/how-it-works.md.

import {
  componentFromImport,
  importNameOf,
  type ComponentImport,
} from "../project/component-imports"
import { componentsFor } from "../project/components"
import { NODE_MODULES } from "../project/fs"
import { definingExportOf, type ExportBinding } from "../project/modules"
import { wrapperTargetOf, type WrapperTarget } from "../project/wrappers"
import { fileOf } from "../rules/messages"
import { withSettings } from "../rules/settings"
import {
  addVisitor,
  attributeNameIn,
  attributeOfContainer,
  isContainer,
  readerFor,
  type ElementName,
  type Visitors,
} from "./readers"
import { jsxElementNameOf } from "./readers/jsx"

export { attributeNameOf, jsxRootOf } from "./readers/jsx"

export type ClassString = {
  value: string
  node: any
}

export type ClassSite = {
  contextualStrings: ClassString[]
  // A referenced helper call owns its vocabulary check at its own site.
  vocabularyStrings: ClassString[]
  // What the collector could not read. A received className prop is
  // accepted; an unreadable authored default is not.
  unresolved: any[]
  component: string | null
  componentFile: string | null
  wrapper: string | null
  attribute: string | null
  node: any
  // The nearest enclosing element that passes `accepts`, and whether it
  // is the direct parent: where a spacing finding sends the class.
  enclosingContainer: (
    accepts: (component: string) => boolean
  ) => { name: string; direct: boolean } | null
  // A direct parent that fails `accepts`: never send spacing there.
  closedParent: (accepts: (component: string) => boolean) => string | null
}

export const DEFAULT_MERGE_FUNCTIONS = [
  "cn",
  "cx",
  "clsx",
  "cva",
  "tv",
  "twMerge",
  "twJoin",
  "classNames",
]

// Object arguments carry classes as values (cva), not keys (clsx).
export const DEFAULT_VARIANT_FUNCTIONS = ["cva", "tv"]

const CLASS_ATTRIBUTE = /^(class:list|[^:]*class(name)?s?)$/i

export function isClassAttribute(name: string) {
  return CLASS_ATTRIBUTE.test(name)
}

export type TrackerOptions = {
  componentImports?: string[]
  // Left alone even when the name matches: a raw Radix primitive
  // imported next to its shadcn wrapper.
  ignoreImports?: string[]
}

export type ResolvedElement = {
  component: string
  file: string | null
  wrapper: string | null
}

const regexps = new Map<string, RegExp>()

function regexpOf(pattern: string) {
  let re = regexps.get(pattern)
  if (!re) {
    re = new RegExp(pattern)
    regexps.set(pattern, re)
  }
  return re
}

export function createComponentTracker(
  context: any,
  options: TrackerOptions = {}
) {
  const filename = fileOf(context)
  const index = componentsFor(filename)
  const patterns = (options.componentImports ?? []).map(regexpOf)
  const ignored = (options.ignoreImports ?? []).map(regexpOf)
  const imports = new Map<string, ComponentImport>()
  const skipped = new Set<string>()
  const bindings = new Map<string, ExportBinding | null>()
  const wrappers = new Map<string, WrapperTarget | null>()

  const bindingOf = (root: string, name: string) => {
    const key = `${root}:${name}`
    const cached = bindings.get(key)
    if (cached !== undefined) return cached
    const source = imports.get(root)?.source
    const binding =
      source && filename ? definingExportOf(source, name, filename) : null
    bindings.set(key, binding)
    return binding
  }

  // Packages are never wrappers of the project's own system.
  const wrapperOf = (
    key: string,
    binding: ExportBinding | null,
    local: string | null
  ) => {
    const cached = wrappers.get(key)
    if (cached !== undefined) return cached
    let target: WrapperTarget | null = null
    if (binding) {
      if (binding.file !== filename && !NODE_MODULES.test(binding.file)) {
        target = wrapperTargetOf(binding.file, binding.name, patterns)
      }
    } else if (local && filename && /^[A-Z]/.test(local)) {
      target = wrapperTargetOf(
        filename,
        local,
        patterns,
        context.sourceCode?.ast
      )
    }
    wrappers.set(key, target)
    return target
  }

  // Resolution first, name second: an import into the ui directory is
  // that component whatever it was renamed to, and one into a package is
  // not, however familiar. Only an unresolvable import falls back to the
  // name, so a broken alias degrades rather than going silent.
  const resolveName = (element: ElementName | null): ResolvedElement | null => {
    if (!element) return null
    // Vue writes an imported CardTitle as `<card-title>` too.
    const root =
      element.alias && !imports.has(element.root) && imports.has(element.alias)
        ? element.alias
        : element.root
    if (!root || skipped.has(root)) return null
    const property = element.property
    const imported = imports.get(root)
    if (imported) {
      const importedName = importNameOf(imported, root, property)
      if (imported.namespace && property === null) importedName.name = root
      const { exportName, name } = importedName
      const binding = exportName ? bindingOf(root, exportName) : null
      const component = componentFromImport(
        index,
        binding,
        importedName,
        patterns
      )
      if (component) return { ...component, wrapper: null }
      if (binding) {
        if (NODE_MODULES.test(binding.file)) return null
        if (property !== null && !imported.namespace) return null
        const target = wrapperOf(`${root}.${exportName}`, binding, null)
        if (!target) return null
        const wrapper = property === null ? name : `${root}.${property}`
        return { component: target.component, file: target.file, wrapper }
      }
      if (index.has(name) || index.has(imported.original)) {
        return {
          component: name,
          file:
            index.files.get(name) ?? index.files.get(imported.original) ?? null,
          wrapper: null,
        }
      }
      return null
    }

    // Not imported: a ui component of this file, or a same-file wrapper.
    const name = property === null ? root : `${root}${property}`
    if (index.has(name)) {
      return {
        component: name,
        file: index.files.get(name) ?? null,
        wrapper: null,
      }
    }
    if (property !== null) return null
    const target = wrapperOf(root, null, root)
    return target
      ? { component: target.component, file: target.file, wrapper: name }
      : null
  }

  return {
    collectImport(node: any) {
      const source = node.source?.value
      if (typeof source !== "string") return
      const matchesIgnore = ignored.some((p) => p.test(source))
      for (const spec of node.specifiers ?? []) {
        const local = spec.local?.name
        if (!local) continue
        const original =
          spec.type === "ImportSpecifier"
            ? (spec.imported?.name ?? spec.imported?.value ?? local)
            : spec.type === "ImportDefaultSpecifier"
              ? "default"
              : local
        imports.set(local, {
          source,
          original,
          namespace: spec.type === "ImportNamespaceSpecifier",
        })
        if (matchesIgnore) skipped.add(local)
      }
    },
    // By JSX name node.
    resolve: (jsxName: any) => resolveName(jsxElementNameOf(jsxName)),
    resolveName,
  }
}

function findVariable(scope: any, name: string) {
  for (let s = scope; s; s = s.upper) {
    const variable = s.set?.get(name)
    if (variable) return variable
  }
  return null
}

function variableOf(node: any, context: any) {
  const scope = context.sourceCode?.getScope?.(node)
  const variable = scope ? findVariable(scope, node.name) : null
  return variable ?? readerFor(context).variableOf?.(node, context) ?? null
}

function referenceExpression(node: any) {
  while (
    node.parent?.expression === node &&
    ["TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression"].includes(
      node.parent.type
    )
  ) {
    node = node.parent
  }
  return node
}

// A const binding keeps the reference, not the contents, so a property
// write through it makes later reads unreadable.
function isMutated(variable: any) {
  return (variable.references ?? []).some((ref: any) => {
    const id = referenceExpression(ref.identifier)
    const parent = id?.parent
    if (parent?.type === "MemberExpression" && parent.object === id) {
      let member = referenceExpression(parent)
      while (
        member.parent?.type === "MemberExpression" &&
        member.parent.object === member
      ) {
        member = referenceExpression(member.parent)
      }
      while (
        (member.parent?.type === "Property" &&
          member.parent.value === member &&
          member.parent.parent?.type === "ObjectPattern") ||
        member.parent?.type === "ArrayPattern" ||
        (member.parent?.type === "RestElement" &&
          member.parent.argument === member) ||
        (member.parent?.type === "AssignmentPattern" &&
          member.parent.left === member)
      ) {
        member =
          member.parent.type === "Property"
            ? member.parent.parent
            : member.parent
      }
      const outer = member.parent
      return (
        (outer?.type === "AssignmentExpression" && outer.left === member) ||
        outer?.type === "UpdateExpression" ||
        (outer?.type === "UnaryExpression" && outer.operator === "delete")
      )
    }
    return (
      parent?.type === "CallExpression" &&
      parent.callee?.type === "MemberExpression" &&
      parent.callee.object?.name === "Object" &&
      parent.callee.property?.name === "assign" &&
      parent.arguments?.[0] === id
    )
  })
}

const helperNames = new WeakMap<object, string[]>()

function helperNamesOf(context: any) {
  let names = helperNames.get(context)
  if (!names) {
    const options = withSettings(context, context.options?.[0] ?? {}) as {
      mergeFunctions?: string[]
      variantFunctions?: string[]
    }
    names = [
      ...DEFAULT_MERGE_FUNCTIONS,
      ...(options.mergeFunctions ?? []),
      ...(options.variantFunctions ?? []),
    ]
    helperNames.set(context, names)
  }
  return names
}

// An object handed to another owner can be changed through it. Reading a
// member or spreading does not hand over the object itself.
function isEscaped(variable: any, context?: any) {
  return (variable.references ?? []).some((ref: any) => {
    if (!ref.isRead?.()) return false
    let value = referenceExpression(ref.identifier)
    let parent = value.parent
    while (
      (parent?.type === "ConditionalExpression" && parent.test !== value) ||
      parent?.type === "LogicalExpression" ||
      (parent?.type === "SequenceExpression" &&
        parent.expressions.at(-1) === value)
    ) {
      value = referenceExpression(parent)
      parent = value.parent
    }
    // Reading the contents at a styling site hands nothing over.
    if (context) {
      const attribute = attributeOfContainer(parent)
      if (
        attribute &&
        (attributeNameIn(attribute) === "style" ||
          isClassAttribute(attributeNameIn(attribute)))
      )
        return false
      // A helper reads its arguments and never keeps them, directly or
      // inside a config literal.
      let container = value
      let outer = parent
      while (
        outer?.type === "Property" &&
        outer.value === container &&
        outer.parent?.type === "ObjectExpression"
      ) {
        container = outer.parent
        outer = container.parent
      }
      if (
        outer?.type === "CallExpression" &&
        outer.arguments.includes(container) &&
        outer.callee.type === "Identifier" &&
        helperNamesOf(context).includes(outer.callee.name)
      )
        return false
    }
    return (
      (parent?.type === "VariableDeclarator" &&
        parent.id.type === "Identifier" &&
        parent.init === value) ||
      (parent?.type === "AssignmentExpression" &&
        ["Identifier", "MemberExpression"].includes(parent.left.type) &&
        parent.right === value) ||
      ((parent?.type === "CallExpression" ||
        parent?.type === "NewExpression") &&
        parent.arguments.includes(value)) ||
      (parent?.type === "ReturnStatement" && parent.argument === value) ||
      (parent?.type === "ArrowFunctionExpression" && parent.body === value) ||
      (parent?.type === "Property" &&
        parent.value === value &&
        parent.parent?.type === "ObjectExpression") ||
      parent?.type === "ArrayExpression" ||
      attributeOfContainer(parent) !== null
    )
  })
}

function isWritten(variable: any) {
  return (
    variable.references?.some((ref: any) => ref.isWrite?.() && !ref.init) ||
    isMutated(variable)
  )
}

// The slot a destructured binding reads from its initializer: `cls` in
// `const [dot, text, cls] = init` is element 2, `colorCls` in
// `const { Icon, colorCls } = init` is that property.
export type PatternStep = { index: number } | { key: string }

// The steps from a binding up to its declarator's pattern, outermost
// first. Null for a rest or a default, whose value no one slot holds.
function patternStepsOf(binding: any, pattern: any) {
  const steps: PatternStep[] = []
  let node = binding
  while (node !== pattern) {
    const parent = node?.parent
    if (parent?.type === "ArrayPattern") {
      steps.unshift({ index: parent.elements.indexOf(node) })
      node = parent
    } else if (
      parent?.type === "Property" &&
      parent.value === node &&
      parent.parent?.type === "ObjectPattern"
    ) {
      const key = keyName(parent)
      if (key === null) return null
      steps.unshift({ key })
      node = parent.parent
    } else {
      return null
    }
  }
  return steps
}

// Follows the steps into a literal initializer as far as the shape is
// plain: an array without a spread before the slot, an object without
// spreads. What remains is for the reader to follow through branches.
function projectStatic(init: any, steps: PatternStep[]) {
  let node = init
  let i = 0
  for (; i < steps.length; i++) {
    const value = unwrapTs(node)
    const step = steps[i]
    if ("index" in step && value?.type === "ArrayExpression") {
      const before = value.elements.slice(0, step.index + 1)
      if (before.some((el: any) => el?.type === "SpreadElement")) break
      const element = value.elements[step.index]
      if (!element) break
      node = element
    } else if ("key" in step && value?.type === "ObjectExpression") {
      if (value.properties.some((p: any) => p.type !== "Property")) break
      const found = value.properties.filter((p: any) => keyName(p) === step.key)
      if (!found.length) break
      node = found[found.length - 1].value
    } else break
  }
  return { init: node, steps: steps.slice(i) }
}

// One hop to a same-file const's initializer. `path` holds the variables
// on the current route, so a self-reference stops while the same variable
// read from both branches of a ternary resolves twice. A destructured
// binding gets its own slot of the initializer, and any steps a reader
// still has to follow through a conditional.
export function resolveIdentifier(node: any, context: any, path: Set<any>) {
  const variable = variableOf(node, context)
  if (!variable || path.has(variable)) return null
  const def = variable.defs?.[0]
  if (!def || def.type !== "Variable" || !def.node?.init) return null
  if (isWritten(variable)) return null
  let init = def.node.init
  let steps: PatternStep[] = []
  if (def.name !== def.node.id) {
    const route = patternStepsOf(def.name, def.node.id)
    if (!route) return null
    ;({ init, steps } = projectStatic(init, route))
  }
  if (
    unwrapTs(init)?.type === "ObjectExpression" &&
    isEscaped(variable, context)
  )
    return null
  return { init, variable, steps }
}

// A single-file component receives its props from a call, not a
// parameter: Svelte's `$props()`, Vue's `defineProps()`.
function isPropsCall(node: any): boolean {
  const call = unwrapTs(node)
  if (call?.type !== "CallExpression" || call.callee?.type !== "Identifier") {
    return false
  }
  if (call.callee.name === "withDefaults") return isPropsCall(call.arguments[0])
  return call.callee.name === "$props" || call.callee.name === "defineProps"
}

// A props parameter or a property destructured from it. A nested data
// property is not the component's received prop.
function parameterOf(node: any, context: any) {
  const variable = variableOf(node, context)
  const def = variable?.defs?.[0]
  if (!def) return null
  const received = def.type === "Variable" && isPropsCall(def.node?.init)
  if (def.type !== "Parameter" && !received) return null
  let binding = def.name
  let fallback: any = null
  if (binding.parent?.type === "AssignmentPattern") {
    binding = binding.parent
    fallback = binding.right
  }
  let key = "*"
  let pattern = binding
  if (binding.parent?.type === "Property") {
    key = keyName(binding.parent) ?? ""
    pattern = binding.parent.parent
  } else if (binding.parent?.type === "RestElement") {
    pattern = binding.parent.parent
  }
  const parameter =
    pattern.parent?.type === "AssignmentPattern" ? pattern.parent : pattern
  if (
    received ? parameter !== def.node.id : !def.node.params?.includes(parameter)
  ) {
    return null
  }
  const objectDefault =
    parameter.type === "AssignmentPattern" ? parameter : null
  return {
    variable,
    key,
    fallback: key === "*" ? null : fallback,
    objectDefault,
    received,
  }
}

// An SFC spells the prop `class`, and it is the same prop.
function namesProp(
  parameter: { received: boolean },
  key: string | null | undefined,
  name: string
) {
  return (
    key === name ||
    (parameter.received && name === "className" && key === "class")
  )
}

function forwardedPropOf(node: any, context: any, name: string) {
  if (node?.type === "Identifier") {
    const parameter = parameterOf(node, context)
    return parameter &&
      namesProp(parameter, parameter.key, name) &&
      !isWritten(parameter.variable)
      ? parameter
      : null
  }
  if (node?.type !== "MemberExpression") return null
  const key = node.computed ? staticKey(node.property) : node.property?.name
  const object = unwrapTs(node.object)
  if (object?.type !== "Identifier") return null
  if (key !== name && !(name === "className" && key === "class")) return null
  const parameter = parameterOf(object, context)
  // Props from a call are read-only: handing them on changes nothing.
  return parameter?.key === "*" &&
    namesProp(parameter, key, name) &&
    !isWritten(parameter.variable) &&
    (parameter.received || !isEscaped(parameter.variable))
    ? parameter
    : null
}

export function isForwardedProp(node: any, context: any, name: string) {
  return forwardedPropOf(node, context, name) !== null
}

type ValueAlternative = { value: any } | { unresolved: any }

// The authored defaults behind a received prop, in cascade order.
export function forwardedValuesOf(
  node: any,
  context: any,
  name: string,
  path: Set<any>
) {
  const parameter = forwardedPropOf(node, context, name)
  if (!parameter) return null
  const alternatives: ValueAlternative[] = []
  if (!path.has(parameter.variable)) {
    if (parameter.fallback) alternatives.push({ value: parameter.fallback })
    if (parameter.objectDefault) {
      const defaultsPath = new Set(path).add(parameter.variable)
      const object = resolveObject(
        parameter.objectDefault.right,
        context,
        defaultsPath
      )
      const found = object
        ? resolveProperty(object, name, context, defaultsPath)
        : { value: undefined, uncertain: true }
      if (found.uncertain) {
        alternatives.push({ unresolved: parameter.objectDefault })
      } else if (found.value) {
        alternatives.push({ value: found.value })
      }
    }
  }
  return { variable: parameter.variable, alternatives }
}

function keyName(prop: any) {
  if (prop.computed) return staticKey(prop.key)
  if (prop.key?.type === "Identifier") return prop.key.name
  if (prop.key?.type === "Literal") return String(prop.key.value)
  return null
}

function staticKey(key: any) {
  if (key?.type === "Literal") return String(key.value)
  if (key?.type === "TemplateLiteral" && key.expressions.length === 0) {
    return key.quasis[0]?.value?.cooked ?? null
  }
  return null
}

function unwrapTs(node: any) {
  while (
    node &&
    (node.type === "TSAsExpression" ||
      node.type === "TSNonNullExpression" ||
      node.type === "TSSatisfiesExpression" ||
      isContainer(node))
  ) {
    node = node.expression
  }
  return node
}

export function resolveObject(node: any, context: any, path: Set<any>) {
  node = unwrapTs(node)
  if (node?.type === "ObjectExpression") return node
  if (node?.type !== "Identifier") return null
  const resolved = resolveIdentifier(node, context, path)
  const init = resolved && unwrapTs(resolved.init)
  return init?.type === "ObjectExpression" ? init : null
}

// A member read cannot trust an object handed to any call.
function resolveMemberObject(node: any, context: any, path: Set<any>) {
  node = unwrapTs(node)
  if (node?.type === "Identifier") {
    const variable = variableOf(node, context)
    if (variable && isEscaped(variable)) return null
  }
  return resolveObject(node, context, path)
}

// Entries in source order, same-file spreads flattened in. What cannot
// be read stays as unknown, so a reader knows a later write may exist.
export type ObjectEntry = { key: string; value: any } | { unknown: any }

export function objectEntries(
  object: any,
  context: any,
  path: Set<any>,
  depth = 0
): ObjectEntry[] {
  const entries: ObjectEntry[] = []
  for (const prop of object.properties) {
    if (prop.type === "SpreadElement") {
      const arg = unwrapTs(prop.argument)
      const inner = depth < 4 ? resolveObject(arg, context, path) : null
      if (!inner) {
        entries.push({ unknown: prop })
        continue
      }
      const variable =
        arg?.type === "Identifier"
          ? resolveIdentifier(arg, context, path)?.variable
          : null
      if (variable) path.add(variable)
      entries.push(...objectEntries(inner, context, path, depth + 1))
      if (variable) path.delete(variable)
      continue
    }
    if (prop.type !== "Property") {
      entries.push({ unknown: prop })
      continue
    }
    const key = keyName(prop)
    if (key === null) entries.push({ unknown: prop })
    else entries.push({ key, value: prop.value })
  }
  return entries
}

// The value `key` has by the end of the literal: the last write wins,
// and an unreadable spread after it makes the answer uncertain.
export function resolveProperty(
  object: any,
  key: string,
  context: any,
  path: Set<any>
) {
  let value: any = undefined
  let uncertain = false
  for (const entry of objectEntries(object, context, path)) {
    if ("unknown" in entry) {
      uncertain = true
    } else if (entry.key === key) {
      value = entry.value
      uncertain = false
    }
  }
  return { value, uncertain }
}

// A member's final value, or the expression that stays unresolved.
export function resolveMemberValue(node: any, context: any, path: Set<any>) {
  const key = keyName({ key: node.property, computed: node.computed })
  const object =
    key === null ? null : resolveMemberObject(node.object, context, path)
  const found = object
    ? resolveProperty(object, key!, context, path)
    : { value: undefined, uncertain: true }
  if (found.value === undefined || found.uncertain) {
    return { key, unresolved: node }
  }
  const variable =
    node.object?.type === "Identifier"
      ? resolveIdentifier(node.object, context, path)?.variable
      : null
  return { key, value: found.value, variable }
}

export function collectClassStrings(
  expression: any,
  context: any,
  options: {
    mergeFunctions?: Set<string>
    variantFunctions?: Set<string>
    resolve?: boolean
    valuesMode?: boolean
    onHelperCall?: (node: any) => void
  } = {}
) {
  const helpers = options.mergeFunctions ?? new Set(DEFAULT_MERGE_FUNCTIONS)
  const valueHelpers =
    options.variantFunctions ?? new Set(DEFAULT_VARIANT_FUNCTIONS)
  const resolve = options.resolve ?? true
  const contextualStrings: ClassString[] = []
  const vocabularyStrings: ClassString[] = []
  const unresolved: any[] = []
  const path = new Set<any>()
  let resolvedCalls = 0

  const push = (value: string, node: any) => {
    const string = { value, node }
    contextualStrings.push(string)
    if (resolvedCalls === 0) vocabularyStrings.push(string)
  }

  // The slot a destructured binding reads, followed through the branches
  // of its initializer: `const [, , cls] = ok ? a : b` reads element 2 of
  // a and of b. A shape the steps cannot enter is unresolved, not read
  // whole: its other slots were never classes.
  const visitThrough = (
    node: any,
    steps: PatternStep[],
    valuesMode: boolean
  ): void => {
    if (!steps.length) {
      visit(node, valuesMode)
      return
    }
    const value = unwrapTs(node)
    switch (value?.type) {
      case "ConditionalExpression":
        visitThrough(value.consequent, steps, valuesMode)
        visitThrough(value.alternate, steps, valuesMode)
        return
      case "LogicalExpression":
        if (value.operator !== "&&") visitThrough(value.left, steps, valuesMode)
        visitThrough(value.right, steps, valuesMode)
        return
      case "Identifier": {
        const resolved = resolve
          ? resolveIdentifier(value, context, path)
          : null
        if (!resolved) {
          unresolved.push(value)
          return
        }
        path.add(resolved.variable)
        visitThrough(resolved.init, [...resolved.steps, ...steps], valuesMode)
        path.delete(resolved.variable)
        return
      }
      case "ArrayExpression":
      case "ObjectExpression": {
        const projected = projectStatic(value, steps)
        if (projected.steps.length === steps.length) {
          unresolved.push(value)
          return
        }
        visitThrough(projected.init, projected.steps, valuesMode)
        return
      }
      default:
        unresolved.push(node)
    }
  }

  const visit = (node: any, valuesMode: boolean) => {
    if (!node) return
    const forwarded = resolve
      ? forwardedValuesOf(node, context, "className", path)
      : null
    if (forwarded) {
      // The incoming prop stays opaque; a default is authored here.
      if (path.has(forwarded.variable)) return
      path.add(forwarded.variable)
      for (const alternative of forwarded.alternatives) {
        if ("unresolved" in alternative) unresolved.push(alternative.unresolved)
        else visit(alternative.value, valuesMode)
      }
      path.delete(forwarded.variable)
      return
    }
    switch (node.type) {
      case "Literal":
      case "SvelteLiteral":
      case "VLiteral":
        if (typeof node.value === "string") push(node.value, node)
        return
      case "TemplateLiteral":
        node.quasis.forEach((quasi: any, i: number) => {
          let text: string = quasi.value?.cooked ?? ""
          // A glued interpolation leaves no class of its own.
          if (i > 0 && !/^\s/.test(text)) text = text.replace(/^\S+/, "")
          if (i < node.expressions.length && !/\s$/.test(text))
            text = text.replace(/\S+$/, "")
          if (text.trim()) push(text, quasi)
        })
        node.expressions.forEach((expr: any, i: number) => {
          const before: string = node.quasis[i]?.value?.cooked ?? ""
          const after: string = node.quasis[i + 1]?.value?.cooked ?? ""
          const glued =
            (before !== "" && !/\s$/.test(before)) ||
            (after !== "" && !/^\s/.test(after))
          if (glued) {
            if (!unresolved.includes(node)) unresolved.push(node)
          } else visit(expr, valuesMode)
        })
        return
      case "ConditionalExpression":
        visit(node.consequent, valuesMode)
        visit(node.alternate, valuesMode)
        return
      case "LogicalExpression":
        if (node.operator !== "&&") visit(node.left, valuesMode)
        visit(node.right, valuesMode)
        return
      case "ArrayExpression":
        for (const el of node.elements) visit(el, valuesMode)
        return
      // Astro's `class:list` takes a Set the way it takes an array.
      case "NewExpression":
        if (node.callee?.type === "Identifier" && node.callee.name === "Set") {
          for (const arg of node.arguments) visit(arg, valuesMode)
          return
        }
        unresolved.push(node)
        return
      case "ObjectExpression":
        for (const entry of objectEntries(node, context, path)) {
          if ("unknown" in entry) {
            unresolved.push(entry.unknown)
          } else if (valuesMode) {
            visit(entry.value, valuesMode)
          } else {
            // { rounded: true }: the key is the class.
            push(entry.key, keyNodeOf(node, entry))
          }
        }
        return
      case "CallExpression": {
        const callee =
          node.callee?.type === "Identifier" ? node.callee.name : null
        if (callee && helpers.has(callee)) {
          // A call reached by resolving an identifier keeps its own site.
          const hopped = path.size > 0
          if (!hopped && node !== expression) options.onHelperCall?.(node)
          if (hopped) resolvedCalls++
          if (valueHelpers.has(callee)) {
            for (const arg of node.arguments) visitVariantConfig(arg)
          } else {
            for (const arg of node.arguments) visit(arg, false)
          }
          if (hopped) resolvedCalls--
          return
        }
        unresolved.push(node)
        return
      }
      case "Identifier": {
        if (node.name === "undefined") return
        const resolved = resolve ? resolveIdentifier(node, context, path) : null
        if (!resolved) {
          unresolved.push(node)
          return
        }
        path.add(resolved.variable)
        visitThrough(resolved.init, resolved.steps, valuesMode)
        path.delete(resolved.variable)
        return
      }
      case "MemberExpression": {
        const found = resolveMemberValue(node, context, path)
        if (!found.key || "unresolved" in found) {
          unresolved.push(node)
          return
        }
        if (found.variable) path.add(found.variable)
        visit(found.value, valuesMode)
        if (found.variable) path.delete(found.variable)
        return
      }
      case "JSXExpressionContainer":
      case "SvelteMustacheTag":
      case "VExpressionContainer":
        visit(node.expression, valuesMode)
        return
      case "TSAsExpression":
      case "TSNonNullExpression":
      case "TSSatisfiesExpression":
        visit(node.expression, valuesMode)
        return
      default:
        unresolved.push(node)
    }
  }

  // In a cva or tv config, `defaultVariants` and the selectors inside
  // compoundVariants are names, not classes.
  const visitVariantConfig = (node: any) => {
    if (!node) return
    if (node.type !== "ObjectExpression") {
      visit(node, true)
      return
    }
    for (const prop of node.properties) {
      if (prop.type !== "Property") {
        unresolved.push(prop)
        continue
      }
      switch (keyName(prop)) {
        case "base":
        case "slots":
        case "class":
        case "className":
        case "variants":
          visit(prop.value, true)
          break
        case "compoundVariants":
        case "compoundSlots":
          if (prop.value?.type === "ArrayExpression") {
            for (const entry of prop.value.elements) {
              if (entry?.type !== "ObjectExpression") continue
              for (const inner of entry.properties) {
                if (inner.type !== "Property") continue
                const innerKey = keyName(inner)
                if (innerKey === "class" || innerKey === "className")
                  visit(inner.value, true)
              }
            }
          }
          break
        default:
          break
      }
    }
  }

  visit(expression, options.valuesMode ?? false)
  return { contextualStrings, vocabularyStrings, unresolved }
}

function keyNodeOf(object: any, entry: { key: string; value: any }) {
  for (const prop of object.properties) {
    if (prop.type === "Property" && prop.value === entry.value) return prop.key
  }
  return object
}

// Classes directly, or the values of a classNames object's properties.
export function collectFromValue(
  value: any,
  context: any,
  options: Parameters<typeof collectClassStrings>[2] = {}
) {
  if (!value)
    return {
      contextualStrings: [] as ClassString[],
      vocabularyStrings: [] as ClassString[],
      unresolved: [] as any[],
    }
  const object = resolveObject(value, context, new Set())
  if (object) {
    return collectClassStrings(object, context, {
      ...options,
      valuesMode: true,
    })
  }
  return collectClassStrings(value, context, options)
}

export type SiteOptions = TrackerOptions & {
  mergeFunctions?: string[]
  variantFunctions?: string[]
  scanAllStrings?: boolean
}

// Per-file state shared by every rule: ESLint runs them over one AST in
// one traversal, so the first rule to reach a node computes its site and
// the others read it. Keyed by the Program node, so it lives exactly as
// long as the parse.
type Shared = {
  tracker?: ReturnType<typeof createComponentTracker>
  helpers: Set<string>
  collectOptions: {
    mergeFunctions: Set<string>
    variantFunctions: Set<string>
    onHelperCall: (node: any) => void
  }
  imports: WeakSet<any>
  // Calls nested inside another site. A call that is a site of its own
  // is never here, so every rule receives it.
  consumedCalls: WeakSet<any>
  sites: WeakMap<any, ClassSite[]>
  // False when the rule can register no visitors at all.
  hasSites: boolean
}

const sharedByProgram = new WeakMap<object, Map<string, Shared>>()

const NO_VISITORS: Visitors = {}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const helperSets = new Map<
  string,
  { helpers: Set<string>; variantFunctions: Set<string>; helperCall: RegExp }
>()

function helpersFor(key: string, options: SiteOptions) {
  let sets = helperSets.get(key)
  if (sets) return sets
  const helpers = new Set([
    ...DEFAULT_MERGE_FUNCTIONS,
    ...(options.mergeFunctions ?? []),
    ...(options.variantFunctions ?? []),
  ])
  const variantFunctions = new Set([
    ...DEFAULT_VARIANT_FUNCTIONS,
    ...(options.variantFunctions ?? []),
  ])
  const helperCall = new RegExp(
    `\\b(?:${[...helpers].map(escapeRegExp).join("|")})\\s*\\(`
  )
  sets = { helpers, variantFunctions, helperCall }
  helperSets.set(key, sets)
  return sets
}

const optionKeys = new WeakMap<object, string>()

// ESLint hands every file the same options object for a given config.
function keyOf(options: SiteOptions) {
  let key = optionKeys.get(options)
  if (key === undefined) {
    key = JSON.stringify([
      options.componentImports ?? [],
      options.ignoreImports ?? [],
      options.mergeFunctions ?? [],
      options.variantFunctions ?? [],
    ])
    optionKeys.set(options, key)
  }
  return key
}

function sharedFor(context: any, options: SiteOptions): Shared {
  const program = context.sourceCode?.ast ?? context.sourceCode ?? context
  let byKey = sharedByProgram.get(program)
  if (!byKey) {
    byKey = new Map()
    sharedByProgram.set(program, byKey)
  }
  const key = keyOf(options)
  let shared = byKey.get(key)
  if (shared) return shared
  const { helpers, variantFunctions, helperCall } = helpersFor(key, options)
  const text: string | undefined = context.sourceCode?.text
  const consumedCalls = new WeakSet<any>()
  shared = {
    helpers,
    collectOptions: {
      mergeFunctions: helpers,
      variantFunctions,
      onHelperCall: (node) => consumedCalls.add(node),
    },
    imports: new WeakSet(),
    consumedCalls,
    sites: new WeakMap(),
    hasSites:
      typeof text !== "string" || /class/i.test(text) || helperCall.test(text),
  }
  byKey.set(key, shared)
  return shared
}

// Calls `onSite` for every class site in the file.
export function classSiteVisitors(
  context: any,
  options: SiteOptions,
  onSite: (site: ClassSite) => void
) {
  const shared = sharedFor(context, options)
  if (!shared.hasSites && !options.scanAllStrings) return NO_VISITORS
  const tracker = (shared.tracker ??= createComponentTracker(context, options))
  const reader = readerFor(context)
  const { helpers, collectOptions, consumedCalls, sites } = shared
  const reportedStrings = new WeakSet<any>()
  // A literal several sites reach is one vocabulary check, owned by the
  // first, but every site still judges it in its own context.
  const claimedVocabulary = new WeakSet<any>()

  const emit = (site: ClassSite) => {
    for (const string of site.contextualStrings)
      reportedStrings.add(string.node)
    const vocabularyStrings = site.vocabularyStrings.filter((string) => {
      if (claimedVocabulary.has(string.node)) return false
      claimedVocabulary.add(string.node)
      return true
    })
    onSite(
      vocabularyStrings.length === site.vocabularyStrings.length
        ? site
        : { ...site, vocabularyStrings }
    )
  }

  // A render prop replaces the element, and the className lands on what
  // it renders, so that is the component wearing the classes.
  const resolvedOf = (element: any) => {
    if (!element) return null
    const rendered = reader.renderedElementOf?.(element)
    if (!rendered) return tracker.resolveName(reader.nameOf(element))
    const resolved = tracker.resolveName(reader.nameOf(rendered))
    if (!resolved) return null
    return {
      ...resolved,
      wrapper: resolved.wrapper ?? reader.nameOf(element)?.text ?? "",
    }
  }

  const enclosingOf = (
    element: any,
    accepts: (component: string) => boolean
  ) => {
    let direct = true
    for (
      let node = reader.parentElementOf(element);
      node;
      node = reader.parentElementOf(node)
    ) {
      const name = reader.nameOf(node)
      const resolved = tracker.resolveName(name)
      if (resolved && accepts(resolved.component)) {
        return { name: name?.text ?? "", direct }
      }
      direct = false
    }
    return null
  }

  const closedParentOf = (
    element: any,
    accepts: (component: string) => boolean
  ) => {
    const parent = reader.parentElementOf(element)
    if (!parent) return null
    const name = reader.nameOf(parent)
    const resolved = tracker.resolveName(name)
    return resolved && !accepts(resolved.component) ? (name?.text ?? "") : null
  }

  const siteFor = (
    node: any,
    value: any,
    attribute: string | null,
    resolved: ResolvedElement | null,
    element: any = null
  ): ClassSite => {
    // Markup's own `class` takes an object the way clsx does, keys as
    // classes. Anywhere else an object is a classNames map.
    const keyed = reader.classObjects === true && attribute === "class"
    const classes =
      value && !keyed
        ? collectFromValue(value, context, collectOptions)
        : collectClassStrings(value ?? node, context, collectOptions)
    return {
      ...classes,
      component: resolved?.component ?? null,
      componentFile: resolved?.file ?? null,
      wrapper: resolved?.wrapper ?? null,
      attribute,
      node,
      enclosingContainer: (accepts) =>
        element ? enclosingOf(element, accepts) : null,
      closedParent: (accepts) =>
        element ? closedParentOf(element, accepts) : null,
    }
  }

  const attributeSites = (node: any) => {
    let list = sites.get(node)
    if (list) return list
    const element = reader.elementOf(node)
    list = [
      siteFor(
        node,
        reader.attributeValue(node),
        reader.attributeName(node),
        resolvedOf(element),
        element
      ),
    ]
    sites.set(node, list)
    return list
  }

  // The final value of each class-like key in a readable spread is a
  // site of its own. An unreadable spread is left alone, by design.
  const spreadSites = (node: any) => {
    let list = sites.get(node)
    if (list) return list
    list = []
    const object = resolveObject(
      reader.spreadArgument(node),
      context,
      new Set()
    )
    if (object) {
      const element = reader.elementOf(node)
      const resolved = resolvedOf(element)
      const finals = new Map<string, any>()
      for (const entry of objectEntries(object, context, new Set())) {
        if ("key" in entry && isClassAttribute(entry.key)) {
          finals.set(entry.key, entry.value)
        }
      }
      for (const [key, value] of finals) {
        list.push(siteFor(value, value, key, resolved, element))
      }
    }
    sites.set(node, list)
    return list
  }

  const callSites = (node: any) => {
    let list = sites.get(node)
    if (list) return list
    list = [siteFor(node, null, null, null)]
    sites.set(node, list)
    return list
  }

  const visitors: Visitors = {}
  for (const type of reader.attributes) {
    addVisitor(visitors, type, (node: any) => {
      if (!isClassAttribute(reader.attributeName(node))) return
      for (const site of attributeSites(node)) emit(site)
    })
  }
  for (const type of reader.spreads) {
    addVisitor(visitors, type, (node: any) => {
      if (!reader.spreadArgument(node)) return
      for (const site of spreadSites(node)) emit(site)
    })
  }
  for (const [type, read] of Object.entries(reader.extraSites ?? {})) {
    addVisitor(visitors, type, (node: any) => {
      let list = sites.get(node)
      if (!list) {
        const extra = read(node)
        list = []
        if (extra) {
          const element = reader.elementOf(extra.anchor)
          list.push({
            ...siteFor(node, null, "class", resolvedOf(element), element),
            contextualStrings: extra.names,
            vocabularyStrings: extra.names,
            unresolved: [],
          })
        }
        sites.set(node, list)
      }
      for (const site of list) emit(site)
    })
  }

  return {
    ImportDeclaration(node: any) {
      if (shared.imports.has(node)) return
      shared.imports.add(node)
      tracker.collectImport(node)
    },
    ...visitors,
    CallExpression(node: any) {
      if (consumedCalls.has(node)) return
      const callee =
        node.callee?.type === "Identifier" ? node.callee.name : null
      if (!callee || !helpers.has(callee)) return
      for (const site of callSites(node)) emit(site)
    },
    ...(options.scanAllStrings
      ? {
          // Every string literal, the way Tailwind's scanner reads them.
          // One claimed here is not reported again by a later site.
          Literal(node: any) {
            if (typeof node.value !== "string" || !node.value.includes("-"))
              return
            if (reportedStrings.has(node) || claimedVocabulary.has(node)) return
            if (node.parent?.type === "ImportDeclaration") return
            const strings = [{ value: node.value, node }]
            emit({
              contextualStrings: strings,
              vocabularyStrings: strings,
              unresolved: [],
              component: null,
              componentFile: null,
              wrapper: null,
              attribute: null,
              node,
              enclosingContainer: () => null,
              closedParent: () => null,
            })
          },
        }
      : {}),
  }
}
