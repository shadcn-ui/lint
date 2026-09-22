import * as path from "node:path"
import { describe, expect, it } from "vitest"

import { templateTags } from "../src/project/sfc-template"
import { wrapperTargetOf } from "../src/project/wrappers"
import {
  lintSfc,
  SVELTE_PAGE,
  SVELTE_PROJECT,
  VUE_PAGE,
  VUE_PROJECT,
} from "./sfc-helpers"

const found = (code: string, page: string) =>
  lintSfc(code, page).map((m) => `${m.ruleId}: ${m.message.split(".")[0]}`)

describe("single-file component wrappers", () => {
  it("scans opening tags past expressions that contain > and braces", () => {
    const tags = templateTags(
      `<script>let a</script>\n<!-- <Hidden /> -->\n<Card.Root class={cn("x", { a: b > 1 }, className)} {...rest} onclick={() => go()}>\n  <img src="x"><Button disabled />\n</Card.Root>`,
      "x.svelte"
    )
    expect(tags.map((tag) => [tag.name, tag.depth])).toEqual([
      ["Card.Root", 0],
      ["img", 1],
      ["Button", 1],
    ])
    expect(tags[0].attributes).toEqual([
      { name: "class", value: `{cn("x", { a: b > 1 }, className)}` },
      { name: "", value: "{...rest}" },
      { name: "onclick", value: "{() => go()}" },
    ])
  })

  it("finds the component a Svelte wrapper forwards class to", () => {
    const button = path.join(
      SVELTE_PROJECT,
      "src/lib/components/ui/button/button.svelte"
    )
    expect(
      wrapperTargetOf(
        path.join(SVELTE_PROJECT, "src/lib/components/save-button.svelte"),
        "SaveButton"
      )
    ).toEqual({ component: "Button", file: button })
    // The class lands on a div: a Button inside does not make a wrapper.
    expect(
      wrapperTargetOf(
        path.join(SVELTE_PROJECT, "src/lib/components/toolbar.svelte"),
        "Toolbar"
      )
    ).toBeNull()
  })

  it("finds the component a Vue wrapper forwards class to", () => {
    const button = path.join(VUE_PROJECT, "src/components/ui/button/Button.vue")
    const wrapper = (name: string) =>
      wrapperTargetOf(
        path.join(VUE_PROJECT, `src/components/${name}.vue`),
        name
      )
    expect(wrapper("SaveButton")).toEqual({ component: "Button", file: button })
    // No class prop and one root: Vue hands the class to the root.
    expect(wrapper("IconButton")).toEqual({ component: "Button", file: button })
    expect(wrapper("Toolbar")).toBeNull()
  })

  it("judges a Svelte wrapper by its target's contract", () => {
    expect(
      found(
        `<script lang="ts">\n  import SaveButton from "$lib/components/save-button.svelte";\n</script>\n<SaveButton class="mt-2 rounded-none">save</SaveButton>`,
        SVELTE_PAGE
      )
    ).toEqual([
      `shadcn/no-restyle: "rounded-none" is not allowed on <SaveButton>: <SaveButton> forwards className to <Button>, which owns its shape`,
    ])
  })

  it("judges a Vue wrapper by its target's contract", () => {
    expect(
      found(
        `<script setup lang="ts">\nimport IconButton from "@/components/IconButton.vue"\nimport SaveButton from "@/components/SaveButton.vue"\n</script>\n<template>\n  <SaveButton class="mt-2 rounded-none">save</SaveButton>\n  <icon-button class="p-4" label="x" />\n</template>`,
        VUE_PAGE
      )
    ).toEqual([
      `shadcn/no-restyle: "rounded-none" is not allowed on <SaveButton>: <SaveButton> forwards className to <Button>, which owns its shape`,
      `shadcn/no-restyle: "p-4" is not allowed on <IconButton>: <IconButton> forwards className to <Button>, which owns its spacing`,
    ])
  })
})
