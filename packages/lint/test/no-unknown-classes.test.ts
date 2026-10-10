import * as path from "node:path"
import { describe, expect, test } from "vitest"

import { noRawColors } from "../src/rules/no-raw-colors"
import { noUnknownClasses } from "../src/rules/no-unknown-classes"
import { oracleAvailable, resetOracleMemo } from "../src/tailwind/client"
import { button, createTester, PAGE, PROJECT } from "./helpers"

const tester = createTester()

// With the built worker present, the project's Tailwind answers and
// names the fix; without it, the bundled grammar answers.
const oracle = oracleAvailable()

const unknown = (code: string, className: string, suggestion: string | null) =>
  oracle && suggestion
    ? {
        messageId: "unknownClassSuggest",
        data: {
          className,
          suggestion,
          file: "test/fixtures/project/app/globals.css",
        },
        suggestions: [
          {
            messageId: "useSuggestion",
            data: { suggestion },
            output: code.replace(className, suggestion),
          },
        ],
      }
    : {
        messageId: "unknownClass",
        data: {
          className,
          suggestion: "",
          file: "test/fixtures/project/app/globals.css",
        },
      }

const FIXTURES = path.dirname(PROJECT)

describe("no-unknown-classes", () => {
  test("the oracle is used when the worker is built", () => {
    // The root test script builds first; a source-only run falls back.
    expect(typeof oracle).toBe("boolean")
  })

  test("rule", () => {
    resetOracleMemo()
    const typos = `${button}\nexport const A = () => <Button className="bg-primry flex-cols itms-center">Go</Button>`
    const variants = `export const A = () => <div className="hover:roundedd md:grd" />`
    tester.run("no-unknown-classes", noUnknownClasses as any, {
      valid: [
        {
          filename: PAGE,
          code: `export const A = () => <div className="flex items-center gap-2 bg-primary text-sm hover:bg-primary/90 md:grid-cols-3 -mt-2 !p-0 sr-only" />`,
        },
        // Markers, arbitrary properties, arbitrary variants.
        {
          filename: PAGE,
          code: `export const A = () => <div className="group peer group/card dark [mask-type:luminance] [&_svg]:size-4 data-[state=open]:flex" />`,
        },
        // Declared in the project's CSS.
        {
          filename: PAGE,
          code: `export const A = () => <div className="tap-target tab-4 legacy-card" />`,
        },
        {
          filename: PAGE,
          code: `export const A = () => <div className="toaster" />`,
          options: [{ allow: ["toaster"] }],
        },
      ],
      invalid: [
        // A typo in the value of a color utility (bg-primry) still
        // classifies as a color and is no-raw-colors' finding; this rule
        // owns typos in the utility itself.
        {
          filename: PAGE,
          code: typos,
          errors: [
            unknown(typos, "flex-cols", "flex-col"),
            unknown(typos, "itms-center", "items-center"),
          ],
        },
        {
          filename: PAGE,
          code: variants,
          errors: [
            unknown(variants, "hover:roundedd", "hover:rounded-md"),
            unknown(variants, "md:grd", "md:grid"),
          ],
        },
      ],
    })
  })

  test.skipIf(!oracle)("with Tailwind: invented variants and values", () => {
    const code = `export const A = () => <div className="hovr:flex tablet:flex rounded-huge" />`
    tester.run("no-unknown-classes", noUnknownClasses as any, {
      valid: [
        // Everything Tailwind generates, however new.
        {
          filename: PAGE,
          code: `export const A = () => <div className="**:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 not-disabled:hover:bg-accent starting:opacity-0 wrap-anywhere field-sizing-content" />`,
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code,
          errors: [
            unknown(code, "hovr:flex", "hover:flex"),
            // The utility is known and the variant is not: a variant is
            // declared with @custom-variant, not @utility.
            {
              messageId: "unknownVariant",
              data: {
                className: "tablet:flex",
                file: "test/fixtures/project/app/globals.css",
              },
            },
            unknown(code, "rounded-huge", null),
          ],
        },
      ],
    })
  })
})

