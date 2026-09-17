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
