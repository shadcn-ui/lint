// Components outside the ui directory that forward className to a
// design-system component: styling <SaveButton> styles the Button inside
// it, so the wrapper inherits its target's contract and variants. The one
// cross-file fact the boundary needs — a contract that follows the value,
// the way a type would. See docs/how-it-works.md.

import * as fs from "node:fs"

import { walk } from "./ast"
import {
  componentFromImport,
  importNameOf,
  type ComponentImport,
} from "./component-imports"
import { componentsFor } from "./components"
import { mtimeOf, NODE_MODULES, TTL } from "./fs"
import { definingExportOf } from "./modules"
import { isSfc, parseSource, sfcNameOf } from "./parser"
import { templateTags, type TemplateTag } from "./sfc-template"

export { walk }

export type WrapperTarget = {
  component: string
  file: string | null
}

// A tag a prop lands on: a design-system component, or a wrapper that
// is asked in turn where that prop goes.
type Hop = { target: WrapperTarget } | { file: string; name: string }

// Where one component sends the class props it receives: the target of
// each one it names, and the tag a props spread hands the rest to.
// "className" is the main class prop, which an SFC spells `class`.
type Forwards = {
  props: Map<string, WrapperTarget | null>
  spread: Hop | null
}

type FileWrappers = Map<string, Forwards>

const NO_FORWARDS: Forwards = { props: new Map(), spread: null }

const CLASS_PROP = /^[^:]*class(name)?s?$/i
const MAIN_CLASS_PROP = /^(class|className|class:list)$/

