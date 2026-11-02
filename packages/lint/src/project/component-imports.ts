import type { ComponentIndex } from "./components"
import { NODE_MODULES, realpath } from "./fs"
import type { ExportBinding } from "./modules"
import { isSfc } from "./parser"

export type ComponentImport = {
  source: string
  original: string
  namespace: boolean
}

// `<Dialog.Content>` from a named import is `DialogContent`; from a
// namespace import it is the property alone. A nested `<UI.Button.Root>`
// keeps its dotted path as the export to look up and joins it for the
// name, so `Motion.Reorder.Root` is `MotionReorderRoot`. A named import's
// `member` is the dotted path to try first: `<Controls.Button>` through
// `export * as Controls` is `Button`, not `ControlsButton`.
export function importNameOf(
  imported: ComponentImport,
  root: string,
  property: string | null
) {
  const joined = property === null ? "" : property.replace(/\./g, "")
  const suffix = imported.namespace ? "" : joined
  return {
    source: imported.source,
    exportName: imported.namespace ? (property ?? "") : imported.original,
    name: imported.namespace
      ? joined
      : `${imported.original === "default" ? root : imported.original}${suffix}`,
    suffix,
    member:
      imported.namespace || property === null || imported.original === "default"
        ? null
        : `${imported.original}.${property}`,
  }
}

// One the ui index owns, or any export of a componentImports source. A
// `member` binding, the dotted name resolved through a namespace, is the
// component itself and takes no suffix. `ui` is settings.shadcn.ui.
export function componentFromImport(
  index: ComponentIndex,
  binding: ExportBinding | null,
  importedName: ReturnType<typeof importNameOf>,
  patterns: RegExp[],
  member: ExportBinding | null = null,
  ui: string[] = []
) {
  const owned = member ?? binding
  if (owned && index.owns(owned.file)) {
    const component = `${owned.name}${member ? "" : importedName.suffix}`
    const indexed = index.files.get(component)
    const packaged = NODE_MODULES.test(owned.file)
    // A ui file that re-exports one name from a package pulls that whole
    // package into the export closure. Only a name the ui directory
    // exports is the project's component, and only when it is this very
    // binding; the package's other exports, whose bundled locals are the
    // minifier's (`er`) or join to a ui name (`Field.Label`), are not.
    if (!packaged || (indexed && realpath(indexed) === realpath(owned.file))) {
      // No message sends anyone into a package to add a variant.
      return { component, file: packaged ? null : (indexed ?? owned.file) }
    }
  }
  // Nor does a ui prefix make a package part a component by the source it
  // came through: only a componentImports pattern vouches for a package.
  if (
    member &&
    NODE_MODULES.test(member.file) &&
    ui.some((prefix) => isUnder(importedName.source, prefix))
  ) {
    return null
  }
  if (patterns.some((pattern) => pattern.test(importedName.source))) {
    // A single-file component is named by its file: a barrel's `Content`
    // says nothing, `dialog-content.svelte` does.
    const component =
      binding && isSfc(binding.file)
        ? `${binding.name}${importedName.suffix}`
        : importedName.name
    return { component, file: binding?.file ?? null }
  }
  return null
}

// Whole segments, the way settings.shadcn.ui matches: `@/ds` is not `@/dsx`.
function isUnder(source: string, prefix: string) {
  return source === prefix || source.startsWith(`${prefix}/`)
}
