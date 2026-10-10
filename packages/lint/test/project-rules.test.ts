// The rules against projects the index alone cannot describe: no
// components.json, monorepo aliases, ignored imports, extra helpers.

import * as path from "node:path"
import { describe, test } from "vitest"

import { noRawColors } from "../src/rules/no-raw-colors"
import { noRestyle } from "../src/rules/no-restyle"
import { requireStaticClasses } from "../src/rules/require-static-classes"
import { button, createTester, PAGE } from "./helpers"

const FIXTURES = path.join(__dirname, "fixtures")
const NO_JSON_PAGE = path.join(FIXTURES, "no-json/src/app/page.tsx")
const WEB_PAGE = path.join(FIXTURES, "monorepo/apps/web/app/page.tsx")
const ADMIN_PAGE = path.join(FIXTURES, "monorepo/apps/admin/app/page.tsx")

const tester = createTester()
const boundary = noRestyle as any
const ds = [{ componentImports: ["(^|/|#)ds(/|$)"] }]

const buttonError = (file: string) => ({
  messageId: "appearanceClassWithVariants",
  data: {
    className: "bg-highlight",
    component: "Button",
    category: "color",
    variants: "primary, secondary",
    file,
  },
})

describe("variants resolve through imports without components.json", () => {
  test("alias, relative, namespace, package imports, barrels", () => {
    const file = "test/fixtures/no-json/src/ds/button.tsx"
    tester.run("no-restyle", boundary, {
      valid: [],
      invalid: [
        {
          filename: NO_JSON_PAGE,
          code: `import { Button } from "@/ds"\nexport const A = () => <Button className="bg-highlight">Go</Button>`,
          options: ds,
          errors: [buttonError(file)],
        },
        {
          filename: NO_JSON_PAGE,
          code: `import { Button } from "../ds/button"\nexport const A = () => <Button className="bg-highlight">Go</Button>`,
          options: ds,
          errors: [buttonError(file)],
        },
        {
          filename: NO_JSON_PAGE,
          code: `import * as DS from "@/ds"\nexport const A = () => <DS.Button className="bg-highlight">Go</DS.Button>`,
          options: ds,
          errors: [buttonError(file)],
        },
        {
          filename: NO_JSON_PAGE,
          code: `import { Button } from "#ds"\nexport const A = () => <Button className="bg-highlight">Go</Button>`,
          options: ds,
          errors: [buttonError(file)],
        },
        // A component with a file but no variant axis names the file.
        {
          filename: NO_JSON_PAGE,
          code: `import { CardBody } from "@/ds"\nexport const A = () => <CardBody className="text-xs">Hi</CardBody>`,
          options: ds,
          errors: [
            {
              messageId: "appearanceClassNoVariants",
              data: {
                className: "text-xs",
                component: "CardBody",
                category: "typography",
                variants: "",
                file: "test/fixtures/no-json/src/ds/card.tsx",
              },
            },
          ],
        },
        // An import that resolves nowhere keeps the generic message.
        {
          filename: NO_JSON_PAGE,
          code: `import { Button } from "@acme/ui"\nexport const A = () => <Button className="bg-highlight">Go</Button>`,
          options: [{ componentImports: ["^@acme/ui"] }],
          errors: [{ messageId: "appearanceClass" }],
        },
      ],
    })
  })
})

describe("monorepo aliases", () => {
  test("variants and file through tsconfig paths and package exports", () => {
    const error = {
      messageId: "appearanceClassWithVariants",
      data: {
        className: "bg-red-500",
        component: "Button",
        category: "color",
        variants: "default, brand",
        file: "test/fixtures/monorepo/packages/ui/src/components/button.tsx",
      },
    }
    tester.run("no-restyle", boundary, {
      valid: [],
      invalid: [
        {
          filename: WEB_PAGE,
          code: `import { Button } from "@workspace/ui/components/button"\nexport const A = () => <Button className="bg-red-500">Go</Button>`,
          errors: [error],
        },
        {
          filename: ADMIN_PAGE,
          code: `import { Button } from "@workspace/ui/components/button"\nexport const A = () => <Button className="bg-red-500">Go</Button>`,
          errors: [error],
        },
      ],
    })
  })
})

describe("no-raw-colors names the theme file", () => {
  test("discovered theme and imported workspace theme", () => {
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: NO_JSON_PAGE,
          code: `export const A = () => <div className="bg-accent text-ink-muted" />`,
        },
      ],
      invalid: [
        {
          filename: NO_JSON_PAGE,
          code: `export const A = () => <div className="bg-highlight" />`,
          errors: [
            {
              messageId: "undeclaredToken",
              data: {
                className: "bg-highlight",
                tokens: "accent, accent-ink, ink, ink-muted, line, paper",
                file: "test/fixtures/no-json/src/styles.css",
              },
            },
          ],
        },
        {
          filename: WEB_PAGE,
          code: `export const A = () => <div className="bg-highlight" />`,
          errors: [
            {
              messageId: "undeclaredToken",
              data: {
                className: "bg-highlight",
                tokens:
                  "background, brand, foreground, primary, primary-foreground",
                file: "test/fixtures/monorepo/apps/web/app/globals.css",
              },
            },
          ],
        },
      ],
    })
  })
})