// The prop of a wrapper an attribute sets. `class` and `className` are
// its main class prop, and Vue's `header-class` is `headerClass`.
export function wrapperPropOf(attribute: string) {
  if (MAIN_CLASS_PROP.test(attribute)) return "className"
  return attribute.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

type Entry = {
  deps: string[]
  signature: string
  checkedAt: number
  wrappers: FileWrappers
}

const cache = new Map<string, Entry>()

function signatureOf(files: string[]) {
  return files.map((file) => `${file}:${mtimeOf(file) ?? "missing"}`).join("|")
}

function indexLocalBindings(ast: any) {
  const bindings = new Map<string, any>()
  const candidates = new Set<string>()
  const aliases: any[] = []
  for (const statement of ast.body) {
    const decl =
      statement.type === "ExportNamedDeclaration" ||
      statement.type === "ExportDefaultDeclaration"
        ? statement.declaration
        : statement
    if (decl?.type === "FunctionDeclaration" && decl.id?.name) {
      candidates.add(decl.id.name)
      bindings.set(decl.id.name, decl)
      if (statement.type === "ExportDefaultDeclaration")
        bindings.set("default", decl)
    } else if (decl?.type === "VariableDeclaration") {
      for (const d of decl.declarations) {
        if (d.id?.type !== "Identifier") continue
        candidates.add(d.id.name)
        if (d.init) bindings.set(d.id.name, d.init)
      }
    } else if (decl && statement.type === "ExportDefaultDeclaration") {
      bindings.set("default", decl)
    }
    if (statement.type === "ExportDefaultDeclaration") candidates.add("default")
    if (statement.type === "ExportNamedDeclaration" && !statement.source) {
      for (const spec of statement.specifiers ?? []) {
        const exported = spec.exported?.name ?? spec.exported?.value
        if (exported) candidates.add(exported)
        aliases.push(spec)
      }
    }
  }

  for (const spec of aliases) {
    const exported = spec.exported?.name ?? spec.exported?.value
    const local = spec.local?.name
    if (exported && local && exported !== local && bindings.has(local)) {
      bindings.set(exported, bindings.get(local))
    }
  }
  return { bindings, candidates }
}

// The function a component name refers to, however it was declared,
// re-bound, or wrapped. "default" names the default export.
function componentFunction(bindings: Map<string, any>, name: string) {
  let fn = bindings.get(name)
  for (let hop = 0; hop < 6 && fn; hop++) {
    if (fn.type === "CallExpression" && fn.arguments?.[0]) fn = fn.arguments[0]
    else if (fn.type === "Identifier" && bindings.has(fn.name))
      fn = bindings.get(fn.name)
    else break
  }
  return fn?.type === "FunctionDeclaration" ||
    fn?.type === "FunctionExpression" ||
    fn?.type === "ArrowFunctionExpression"
    ? fn
    : null
}

// The destructured binding of each class prop, and what carries the props
// left undestructured: the whole props object, or `...rest`.
function propBindings(fn: any) {
  const named = new Map<string, string>()
  const carriers = new Set<string>()
  const param = fn.params?.[0]
  if (!param) return { named, carriers }
  const pattern = param.type === "AssignmentPattern" ? param.left : param
  if (pattern.type === "ObjectPattern") {
    for (const prop of pattern.properties) {
      if (prop.type === "RestElement") {
        if (prop.argument?.type === "Identifier") {
          carriers.add(prop.argument.name)
        }
        continue
      }
      if (prop.type !== "Property") continue
      const key = prop.key?.name ?? prop.key?.value
      if (typeof key !== "string" || !CLASS_PROP.test(key)) continue
      const value =
        prop.value?.type === "AssignmentPattern" ? prop.value.left : prop.value
      if (value?.type === "Identifier") named.set(key, value.name)
    }
  } else if (pattern.type === "Identifier") {
    carriers.add(pattern.name)
  }
  return { named, carriers }
}

// The same split for one prop. Once it is destructured out, `{...rest}`
// no longer carries it.
function bindingsFor(
  prop: string,
  named: Map<string, string>,
  carriers: Set<string>
) {
  const local = named.get(prop)
  return {
    names: new Set<string>(local ? [local] : []),
    propsNames: local ? new Set<string>() : carriers,
  }
}

// The class props a body reads off its props: `props.headerClassName`.
function memberClassProps(body: any, carriers: Set<string>) {
  const out = new Set<string>()
  if (!carriers.size) return out
  walk(body, (node) => {
    if (
      node.type === "MemberExpression" &&
      !node.computed &&
      node.object?.type === "Identifier" &&
      carriers.has(node.object.name) &&
      typeof node.property?.name === "string" &&
      CLASS_PROP.test(node.property.name)
    ) {
      out.add(node.property.name)
    }
  })
  return out
}

function forwardsProp(
  expr: any,
  prop: string,
  names: Set<string>,
  propsNames: Set<string>
) {
  let found = false
  walk(expr, (node) => {
    if (found) return
    if (node.type === "Identifier" && names.has(node.name)) found = true
    if (
      node.type === "MemberExpression" &&
      node.object?.type === "Identifier" &&
      propsNames.has(node.object.name) &&
      node.property?.name === prop
    )
      found = true
    if (
      node.type === "JSXSpreadAttribute" &&
      node.argument?.type === "Identifier" &&
      propsNames.has(node.argument.name)
    )
      found = true
  })
  return found
}

// A single-file component receives its props from a call in its script:
// `let { class: className, ...rest } = $props()` in Svelte, `const props
// = defineProps()` in Vue. Same split as `classNameBindings`.
function sfcClassBindings(ast: any, vue: boolean) {
  const names = new Set<string>()
  const propsNames = new Set<string>(vue ? ["$props", "$attrs"] : [])
  // Vue hands `class` to a lone root element unless a prop claims it.
  let declaresClass = false
  const isPropsCall = (node: any): boolean => {
    while (node?.type?.startsWith("TS") && node.expression) {
      node = node.expression
    }
    if (node?.type !== "CallExpression" || node.callee?.type !== "Identifier") {
      return false
    }
    if (node.callee.name === "withDefaults") {
      return isPropsCall(node.arguments[0])
    }
    return node.callee.name === "$props" || node.callee.name === "defineProps"
  }
  walk(ast, (node) => {
    if (node.type === "CallExpression" && isPropsCall(node)) {
      walk(node, (inner) => {
        const key = inner.key?.name ?? inner.key?.value
        if (
          (inner.type === "TSPropertySignature" || inner.type === "Property") &&
          key === "class"
        ) {
          declaresClass = true
        }
      })
    }
    if (node.type !== "VariableDeclarator" || !isPropsCall(node.init)) return
    if (node.id.type === "Identifier") {
      propsNames.add(node.id.name)
      return
    }
    if (node.id.type !== "ObjectPattern") return
    const rests: string[] = []
    for (const prop of node.id.properties) {
      if (prop.type === "RestElement" && prop.argument?.type === "Identifier") {
        rests.push(prop.argument.name)
      }
      if (prop.type !== "Property") continue
      if ((prop.key?.name ?? prop.key?.value) !== "class") continue
      const value =
        prop.value?.type === "AssignmentPattern" ? prop.value.left : prop.value
      if (value?.type === "Identifier") names.add(value.name)
    }
    // Once class is destructured out, the rest no longer carries it.
    if (!names.size) for (const rest of rests) propsNames.add(rest)
  })
  return { names, propsNames, declaresClass }
}

const escapeName = (name: string) => name.replace(/[$]/g, "\\$&")

// Whether the received class reaches this tag: named in its class value,
// or carried by a spread of the props it arrived in.
function tagForwardsClass(
  tag: TemplateTag,
  names: Set<string>,
  propsNames: Set<string>
) {
  const mentions = (value: string) =>
    [...names].some((name) =>
      new RegExp(`(?<![\\w$.])${escapeName(name)}(?![\\w$])`).test(value)
    ) ||
    [...propsNames].some((name) =>
      new RegExp(`(?<![\\w$.])${escapeName(name)}\\.class(?![\\w$])`).test(
        value
      )
    )
  return tag.attributes.some(({ name, value }) => {
    if (name === "class" || name === ":class" || name === "v-bind:class") {
      return mentions(value)
    }
    const spread =
      name === ""
        ? value.match(/^\{\s*\.\.\.\s*([\w$]+)\s*\}$/)?.[1]
        : name === "v-bind"
          ? value.replace(/^["']|["']$/g, "").trim()
          : undefined
    return spread !== undefined && propsNames.has(spread)
  })
}

// The tags of an SFC the received class lands on, in source order.
function sfcForwardingTags(source: string, file: string, ast: any) {
  const vue = /\.vue$/i.test(file)
  const { names, propsNames, declaresClass } = sfcClassBindings(ast, vue)
  const tags = templateTags(source, file)
  const forwarding = tags.filter((tag) =>
    tagForwardsClass(tag, names, propsNames)
  )
  const roots = tags.filter((tag) => tag.depth === 0)
  if (
    vue &&
    !declaresClass &&
    roots.length === 1 &&
    !/inheritAttrs\s*:\s*false/.test(source) &&
    !forwarding.includes(roots[0])
  ) {
    forwarding.unshift(roots[0])
  }
  return forwarding
}

function jsxElementName(node: any) {
  const name = node.name
  if (name?.type === "JSXIdentifier") return { root: name.name, property: null }
  if (name?.type === "JSXMemberExpression") {
    return {
      root: name.object?.name as string | undefined,
      property: (name.property?.name ?? "") as string,
    }
  }
  return null
}

// `visiting` holds the files on the current path so a wrapper cycle
// terminates; a map computed while a cycle was cut is never cached, so no
// caller sees a truncated answer later.
function build(
  file: string,
  patterns: RegExp[],
  ui: string[],
  visiting: Set<string>,
  deps: Set<string>,
  parsedAst?: any
): { wrappers: FileWrappers; complete: boolean } {
  const wrappers: FileWrappers = new Map()
  let complete = true
  deps.add(file)
  const sfc = isSfc(file)
  // A linter's AST of an SFC is the framework's own; the scripts are
  // read from disk the way every other component file is.
  let ast: any = sfc ? undefined : parsedAst
  let source = ""
  if (!ast) {
    try {
      source = fs.readFileSync(file, "utf-8")
    } catch {
      return { wrappers, complete }
    }
    // A file with neither is not a wrapper and is not worth parsing.
    if (!sfc && !source.includes("className") && !source.includes("...")) {
      return { wrappers, complete }
    }
    try {
      ast = parseSource(source, file)
    } catch {
      return { wrappers, complete }
    }
  }
  const imports = new Map<string, ComponentImport>()
  for (const statement of ast.body) {
    if (statement.type !== "ImportDeclaration") continue
    const source = statement.source?.value
    if (typeof source !== "string") continue
    for (const spec of statement.specifiers ?? []) {
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
    }
  }
  const index = componentsFor(file)
  // A tag with no import is also looked up in settings.shadcn.ui.
  const tagIndex = ui.length ? componentsFor(file, ui) : index
  const { bindings, candidates } = indexLocalBindings(ast)
  const declaring = new Set<string>()
  const asking = new Set<string>()

  // Each tag is resolved once, whichever props are asked about it.
  const hops = new Map<any, Hop | null>()
  const hopOf = (element: any) => {
    let hop = hops.get(element)
    if (hop === undefined) {
      hop = hopOfName(jsxElementName(element))
      hops.set(element, hop)
    }
    return hop
  }

  const hopOfName = (
    name: { root?: string; property: string | null } | null
  ): Hop | null => {
    if (!name?.root) return null
    const imported = imports.get(name.root)
    if (!imported) {
      if (name.property !== null) return null
      if (tagIndex.has(name.root)) {
        return {
          target: {
            component: name.root,
            file: tagIndex.files.get(name.root) ?? null,
          },
        }
      }
      return candidates.has(name.root) ? { file, name: name.root } : null
    }
    const importedName = importNameOf(imported, name.root, name.property)
    const binding = importedName.exportName
      ? definingExportOf(
          importedName.source,
          importedName.exportName,
          file,
          deps
        )
      : null
    const component = componentFromImport(
      index,
      binding,
      importedName,
      patterns
    )
    if (component) return { target: component }
    if (!binding) {
      // Not cached: the file the name points at may yet be created.
      complete = false
      return index.has(importedName.name)
        ? {
            target: {
              component: importedName.name,
              file: index.files.get(importedName.name) ?? null,
            },
          }
        : null
    }
    // Packages are never wrappers of the project's own system.
    if (binding.file === file || NODE_MODULES.test(binding.file)) return null
    if (importedName.suffix) return null
    return { file: binding.file, name: binding.name }
  }

  // The component a prop handed to this tag ends up on.
  const targetVia = (hop: Hop | null, prop: string): WrapperTarget | null => {
    if (!hop) return null
    if ("target" in hop) return hop.target
    if (hop.file === file) return localTarget(hop.name, prop)
    if (visiting.has(hop.file)) {
      complete = false
      return null
    }
    const result = lookup(
      hop.file,
      hop.name,
      prop,
      patterns,
      ui,
      visiting,
      deps
    )
    if (!result.complete) complete = false
    return result.target
  }

  const localTarget = (name: string, prop: string) => {
    const key = `${name}|${prop}`
    if (asking.has(key)) {
      complete = false
      return null
    }
    asking.add(key)
    const own = resolveDeclared(name)
    const target = own.props.has(prop)
      ? (own.props.get(prop) ?? null)
      : targetVia(own.spread, prop)
    asking.delete(key)
    return target
  }

  // The first tag the prop reaches that is, or wraps, a design-system
  // component: named in one of its class props, or carried by a spread.
  const forwardedTarget = (
    fn: any,
    prop: string,
    named: Map<string, string>,
    carriers: Set<string>
  ) => {
    const { names, propsNames } = bindingsFor(prop, named, carriers)
    if (!names.size && !propsNames.size) return null
    let target: WrapperTarget | null = null
    walk(fn.body, (node) => {
      if (target || node.type !== "JSXOpeningElement") return
      for (const attr of node.attributes ?? []) {
        let lands: string | null = null
        if (attr.type === "JSXAttribute") {
          const attribute =
            attr.name?.type === "JSXIdentifier" ? attr.name.name : ""
          if (
            CLASS_PROP.test(attribute) &&
            forwardsProp(attr.value, prop, names, propsNames)
          ) {
            lands = wrapperPropOf(attribute)
          }
        } else if (
          attr.type === "JSXSpreadAttribute" &&
          forwardsProp(attr, prop, names, propsNames)
        ) {
          lands = prop
        }
        if (lands === null) continue
        target = targetVia(hopOf(node), lands)
        if (target) return
      }
    })
    return target
  }

  const resolveDeclared = (name: string): Forwards => {
    const cached = wrappers.get(name)
    if (cached) return cached
    if (declaring.has(name)) {
      complete = false
      return NO_FORWARDS
    }
    declaring.add(name)
    const own: Forwards = { props: new Map(), spread: null }
    const fn = componentFunction(bindings, name)
    if (fn) {
      const { named, carriers } = propBindings(fn)
      const props = new Set([
        "className",
        ...named.keys(),
        ...memberClassProps(fn.body, carriers),
      ])
      for (const prop of props) {
        own.props.set(prop, forwardedTarget(fn, prop, named, carriers))
      }
      // Any other prop goes wherever the props are spread.
      if (carriers.size) {
        walk(fn.body, (node) => {
          if (own.spread || node.type !== "JSXOpeningElement") return
          const spreads = node.attributes?.some(
            (attr: any) =>
              attr.type === "JSXSpreadAttribute" &&
              attr.argument?.type === "Identifier" &&
              carriers.has(attr.argument.name)
          )
          if (spreads) own.spread = hopOf(node)
        })
      }
    }
    declaring.delete(name)
    wrappers.set(name, own)
    return own
  }

  for (const name of candidates) {
    if (name === "default" || /^[A-Z]/.test(name)) resolveDeclared(name)
  }
  if (sfc) {
    // The file is the component: the first forwarding tag that is a
    // design-system component is what it wraps.
    let target: WrapperTarget | null = null
    for (const tag of sfcForwardingTags(source, file, ast)) {
      const [root, ...rest] = tag.name.split(".")
      const pascal = root.includes("-") ? sfcNameOf(root) : root
      target = targetVia(
        hopOfName({
          root: imports.has(root) ? root : pascal,
          property: rest.length ? rest.join(".") : null,
        }),
        "className"
      )
      if (target) break
    }
    // Only its class is followed: any other prop is not checked.
    wrappers.set(sfcNameOf(file), {
      props: new Map([["className", target]]),
      spread: null,
    })
  }
  return { wrappers, complete }
}

// Where a file's component sends a prop, following spreads within the
// file; a spread into another file asks that file.
function targetIn(
  file: string,
  wrappers: FileWrappers,
  exportName: string,
  prop: string,
  patterns: RegExp[],
  ui: string[],
  visiting: Set<string>,
  deps: Set<string> | undefined
): { target: WrapperTarget | null; complete: boolean } {
  const seen = new Set<string>()
  for (let name = exportName; !seen.has(name);) {
    seen.add(name)
    const own = wrappers.get(name)
    if (!own) break
    if (own.props.has(prop)) {
      return { target: own.props.get(prop) ?? null, complete: true }
    }
    const hop = own.spread
    if (!hop) break
    if ("target" in hop) return { target: hop.target, complete: true }
    if (hop.file === file) {
      name = hop.name
      continue
    }
    if (visiting.has(hop.file)) return { target: null, complete: false }
    return lookup(hop.file, hop.name, prop, patterns, ui, visiting, deps)
  }
  return { target: null, complete: true }
}

function lookup(
  file: string,
  exportName: string,
  prop: string,
  patterns: RegExp[],
  ui: string[],
  visiting: Set<string>,
  deps: Set<string> | undefined,
  parsedAst?: any
): { target: WrapperTarget | null; complete: boolean } {
  deps?.add(file)
  if (mtimeOf(file) === null) return { target: null, complete: false }
  const key = `${file}|${patterns.map((p) => p.source).join(",")}|${ui.join(",")}`
  const cached = cache.get(key)
  const now = Date.now()
  let wrappers: FileWrappers
  let complete = true
  if (
    cached &&
    (now - cached.checkedAt < TTL ||
      signatureOf(cached.deps) === cached.signature)
  ) {
    if (now - cached.checkedAt >= TTL) {
      cached.checkedAt = now
    }
    if (deps) {
      for (const dep of cached.deps) {
        deps.add(dep)
      }
    }
    wrappers = cached.wrappers
  } else {
    visiting.add(file)
    const own = new Set<string>()
    const built = build(file, patterns, ui, visiting, own, parsedAst)
    visiting.delete(file)
    if (deps) {
      for (const dep of own) {
        deps.add(dep)
      }
    }
    const depList = [...own]
    wrappers = built.wrappers
    complete = built.complete
    if (complete) {
      cache.set(key, {
        deps: depList,
        signature: signatureOf(depList),
        checkedAt: now,
        wrappers,
      })
    }
  }
  visiting.add(file)
  const result = targetIn(
    file,
    wrappers,
    exportName,
    prop,
    patterns,
    ui,
    visiting,
    deps
  )
  visiting.delete(file)
  return { target: result.target, complete: complete && result.complete }
}

// For the file being linted, pass the AST the linter already parsed
// instead of re-reading it from disk. `prop` is the class prop a caller
// sets; "className" is the main one, `class` in an SFC.
export function wrapperTargetOf(
  file: string,
  exportName: string,
  patterns: RegExp[] = [],
  parsedAst?: any,
  ui: string[] = [],
  prop = "className"
): WrapperTarget | null {
  return lookup(
    file,
    exportName,
    prop,
    patterns,
    ui,
    new Set(),
    undefined,
    parsedAst
  ).target
}

export function clearWrapperCache() {
  cache.clear()
}
