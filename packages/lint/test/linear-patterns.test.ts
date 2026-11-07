// Patterns that read class tokens and theme values run in one pass. A
// backtracking regex retries from every bracket, digit or space of a
// hostile token, and 50,000 of them took seconds each.

import { describe, expect, test } from "vitest"

import {
  isArbitraryValue,
  isPaletteClass,
  OPACITY_MODIFIER,
} from "../src/grammar/classes"
import { isArbitraryLength, isArbitraryShadow } from "../src/grammar/validators"
import { parseDeclarations } from "../src/project/theme"
import {
  noArbitraryValues,
  splitArbitrary,
} from "../src/rules/no-arbitrary-values"
import { createTester, PAGE } from "./helpers"

const N = 50_000

function quick<T>(run: () => T) {
  const start = performance.now()
  const result = run()
  expect(performance.now() - start).toBeLessThan(1000)
  return result
}

describe("hostile class tokens", () => {
  test("unclosed arbitrary values", () => {
    expect(quick(() => isArbitraryValue("a-[".repeat(N)))).toBe(false)
    expect(quick(() => isArbitraryValue(`[${"a:".repeat(N)}`))).toBe(false)
    expect(quick(() => splitArbitrary("a-[".repeat(N)))).toBeNull()
    expect(quick(() => splitArbitrary(`w-[${"a-[".repeat(N)}`))).toBeNull()

    expect(isArbitraryValue("hover:w-[13px]")).toBe(true)
    expect(isArbitraryValue("[mask-type:luminance]")).toBe(true)
    expect(isArbitraryValue("[:a:b]")).toBe(true)
    expect(isArbitraryValue("[:a]")).toBe(false)
    expect(isArbitraryValue("w-[13px")).toBe(false)
    // The important marker, v4 trailing and legacy leading, is not part of
    // the property: `[color:red]!` is as arbitrary as `[color:red]`.
    expect(isArbitraryValue("[color:red]!")).toBe(true)
    expect(isArbitraryValue("![color:red]")).toBe(true)
    expect(isArbitraryValue("hover:[color:red]!")).toBe(true)
    expect(isArbitraryValue("[:a]!")).toBe(false)
    expect(quick(() => isArbitraryValue(`![${"a:".repeat(N)}!`))).toBe(false)
    expect(splitArbitrary("md:text-[13px]/5")).toEqual({
      utility: "text",
      inner: "13px",
      suffix: "/5",
    })
    expect(splitArbitrary("-[13px]")).toBeNull()
  })

  test("unclosed opacity modifiers", () => {
    for (const open of ["/[", "/("]) {
      const token = `bg-red-500${open.repeat(N)}`
      expect(quick(() => token.match(OPACITY_MODIFIER))).toBeNull()
      expect(quick(() => isPaletteClass(token))).toBe(false)
    }
    expect("bg-primary/[0.5]".match(OPACITY_MODIFIER)?.[0]).toBe("/[0.5]")
    expect("bg-primary/(--alpha)".match(OPACITY_MODIFIER)?.[0]).toBe(
      "/(--alpha)"
    )
    expect("bg-primary/50".match(OPACITY_MODIFIER)?.[0]).toBe("/50")
    expect(isPaletteClass("bg-red-500/[calc(1/2)]")).toBe(true)
  })

  test("long arbitrary lengths and shadows", () => {
    expect(quick(() => isArbitraryLength(`[${"calc(".repeat(N)}]`))).toBe(false)
    expect(quick(() => isArbitraryLength(`[${"1".repeat(N)}]`))).toBe(false)
    expect(quick(() => isArbitraryShadow(`[${"1".repeat(N)}]`))).toBe(false)
  })

  test("a long class before a glued interpolation", () => {
    const code = `<div className={\`${"a".repeat(N)} b\${x}\`} />`
    quick(() =>
      createTester().run("no-arbitrary-values", noArbitraryValues as any, {
        valid: [{ code, filename: PAGE }],
        invalid: [],
      })
    )
  })

  test("a theme value with a long run of spaces", () => {
    const { values } = quick(() =>
      parseDeclarations(`:root { --a: x${" ".repeat(N)}y; }`)
    )
    expect(values.get("a")).toBe(`x${" ".repeat(N)}y`)
    const trimmed = parseDeclarations(":root { --a:  red  \n ; --b: ; }")
    expect(trimmed.values.get("a")).toBe("red")
    expect(trimmed.values.get("b")).toBe(" ")
  })
})
