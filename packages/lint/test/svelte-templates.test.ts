import { describe, expect, it } from "vitest"

import { lintSfc, summarize, SVELTE_PAGE } from "./sfc-helpers"

const script = (body = "") => `<script lang="ts">
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { cn } from "$lib/utils";
  let { active, tone, class: className, ...restProps } = $props();
  ${body}
</script>
`

const lint = (markup: string, body?: string) =>
  lintSfc(script(body) + markup, SVELTE_PAGE)

const found = (markup: string, body?: string) =>
  lint(markup, body).map((m) => `${m.ruleId}: ${m.message.split(".")[0]}`)

describe("Svelte templates", () => {
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

  it("names a component after its file, through a namespace import", () => {
    expect(found(`<Card.Title class="text-2xl">Hi</Card.Title>`)).toEqual([
      `shadcn/no-restyle: "text-2xl" is not allowed on <CardTitle>: <CardTitle> owns its typography`,
    ])
    const [message] = lint(`<Card.Title class="text-2xl">Hi</Card.Title>`)
    expect(message.message).toContain(
      "src/lib/components/ui/card/card-title.svelte"
    )
  })

  it("lists the sizes a tv() in the module script declares", () => {
    const [message] = lint(`<Button class="p-4">x</Button>`)
    expect(message.ruleId).toBe("shadcn/no-restyle")
    expect(message.message).toContain("Use a size (default, sm, lg)")
    expect(message.message).toContain(
      "src/lib/components/ui/button/button.svelte"
    )
  })

  it("allows layout on a component and variants by prop", () => {
    expect(
      found(
        `<Card.Root class="mt-4 flex"><Button variant="link">x</Button></Card.Root>`
      )
    ).toEqual([])
  })

  it("reads text and mustache parts as one template", () => {
    expect(
      found(
        `<Card.Root class="mt-4 {active ? 'bg-primary' : ''}">x</Card.Root>`
      )
    ).toEqual([
      `shadcn/no-restyle: "bg-primary" is not allowed on <Card>: <Card> owns its color`,
    ])
    // A glued interpolation is not a class anyone wrote.
    expect(found(`<Card.Root class="p-{tone}">x</Card.Root>`)).toEqual([
      "shadcn/require-static-classes: Dynamically built className on <Card> cannot be checked",
    ])
  })

  it("resolves an identifier in the template to the script", () => {
    expect(
      found(
        `<Card.Content class={cn(base, "flex")}>x</Card.Content>`,
        `const base = "text-lg";`
      )
    ).toEqual([
      `shadcn/no-restyle: "text-lg" is not allowed on <CardContent>: <CardContent> owns its typography`,
    ])
  })

  it("reads arrays and objects the way clsx does", () => {
    expect(
      found(
        `<div class={["flex", active && "text-[#123456]", { "bg-red-500": active }]}></div>`
      )
    ).toEqual([
      `shadcn/no-arbitrary-values: "text-[#123456]" hardcodes a color and no declared theme color is close to it`,
      `shadcn/no-raw-colors: "bg-red-500" uses the raw Tailwind palette`,
    ])
  })

  it("reads class: directives", () => {
    expect(found(`<Button class:bg-primary={active}>x</Button>`)).toEqual([
      `shadcn/no-restyle: "bg-primary" is not allowed on <Button>: <Button> owns its color`,
    ])
    expect(found(`<div class:flex={active}></div>`)).toEqual([])
  })

  it("reads style attributes and style: directives", () => {
    expect(
      found(
        `<div style="color: red; --tone: #fff; --size: {tone}px" style:background-color={tone} style:--chart={"#123456"} style:--gap={tone}></div>`
      )
    ).toEqual([
      "shadcn/no-inline-styles: Inline style sets color",
      "shadcn/no-inline-styles: Custom property --tone hardcodes a color",
      "shadcn/no-inline-styles: Inline style sets background-color",
      "shadcn/no-inline-styles: Custom property --chart hardcodes a color",
    ])
  })

  it("accepts the received class prop and a forwarded spread", () => {
    expect(
      found(`<Button class={cn("mt-2", className)} {...restProps}>x</Button>`)
    ).toEqual([])
  })

  it("leaves dynamic elements to the vocabulary rules", () => {
    expect(
      found(`<svelte:element this={tone} class="bg-red-500 flex" />`)
    ).toEqual([
      `shadcn/no-raw-colors: "bg-red-500" uses the raw Tailwind palette`,
    ])
  })

  it("rewrites unquoted markup text in a suggestion", () => {
    const [message] = lint(`<div class="flex p-[13px]"></div>`)
    const code = script() + `<div class="flex p-[13px]"></div>`
    const [suggestion] = message.suggestions ?? []
    const { range, text } = suggestion.fix
    expect(code.slice(0, range[0]) + text + code.slice(range[1])).toBe(
      script() + `<div class="flex p-3.25"></div>`
    )
  })

  it("points a finding at the class text", () => {
    const [message] = lint(`<Card.Title class="text-2xl">Hi</Card.Title>`)
    const line = (
      script() + `<Card.Title class="text-2xl">Hi</Card.Title>`
    ).split("\n")[message.line - 1]
    expect(line.slice(message.column - 1, message.endColumn! - 1)).toBe(
      "text-2xl"
    )
  })

  it("still lints the script block", () => {
    expect(
      summarize(
        lint("", `const chip = cn("bg-red-500");`).filter(
          (m) => m.ruleId === "shadcn/no-raw-colors"
        )
      )
    ).toHaveLength(1)
  })
})
