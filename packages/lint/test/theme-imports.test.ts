// A design system published as a package ships its @theme in its own
// CSS, which the app imports. Files under node_modules contribute no
// color tokens by default, so once the app declares one color of its
// own, every kit color reads as undeclared. settings.shadcn.themeImports
// names the imports whose package is the project's own theme.

import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { colorTokensFor } from "../src/project/theme"
import { resetWarnings, setWarningSink } from "../src/project/warn"
import { noRawColors } from "../src/rules/no-raw-colors"
import { noRestyle } from "../src/rules/no-restyle"
import { createTester, PROJECT } from "./helpers"

const FIXTURE = path.join(path.dirname(PROJECT), "package-theme")
const PAGE = path.join(FIXTURE, "app/page.tsx")
const FILE = "test/fixtures/package-theme/app/globals.css"
const settings = { shadcn: { themeImports: ["^acme-ui/"] } }

const warnings: string[] = []
beforeEach(() => {
  warnings.length = 0
  resetWarnings()
  setWarningSink((m) => warnings.push(m))
})
afterEach(() => setWarningSink((m) => console.warn(m)))

describe("no-raw-colors with a theme from a package", () => {
  test("without themeImports, the kit's colors are undeclared", () => {
    createTester().run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: PAGE,
          code: `export const A = () => <div className="text-spotlight" />`,
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: `export const A = () => <div className="ring-primary/60" />`,
          errors: [
            {
              messageId: "undeclaredToken",
              data: {
                className: "ring-primary/60",
                tokens: "spotlight",
                file: FILE,
              },
            },
          ],
        },
      ],
    })
  })

  test("with themeImports, the kit's colors are the project's own", () => {
    createTester().run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: PAGE,
          settings,
          code: `export const A = () => <div className="bg-primary ring-primary/60 text-muted border-brand text-spotlight" />`,
        },
      ],
      invalid: [
        // The kit's own `@import "tailwindcss"` is another package: the
        // palette is still raw, and the kit's colors are now suggestions.
        {
          filename: PAGE,
          settings,
          code: `export const A = () => <div className="bg-zinc-100" />`,
          errors: [
            {
              messageId: "paletteClassNear",
              data: {
                className: "bg-zinc-100",
                suggestions: "bg-muted, bg-spotlight",
                tokens: "brand, muted, primary, spotlight",
                file: FILE,
              },
              suggestions: [
                {
                  messageId: "useToken",
                  data: { replacement: "bg-muted" },
                  output: `export const A = () => <div className="bg-muted" />`,
                },
                {
                  messageId: "useToken",
                  data: { replacement: "bg-spotlight" },
                  output: `export const A = () => <div className="bg-spotlight" />`,
                },
              ],
            },
          ],
        },
        {
          filename: PAGE,
          settings,
          code: `export const A = () => <div className="bg-highlight" />`,
          errors: [{ messageId: "undeclaredToken" }],
        },
        // A pattern names the import as written.
        {
          filename: PAGE,
          settings: { shadcn: { themeImports: ["^other-ui/"] } },
          code: `export const A = () => <div className="bg-primary" />`,
          errors: [{ messageId: "undeclaredToken" }],
        },
      ],
    })
  })

  test("the setting applies to the project whose rules read it", () => {
    createTester().run("no-raw-colors", noRawColors as any, {
      valid: [
        { filename: PAGE, settings, code: `export const A = () => null` },
      ],
      invalid: [],
    })
    expect([...(colorTokensFor(PAGE) ?? [])].sort()).toEqual([
      "brand",
      "muted",
      "primary",
      "spotlight",
    ])
    createTester().run("no-raw-colors", noRawColors as any, {
      valid: [{ filename: PAGE, code: `export const A = () => null` }],
      invalid: [],
    })
    expect([...(colorTokensFor(PAGE) ?? [])]).toEqual(["spotlight"])
  })

  test("an invalid pattern warns once and is ignored", () => {
    createTester().run("no-raw-colors", noRawColors as any, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          settings: { shadcn: { themeImports: ["^acme-ui/(", "^acme-ui/"] } },
          code: `export const A = () => <div className="bg-primary bg-highlight" />`,
          errors: [{ messageId: "undeclaredToken" }],
        },
      ],
    })
    expect(warnings).toEqual([
      "[@shadcn/lint] settings.shadcn.themeImports has an invalid pattern, ^acme-ui/(; it is ignored.",
    ])
  })
})

describe("no-restyle on a component from a package", () => {
  test("lists the package's variants without naming its file", () => {
    createTester().run("no-restyle", noRestyle as any, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          options: [{ allow: ["layout"], componentImports: ["^acme-ui/"] }],
          code: `import { Badge } from "acme-ui/badge"\nexport const A = () => <Badge className="bg-muted px-8" />`,
          errors: [
            {
              message:
                '"bg-muted" is not allowed on <Badge>: <Badge> owns its color. Use a variant: default, outline. Add a new variant to <Badge> only if the design explicitly calls for a treatment none of these provides.',
            },
            {
              message:
                '"px-8" is not allowed on <Badge>: <Badge> owns its spacing. Use a size (sm, lg), or margin here or gap on the parent for space around it. Add a size to <Badge> only if the design explicitly calls for one.',
            },
          ],
        },
      ],
    })
  })
})
