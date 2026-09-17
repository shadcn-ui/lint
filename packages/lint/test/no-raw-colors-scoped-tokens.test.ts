// Tailwind reads a color utility from its own namespace before
// --color-*: --background-color-surface generates bg-surface and nothing
// else. Such a token is declared for that utility, the way Tailwind
// generates it, and undeclared for every other.

import * as path from "node:path"
import { describe, expect, test } from "vitest"

import { COLOR_NAMESPACES, scopedColorTokensFor } from "../src/project/theme"
import { colorNamespaceOf, noRawColors } from "../src/rules/no-raw-colors"
import { createTester, PROJECT } from "./helpers"

const PAGE = path.join(path.dirname(PROJECT), "scoped-colors/app/page.tsx")

describe("scoped color namespaces", () => {
  test("are read by namespace, resets included", () => {
    const scoped = scopedColorTokensFor(PAGE)
    expect([...(scoped?.get("background-color") ?? [])]).toEqual(["surface"])
    expect([...(scoped?.get("text-color") ?? [])]).toEqual(["ink"])
    expect([...(scoped?.get("fill") ?? [])]).toEqual(["brand"])
  })

  test("map from the class prefix the way Tailwind does", () => {
    expect(colorNamespaceOf("bg-")).toBe("background-color")
    expect(colorNamespaceOf("border-t-")).toBe("border-color")
    expect(colorNamespaceOf("divide-x-")).toBe("divide-color")
    expect(colorNamespaceOf("text-shadow-")).toBe("text-shadow-color")
    expect(colorNamespaceOf("from-")).toBeNull()
    expect(colorNamespaceOf("shadow-")).toBeNull()
    for (const prefix of [
      "bg-",
      "text-",
      "border-",
      "border-s-",
      "divide-",
      "divide-y-",
      "ring-",
      "outline-",
      "accent-",
      "caret-",
      "placeholder-",
      "decoration-",
      "text-shadow-",
      "drop-shadow-",
      "fill-",
      "stroke-",
    ]) {
      expect(COLOR_NAMESPACES).toContain(colorNamespaceOf(prefix))
    }
  })

  test("declare a token for one utility only", () => {
    createTester().run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: PAGE,
          code: `export const A = () => <div className="bg-surface text-ink border-t-edge fill-brand bg-gray-500" />`,
        },
        {
          filename: PAGE,
          code: `export const A = () => <div className="hover:bg-surface/50" />`,
        },
      ],
      invalid: [
        // A background-color token is not a text color.
        {
          filename: PAGE,
          code: `export const A = () => <div className="text-surface" />`,
          errors: [{ messageId: "undeclaredToken" }],
        },
        // A reset namespace drops its token.
        {
          filename: PAGE,
          code: `export const A = () => <div className="bg-old" />`,
          errors: [{ messageId: "undeclaredToken" }],
        },
        // The spelling suggestion knows the namespace's tokens.
        {
          filename: PAGE,
          code: `export const A = () => <div className="bg-surfaec" />`,
          errors: [
            {
              messageId: "undeclaredTokenTypo",
              data: {
                className: "bg-surfaec",
                suggestion: "bg-surface",
                tokens: "gray-500",
              },
              suggestions: [
                {
                  messageId: "useToken",
                  data: { replacement: "bg-surface" },
                  output: `export const A = () => <div className="bg-surface" />`,
                },
              ],
            },
          ],
        },
      ],
    })
  })
})
