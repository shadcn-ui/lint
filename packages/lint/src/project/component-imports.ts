import type { ComponentIndex } from "./components"
import { NODE_MODULES } from "./fs"
import type { ExportBinding } from "./modules"
import { isSfc } from "./parser"

export type ComponentImport = {
  source: string
  original: string
  namespace: boolean
}

// `<Dialog.Content>` from a named import is `DialogContent`; from a
// namespace import it is the property alone.
export function importNameOf(
  imported: ComponentImport,
  root: string,
  property: string | null
) {
  const suffix = property !== null && !imported.namespace ? property : ""
  return {
    source: imported.source,
    exportName: imported.namespace ? (property ?? "") : imported.original,
    name: imported.namespace
      ? (property ?? "")
      : `${imported.original === "default" ? root : imported.original}${suffix}`,
    suffix,
  }
}

// One the ui index owns, or any export of a componentImports source.
export function componentFromImport(
  index: ComponentIndex,
  binding: ExportBinding | null,
  importedName: ReturnType<typeof importNameOf>,
  patterns: RegExp[]
) {
  if (binding && index.owns(binding.file)) {
    const component = `${binding.name}${importedName.suffix}`
    const indexed = index.files.get(component)
    // A ui file that re-exports one name from a package pulls that whole
    // package into the export closure. Only a name the ui directory
    // exports is the project's component; the package's other exports,
    // whose bundled locals are the minifier's (`er`), are not.
    if (!NODE_MODULES.test(binding.file) || indexed) {
      const file = indexed ?? binding.file
      // No message sends anyone into a package to add a variant.
      return { component, file: NODE_MODULES.test(file) ? null : file }
    }
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
