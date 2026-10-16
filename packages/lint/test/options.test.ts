// Option semantics shared across rules: the layout contract keyword,
// allow entries with contract normalization, scanAllStrings, SVG color
// attributes, and the unknown-group guard.

import { defaultConfig, mergeConfigs } from "cn/config"
import { describe, expect, test } from "vitest"

import { groupOf, unknownGroups } from "../src/grammar/classifier"
import { noArbitraryValues } from "../src/rules/no-arbitrary-values"
import { isRawColorValue, noRawColors } from "../src/rules/no-raw-colors"
import { noRestyle } from "../src/rules/no-restyle"
import { button, card, createTester, PAGE } from "./helpers"

const tester = createTester()

describe("layout keyword", () => {
  test("allow: [layout] keeps placement and rejects appearance", () => {
    const options = [
      { contracts: [{ pattern: "^CardContent$", allow: ["layout"] }] },
    ]
    tester.run("no-restyle", noRestyle as any, {
      valid: [
        {
          filename: PAGE,
          code: `${card}\nexport const A = () => <CardContent className="mt-4 w-full hidden">Hi</CardContent>`,
          options,
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: `${card}\nexport const A = () => <CardContent className="px-2">Hi</CardContent>`,
          options,
          errors: [{ messageId: "spacingClassNoSizes" }],
        },
        // The keyword opens layout only where it is written: a component
        // the contract does not name has no allow list at all.
        {
          filename: PAGE,
          code: `${card}\nexport const A = () => <CardTitle className="mt-4">Hi</CardTitle>`,
          options,
          errors: [{ messageId: "layoutClassClosed" }],
        },
      ],
    })
  })
})

describe("allow with contract normalization", () => {
  test("no-raw-colors: variants, opacity, globs", () => {
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: PAGE,
          code: `export const A = () => <div className="bg-amber-100 hover:bg-amber-100 bg-amber-100/50 dark:bg-amber-200" />`,
          options: [{ allow: ["bg-amber-1*", "bg-amber-200"] }],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: `export const A = () => <div className="bg-amber-300" />`,
          options: [{ allow: ["bg-amber-100"] }],
          errors: [{ messageId: "paletteClassFar" }],
        },
      ],
    })
  })

  test("no-arbitrary-values: an allowed value covers its variants", () => {
    tester.run("no-arbitrary-values", noArbitraryValues as any, {
      valid: [
        {
          filename: PAGE,
          code: `export const A = () => <div className="md:p-[13px] p-[13px]/50" />`,
          options: [{ allow: ["p-[13px]"] }],
        },
      ],
      invalid: [],
    })
  })
})

describe("scanAllStrings", () => {
  test("bare string literals are checked", () => {
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: PAGE,
          code: `const tone = "bg-pink-500"\nexport const A = () => <div data-tone={tone} />`,
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: `const tone = "bg-pink-500"\nexport const A = () => <div data-tone={tone} />`,
          options: [{ scanAllStrings: true }],
          errors: [{ messageId: "paletteClassFar" }],
        },
      ],
    })
  })

  test("plain object keys are names, class object keys are classes", () => {
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: PAGE,
          code: `const layer = { paint: { "fill-color": tone, "fill-opacity": 0.85 }, layout: { "text-field": "name" } }\nconst { "fill-color": fill } = layer.paint\nclass Layer { "fill-color" = tone }\ntype Paint = { "fill-color": string }\nexport const A = () => <div data-layer={layer} />`,
          options: [{ scanAllStrings: true }],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: `import { cn } from "@/lib/utils"\nexport const A = ({ on }) => <div className={cn({ "bg-pink-500": on })} />`,
          options: [{ scanAllStrings: true }],
          errors: [{ messageId: "paletteClassFar" }],
        },
        {
          filename: PAGE,
          code: `const tones = { ["bg-pink-500"]: 1 }\nexport const A = () => <div data-tones={tones} />`,
          options: [{ scanAllStrings: true }],
          errors: [{ messageId: "paletteClassFar" }],
        },
      ],
    })
  })
})

describe("SVG presentation attributes", () => {
  test("isRawColorValue", () => {
    expect(isRawColorValue("#ff00aa")).toBe(true)
    expect(isRawColorValue("rgb(1 2 3)")).toBe(true)
    expect(isRawColorValue("red")).toBe(true)
    expect(isRawColorValue("currentColor")).toBe(false)
    expect(isRawColorValue("none")).toBe(false)
    expect(isRawColorValue("var(--color-brand)")).toBe(false)
    expect(isRawColorValue("oklch(var(--primary-oklch))")).toBe(false)
    expect(isRawColorValue("oklch(var(--x) / 0.2)")).toBe(false)
    expect(isRawColorValue("oklch(var(--x) / var(--alpha))")).toBe(false)
    expect(isRawColorValue("oklch(0.62 0.19 260)")).toBe(true)
    expect(isRawColorValue("oklch(var(--x, 0.62 0.19 260))")).toBe(true)
    expect(isRawColorValue("oklch(var(--x) var(--y))")).toBe(true)
    expect(isRawColorValue("color-mix(var(--x))")).toBe(true)
    expect(isRawColorValue("url(#gradient)")).toBe(false)
  })

  test("fill and stroke with raw colors are flagged", () => {
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: PAGE,
          code: `export const A = () => <svg><path fill="currentColor" stroke="none" /></svg>`,
        },
        {
          filename: PAGE,
          code: `export const A = () => <svg><path fill="var(--color-brand)" /></svg>`,
        },
        {
          filename: PAGE,
          code: `export const A = () => <svg><path fill={color} /></svg>`,
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: `export const A = () => <svg><path fill="#ff00aa" stroke={"red"} /></svg>`,
          errors: [
            {
              messageId: "rawColorAttribute",
              data: { attribute: "fill", value: "#ff00aa" },
            },
            {
              messageId: "rawColorAttributeNear",
              data: {
                attribute: "stroke",
                value: "red",
                suggestion: "destructive",
              },
            },
          ],
        },
      ],
    })
  })
})

describe("unknown class groups", () => {
  test("every bundled group has a category; a new one is reported", () => {
    expect(unknownGroups(defaultConfig())).toEqual([])
    const extended = mergeConfigs(defaultConfig(), {
      extend: { classGroups: { "future-thing": ["future"] } },
    })
    expect(unknownGroups(extended)).toEqual(["future-thing"])
  })
})

describe("geometry is an arbitrary value too", () => {
  test("w-[320px] is an error until layout is allowed", () => {
    tester.run("no-arbitrary-values", noArbitraryValues as any, {
      valid: [
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="w-[320px]">Go</Button>`,
          options: [{ allow: ["layout"] }],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="w-[320px]">Go</Button>`,
          errors: [
            {
              messageId: "arbitraryValueWithScale",
              data: { className: "w-[320px]", replacement: "w-80" },
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "w-80" },
                  output: `${button}\nexport const A = () => <Button className="w-80">Go</Button>`,
                },
              ],
            },
          ],
        },
      ],
    })
  })
})

describe("legacy gradient direction utilities", () => {
  test("bg-gradient-to-* is an image, not an undeclared color", () => {
    expect(groupOf("bg-gradient-to-b")).toBe("bg-image")
    expect(groupOf("bg-linear-to-r")).toBe("bg-image")
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: PAGE,
          code: `export const A = () => <div className="bg-gradient-to-b from-primary to-transparent" />`,
        },
      ],
      invalid: [],
    })
  })
})
