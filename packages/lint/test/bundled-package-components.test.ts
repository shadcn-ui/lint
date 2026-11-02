// A ui file that wraps a package primitive and re-exports something else
// from the same package pulls that package into the ui directory's export
// closure. Reading a package's file does not make its exports the
// project's components, and no message sends anyone into node_modules.

import * as path from "node:path"
import { describe, test } from "vitest"

import { noRestyle } from "../src/rules/no-restyle"
import { createTester, PROJECT } from "./helpers"

const SCROLLER = path.join(PROJECT, "components/ui/scroller.tsx")
const SCROLLER_SOURCE = `import { Scroller as ScrollerPrimitive, useScroller } from "minified-kit"
import { cn } from "@/lib/utils"
function ScrollerButton({ className }: { className?: string }) {
  return <ScrollerPrimitive.Button className={cn("bg-background", className)} />
}
export { ScrollerButton, useScroller }`

describe("a package reached through a ui file's re-export", () => {
  test("is not the project's design system, whatever its locals are named", () => {
    createTester().run("no-restyle", noRestyle as any, {
      valid: [
        {
          filename: SCROLLER,
          code: SCROLLER_SOURCE,
          options: [{ allow: ["layout"] }],
        },
      ],
      invalid: [],
    })
  })

  test("leaves the wrapper itself named and placed by its own file", () => {
    createTester().run("no-restyle", noRestyle as any, {
      valid: [],
      invalid: [
        {
          filename: path.join(PROJECT, "app/scroller-page.tsx"),
          code: `import { ScrollerButton } from "@/components/ui/scroller"
const a = <ScrollerButton className="bg-background" />`,
          options: [{ allow: ["layout"] }],
          errors: [
            {
              message:
                '"bg-background" is not allowed on <ScrollerButton>: <ScrollerButton> owns its color. Add a variant in test/fixtures/project/components/ui/scroller.tsx only if the design explicitly calls for this treatment.',
            },
          ],
        },
      ],
    })
  })
})

describe("a vendor component the ui directory re-exports", () => {
  test("is still checked, and its finding names no package file", () => {
    createTester().run("no-restyle", noRestyle as any, {
      valid: [],
      invalid: [
        {
          filename: path.join(PROJECT, "app/vendor-page.tsx"),
          code: `import { VendorChip } from "@/components/ui/vendor-chip"
const a = <VendorChip className="bg-background" />`,
          options: [{ allow: ["layout"] }],
          errors: [
            {
              message:
                '"bg-background" is not allowed on <VendorChip>: <VendorChip> owns its color. Use one of its variants. Add a new variant only if the design explicitly calls for a treatment none of them provides.',
            },
          ],
        },
      ],
    })
  })
})

describe("a package namespace a ui file re-exports", () => {
  const PAGE = path.join(PROJECT, "app/primitives-page.tsx")
  const lint = (code: string, errors: { message: string }[]) =>
    createTester().run("no-restyle", noRestyle as any, {
      valid: errors.length
        ? []
        : [{ filename: PAGE, code, options: [{ allow: ["layout"] }] }],
      invalid: errors.length
        ? [{ filename: PAGE, code, options: [{ allow: ["layout"] }], errors }]
        : [],
    })

  test("leaves its raw parts unchecked, however they are imported", () => {
    lint(
      `import { Field } from "parts-kit/field"
const a = <Field.Label className="text-base" />`,
      []
    )
    lint(
      `import { FieldPrimitive } from "@/components/ui/primitives"
const a = <FieldPrimitive.Label className="text-base" />`,
      []
    )
  })

  test("leaves them unchecked when settings.shadcn.ui names the ui file", () => {
    // The prefix matches the import's source, but a package part is not a
    // component by where it was imported from.
    const code = `import { FieldPrimitive } from "@/components/ui/primitives"
const a = <FieldPrimitive.Label className="text-base" />`
    createTester().run("no-restyle", noRestyle as any, {
      valid: [
        {
          filename: PAGE,
          code,
          options: [{ allow: ["layout"] }],
          settings: { shadcn: { ui: "@/components/ui" } },
        },
      ],
      invalid: [],
    })
  })

  test("checks them when componentImports names the package", () => {
    createTester().run("no-restyle", noRestyle as any, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          code: `import { Field } from "parts-kit/field"
const a = <Field.Label className="text-base" />`,
          options: [{ allow: ["layout"], componentImports: ["^parts-kit"] }],
          errors: [{ message: /is not allowed on <FieldLabel>/ }],
        },
      ],
    })
  })

  test("still checks the styled component of the same joined name", () => {
    lint(
      `import { FieldLabel } from "@/components/ui/field"
const a = <FieldLabel className="text-base" />`,
      [
        {
          message:
            '"text-base" is not allowed on <FieldLabel>: <FieldLabel> owns its typography. Use a variant: default, muted. Add a new variant in test/fixtures/project/components/ui/field.tsx only if the design explicitly calls for a treatment none of these provides.',
        },
      ]
    )
  })

  test("names a ui component reached through `export * as` by its own name", () => {
    lint(
      `import { Controls } from "@/components/ui/primitives"
const a = <Controls.Button className="p-8" />`,
      [
        {
          message:
            '"p-8" is not allowed on <Button>: <Button> owns its spacing. Use a size (default, xs, sm, lg, icon, icon-xs, icon-sm, icon-lg), or margin here or gap on the parent for space around it. Add a size in test/fixtures/project/components/ui/button.tsx only if the design explicitly calls for one.',
        },
      ]
    )
  })
})