describe.skipIf(!oracle)("a broken theme is unavailable on its own", () => {
  test("the healthy project keeps its answers", () => {
    const brokenPage = path.join(
      path.dirname(PAGE),
      "../../broken-theme/app/page.tsx"
    )
    tester.run("no-unknown-classes", noUnknownClasses as any, {
      valid: [],
      invalid: [
        // The theme imports a file that does not exist: Tailwind cannot
        // build it, so the grammar answers here, without a suggestion.
        {
          filename: brokenPage,
          code: `export const A = () => <div className="flex-cols" />`,
          errors: [{ messageId: "unknownClass" }],
        },
        // The other project is untouched by that failure.
        {
          filename: PAGE,
          code: `export const A = () => <div className="flex-cols" />`,
          errors: [
            {
              messageId: "unknownClassSuggest",
              data: {
                className: "flex-cols",
                suggestion: "flex-col",
                file: "test/fixtures/project/app/globals.css",
              },
              suggestions: [
                {
                  messageId: "useSuggestion",
                  data: { suggestion: "flex-col" },
                  output: `export const A = () => <div className="flex-col" />`,
                },
              ],
            },
          ],
        },
      ],
    })
  })
})

// components.json can point tailwind.css at a partial that declares tokens
// without importing Tailwind. A theme built from it holds no base utility,
// so every stock class would read as unknown.
describe.skipIf(!oracle)("a theme file that does not import Tailwind", () => {
  const page = path.join(FIXTURES, "partial-theme/src/page.tsx")
  test("stock classes are known, and the partial is still where a token belongs", () => {
    resetOracleMemo()
    const code = `export const A = () => <div className="flex-cols" />`
    tester.run("no-unknown-classes", noUnknownClasses as any, {
      valid: [
        {
          filename: page,
          code: `export const A = () => <div className="flex p-4 text-sm bg-brand" />`,
        },
      ],
      invalid: [
        {
          filename: page,
          code,
          errors: [
            {
              messageId: "unknownClassSuggest",
              data: {
                className: "flex-cols",
                suggestion: "flex-col",
                file: "test/fixtures/partial-theme/src/theme.css",
              },
              suggestions: [
                {
                  messageId: "useSuggestion",
                  data: { suggestion: "flex-col" },
                  output: code.replace("flex-cols", "flex-col"),
                },
              ],
            },
          ],
        },
      ],
    })
  })
})

describe.skipIf(!oracleAvailable())("prefixed variant typos", () => {
  const page = path.join(FIXTURES, "prefixed/app/page.tsx")
  test("the prefix is kept when the bare utility is checked", () => {
    resetOracleMemo()
    const code = `export const A = () => <div className="tw:hovr:bg-primary tw:bogus:text-primary tw:hovr:flex tw:bg-primary" />`
    tester.run("no-unknown-classes", noUnknownClasses as any, {
      valid: [],
      invalid: [
        {
          filename: page,
          code,
          errors: [
            {
              messageId: "unknownClassSuggest",
              data: {
                className: "tw:hovr:bg-primary",
                suggestion: "tw:hover:bg-primary",
                file: "test/fixtures/prefixed/app/globals.css",
              },
              suggestions: [
                {
                  messageId: "useSuggestion",
                  data: { suggestion: "tw:hover:bg-primary" },
                  output: code.replace(
                    "tw:hovr:bg-primary",
                    "tw:hover:bg-primary"
                  ),
                },
              ],
            },
            { messageId: "unknownVariant" },
            {
              messageId: "unknownClassSuggest",
              data: {
                className: "tw:hovr:flex",
                suggestion: "tw:hover:flex",
                file: "test/fixtures/prefixed/app/globals.css",
              },
              suggestions: [
                {
                  messageId: "useSuggestion",
                  data: { suggestion: "tw:hover:flex" },
                  output: code.replace("tw:hovr:flex", "tw:hover:flex"),
                },
              ],
            },
          ],
        },
      ],
    })
  })

  // Under prefix(tw), text-muted is no more a Tailwind class than flex.
  test("an unprefixed color class is unknown, not an undeclared color", () => {
    resetOracleMemo()
    const code = `export const A = () => <div className="tw:text-primary text-muted text-red-500 flex" />`
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [{ filename: page, code }],
      invalid: [
        {
          filename: page,
          code: `export const A = () => <div className="tw:text-nope" />`,
          errors: [{ messageId: "undeclaredToken" }],
        },
      ],
    })
    tester.run("no-unknown-classes", noUnknownClasses as any, {
      valid: [],
      invalid: [
        {
          filename: page,
          code,
          errors: [
            {
              messageId: "unknownClass",
              data: {
                className: "text-muted",
                file: "test/fixtures/prefixed/app/globals.css",
              },
            },
            {
              messageId: "unknownClass",
              data: {
                className: "text-red-500",
                file: "test/fixtures/prefixed/app/globals.css",
              },
            },
            {
              messageId: "unknownClass",
              data: {
                className: "flex",
                file: "test/fixtures/prefixed/app/globals.css",
              },
            },
          ],
        },
      ],
    })
  })
})
