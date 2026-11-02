// A module's exports, each mapped to the file and binding that define it,
// followed through barrels. Text-based on purpose: it runs for every ui
// file and every imported component, and the forms it needs are regular.
// A recursive lookup keeps its visiting set so a cycle never caches a
// truncated view; callers record the files touched (`deps`) to revalidate.

import * as fs from "node:fs"
import * as path from "node:path"

import { memoize, mtimeOf } from "./fs"
import { isSfc, scriptOf, sfcNameOf } from "./parser"
import { packageRoot, resolveFile } from "./resolve"

export type ExportBinding = {
  file: string
  // `Button` for `export { Button as Action }`. `*` for a namespace: the
  // module itself, through `export * as Button from "./button"`.
  name: string
}

export type ModuleExports = Map<string, ExportBinding>

type ParsedModule = {
  local: Set<string>
  // Local name -> specifier and imported name.
  imports: Map<string, { spec: string; name: string }>
  defaultName: string | null
  // A .svelte or .vue file: the default export is the component itself.
  sfc: boolean
  named: { exported: string; local: string; spec: string }[]
  namedIndices: Map<string, number[]>
  stars: string[]
  // Exported name -> specifier of `export * as Name from "spec"`.
  namespaces: Map<string, string>
}

const parsed = new Map<string, { mtimeMs: number; module: ParsedModule }>()

const DECLARATION_RE =
  /export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|enum)\s+([A-Za-z_$][\w$]*)/g
const DEFAULT_DECLARATION_RE =
  /export\s+default\s+(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/
const DEFAULT_IDENTIFIER_RE = /export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/m
// `export default memo(Button)`: the component is inside the call.
const DEFAULT_WRAPPED_RE =
  /export\s+default\s+(?:React\.)?(?:memo|forwardRef)\(\s*(?:function\s+)?([A-Za-z_$][\w$]*)/
const NAMED_RE =
  /export\s*(type\s+)?\{([^}]*)\}\s*(?:from\s*["']([^"']+)["'])?/g
const STAR_RE = /export\s*\*\s*(?:as\s+([\w$]+)\s+)?from\s*["']([^"']+)["']/g
const IMPORT_RE =
  /import\s+(?!type\s)(?:([\w$]+)\s*,?\s*)?(?:\*\s*as\s+([\w$]+)|\{([^}]*)\})?\s*from\s*["']([^"']+)["']/g

// A list may carry comments: a barrel may separate its short names
// from its long ones with a bare `//`.
const COMMENT_RE = /\/\*[\s\S]*?\*\/|\/\/[^\n\r]*/g

function parseNamed(list: string) {
  const out: { exported: string; local: string }[] = []
  for (const raw of list.replace(COMMENT_RE, "").split(",")) {
    const item = raw.trim()
    if (!item || item.startsWith("type ")) continue
    const [local, exported] = item.split(/\s+as\s+/).map((s) => s.trim())
    if (!local) continue
    out.push({ exported: exported ?? local, local })
  }
  return out
}

function parseModule(file: string): ParsedModule {
  const module: ParsedModule = {
    local: new Set(),
    imports: new Map(),
    defaultName: null,
    sfc: isSfc(file),
    named: [],
    namedIndices: new Map(),
    stars: [],
    namespaces: new Map(),
  }
  let source: string
  try {
    source = fs.readFileSync(file, "utf-8")
  } catch {
    return module
  }
  if (module.sfc) source = scriptOf(source)
  for (const match of source.matchAll(IMPORT_RE)) {
    const [, defaultLocal, namespaceLocal, list, spec] = match
    if (defaultLocal)
      module.imports.set(defaultLocal, { spec, name: "default" })
    if (namespaceLocal) module.imports.set(namespaceLocal, { spec, name: "*" })
    for (const { exported, local } of list ? parseNamed(list) : []) {
      module.imports.set(exported, { spec, name: local })
    }
  }
  for (const match of source.matchAll(DECLARATION_RE))
    module.local.add(match[1])
  const defaultDeclaration = source.match(DEFAULT_DECLARATION_RE)
  const defaultIdentifier =
    source.match(DEFAULT_IDENTIFIER_RE) ?? source.match(DEFAULT_WRAPPED_RE)
  if (defaultDeclaration) module.defaultName = defaultDeclaration[1]
  else if (defaultIdentifier) {
    module.defaultName = defaultIdentifier[1]
    module.local.add(defaultIdentifier[1])
  }
  if (module.sfc) module.defaultName = sfcNameOf(file)
  for (const match of source.matchAll(NAMED_RE)) {
    if (match[1]) continue
    // No `from` clause: the empty specifier means this file's own name.
    const spec = match[3] ?? ""
    for (const { exported, local } of parseNamed(match[2])) {
      module.named.push({ exported, local, spec })
    }
  }
  for (const match of source.matchAll(STAR_RE)) {
    if (match[1]) {
      module.namespaces.set(match[1], match[2])
      continue
    }
    module.stars.push(match[2])
  }
  for (let index = 0; index < module.named.length; index++) {
    const name = module.named[index].exported
    const indices = module.namedIndices.get(name)
    if (indices) {
      indices.push(index)
    } else {
      module.namedIndices.set(name, [index])
    }
  }
  return module
}

