// The cross-file analyses read component files through whichever
// parser is available: oxc-parser when installed, @typescript-eslint/
// parser otherwise. Both must give the same answers.

import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, test } from "vitest"

import {
  activeParserKind,
  createParser,
  useParser,
  type ParserKind,
} from "../src/project/parser"
import { extractVariantDefinitions } from "../src/project/variants"
import { clearWrapperCache, wrapperTargetOf } from "../src/project/wrappers"
import { PROJECT } from "./helpers"

const NO_JSON = path.join(path.dirname(PROJECT), "no-json")

const hasOxc = (() => {
  try {
    createParser("oxc")
    return true
  } catch {
    return false
  }
})()

const KINDS: ParserKind[] = hasOxc ? ["oxc", "typescript"] : ["typescript"]

describe("parser", () => {
  test("oxc-parser is the default when installed", () => {
    useParser(null)
    expect(activeParserKind()).toBe(hasOxc ? "oxc" : "typescript")
  })

  test("both parsers read the same variant axes", () => {
    const files = [
      path.join(PROJECT, "components/ui/button.tsx"),
      path.join(NO_JSON, "src/ds/button.tsx"),
    ]
    for (const file of files) {
      const source = fs.readFileSync(file, "utf-8")
      const results = KINDS.map((kind) => {
        useParser(kind)
        return extractVariantDefinitions(source, file)
      })
      expect(results[0].length).toBeGreaterThan(0)
      for (const result of results.slice(1)) expect(result).toEqual(results[0])
    }
    useParser(null)
  })

  test("both parsers read an alias, a lookup object and a props union", () => {
    const source = `
      const VARIANTS = { primary: "", secondary: "" } as const
      type ButtonVariant = keyof typeof VARIANTS
      type Base = { variant?: ButtonVariant }
      type ButtonProps = (Base & { href: string }) | (Base & { href?: undefined })
      export function Button(props: ButtonProps) { return <button /> }
    `
    const results = KINDS.map((kind) => {
      useParser(kind)
      return extractVariantDefinitions(source, "button.tsx")
    })
    expect(results[0]).toEqual([
      {
        name: "Button",
        axes: { variant: ["primary", "secondary"] },
        source: "props",
      },
    ])
    for (const result of results.slice(1)) expect(result).toEqual(results[0])
    useParser(null)
  })

  test("both parsers find the same wrappers", () => {
    const saveButton = path.join(PROJECT, "components/save-button.tsx")
    const cases: [string, string][] = [
      [saveButton, "SaveButton"],
      [saveButton, "Section"],
      [saveButton, "CancelButton"],
      [saveButton, "PrimaryAction"],
      [saveButton, "FixedButton"],
      [path.join(PROJECT, "app/local-wrapper.tsx"), "LocalButton"],
    ]
    for (const [file, name] of cases) {
      const results = KINDS.map((kind) => {
        useParser(kind)
        clearWrapperCache()
        return wrapperTargetOf(file, name)
      })
      for (const result of results.slice(1)) expect(result).toEqual(results[0])
    }
    useParser(null)
    clearWrapperCache()
  })

  test("a file that cannot forward className is not parsed", () => {
    const file = path.join(PROJECT, "components/ui/card.tsx")
    // Card forwards className itself, so this is a control: the answer
    // does not depend on the parser.
    useParser(null)
    clearWrapperCache()
    expect(wrapperTargetOf(file, "Card")).toBeNull()
  })
})
