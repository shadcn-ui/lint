import { describe, expect, test } from "vitest"

import { noArbitraryValues } from "../src/rules/no-arbitrary-values"
import { noRawColors } from "../src/rules/no-raw-colors"
import { attributeNameOf, isClassAttribute } from "../src/sites/collect"
import { createTester, PAGE } from "./helpers"

const tester = createTester()

// astro-eslint-parser gives `class:list` the same JSXNamespacedName the
// TypeScript parser does, so these cases run on the shared tester.
describe("class:list", () => {
  test("is a class attribute", () => {
    expect(isClassAttribute("class:list")).toBe(true)
    expect(isClassAttribute("class")).toBe(true)
    expect(isClassAttribute("wrapperClassName")).toBe(true)
    expect(isClassAttribute("client:load")).toBe(false)
    expect(isClassAttribute("xlink:class")).toBe(false)
    expect(
      attributeNameOf({
        name: {
          type: "JSXNamespacedName",
          namespace: { type: "JSXIdentifier", name: "class" },
          name: { type: "JSXIdentifier", name: "list" },
        },
      })
    ).toBe("class:list")
  })

  test("strings, arrays and objects reach the class rules", () => {
    tester.run("no-arbitrary-values", noArbitraryValues as any, {
      valid: [
        {
          filename: PAGE,
          code: `export const A = () => <a class:list={["p-4", { "mt-2": true }]}>Go</a>`,
        },
        {
          filename: PAGE,
          code: `export const A = () => <a client:load="p-[13px]">Go</a>`,
        },
        // A Set reads like the array it wraps.
        {
          filename: PAGE,
          code: `export const A = () => <a class:list={new Set(["p-4", "mt-2"])}>Go</a>`,
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: `export const A = () => <a class:list="p-[14px]">Go</a>`,
          errors: [
            {
              messageId: "arbitraryValueWithScale",
              data: { className: "p-[14px]", replacement: "p-3.5" },
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "p-3.5" },
                  output: `export const A = () => <a class:list="p-3.5">Go</a>`,
                },
              ],
            },
          ],
        },
        {
          filename: PAGE,
          code: `export const A = () => <a class:list={["p-[15px]"]}>Go</a>`,
          errors: [
            {
              messageId: "arbitraryValueWithScale",
              data: { className: "p-[15px]", replacement: "p-3.75" },
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "p-3.75" },
                  output: `export const A = () => <a class:list={["p-3.75"]}>Go</a>`,
                },
              ],
            },
          ],
        },
        // Object keys are the classes, the way clsx reads them.
        {
          filename: PAGE,
          code: `export const A = ({ on }: { on: boolean }) => <a class:list={["flex", { "min-w-[70px]": on }, on && "py-[10px]"]}>Go</a>`,
          errors: 2,
        },
        {
          filename: PAGE,
          code: `export const A = () => <a class:list={new Set(["p-[15px]", { "mt-[3px]": true }])}>Go</a>`,
          errors: 2,
        },
      ],
    })

    tester.run("no-raw-colors", noRawColors as any, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          code: `export const A = () => <a class:list={["bg-red-500"]}>Go</a>`,
          errors: 1,
        },
      ],
    })
  })
})