function moduleOf(file: string) {
  const mtimeMs = mtimeOf(file)
  if (mtimeMs === null) return null
  const cached = parsed.get(file)
  if (cached && cached.mtimeMs === mtimeMs) return cached.module
  const module = parseModule(file)
  parsed.set(file, { mtimeMs, module })
  return module
}

function resolveFrom(file: string, spec: string) {
  const dir = path.dirname(file)
  return resolveFile(spec, dir, packageRoot(file) ?? dir)
}

// A memoized closure is only as fresh as the mtimes it read, and those
// are memoized on their own clock: without this, a closure built from a
// pre-edit mtime memo would be stamped with the new mtimes by the cache
// above it and kept forever.
function signatureOf(dependencies: Set<string>) {
  let signature = ""
  for (const dependency of dependencies) {
    signature += `${dependency}:${mtimeOf(dependency) ?? "missing"}|`
  }
  return signature
}

// Dropped as soon as any file it was computed from has a new mtime.
function derive<T>(key: string, compute: (dependencies: Set<string>) => T) {
  return memoize(
    key,
    () => {
      const dependencies = new Set<string>()
      const value = compute(dependencies)
      return { value, dependencies, signature: signatureOf(dependencies) }
    },
    (hit) => hit.signature !== signatureOf(hit.dependencies)
  )
}

// Only root lookups are memoized; dependencies are kept for callers.
export function exportsOf(
  file: string,
  visiting: Set<string> = new Set(),
  deps?: Set<string>
): ModuleExports {
  if (visiting.size) {
    return collectExports(file, visiting, deps)
  }
  const cached = derive(`exports:${file}`, (dependencies) =>
    collectExports(file, new Set(), dependencies)
  )
  if (deps) {
    for (const dependency of cached.dependencies) {
      deps.add(dependency)
    }
  }
  return cached.value
}

// A barrel chain can run thousands of files deep, past what the call
// stack holds, so each file's walk yields the files it needs and runs on
// a stack of its own.
function collectExports(
  file: string,
  visiting: Set<string>,
  deps?: Set<string>
) {
  const walks = [walkExports(file, visiting, deps)]
  let inner: ModuleExports = new Map()
  for (;;) {
    const step = walks[walks.length - 1].next(inner)
    if (!step.done) {
      walks.push(walkExports(step.value, visiting, deps))
      continue
    }
    walks.pop()
    inner = step.value
    if (!walks.length) return inner
  }
}

function* walkExports(
  file: string,
  visiting: Set<string>,
  deps?: Set<string>
): Generator<string, ModuleExports, ModuleExports> {
  const exports: ModuleExports = new Map()
  if (visiting.has(file)) return exports
  deps?.add(file)
  const module = moduleOf(file)
  if (!module) return exports
  visiting.add(file)
  for (const name of module.local) exports.set(name, { file, name })
  if (module.sfc && module.defaultName) {
    exports.set("default", { file, name: module.defaultName })
  } else if (module.defaultName) {
    const imported = module.imports.get(module.defaultName)
    const target =
      imported && imported.name !== "*"
        ? resolveFrom(file, imported.spec)
        : null
    const inner = target ? yield target : null
    exports.set(
      "default",
      inner?.get(imported!.name) ??
        (target
          ? { file: target, name: imported!.name }
          : { file, name: module.defaultName })
    )
  }
  for (const { exported, local, spec } of module.named) {
    if (!spec) {
      // A declaration of this file, or an import passed on.
      const imported = module.imports.get(local)
      if (imported && imported.name !== "*") {
        const target = resolveFrom(file, imported.spec)
        const inner = target ? yield target : null
        exports.set(
          exported,
          inner?.get(imported.name) ??
            (target
              ? { file: target, name: imported.name }
              : { file, name: local })
        )
        continue
      }
      if (imported) {
        const target = resolveFrom(file, imported.spec)
        exports.set(
          exported,
          target ? { file: target, name: "*" } : { file, name: local }
        )
        continue
      }
      exports.set(exported, exports.get(local) ?? { file, name: local })
      continue
    }
    const target = resolveFrom(file, spec)
    if (!target) continue
    const inner = yield target
    exports.set(exported, inner.get(local) ?? { file: target, name: local })
  }
  for (const [exported, spec] of module.namespaces) {
    const target = resolveFrom(file, spec)
    if (target) exports.set(exported, { file: target, name: "*" })
  }
  for (const spec of module.stars) {
    const target = resolveFrom(file, spec)
    if (!target) continue
    for (const [name, binding] of yield target) {
      if (name !== "default" && !exports.has(name)) exports.set(name, binding)
    }
  }
  visiting.delete(file)
  return exports
}

