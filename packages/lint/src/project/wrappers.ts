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

type FileWrappers = Map<string, WrapperTarget | null>

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

// The destructured binding, or the whole props object. Once className is
// destructured out, `{...rest}` no longer carries it.
function classNameBindings(fn: any) {
  const names = new Set<string>()
  const propsNames = new Set<string>()
  const param = fn.params?.[0]
  if (!param) return { names, propsNames }
  const pattern = param.type === "AssignmentPattern" ? param.left : param
  if (pattern.type === "ObjectPattern") {
    for (const prop of pattern.properties) {
      if (prop.type !== "Property") continue
      const key = prop.key?.name ?? prop.key?.value
      if (key !== "className") continue
      const value =
        prop.value?.type === "AssignmentPattern" ? prop.value.left : prop.value
      if (value?.type === "Identifier") names.add(value.name)
    }
    if (!names.size) {
      for (const prop of pattern.properties) {
        if (
          prop.type === "RestElement" &&
          prop.argument?.type === "Identifier"
        ) {
          propsNames.add(prop.argument.name)
        }
      }
    }
  } else if (pattern.type === "Identifier") {
    propsNames.add(pattern.name)
  }
  return { names, propsNames }
}

function forwardsClassName(
  expr: any,
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
      node.property?.name === "className"
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
  const { bindings, candidates } = indexLocalBindings(ast)
  const localVisiting = new Set<string>()

  const targetOf = (element: any) => targetOfName(jsxElementName(element))

  const targetOfName = (
    name: { root?: string; property: string | null } | null
  ): WrapperTarget | null => {
    if (!name?.root) return null
    const imported = imports.get(name.root)
    if (!imported) {
      if (name.property !== null) return null
      if (index.has(name.root)) {
        return {
          component: name.root,
          file: index.files.get(name.root) ?? null,
        }
      }
      return candidates.has(name.root) ? resolveDeclared(name.root) : null
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
    if (component) return component
    if (!binding) {
      // Not cached: the file the name points at may yet be created.
      complete = false
      return index.has(importedName.name)
        ? {
            component: importedName.name,
            file: index.files.get(importedName.name) ?? null,
          }
        : null
    }
    // Packages are never wrappers of the project's own system.
    if (binding.file === file || NODE_MODULES.test(binding.file)) return null
    if (importedName.suffix) return null
    if (visiting.has(binding.file)) {
      complete = false
      return null
    }
    const result = lookup(binding.file, binding.name, patterns, visiting, deps)
    if (!result.complete) complete = false
    return result.target
  }

  const resolveDeclared = (name: string): WrapperTarget | null => {
    const cached = wrappers.get(name)
    if (cached !== undefined) return cached
    if (localVisiting.has(name)) {
      complete = false
      return null
    }
    localVisiting.add(name)
    let target: WrapperTarget | null = null
    const fn = componentFunction(bindings, name)
    if (fn) {
      const { names, propsNames } = classNameBindings(fn)
      if (names.size || propsNames.size) {
        walk(fn.body, (node) => {
          if (target || node.type !== "JSXOpeningElement") return
          const forwards = node.attributes?.some(
            (attr: any) =>
              (attr.type === "JSXAttribute" &&
                attr.name?.name === "className" &&
                forwardsClassName(attr.value, names, propsNames)) ||
              (attr.type === "JSXSpreadAttribute" &&
                forwardsClassName(attr, names, propsNames))
          )
          if (forwards) target = targetOf(node)
        })
      }
    }
    localVisiting.delete(name)
    wrappers.set(name, target)
    return target
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
      target = targetOfName({
        root: imports.has(root) ? root : pascal,
        property: rest.length ? rest.join(".") : null,
      })
      if (target) break
    }
    wrappers.set(sfcNameOf(file), target)
  }
  return { wrappers, complete }
}

function lookup(
  file: string,
  exportName: string,
  patterns: RegExp[],
  visiting: Set<string>,
  deps: Set<string> | undefined,
  parsedAst?: any
): { target: WrapperTarget | null; complete: boolean } {
  deps?.add(file)
  if (mtimeOf(file) === null) return { target: null, complete: false }
  const key = `${file}|${patterns.map((p) => p.source).join(",")}`
  const cached = cache.get(key)
  const now = Date.now()
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
    return { target: cached.wrappers.get(exportName) ?? null, complete: true }
  }
  visiting.add(file)
  const own = new Set<string>()
  const { wrappers, complete } = build(file, patterns, visiting, own, parsedAst)
  visiting.delete(file)
  if (deps) {
    for (const dep of own) {
      deps.add(dep)
    }
  }
  const depList = [...own]
  if (complete) {
    cache.set(key, {
      deps: depList,
      signature: signatureOf(depList),
      checkedAt: now,
      wrappers,
    })
  }
  return { target: wrappers.get(exportName) ?? null, complete }
}

// For the file being linted, pass the AST the linter already parsed
// instead of re-reading it from disk.
export function wrapperTargetOf(
  file: string,
  exportName: string,
  patterns: RegExp[] = [],
  parsedAst?: any
): WrapperTarget | null {
  return lookup(file, exportName, patterns, new Set(), undefined, parsedAst)
    .target
}

export function clearWrapperCache() {
  cache.clear()
}
