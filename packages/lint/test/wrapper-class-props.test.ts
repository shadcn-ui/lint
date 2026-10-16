// A wrapper's other class props go where the wrapper hands them, not
// where its className goes: <Panel headerClassName> is CardHeader's (#102).

import * as path from "node:path"
import { beforeEach, describe, expect, test } from "vitest"

import { clearWrapperCache, wrapperTargetOf } from "../src/project/wrappers"
import { noRestyle } from "../src/rules/no-restyle"
import { createTester, PAGE, PROJECT } from "./helpers"

const tester = createTester()
const rule = noRestyle as any
const PANELS = path.join(PROJECT, "components/card-panel.tsx")
const CARD = path.join(PROJECT, "components/ui/card.tsx")
// A file on disk, so a wrapper declared in the linted code is read too.
const LOCAL = path.join(PROJECT, "app/local-wrapper.tsx")

const panels = `import { Panel, Passed, Header } from "@/components/card-panel"`
const options = [
  {
    allow: ["layout"],
    contracts: [
      { pattern: "^Card$", allow: ["layout"] },
      { pattern: "^CardHeader$", allow: ["spacing"] },
    ],
  },
]

describe("wrapperTargetOf by prop", () => {
  const target = (name: string, prop?: string) =>
    wrapperTargetOf(PANELS, name, [], undefined, [], prop)

  test("each class prop follows its own forwarding", () => {
    expect(target("Panel")).toEqual({ component: "Card", file: CARD })
    expect(target("Panel", "headerClassName")).toEqual({
      component: "CardHeader",
      file: CARD,
    })
    expect(target("Members", "bodyClass")?.component).toBe("CardContent")
    expect(target("Passed", "headerClassName")?.component).toBe("CardHeader")
    expect(target("Renamed", "titleClassName")?.component).toBe("CardHeader")
  })

  test("a prop the wrapper does not hand on has no target", () => {
    expect(target("Header")).toBeNull()
    expect(target("Dropped", "headerClassName")).toBeNull()
    expect(target("Panel", "footerClassName")).toBeNull()
  })
})

describe("no-restyle on a wrapper's other class props", () => {
  // The linted file's own wrappers are cached by its path and mtime, and
  // these cases write different code to the same path.
  beforeEach(clearWrapperCache)

  test("headerClassName is checked against CardHeader's contract", () => {
    tester.run("no-restyle", rule, {
      valid: [
        {
          filename: PAGE,
          options,
          code: `${panels}\nexport const A = () => <Panel headerClassName="px-6" />`,
        },
        {
          filename: PAGE,
          options,
          code: `${panels}\nexport const A = () => <Passed className="w-full" headerClassName="px-6" />`,
        },
      ],
      invalid: [
        {
          filename: PAGE,
          options,
          code: `${panels}\nexport const A = () => <Panel headerClassName="w-full" />`,
          errors: [
            {
              messageId: "layoutClass",
              data: {
                className: "w-full",
                component: "CardHeader",
                entries: "spacing",
              },
            },
          ],
        },
        {
          filename: PAGE,
          options,
          code: `${panels}\nexport const A = () => <Passed className="px-6" />`,
          errors: [
            {
              message:
                /^"px-6" is not allowed on <Passed>: <Passed> forwards className to <Card>, which owns its spacing\./,
            },
          ],
        },
      ],
    })
  })

  test("the message names the prop the wrapper forwards", () => {
    tester.run("no-restyle", rule, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          code: `${panels}\nexport const A = () => <Panel headerClassName="bg-red-500" />`,
          errors: [
            {
              message:
                /^"bg-red-500" is not allowed on <Panel>: <Panel> forwards headerClassName to <CardHeader>, which owns its color\./,
            },
          ],
        },
      ],
    })
  })

  test("a class prop the wrapper does not forward is not checked", () => {
    tester.run("no-restyle", rule, {
      valid: [
        {
          filename: PAGE,
          options,
          code: `${panels}\nexport const A = () => <Header className="bg-red-500" />`,
        },
        {
          filename: LOCAL,
          options,
          code: `import { Card } from "@/components/ui/card"
function Plain({ className, headerClassName }: { className?: string; headerClassName?: string }) {
  return <Card className={className}><div className={headerClassName} /></Card>
}
export const A = () => <Plain headerClassName="bg-red-500" />`,
        },
      ],
      invalid: [],
    })
  })

  test("a wrapper in the linted file is followed by prop too", () => {
    tester.run("no-restyle", rule, {
      valid: [],
      invalid: [
        {
          filename: LOCAL,
          options,
          code: `import { Card, CardHeader } from "@/components/ui/card"
function Local({ className, headerClassName }: { className?: string; headerClassName?: string }) {
  return <Card className={className}><CardHeader className={headerClassName} /></Card>
}
export const A = () => <Local headerClassName="w-full" />`,
          errors: [
            {
              messageId: "layoutClass",
              data: {
                className: "w-full",
                component: "CardHeader",
                entries: "spacing",
              },
            },
          ],
        },
      ],
    })
  })
})