function exportRoute(module: ParsedModule, file: string, name: string) {
  const importedRoute = (local: string) => {
    const imported = module.imports.get(local)
    const target =
      imported && imported.name !== "*"
        ? resolveFrom(file, imported.spec)
        : null
    return target
      ? { binding: { file: target, name: imported!.name }, follow: true }
      : { binding: { file, name: local }, follow: false }
  }

  let before = module.named.length
  let fallback: ExportBinding | null = null
  for (;;) {
    const indices = module.namedIndices.get(name) ?? []
    let aliased = false
    for (let i = indices.length - 1; i >= 0; i--) {
      const index = indices[i]
      if (index >= before) {
        continue
      }
      const { local, spec } = module.named[index]
      if (!spec) {
        const imported = module.imports.get(local)
        if (imported && imported.name !== "*") {
          return importedRoute(local)
        }
        const target = imported ? resolveFrom(file, imported.spec) : null
        if (target) {
          return { binding: { file: target, name: "*" }, follow: false }
        }
        name = local
        before = index
        fallback = { file, name }
        aliased = true
        break
      }
      const target = resolveFrom(file, spec)
      if (target) {
        return { binding: { file: target, name: local }, follow: true }
      }
    }
    if (aliased) {
      continue
    }
    if (name === "default" && module.defaultName) {
      return module.sfc
        ? { binding: { file, name: module.defaultName }, follow: false }
        : importedRoute(module.defaultName)
    }
    const namespace = module.namespaces.get(name)
    const target = namespace ? resolveFrom(file, namespace) : null
    if (target) {
      return { binding: { file: target, name: "*" }, follow: false }
    }
    const binding = module.local.has(name) ? { file, name } : fallback
    return binding ? { binding, follow: false } : null
  }
}

function resolveBinding(file: string, name: string, deps: Set<string>) {
  const visiting = new Set<string>()
  let fallback: ExportBinding | null = null
  while (!visiting.has(file)) {
    deps.add(file)
    const module = moduleOf(file)
    if (!module) {
      return fallback
    }
    if (module.stars.length) {
      return exportsOf(file, visiting, deps).get(name) ?? fallback
    }
    visiting.add(file)
    const route = exportRoute(module, file, name)
    if (!route) {
      return fallback
    }
    if (!route.follow) {
      return route.binding
    }
    fallback = route.binding
    file = route.binding.file
    name = route.binding.name
  }
  return fallback
}

// `Button.Root` through `export * as Button from "./button"`: each
// segment is looked up in the namespace the one before it names.
function resolvePath(file: string, name: string, deps: Set<string>) {
  const [head, ...rest] = name.split(".")
  let binding = resolveBinding(file, head, deps)
  for (const segment of rest) {
    if (binding?.name !== "*") return null
    binding = resolveBinding(binding.file, segment, deps)
  }
  return binding
}

// Falls back to the resolved file with the import's own name when the
// export cannot be traced. A dotted name that cannot be traced, and a
// namespace where a component was expected, resolve to nothing.
export function definingExportOf(
  spec: string,
  name: string,
  fromFile: string,
  deps?: Set<string>
): ExportBinding | null {
  const target = resolveFrom(fromFile, spec)
  if (!target) return null
  const cached = derive(`binding:${target}\u0000${name}`, (dependencies) =>
    resolvePath(target, name, dependencies)
  )
  if (deps) {
    for (const dependency of cached.dependencies) {
      deps.add(dependency)
    }
  }
  const binding = cached.value?.name === "*" ? null : cached.value
  if (name.includes(".")) return binding
  return binding ?? { file: target, name }
}

export function definingFileOf(spec: string, name: string, fromFile: string) {
  return definingExportOf(spec, name, fromFile)?.file ?? null
}
