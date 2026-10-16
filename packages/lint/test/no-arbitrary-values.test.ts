import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { describe, expect, test } from "vitest"

import {
  noArbitraryValues,
  scaleEquivalent,
} from "../src/rules/no-arbitrary-values"
import { button, cn, createTester, OUTSIDE, PAGE } from "./helpers"

const tester = createTester()
const rule = noArbitraryValues as any

describe("scaleEquivalent", () => {
  test.each([
    ["p-[13px]", "p-3.25"],
    ["md:px-[16px]", "md:px-4"],
    ["-mt-[8px]", "-mt-2"],
    ["p-[13.5px]", null],
    ["text-[13px]", "text-3.25"],
    // Two-segment utility names are on the scale too.
    ["border-spacing-x-[8px]", "border-spacing-x-2"],
    ["scroll-mt-[4px]", "scroll-mt-1"],
  ])("%s -> %s", (token, expected) => {
    expect(scaleEquivalent(token)).toBe(expected)
  })
})

describe("no-arbitrary-values", () => {
  test("rule", () => {
    tester.run("no-arbitrary-values", rule, {
      valid: [
        {
          filename: PAGE,
          code: `export const A = () => <div className="p-4 rounded-lg border border-border text-sm bg-card" />`,
        },
        {
          filename: PAGE,
          code: `export const A = () => <div className="data-[state=open]:flex [&_svg]:size-4" />`,
        },
        // Geometry is contextual, so a project opens layout and keeps
        // the rule on appearance.
        {
          filename: PAGE,
          code: `export const A = () => <div className="w-[calc(100%-2rem)] max-h-[250px] mt-[13px]" />`,
          options: [{ allow: ["layout"] }],
        },
        {
          filename: PAGE,
          code: `export const A = () => <div className="w-[320px]" />`,
          options: [{ allow: ["w-[320px]"] }],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: `export const A = () => <div className="p-[13px] rounded-[10px] border-[#E4E4E7] text-[13px]" />`,
          errors: [
            {
              messageId: "arbitraryValueWithScale",
              data: { className: "p-[13px]", replacement: "p-3.25" },
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "p-3.25" },
                  output: `export const A = () => <div className="p-3.25 rounded-[10px] border-[#E4E4E7] text-[13px]" />`,
                },
              ],
            },
            // The fixture theme sets --radius-lg to var(--radius), 10px.
            {
              messageId: "arbitraryValueWithScale",
              data: { className: "rounded-[10px]", replacement: "rounded-lg" },
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "rounded-lg" },
                  output: `export const A = () => <div className="p-[13px] rounded-lg border-[#E4E4E7] text-[13px]" />`,
                },
              ],
            },
            {
              messageId: "arbitraryColorNear",
              data: {
                className: "border-[#E4E4E7]",
                suggestions: "border-border, border-muted",
                file: "test/fixtures/project/app/globals.css",
              },
              suggestions: [
                {
                  messageId: "useToken",
                  data: { replacement: "border-border" },
                  output: `export const A = () => <div className="p-[13px] rounded-[10px] border-border text-[13px]" />`,
                },
                {
                  messageId: "useToken",
                  data: { replacement: "border-muted" },
                  output: `export const A = () => <div className="p-[13px] rounded-[10px] border-muted text-[13px]" />`,
                },
              ],
            },
            {
              messageId: "arbitraryValueNearScale",
              data: {
                className: "text-[13px]",
                suggestions: "text-xs (12px), text-sm (14px)",
              },
            },
          ],
        },
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="p-[3px]">Go</Button>`,
          errors: [
            {
              messageId: "arbitraryValueWithScale",
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "p-0.75" },
                  output: `${button}\nexport const A = () => <Button className="p-0.75">Go</Button>`,
                },
              ],
            },
          ],
        },
        {
          filename: PAGE,
          code: `${cn}\nexport const A = () => <p className={cn("md:text-[11px]")} />`,
          errors: [
            {
              messageId: "arbitraryValueNearScale",
              data: {
                className: "md:text-[11px]",
                suggestions: "md:text-xs (12px), md:text-sm (14px)",
              },
            },
          ],
        },
        // A layout value is a value like any other until layout is allowed.
        {
          filename: PAGE,
          code: `export const A = () => <div className="w-[320px] mt-[13px]" />`,
          errors: [
            {
              messageId: "arbitraryValueWithScale",
              data: { className: "w-[320px]", replacement: "w-80" },
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "w-80" },
                  output: `export const A = () => <div className="w-80 mt-[13px]" />`,
                },
              ],
            },
            {
              messageId: "arbitraryValueWithScale",
              data: { className: "mt-[13px]", replacement: "mt-3.25" },
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "mt-3.25" },
                  output: `export const A = () => <div className="w-[320px] mt-3.25" />`,
                },
              ],
            },
          ],
        },
        // Outside JSX, and behind one hop.
        {
          filename: PAGE,
          code: `import { cva } from "class-variance-authority"\nexport const v = cva("bg-[#f0f]")`,
          errors: [{ messageId: "arbitraryColorFar" }],
        },
        {
          filename: PAGE,
          code: `const c = "bg-[#ff00aa]"\nexport const A = () => <div className={c} />`,
          errors: [
            {
              messageId: "arbitraryColorFar",
              data: {
                className: "bg-[#ff00aa]",
                suggestions: "",
                tokens:
                  "accent, background, border, card, destructive, foreground, input, muted, popover, primary, ring, secondary (+6 more)",
                file: "test/fixtures/project/app/globals.css",
              },
            },
          ],
        },
        // Outside any project: no theme, no scale beyond the defaults.
        {
          filename: OUTSIDE,
          code: `export const A = () => <div className="bg-[#ff00aa] rounded-[10px] text-[0.875rem]" />`,
          errors: [
            {
              messageId: "arbitraryValue",
              data: { className: "bg-[#ff00aa]" },
            },
            {
              messageId: "arbitraryValueNearScale",
              data: {
                className: "rounded-[10px]",
                suggestions: "rounded-lg (8px), rounded-xl (12px)",
              },
            },
            {
              messageId: "arbitraryValueWithScale",
              data: { className: "text-[0.875rem]", replacement: "text-sm" },
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "text-sm" },
                  output: `export const A = () => <div className="bg-[#ff00aa] rounded-[10px] text-sm" />`,
                },
              ],
            },
          ],
        },
      ],
    })
  })
})

test("a two-segment spacing utility gets its scale replacement", () => {
  const code = `export const A = () => <div className="border-spacing-x-[8px]" />`
  createTester().run("no-arbitrary-values", noArbitraryValues as any, {
    valid: [],
    invalid: [
      {
        filename: PAGE,
        code,
        errors: [
          {
            messageId: "arbitraryValueWithScale",
            data: {
              className: "border-spacing-x-[8px]",
              replacement: "border-spacing-x-2",
            },
            suggestions: [
              {
                messageId: "useScale",
                data: { replacement: "border-spacing-x-2" },
                output: code.replace(
                  "border-spacing-x-[8px]",
                  "border-spacing-x-2"
                ),
              },
            ],
          },
        ],
      },
    ],
  })
})

// An arbitrary layout property is reported until layout is allowed;
// docs/rules.md points contracts at this for [margin:1rem].
test("an arbitrary layout property follows the layout keyword", () => {
  const code = `export const A = () => <div className="[margin:1rem]" />`
  createTester().run("no-arbitrary-values", noArbitraryValues as any, {
    valid: [{ filename: PAGE, code, options: [{ allow: ["layout"] }] }],
    invalid: [
      {
        filename: PAGE,
        code,
        errors: [{ message: /"\[margin:1rem\]" hardcodes an off-token value/ }],
      },
    ],
  })
})

// A density class declared after :root sets --radius only inside it, so
// the scale comes from :root: lg is 10px and xl 12px, and 8px is on
// neither. The :root value wins from an imported stylesheet too.
test("the scale reads --radius from :root, not a scoped selector", () => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "lint-scoped-radius-"))
  )
  try {
    fs.writeFileSync(
      path.join(root, "components.json"),
      JSON.stringify({ tailwind: { css: "app.css" } })
    )
    fs.writeFileSync(path.join(root, "base.css"), ":root { --radius: 0.5rem; }")
    fs.writeFileSync(
      path.join(root, "app.css"),
      `@import "tailwindcss";
@import "./base.css";
.compact { --radius: 0.25rem; }
@theme inline {
  --radius-lg: calc(var(--radius) + 2px);
  --radius-xl: calc(var(--radius) + 4px);
}`
    )
    const filename = path.join(root, "page.tsx")
    createTester().run("no-arbitrary-values", noArbitraryValues as any, {
      valid: [],
      invalid: [
        {
          filename,
          code: `export const A = () => <div className="rounded-[8px]" />`,
          errors: [{ messageId: "arbitraryValueNearScale" }],
        },
        {
          filename,
          code: `export const A = () => <div className="rounded-[12px]" />`,
          errors: [
            {
              messageId: "arbitraryValueWithScale",
              data: { className: "rounded-[12px]", replacement: "rounded-xl" },
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "rounded-xl" },
                  output: `export const A = () => <div className="rounded-xl" />`,
                },
              ],
            },
          ],
        },
      ],
    })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
