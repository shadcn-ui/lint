// A received labelClass handed to an inner part's class is forwarded, the
// way a received className is: callers write it as a class attribute, so
// their classes are checked where they are written (#64).

import { describe, expect, test } from "vitest"

import { requireStaticClasses } from "../src/rules/require-static-classes"
import { button, card, createTester, PAGE } from "./helpers"
import { lintSfc, SVELTE_PAGE } from "./sfc-helpers"

const tester = createTester()
const rule = requireStaticClasses as any
const rules = { "shadcn/require-static-classes": "error" }

describe("received class props other than className", () => {
  test("React: labelClassName, legendClass, and a member read", () => {
    tester.run("require-static-classes", rule, {
      valid: [
        {
          filename: PAGE,
          code: `${button}\n${card}\nexport const F = ({ className, titleClassName }: { className?: string; titleClassName?: string }) => <Card className={className}><CardTitle className={titleClassName}>x</CardTitle></Card>`,
        },
        {
          filename: PAGE,
          code: `${card}\nexport const F = (props: { legendClass?: string }) => <CardTitle className={props.legendClass}>x</CardTitle>`,
        },
        // The caller's value is checked where it is written.
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button labelClass="mt-2">Go</Button>`,
        },
      ],
      invalid: [
        // A received prop that is not a class prop is still dynamic.
        {
          filename: PAGE,
          code: `${card}\nexport const F = ({ tone }: { tone?: string }) => <CardTitle className={tone}>x</CardTitle>`,
          errors: [{ messageId: "dynamicClasses" }],
        },
        // So is a class prop that is changed before it is handed on.
        {
          filename: PAGE,
          code: `${card}\nexport const F = ({ titleClass }: { titleClass?: string }) => { titleClass = titleClass + " x"; return <CardTitle className={titleClass}>x</CardTitle> }`,
          errors: [{ messageId: "dynamicClasses" }],
        },
      ],
    })
  })

  test("Svelte: the issue's labelClass from $props()", () => {
    const code = `<script lang="ts">
  import * as Card from "$lib/components/ui/card";
  const { class: className, labelClass, tone } = $props();
</script>

<Card.Root class={className}>
  <Card.Title class={labelClass}>x</Card.Title>
</Card.Root>
`
    expect(lintSfc(code, SVELTE_PAGE, rules)).toEqual([])
    const dynamic = code.replace("class={labelClass}", "class={tone}")
    expect(
      lintSfc(dynamic, SVELTE_PAGE, rules).map((m) => m.messageId)
    ).toEqual(["dynamicClasses"])
  })
})
