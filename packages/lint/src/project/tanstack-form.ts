// The statically traceable subset of TanStack Form's createFormHook:
// direct const destructuring and literal component maps.
import * as fs from "node:fs"

import type { ComponentImport } from "./component-imports"
import { dirOf, memoize, NODE_MODULES } from "./fs"
import { parseSource } from "./parser"
import { packageRoot, resolveFile } from "./resolve"

type Registration = {
  file: string
  program: any
  component: string
}

function propertyName(property: any) {
  if (property.type !== "Property" || property.computed) return null
  if (property.key.type === "Identifier") return property.key.name
  if (typeof property.key.value === "string") return property.key.value
  return null
}

function propertyOf(object: any, name: string) {
  if (object?.type !== "ObjectExpression") return null
  let value = null
  for (const property of object.properties) {
    const key = propertyName(property)
    // Dynamic keys and spreads might override the preceding properties.
    if (key === null) return null
    if (key === name) value = property.kind === "init" ? property.value : null
  }
  return value
}

export function namedImportOf(
  program: any,
  name: string
): ComponentImport | null {
  for (const node of program?.body ?? []) {
    if (node.type !== "ImportDeclaration" || node.importKind === "type")
      continue
    for (const specifier of node.specifiers) {
      if (specifier.local.name !== name || specifier.importKind === "type")
        continue
      if (specifier.type === "ImportSpecifier") {
        return {
          source: node.source.value,
          original: specifier.imported.name ?? specifier.imported.value,
          namespace: false,
        }
      }
      if (specifier.type === "ImportDefaultSpecifier") {
        return {
          source: node.source.value,
          original: "default",
          namespace: false,
        }
      }
    }
  }
  return null
}

function componentOf(
  program: any,
  hook: string,
  group: string,
  member: string,
  exportedOnly: boolean
) {
  for (const statement of program?.body ?? []) {
    const exported = statement.type === "ExportNamedDeclaration"
    if (exportedOnly && !exported) continue
    const declaration = exported ? statement.declaration : statement
    if (
      declaration?.type !== "VariableDeclaration" ||
      declaration.kind !== "const"
    )
      continue
    for (const declarator of declaration.declarations) {
      if (declarator.id.type !== "ObjectPattern") continue
      if (
        !declarator.id.properties.some(
          (p: any) =>
            propertyName(p) === "useAppForm" &&
            p.value.type === "Identifier" &&
            p.value.name === hook
        )
      )
        continue
      const call = declarator.init
      if (
        call?.type !== "CallExpression" ||
        call.optional ||
        call.callee.type !== "Identifier"
      )
        return null
      const origin = namedImportOf(program, call.callee.name)
      if (
        origin?.source !== "@tanstack/react-form" ||
        origin.original !== "createFormHook"
      )
        return null
      const value = propertyOf(propertyOf(call.arguments[0], group), member)
      return value?.type === "Identifier" ? value.name : null
    }
  }
  return null
}

function readProgram(file: string) {
  return memoize(`tanstack-form:${file}`, () => {
    try {
      const source = fs.readFileSync(file, "utf8")
      return source.includes("@tanstack/react-form") &&
        source.includes("createFormHook")
        ? parseSource(source, file)
        : null
    } catch {
      return null
    }
  })
}

export function registeredComponent(
  file: string,
  program: any,
  hook: string,
  group: "formComponents" | "fieldComponents",
  member: string,
  imported: boolean
): Registration | null {
  if (imported) {
    const specifier = namedImportOf(program, hook)
    if (!specifier) return null
    const hookFile = resolveFile(
      specifier.source,
      dirOf(file),
      packageRoot(file) ?? dirOf(file)
    )
    if (!hookFile || NODE_MODULES.test(hookFile)) return null
    file = hookFile
    program = readProgram(file)
    hook = specifier.original
  }
  const component = componentOf(program, hook, group, member, imported)
  return component ? { file, program, component } : null
}