describe("ignoreImports", () => {
  test("a same-named third-party component is left alone when its source is ignored", () => {
    const code = `import { Button } from "@mui/material"\nexport const A = () => <Button className="bg-red-500">Go</Button>`
    tester.run("no-restyle", boundary, {
      valid: [
        {
          filename: PAGE,
          code,
          options: [{ ignoreImports: ["^@mui/"] }],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code,
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
      ],
    })
  })
})

describe("helpers", () => {
  test("mergeFunctions adds to the defaults; cx is a default", () => {
    tester.run("require-static-classes", requireStaticClasses as any, {
      valid: [
        {
          filename: PAGE,
          code: `${button}\nimport { cx } from "class-variance-authority"\nexport const A = () => <Button className={cx("w-full")}>Go</Button>`,
        },
        {
          filename: PAGE,
          code: `${button}\nimport { merge } from "./merge"\nimport { cn } from "@/lib/utils"\nexport const A = () => <Button className={merge(cn("w-full"))}>Go</Button>`,
          options: [{ mergeFunctions: ["merge"] }],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: `${button}\nimport { merge } from "./merge"\nexport const A = () => <Button className={merge("w-full")}>Go</Button>`,
          errors: [{ messageId: "dynamicClasses" }],
        },
      ],
    })
  })

  test("a dotted mergeFunctions entry names a member call", () => {
    const option = [
      {
        mergeFunctions: ["Option.some", "Option.none", "Option.fromNullishOr"],
      },
    ]
    const imports = `${button}\nimport * as Option from "effect/Option"`
    tester.run("require-static-classes", requireStaticClasses as any, {
      valid: [
        {
          filename: PAGE,
          code: `${imports}\nexport const A = () => <Button className={Option.none()}>Go</Button>`,
          options: option,
        },
        {
          filename: PAGE,
          code: `${imports}\nexport const A = () => <Button className={Option.some("w-full")}>Go</Button>`,
          options: option,
        },
        {
          filename: PAGE,
          code: `${imports}\nexport const A = () => <Button className={Option.fromNullishOr("w-full")}>Go</Button>`,
          options: option,
        },
        // The path is exact and may be deeper than one dot.
        {
          filename: PAGE,
          code: `${button}\ndeclare const ui: any\nexport const A = () => <Button className={ui.h.Class("w-full")}>Go</Button>`,
          options: [{ mergeFunctions: ["ui.h.Class"] }],
        },
      ],
      invalid: [
        // What the call is handed must still be static.
        {
          filename: PAGE,
          code: `${imports}\ndeclare const load: () => string\nexport const A = () => <Button className={Option.some(load())}>Go</Button>`,
          options: option,
          errors: [{ messageId: "dynamicClasses" }],
        },
        // Unlisted members, computed members and other objects stay dynamic.
        {
          filename: PAGE,
          code: `${imports}\nexport const A = () => <Button className={Option.getOrElse("w-full")}>Go</Button>`,
          options: option,
          errors: [{ messageId: "dynamicClasses" }],
        },
        {
          filename: PAGE,
          code: `${imports}\nexport const A = () => <Button className={Option["some"]("w-full")}>Go</Button>`,
          options: option,
          errors: [{ messageId: "dynamicClasses" }],
        },
        {
          filename: PAGE,
          code: `${button}\ndeclare const Maybe: any\nexport const A = () => <Button className={Maybe.some("w-full")}>Go</Button>`,
          options: option,
          errors: [{ messageId: "dynamicClasses" }],
        },
      ],
    })
  })

  test("classes in a dotted helper call are checked like any other", () => {
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          code: `declare const h: any\nexport const view = h.Class("bg-red-500")`,
          options: [{ mergeFunctions: ["h.Class"] }],
          errors: 1,
        },
        {
          filename: PAGE,
          code: `${button}\nimport * as Option from "effect/Option"\nexport const A = () => <Button className={Option.some("bg-red-500")}>Go</Button>`,
          options: [{ mergeFunctions: ["Option.some"] }],
          errors: 1,
        },
        {
          filename: PAGE,
          code: `declare const ui: any\nexport const tone = ui.variants({ variants: { tone: { pink: "bg-pink-500" } } })`,
          options: [{ variantFunctions: ["ui.variants"] }],
          errors: 1,
        },
      ],
    })
  })

  test("variantFunctions reads object values like cva", () => {
    const code = `import { defineVariants } from "./variants"\nexport const tone = defineVariants({ variants: { tone: { pink: "bg-pink-500" } } })`
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [{ filename: PAGE, code }],
      invalid: [
        {
          filename: PAGE,
          code,
          options: [{ variantFunctions: ["defineVariants"] }],
          errors: [{ messageId: "paletteClassFar" }],
        },
      ],
    })
  })
})
