import * as path from "node:path"
import { describe, expect, test } from "vitest"

import {
  colorTokensFor,
  parseClassSelectors,
  parseDeclarations,
  parseImports,
  scaleFor,
  spacingBaseFor,
  stripComments,
  themeFileFor,
} from "../src/project/theme"
import { noArbitraryValues } from "../src/rules/no-arbitrary-values"
import { noUnknownClasses } from "../src/rules/no-unknown-classes"
import { oracleAvailable, resetOracleMemo } from "../src/tailwind/client"
import { createTester, PROJECT } from "./helpers"

const tester = createTester()

const FIXTURES = path.dirname(PROJECT)

describe("theme resets apply in cascade order", () => {
  const reset = path.join(FIXTURES, "reset-theme/app/page.tsx")
  const full = path.join(FIXTURES, "full-reset-theme/app/page.tsx")
  test("a step declared before the reset is gone, one after it stays", () => {
    expect([...scaleFor(reset, "radius")]).toEqual([["fresh", 16]])
    expect([...scaleFor(reset, "text")]).toEqual([["sm", 32]])
    expect(spacingBaseFor(reset)).toBeNull()
  })
  test("the full reset clears every namespace", () => {
    expect(colorTokensFor(full)).toEqual(new Set(["primary"]))
    expect(scaleFor(full, "radius").size).toBe(0)
    expect(spacingBaseFor(full)).toBeNull()
  })
  test("no exact scale step without a known unit", () => {
    tester.run("no-arbitrary-values", noArbitraryValues as any, {
      valid: [],
      invalid: [
        {
          filename: reset,
          code: `export const A = () => <div className="p-[12px] rounded-[4px]" />`,
          errors: [
            { messageId: "arbitraryValue" },
            {
              messageId: "arbitraryValueNearScale",
              data: {
                className: "rounded-[4px]",
                suggestions: "rounded-fresh (16px)",
              },
            },
          ],
        },
      ],
    })
  })
})

describe("a plain Vite project has a theme too", () => {
  const app = path.join(FIXTURES, "vite-plain/src/App.jsx")
  test("the stylesheet that imports Tailwind is the theme, tokens or not", () => {
    // tokens.css declares a color and imports nothing; index.css imports
    // Tailwind and declares nothing. The entry wins.
    expect(themeFileFor(app)).toBe(
      path.join(FIXTURES, "vite-plain/src/index.css")
    )
  })
  test.skipIf(!oracleAvailable())(
    "its @utility is known and a stranger is not",
    () => {
      resetOracleMemo()
      tester.run("no-unknown-classes", noUnknownClasses as any, {
        valid: [
          {
            filename: app,
            code: `export default function App() { return <p className="text-2xl font-bold p-2 foo">Hello</p> }`,
          },
        ],
        invalid: [
          {
            filename: app,
            code: `export default function App() { return <p className="bar">Hello</p> }`,
            errors: [
              {
                messageId: "unknownClass",
                data: {
                  className: "bar",
                  suggestion: "",
                  file: "test/fixtures/vite-plain/src/index.css",
                },
              },
            ],
          },
        ],
      })
    }
  )
})

// The comment stripper reads strings and url() as text, so a "/*" in
// an @source glob does not open a comment that eats the theme.
describe("comments are stripped without reading into strings", () => {
  test("an @source glob does not swallow the declarations after it", () => {
    const { declarations } = parseDeclarations(
      `@source "../node_modules/streamdown/dist/*.js";
@theme inline { --radius-lg: var(--radius); }
:root { --radius: 0.375rem; /* 6px */ }
.a { --other: 1px; }`
    )
    expect(declarations.map((d) => d.name)).toEqual([
      "radius-lg",
      "radius",
      "other",
    ])
  })

  test("strings, escapes, url() and real comments", () => {
    expect(
      stripComments(
        `a: "/*"; /* gone */ b: '\\'/*'; c: url(/x/*.css); /* also gone */ d`
      )
    ).toBe(`a: "/*";  b: '\\'/*'; c: url(/x/*.css);  d`)
    expect(stripComments("a /* open")).toBe("a ")
    expect(
      parseClassSelectors(`@source "dist/*.js"; .card {} /* .not */`)
    ).toEqual(new Set(["card"]))
  })

  test("an @import mentioned in a comment is not an import", () => {
    expect(
      parseImports(`/* Consumers own the \`@import 'tailwindcss'\` entry point and
 * must import this file alongside it. */
@theme inline { --color-brand: #123456; }
@import "./tokens.css";`)
    ).toEqual(["./tokens.css"])
  })
})

describe("dark-mode blocks are skipped by selector, not by prefix", () => {
  const declared = (prelude: string) =>
    parseDeclarations(`${prelude} { --color-x: red; }`).values.get("color-x")

  test.each([
    ".dark",
    ".dark .card",
    ".dark, .night",
    ".dark.card",
    ".dark:where(.x)",
    ".dark>.card",
    ".dark[data-x]",
    "html.dark",
    ".dark\n",
  ])("%j is dark", (prelude) => {
    expect(declared(prelude)).toBeUndefined()
  })

  test.each([".dark-card", ".dark_card", ".darker", ".card"])(
    "%j is not dark",
    (prelude) => {
      expect(declared(prelude)).toBe("red")
    }
  )
})
