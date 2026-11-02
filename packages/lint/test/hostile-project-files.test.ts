import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { resetFsMemo } from "../src/project/fs"
import { definingExportOf, exportsOf } from "../src/project/modules"
import {
  parseClassSelectors,
  parseDeclarations,
  parseImports,
  parseUtilities,
  resolveVariables,
  stripComments,
} from "../src/project/theme"

// The project readers scan files the linted code merely imports: a
// generated barrel, a package's dist, a half-saved stylesheet. None of
// them may throw or lose the declarations around the damage.

let root: string

function write(name: string, source: string) {
  const file = path.join(root, name)
  fs.writeFileSync(file, source)
  return file
}

beforeEach(() => {
  resetFsMemo()
  root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "lint-hostile-"))
  )
  write("package.json", JSON.stringify({ private: true }))
})

afterEach(() => {
  resetFsMemo()
  fs.rmSync(root, { recursive: true, force: true })
})

describe("module exports from damaged or generated sources", () => {
  test("an unterminated export or import list keeps the declarations", () => {
    const file = write(
      "broken.ts",
      'export const Button = () => null\nimport { a, b from "./a"\nexport { Button, Card'
    )
    expect([...exportsOf(file).keys()]).toEqual(["Button"])
  })

  test("a minified one-line barrel of 1,000 exports keeps every one", () => {
    const names = Array.from({ length: 1000 }, (_, i) => `C${i}`)
    write(
      "controls.ts",
      names.map((name) => `export const ${name}=()=>null;`).join("")
    )
    const barrel = write(
      "index.ts",
      `export{${names.join(",")}}from"./controls"`
    )
    const exports = exportsOf(barrel)
    expect(exports.size).toBe(1000)
    expect(exports.get("C999")).toEqual({
      file: path.join(root, "controls.ts"),
      name: "C999",
    })
  })

  test("a 200-deep chain of star re-exports reaches the declaration", () => {
    for (let i = 0; i < 200; i++) {
      write(`level-${i}.ts`, `export * from "./level-${i + 1}"`)
    }
    const leaf = write("level-200.ts", "export const Leaf = () => null")
    expect(exportsOf(path.join(root, "level-0.ts")).get("Leaf")).toEqual({
      file: leaf,
      name: "Leaf",
    })
    expect(
      definingExportOf("./level-0", "Leaf", path.join(root, "page.tsx"))
    ).toEqual({ file: leaf, name: "Leaf" })
  })

  test("a barrel that re-exports itself terminates", () => {
    const file = write(
      "self.ts",
      'export * from "./self"\nexport { Self as Alias } from "./self"\nexport const Self = 1'
    )
    expect(exportsOf(file).get("Self")).toEqual({ file, name: "Self" })
  })
})

describe("theme CSS that does not parse cleanly", () => {
  test("stray closing braces before the theme do not drop it", () => {
    const { values, themeNames } = parseDeclarations(
      "}}}\n@theme { --color-primary: red; }\n:root { --radius: 1rem; }"
    )
    expect(values.get("color-primary")).toBe("red")
    expect(values.get("radius")).toBe("1rem")
    expect(themeNames).toEqual(new Set(["color-primary"]))
  })

  test("an unclosed block keeps what it declared", () => {
    const { values } = parseDeclarations(
      ":root { --radius: 1rem; }\n@theme { --color-primary: red;"
    )
    expect(values.get("radius")).toBe("1rem")
    expect(values.get("color-primary")).toBe("red")
  })

  test("2,000 levels of nesting are read without recursion", () => {
    const css = "a {".repeat(2000) + "--deep: 1px;" + "}".repeat(2000)
    expect(parseDeclarations(`@theme { ${css} }`).values.get("deep")).toBe(
      "1px"
    )
  })

  test("an unterminated comment or string ends the scan, not the run", () => {
    expect(stripComments(":root { --a: 1; } /* open")).toBe(
      ":root { --a: 1; } "
    )
    expect(stripComments(':root { --a: "open\\')).toBe(':root { --a: "open\\')
    expect(parseDeclarations(':root { --a: 1; --b: "open').values).toEqual(
      new Map([["a", "1"]])
    )
    expect(parseClassSelectors('.a { content: "open .b')).toContain("a")
    expect(parseImports('@import "open')).toEqual([])
  })

  test("an unclosed @utility body reads to the end of the file", () => {
    expect(
      parseUtilities("@utility card { padding: 1rem; color: red;")
    ).toEqual(new Map([["card", ["padding", "color"]]]))
  })

  test("self and mutual variable references resolve to nothing", () => {
    const values = new Map([
      ["self", "var(--self)"],
      ["a", "var(--b)"],
      ["b", "var(--a)"],
      ["ok", "oklch(0.5 0 0)"],
    ])
    expect(resolveVariables("var(--self)", values)).toBeNull()
    expect(resolveVariables("var(--a)", values)).toBeNull()
    expect(resolveVariables("var(--missing, var(--ok))", values)).toBe(
      "oklch(0.5 0 0)"
    )
  })
})
