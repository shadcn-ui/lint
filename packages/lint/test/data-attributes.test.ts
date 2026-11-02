// A data-* or aria-* attribute whose name ends in "class" is not a class
// list: `data-class` is an E2E selector hook, not classes (#138).

import * as path from "node:path"
import { describe, expect, test } from "vitest"

import { clearWrapperCache } from "../src/project/wrappers"
import { noRawColors } from "../src/rules/no-raw-colors"
import { noRestyle } from "../src/rules/no-restyle"
import { isClassAttribute } from "../src/sites/collect"
import { button, createTester, PAGE, PROJECT } from "./helpers"
import { lintSfc, SVELTE_PAGE, VUE_PAGE } from "./sfc-helpers"

const tester = createTester()
// A file on disk, so a wrapper declared in the linted code is read too.
const LOCAL = path.join(PROJECT, "app/local-wrapper.tsx")

const rules = {
  "shadcn/no-restyle": ["error", { allow: ["layout"] }],
  "shadcn/no-unknown-classes": "error",
  "shadcn/no-raw-colors": "error",
  "shadcn/no-arbitrary-values": "error",
}

describe("data-* and aria-* attributes", () => {
  test("are not class attributes", () => {
    expect(isClassAttribute("data-class")).toBe(false)
    expect(isClassAttribute("data-testclass")).toBe(false)
    expect(isClassAttribute("DATA-CLASSNAME")).toBe(false)
    expect(isClassAttribute("aria-class")).toBe(false)
    expect(isClassAttribute("dataClass")).toBe(true)
    expect(isClassAttribute("contentClass")).toBe(true)
    expect(isClassAttribute("header-class")).toBe(true)
  })

  test("React: their values reach no class rule", () => {
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <div data-class="client-item"><Button data-testclass="bg-pink-500">+</Button><span data-class="bg-pink-500 p-[13px]">x</span></div>`,
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: `export const A = () => <span data-class="x" contentClass="bg-pink-500">x</span>`,
          errors: [{ messageId: "paletteClassFar" }],
        },
      ],
    })
  })

  test("Vue: the issue's reproduction", () => {
    const code = `<script setup lang="ts">
import { Button } from "@/components/ui/button"
</script>

<template>
  <div data-class="client-item">
    <Button data-class="button-add-one" variant="ghost">+</Button>
    <span data-class="bg-pink-500 p-[13px]">x</span>
    <span :data-class="'bg-pink-500'" aria-class="bg-pink-500">x</span>
  </div>
</template>
`
    expect(lintSfc(code, VUE_PAGE, rules)).toEqual([])
  })

  test("Svelte: the same markup", () => {
    const code = `<script lang="ts">
  import { Button } from "$lib/components/ui/button";
</script>

<div data-class="client-item">
  <Button data-class="button-add-one" variant="ghost">+</Button>
  <span data-class="bg-pink-500 p-[13px]">x</span>
  <span data-class={"bg-pink-500"}>x</span>
</div>
`
    expect(lintSfc(code, SVELTE_PAGE, rules)).toEqual([])
  })

  test("a wrapper does not forward its className through data-class", () => {
    clearWrapperCache()
    tester.run("no-restyle", noRestyle as any, {
      valid: [
        {
          filename: LOCAL,
          options: [{ allow: ["spacing"] }],
          code: `import { Card } from "@/components/ui/card"
function Tagged({ className }: { className?: string }) {
  return <Card data-class={className} />
}
export const A = () => <Tagged className="w-full" />`,
        },
      ],
      invalid: [],
    })
  })
})
