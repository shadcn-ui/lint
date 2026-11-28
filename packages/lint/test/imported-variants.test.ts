import * as fs from "node:fs"
import * as path from "node:path"
import { test } from "vitest"

import { noRestyle } from "../src/rules/no-restyle"
import { requireStaticClasses } from "../src/rules/require-static-classes"
import { createTester, PROJECT } from "./helpers"

const filename = path.join(PROJECT, "app/imported-variants.tsx")
const code = fs.readFileSync(filename, "utf8")
const options = [{ contracts: [{ pattern: "^Button$", allow: ["layout"] }] }]

test("imported design-system variant calls apply their contract", () => {
  createTester().run("no-restyle with imported variants", noRestyle as any, {
    valid: [
      {
        filename,
        options,
        code: `
        import { buttonVariants } from "@/components/ui/button"
        const unrelated = (buttonVariants) => <a className={buttonVariants({ className: "text-red-600" })} />
        const fallback = (active) => <a className={active ? buttonVariants({ variant: "ghost" }) : "text-red-600"} />
      `,
      },
      {
        filename,
        options,
        code: code.replace(/text-red-600|bg-red-600/g, "w-full"),
      },
    ],
    invalid: [
      {
        filename,
        options,
        code,
        errors: [
          { messageId: "appearanceClassWithVariants" },
          { messageId: "appearanceClassWithVariants" },
          { messageId: "appearanceClassWithVariants" },
        ],
      },
    ],
  })
})

test("require-static-classes recognizes selection but checks class overrides", () => {
  createTester().run(
    "static classes with imported variants",
    requireStaticClasses as any,
    {
      valid: [{ filename, code }],
      invalid: [
        {
          filename,
          code: `
        import { buttonVariants } from "@/components/ui/button"
        export const App = () => <a className={buttonVariants({ class: getColor() })} />
      `,
          errors: 1,
        },
      ],
    }
  )
})
