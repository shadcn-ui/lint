import { describe, expect, test } from "vitest"

import { colorValueOf, noRawColors } from "../src/rules/no-raw-colors"
import { button, cn, createTester, OUTSIDE, PAGE } from "./helpers"

const tester = createTester()
const rule = noRawColors as any

describe("colorValueOf", () => {
  test.each([
    ["bg-primary", "primary"],
    ["text-muted-foreground/80", "muted-foreground"],
    ["text-muted-foreground/[0.7]", "muted-foreground"],
    ["bg-primary/(--opacity)", "primary"],
    ["bg-red-500/[0.5]", "red-500"],
    ["border-t-border", "border"],
    ["ring-offset-background", "background"],
    ["hover:bg-pink-500", "pink-500"],
    ["bg-[#333]", null],
    ["bg-(--brand)", null],
    ["text-sm", "sm"],
    ["p-4", null],
  ])("%s -> %s", (token, expected) => {
    expect(colorValueOf(token)).toBe(expected)
  })
})

describe("no-raw-colors", () => {
  test("rule", () => {
    tester.run("no-raw-colors", rule, {
      valid: [
        {
          filename: PAGE,
          code: `export const A = () => <div className="bg-primary text-muted-foreground border-border ring-ring/50" />`,
        },
        // Bracket and variable opacity modifiers are modifiers too.
        {
          filename: PAGE,
          code: `export const A = () => <div className="bg-primary/[0.5] hover:bg-primary/(--o) text-muted-foreground/[0.7]" />`,
        },
        {
          filename: PAGE,
          code: `export const A = () => <div className="bg-transparent text-white border-black text-current" />`,
        },
        // Non-color utilities that share a prefix.
        {
          filename: PAGE,
          code: `export const A = () => <div className="text-sm ring-2 border-2 shadow-lg bg-cover bg-none" />`,
        },
        // none is an SVG paint, not a color token.
        {
          filename: PAGE,
          code: `export const A = () => <svg className="fill-none stroke-none hover:fill-none" />`,
        },
        {
          filename: PAGE,
          code: `export const A = () => <div className="border-none outline-none shadow-none drop-shadow-none" />`,
        },
        // Arbitrary values and variable references are other rules' business.
        {
          filename: PAGE,
          code: `export const A = () => <div className="bg-[#333] bg-(--brand)" />`,
        },
        {
          filename: PAGE,
          code: `export const A = () => <div className="bg-amber-100" />`,
          options: [{ allow: ["bg-amber-100"] }],
        },
        // Outside a project only the palette check applies.
        {
          filename: OUTSIDE,
          code: `export const A = () => <div className="bg-brand text-whatever" />`,
        },
      ],
      invalid: [
        // A cva config assembled from same-file objects is read through
        // the shorthand and through a nested key alike.
        {
          filename: PAGE,
          code: `import { cva } from "class-variance-authority"\nconst variants = { tone: { hot: "bg-pink-500" } }\nexport const v = cva("mt-4", { variants })`,
          errors: [{ messageId: "paletteClassFar" }],
        },
        {
          filename: PAGE,
          code: `import { cva } from "class-variance-authority"\nconst tone = { hot: "bg-pink-500" }\nexport const v = cva("mt-4", { variants: { tone } })`,
          errors: [{ messageId: "paletteClassFar" }],
        },
        // A literal read through a variable from two sites, or from both
        // branches of one conditional, is reported once.
        {
          filename: PAGE,
          code: `const c = "bg-pink-500"\nexport const A = () => <><div className={c} /><div className={c} /></>`,
          errors: [{ messageId: "paletteClassFar" }],
        },
        {
          filename: PAGE,
          code: `const c = "bg-pink-500"\nexport const A = ({ on }: { on: boolean }) => <div className={on ? c : c} />`,
          errors: [{ messageId: "paletteClassFar" }],
        },
        // The newer palette families and the shadow, ring-offset, and
        // mask stop utilities are palette classes too.
        {
          filename: OUTSIDE,
          code: `export const A = () => <div className="bg-olive-500 border-t-red-500 text-shadow-red-500 ring-offset-red-500 mask-linear-from-red-500" />`,
          errors: [
            { messageId: "paletteClass" },
            { messageId: "paletteClass" },
            { messageId: "paletteClass" },
            { messageId: "paletteClass" },
            { messageId: "paletteClass" },
          ],
        },
        // A palette color keeps its verdict under a bracket opacity.
        {
          filename: PAGE,
          code: `export const A = () => <div className="bg-pink-500/[0.5] hover:bg-pink-500/(--o)" />`,
          errors: [
            { messageId: "paletteClassFar" },
            { messageId: "paletteClassFar" },
          ],
        },
        {
          filename: PAGE,
          code: `export const A = () => <div className="bg-pink-500 text-zinc-400" />`,
          errors: [
            { messageId: "paletteClassFar" },
            {
              messageId: "paletteClassNear",
              suggestions: [
                {
                  messageId: "useToken",
                  data: { replacement: "text-ring" },
                  output: `export const A = () => <div className="bg-pink-500 text-ring" />`,
                },
              ],
            },
          ],
        },
        {
          filename: PAGE,
          code: `export const A = () => <div className="hover:bg-emerald-600/90 dark:text-sky-300" />`,
          errors: [
            { messageId: "paletteClassFar" },
            { messageId: "paletteClassFar" },
          ],
        },
        {
          filename: PAGE,
          code: `${cn}\nexport const A = () => <p className={cn("from-orange-400")} />`,
          errors: [{ messageId: "paletteClassFar" }],
        },
        // Outside any project there is no theme to compare with.
        {
          filename: OUTSIDE,
          code: `export const A = () => <div className="bg-pink-500" />`,
          errors: [{ messageId: "paletteClass" }],
        },
        // Undeclared token, inside a project whose theme is readable.
        {
          filename: PAGE,
          code: `export const A = () => <div className="bg-brand" />`,
          errors: [{ messageId: "undeclaredToken" }],
        },
        // Class strings outside JSX are scanned too.
        {
          filename: PAGE,
          code: `import { cva } from "class-variance-authority"\nexport const v = cva("bg-pink-500", { variants: { tone: { hot: "text-rose-600" } } })`,
          errors: [
            { messageId: "paletteClassFar" },
            {
              messageId: "paletteClassNear",
              suggestions: [
                {
                  messageId: "useToken",
                  data: { replacement: "text-destructive" },
                  output: `import { cva } from "class-variance-authority"\nexport const v = cva("bg-pink-500", { variants: { tone: { hot: "text-destructive" } } })`,
                },
              ],
            },
          ],
        },
        // classNames object props.
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button classNames={{ day: "bg-pink-500" }}>Go</Button>`,
          errors: [{ messageId: "paletteClassFar" }],
        },
      ],
    })
  })
})

describe("no-raw-colors names the nearest token", () => {
  test("palette classes, typos and SVG attributes", () => {
    tester.run("no-raw-colors", rule, {
      valid: [],
      invalid: [
        // The default theme's grays, by OKLab distance. Tokens sharing
        // a value collapse to one name; surfaces are not offered
        // -foreground tokens. Each candidate is an editor suggestion.
        {
          filename: PAGE,
          code: `export const A = () => <div className="bg-zinc-100 text-zinc-500 border-zinc-200 hover:bg-zinc-900/50 text-red-500" />`,
          errors: [
            {
              messageId: "paletteClassNear",
              data: {
                className: "bg-zinc-100",
                suggestions: "bg-muted, bg-background",
                tokens:
                  "accent, background, border, card, destructive, foreground, input, muted, popover, primary, ring, secondary (+6 more)",
                file: "test/fixtures/project/app/globals.css",
              },
              suggestions: [
                {
                  messageId: "useToken",
                  data: { replacement: "bg-muted" },
                  output: `export const A = () => <div className="bg-muted text-zinc-500 border-zinc-200 hover:bg-zinc-900/50 text-red-500" />`,
                },
                {
                  messageId: "useToken",
                  data: { replacement: "bg-background" },
                  output: `export const A = () => <div className="bg-background text-zinc-500 border-zinc-200 hover:bg-zinc-900/50 text-red-500" />`,
                },
              ],
            },
            {
              messageId: "paletteClassNear",
              data: {
                className: "text-zinc-500",
                suggestions: "text-muted-foreground",
                tokens:
                  "accent, background, border, card, destructive, foreground, input, muted, popover, primary, ring, secondary (+6 more)",
                file: "test/fixtures/project/app/globals.css",
              },
              suggestions: [
                {
                  messageId: "useToken",
                  data: { replacement: "text-muted-foreground" },
                  output: `export const A = () => <div className="bg-zinc-100 text-muted-foreground border-zinc-200 hover:bg-zinc-900/50 text-red-500" />`,
                },
              ],
            },
            {
              messageId: "paletteClassNear",
              data: {
                className: "border-zinc-200",
                suggestions: "border-border, border-muted",
                tokens:
                  "accent, background, border, card, destructive, foreground, input, muted, popover, primary, ring, secondary (+6 more)",
                file: "test/fixtures/project/app/globals.css",
              },
              suggestions: [
                {
                  messageId: "useToken",
                  data: { replacement: "border-border" },
                  output: `export const A = () => <div className="bg-zinc-100 text-zinc-500 border-border hover:bg-zinc-900/50 text-red-500" />`,
                },
                {
                  messageId: "useToken",
                  data: { replacement: "border-muted" },
                  output: `export const A = () => <div className="bg-zinc-100 text-zinc-500 border-muted hover:bg-zinc-900/50 text-red-500" />`,
                },
              ],
            },
            // Variants and opacity are kept on the suggestion; foreground
            // is a text token, so a surface is not offered it.
            {
              messageId: "paletteClassNear",
              data: {
                className: "hover:bg-zinc-900/50",
                suggestions: "hover:bg-primary/50",
                tokens:
                  "accent, background, border, card, destructive, foreground, input, muted, popover, primary, ring, secondary (+6 more)",
                file: "test/fixtures/project/app/globals.css",
              },
              suggestions: [
                {
                  messageId: "useToken",
                  data: { replacement: "hover:bg-primary/50" },
                  output: `export const A = () => <div className="bg-zinc-100 text-zinc-500 border-zinc-200 hover:bg-primary/50 text-red-500" />`,
                },
              ],
            },
            {
              messageId: "paletteClassNear",
              data: {
                className: "text-red-500",
                suggestions: "text-destructive",
                tokens:
                  "accent, background, border, card, destructive, foreground, input, muted, popover, primary, ring, secondary (+6 more)",
                file: "test/fixtures/project/app/globals.css",
              },
              suggestions: [
                {
                  messageId: "useToken",
                  data: { replacement: "text-destructive" },
                  output: `export const A = () => <div className="bg-zinc-100 text-zinc-500 border-zinc-200 hover:bg-zinc-900/50 text-destructive" />`,
                },
              ],
            },
          ],
        },
        // A misspelled token gets its spelling.
        {
          filename: PAGE,
          code: `export const A = () => <div className="bg-primry text-mutedforeground/80 bg-brand" />`,
          errors: [
            {
              messageId: "undeclaredTokenTypo",
              data: {
                className: "bg-primry",
                suggestion: "bg-primary",
                tokens:
                  "accent, background, border, card, destructive, foreground, input, muted, popover, primary, ring, secondary (+6 more)",
              },
              suggestions: [
                {
                  messageId: "useToken",
                  data: { replacement: "bg-primary" },
                  output: `export const A = () => <div className="bg-primary text-mutedforeground/80 bg-brand" />`,
                },
              ],
            },
            {
              messageId: "undeclaredTokenTypo",
              data: {
                className: "text-mutedforeground/80",
                suggestion: "text-muted-foreground/80",
                tokens:
                  "accent, background, border, card, destructive, foreground, input, muted, popover, primary, ring, secondary (+6 more)",
              },
              suggestions: [
                {
                  messageId: "useToken",
                  data: { replacement: "text-muted-foreground/80" },
                  output: `export const A = () => <div className="bg-primry text-muted-foreground/80 bg-brand" />`,
                },
              ],
            },
            { messageId: "undeclaredToken" },
          ],
        },
        // SVG attributes name the nearest token as a variable.
        {
          filename: PAGE,
          code: `export const A = () => <svg><path fill="#71717a" /><path stroke="hotpink" /></svg>`,
          errors: [
            {
              messageId: "rawColorAttributeNear",
              data: {
                attribute: "fill",
                value: "#71717a",
                suggestion: "muted-foreground",
              },
            },
            {
              messageId: "rawColorAttribute",
              data: { attribute: "stroke", value: "hotpink" },
            },
          ],
        },
      ],
    })
  })
})

describe("no-raw-colors sees the same shapes", () => {
  test("a spread object and a || alternative", () => {
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          code: `export const A = () => <div {...{ className: "bg-pink-500" }} />`,
          errors: [{ messageId: "paletteClassFar" }],
        },
        {
          filename: PAGE,
          code: `const c = "bg-pink-500"\nexport const A = () => <div className={c || "flex"} />`,
          errors: [{ messageId: "paletteClassFar" }],
        },
      ],
    })
  })
})

describe("no-raw-colors edges", () => {
  test("text-shadow tokens, component color props, intrinsic color attributes", () => {
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: PAGE,
          code: `export const A = () => <div className="text-shadow-primary inset-ring-border" />`,
        },
        {
          filename: PAGE,
          code: `import { Tag } from "./tag"\nexport const A = () => <Tag color="red" />`,
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: `export const A = () => <svg><circle fill="red" /></svg>`,
          errors: [{ messageId: "rawColorAttributeNear" }],
        },
      ],
    })
  })
})
