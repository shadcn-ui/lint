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
    fs.mkdtempSync(path.join(os.tmpdir(), "lint-scan-time-"))
  )
  write("package.json", JSON.stringify({ private: true }))
  write("button.tsx", "export const Button = () => null")
})

afterEach(() => {
  resetFsMemo()
  fs.rmSync(root, { recursive: true, force: true })
})

// Each took seconds to scan before; linear scans take milliseconds. The
// bound is loose so a slow runner never fails on time alone.
test.each([
  ["an import with a long run of spaces", "import a" + " ".repeat(2_000)],
  ["many unclosed export lists", "export {".repeat(20_000)],
  ["many unclosed import lists", "import {".repeat(20_000)],
  [
    "a default identifier with trailing spaces",
    "export default a" + " ".repeat(40_000) + "x",
  ],
  [
    "an export list with a long run of spaces",
    `export { a${" ".repeat(60_000)}b }`,
  ],
])("%s scans in linear time", (_, source) => {
  const file = write("module.ts", source)
  const start = performance.now()
  exportsOf(file)
  expect(performance.now() - start).toBeLessThan(1_000)
})

test("spaced imports, lists, and defaults still resolve", () => {
  const file = write(
    "index.ts",
    [
      'import Button ,  { Button as Root }  from "./button"',
      'import * as All  from "./button"',
      "export { Root  as  Action, All }",
      "export default Button  ;  ",
    ].join("\n")
  )
  const button = path.join(root, "button.tsx")
  expect(Object.fromEntries(exportsOf(file))).toEqual({
    Action: { file: button, name: "Button" },
    All: { file: button, name: "*" },
    Button: { file, name: "Button" },
    default: { file: button, name: "default" },
  })
})
