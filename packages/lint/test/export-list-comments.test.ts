import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, expect, test } from "vitest"

import { resetFsMemo } from "../src/project/fs"
import { exportsOf } from "../src/project/modules"

let root: string

function write(name: string, source: string) {
  const file = path.join(root, name)
  fs.writeFileSync(file, source)
  return file
}

beforeEach(() => {
  resetFsMemo()
  root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "lint-export-comments-"))
  )
  write("package.json", JSON.stringify({ private: true }))
  write("ab.tsx", "export const A = () => null\nexport const B = () => null")
})

afterEach(() => {
  resetFsMemo()
  fs.rmSync(root, { recursive: true, force: true })
})

test("a `}` in a block comment does not close an export list", () => {
  const file = write(
    "index.ts",
    "const A = 1\nconst B = 2\nexport { A /* } */, B }"
  )
  expect([...exportsOf(file).keys()]).toEqual(["A", "B"])
})

test("a `// }` line does not close a multi-line export list", () => {
  const file = write(
    "index.ts",
    ["export {", "  A, // }", "  B,", '} from "./ab"'].join("\n")
  )
  const ab = path.join(root, "ab.tsx")
  expect(Object.fromEntries(exportsOf(file))).toEqual({
    A: { file: ab, name: "A" },
    B: { file: ab, name: "B" },
  })
})

test("lists after a commented list are still read", () => {
  const file = write(
    "index.ts",
    [
      'export { A /* } */ } from "./ab"',
      'export { B as Action } from "./ab"',
    ].join("\n")
  )
  const ab = path.join(root, "ab.tsx")
  expect(Object.fromEntries(exportsOf(file))).toEqual({
    A: { file: ab, name: "A" },
    Action: { file: ab, name: "B" },
  })
})

test.each([
  ["unclosed block comments", "export { /* } ".repeat(20_000)],
  ["unclosed line comments", "export { // } ".repeat(20_000)],
  ["one late comment end", "export { /* } ".repeat(20_000) + "*/ }"],
])("lists with %s scan in linear time", (_, source) => {
  const file = write("module.ts", source)
  const start = performance.now()
  exportsOf(file)
  expect(performance.now() - start).toBeLessThan(1_000)
})
