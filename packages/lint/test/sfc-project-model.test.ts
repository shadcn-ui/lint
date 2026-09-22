import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import {
  componentFromImport,
  importNameOf,
} from "../src/project/component-imports"
import { componentsFor } from "../src/project/components"
import { definingExportOf, exportsOf } from "../src/project/modules"
import { scriptOf, sfcNameOf } from "../src/project/parser"
import { sizeNamesFor, variantNamesFor } from "../src/project/variants"

const FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures"
)
const SVELTE = path.join(FIXTURES, "svelte-project")
const VUE = path.join(FIXTURES, "vue-project")
const SVELTE_PAGE = path.join(SVELTE, "src/routes/+page.svelte")
const VUE_PAGE = path.join(VUE, "src/App.vue")

describe("single-file components in the project model", () => {
  it("names a component after its file", () => {
    expect(sfcNameOf("/ui/card/card-title.svelte")).toBe("CardTitle")
    expect(sfcNameOf("/ui/card/CardTitle.vue")).toBe("CardTitle")
    expect(sfcNameOf("/ui/button/button.svelte")).toBe("Button")
  })

  it("keeps script offsets and blanks everything else", () => {
    const source = `<script lang="ts" module>\nexport const a = 1\n</script>\n<div class="x">{a}</div>\n<script>\nlet b = 2\n</script>`
    const script = scriptOf(source)
    expect(script).toHaveLength(source.length)
    expect(script.indexOf("export const a")).toBe(
      source.indexOf("export const a")
    )
    expect(script.indexOf("let b")).toBe(source.indexOf("let b"))
    expect(script).not.toContain("class")
    expect(script.split("\n")).toHaveLength(source.split("\n").length)
  })

  it("reads a barrel whose export list carries comments", () => {
    const barrel = path.join(SVELTE, "src/lib/components/ui/card/index.ts")
    const exported = exportsOf(barrel)
    expect([...exported.keys()].sort()).toEqual([
      "Card",
      "CardContent",
      "CardTitle",
      "Content",
      "Root",
      "Title",
    ])
    expect(exported.get("CardTitle")).toEqual({
      file: path.join(path.dirname(barrel), "card-title.svelte"),
      name: "CardTitle",
    })
  })

  it("indexes the Svelte ui directory by component", () => {
    const dir = path.join(SVELTE, "src/lib/components/ui")
    const index = componentsFor(SVELTE_PAGE)
    expect(index.dir).toBe(dir)
    expect(index.files.get("Button")).toBe(
      path.join(dir, "button/button.svelte")
    )
    expect(index.files.get("Card")).toBe(path.join(dir, "card/card.svelte"))
    expect(index.files.get("CardTitle")).toBe(
      path.join(dir, "card/card-title.svelte")
    )
  })

  it("indexes the Vue ui directory by component", () => {
    const dir = path.join(VUE, "src/components/ui")
    const index = componentsFor(VUE_PAGE)
    expect(index.dir).toBe(dir)
    expect(index.files.get("Button")).toBe(path.join(dir, "button/Button.vue"))
    expect(index.files.get("Card")).toBe(path.join(dir, "card/Card.vue"))
    expect(index.files.get("CardTitle")).toBe(
      path.join(dir, "card/CardTitle.vue")
    )
  })

  it("resolves a short barrel name to the component its file names", () => {
    expect(
      definingExportOf("$lib/components/ui/card", "Title", SVELTE_PAGE)
    ).toEqual({
      file: path.join(SVELTE, "src/lib/components/ui/card/card-title.svelte"),
      name: "CardTitle",
    })
    expect(
      definingExportOf("@/components/ui/card", "CardTitle", VUE_PAGE)
    ).toEqual({
      file: path.join(VUE, "src/components/ui/card/CardTitle.vue"),
      name: "CardTitle",
    })
  })

  it("reads variants from a module script and from the barrel beside an SFC", () => {
    const svelte = path.join(
      SVELTE,
      "src/lib/components/ui/button/button.svelte"
    )
    const vue = path.join(VUE, "src/components/ui/button/Button.vue")
    for (const file of [svelte, vue]) {
      expect(variantNamesFor(file, "Button")).toEqual([
        "default",
        "outline",
        "link",
      ])
      expect(sizeNamesFor(file, "Button")).toEqual(["default", "sm", "lg"])
    }
    // A barrel's factory belongs only to the component it is named after.
    expect(
      variantNamesFor(path.join(VUE, "src/components/ui/card/Card.vue"), "Card")
    ).toBeNull()
  })

  it("names an SFC by its file when only a pattern recognizes the import", () => {
    const index = componentsFor("/nonexistent/page.svelte")
    const imported = {
      source: "$lib/ds/dialog",
      original: "*",
      namespace: true,
    }
    const name = importNameOf(imported, "Dialog", "Content")
    const patterns = [/^\$lib\/ds/]
    expect(
      componentFromImport(
        index,
        { file: "/ds/dialog/dialog-content.svelte", name: "DialogContent" },
        name,
        patterns
      )
    ).toEqual({
      component: "DialogContent",
      file: "/ds/dialog/dialog-content.svelte",
    })
    // A module's own export name is all a .tsx file has, and it stays.
    expect(
      componentFromImport(
        index,
        { file: "/ds/dialog.tsx", name: "DialogContent" },
        name,
        patterns
      )?.component
    ).toBe("Content")
  })
})
