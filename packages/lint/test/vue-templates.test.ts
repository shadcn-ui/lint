import { describe, expect, it } from "vitest"

import { lintSfc, VUE_PAGE } from "./sfc-helpers"

const sfc = (template: string, body = "") => `<script setup lang="ts">
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
const props = defineProps<{ class?: string; active?: boolean; tone?: string }>()
${body}
</script>

<template>
  ${template}
</template>
`

const lint = (template: string, body?: string) =>
  lintSfc(sfc(template, body), VUE_PAGE)

const found = (template: string, body?: string) =>
  lint(template, body).map((m) => `${m.ruleId}: ${m.message.split(".")[0]}`)

describe("Vue templates", () => {
  it("reports the probe from the issue the way a .tsx file does", () => {
    const messages = lint(
      `<div class="bg-red-50 text-red-800 p-[13px]" style="color: red">x</div>`
    )
    expect(messages.map((m) => m.ruleId)).toEqual([
      "shadcn/no-raw-colors",
      "shadcn/no-raw-colors",
      "shadcn/no-arbitrary-values",
      "shadcn/no-inline-styles",
    ])
  })

  it("reports each finding once", () => {
    expect(found(`<CardTitle class="text-2xl">Hi</CardTitle>`)).toEqual([
      `shadcn/no-restyle: "text-2xl" is not allowed on <CardTitle>: <CardTitle> owns its typography`,
    ])
  })

  it("names a component after its file, in either spelling", () => {
    const [pascal] = lint(`<CardTitle class="text-2xl">Hi</CardTitle>`)
    const [kebab] = lint(`<card-title class="text-2xl">Hi</card-title>`)
    expect(kebab.message).toBe(pascal.message)
    expect(pascal.message).toContain("src/components/ui/card/CardTitle.vue")
  })

  it("lists the sizes a cva() in the barrel declares", () => {
    const [message] = lint(`<Button class="p-4">x</Button>`)
    expect(message.ruleId).toBe("shadcn/no-restyle")
    expect(message.message).toContain("Use a size (default, sm, lg)")
    expect(message.message).toContain("src/components/ui/button/Button.vue")
  })

  it("tells a component from the native element of the same name", () => {
    expect(found(`<button class="p-4 rounded-md">x</button>`)).toEqual([])
  })

  it("allows layout on a component and variants by prop", () => {
    expect(
      found(`<Card class="mt-4 flex"><Button variant="link">x</Button></Card>`)
    ).toEqual([])
  })

  it("reads :class objects with classes as keys", () => {
    expect(found(`<Card :class="{ 'bg-primary': active }" />`)).toEqual([
      `shadcn/no-restyle: "bg-primary" is not allowed on <Card>: <Card> owns its color`,
    ])
  })

  it("reads :class arrays, and an identifier from the script", () => {
    expect(
      found(
        `<CardContent :class="[base, active && 'text-[#123456]']" />`,
        `const base = "text-lg"`
      ).sort()
    ).toEqual([
      `shadcn/no-arbitrary-values: "text-[#123456]" hardcodes a color and no declared theme color is close to it`,
      `shadcn/no-restyle: "text-[#123456]" is not allowed on <CardContent>: <CardContent> owns its color`,
      `shadcn/no-restyle: "text-lg" is not allowed on <CardContent>: <CardContent> owns its typography`,
    ])
  })

  it("does not read a script variable through a template name that shadows it", () => {
    const body = `const base = "text-lg"\nconst items = ["mt-2"]`
    expect(
      found(`<Card v-for="base in items" :key="base" :class="base" />`, body)
    ).toEqual([
      "shadcn/require-static-classes: Dynamically built className on <Card> cannot be checked",
    ])
    expect(
      found(
        `<Card><template #default="{ base }"><Card :class="base" /></template></Card>`,
        body
      )
    ).toEqual([
      "shadcn/require-static-classes: Dynamically built className on <Card> cannot be checked",
    ])
  })

  it("reads a helper call in the template", () => {
    expect(found(`<Card :class="cn('mt-2', 'bg-primary')" />`)).toEqual([
      `shadcn/no-restyle: "bg-primary" is not allowed on <Card>: <Card> owns its color`,
    ])
  })

  it("reads static class and :class on the same element", () => {
    expect(
      found(`<Card class="text-lg" :class="{ 'bg-primary': active }" />`)
    ).toHaveLength(2)
  })

  it("reads a v-bind object as a spread", () => {
    expect(found(`<Card v-bind="{ class: 'rounded-none' }" />`)).toEqual([
      `shadcn/no-restyle: "rounded-none" is not allowed on <Card>: <Card> owns its shape`,
    ])
    expect(found(`<Card v-bind="$attrs" />`)).toEqual([])
  })

  it("accepts the received class prop", () => {
    expect(
      found(`<Button :class="cn('mt-2', props.class)">x</Button>`)
    ).toEqual([])
  })

  it("reports a class it cannot read on a component", () => {
    expect(found('<Card :class="`p-${tone}`" />')).toEqual([
      "shadcn/require-static-classes: Dynamically built className on <Card> cannot be checked",
    ])
  })

  it("reads style and :style", () => {
    expect(
      found(
        `<div style="color: red; --tone: #fff" :style="{ backgroundColor: tone, '--chart': '#123456', '--gap': tone }" />`
      )
    ).toEqual([
      "shadcn/no-inline-styles: Inline style sets color",
      "shadcn/no-inline-styles: Custom property --tone hardcodes a color",
      "shadcn/no-inline-styles: Inline style sets backgroundColor",
      "shadcn/no-inline-styles: Custom property --chart hardcodes a color",
    ])
  })

  it("skips a <template> wrapper when it names the parent", () => {
    const [message] = lint(
      `<Card><template v-if="active"><Button class="p-4">x</Button></template></Card>`
    )
    expect(message.message).toContain("<Button> owns its spacing")
  })

  it("keeps the quotes when a suggestion rewrites markup", () => {
    const code = sfc(`<div class="flex p-[13px]"></div>`)
    const [message] = lint(`<div class="flex p-[13px]"></div>`)
    const [suggestion] = message.suggestions ?? []
    const { range, text } = suggestion.fix
    expect(code.slice(0, range[0]) + text + code.slice(range[1])).toBe(
      sfc(`<div class="flex p-3.25"></div>`)
    )
  })

  it("knows the classes its own style block declares", () => {
    const rules = { "shadcn/no-unknown-classes": "error" }
    const code = `<template><div class="box flex-cols" /></template>\n<style scoped>\n.box { color: red }\n</style>\n`
    expect(
      lintSfc(code, VUE_PAGE, rules).map((m) => m.message.split(" ")[0])
    ).toEqual([`"flex-cols"`])
  })

  it("still lints the script block, once", () => {
    expect(found("<div />", `const chip = cn("bg-red-500")`)).toEqual([
      `shadcn/no-raw-colors: "bg-red-500" uses the raw Tailwind palette`,
    ])
  })
})
