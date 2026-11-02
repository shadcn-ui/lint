import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, expect, test } from "vitest"

import { resetFsMemo } from "../src/project/fs"
import { definingExportOf, exportsOf } from "../src/project/modules"

// Deeper than the call stack holds when each barrel recurses into the next.
const DEPTH = 10_000
// Writing and removing that many files can pass vitest's 10s hook
// limit on a Windows runner.
const SETUP_TIMEOUT = 60_000

let root: string

beforeEach(() => {
  resetFsMemo()
  root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "lint-deep-barrels-"))
  )
  fs.writeFileSync(path.join(root, "package.json"), "{}")
  for (let i = 0; i < DEPTH; i++) {
    const next = i + 1 === DEPTH ? "./leaf" : `./barrel-${i + 1}`
    fs.writeFileSync(
      path.join(root, `barrel-${i}.ts`),
      i % 2 ? `export * from "${next}"` : `export { Leaf } from "${next}"`
    )
  }
  fs.writeFileSync(
    path.join(root, "leaf.tsx"),
    "export const Leaf = () => null"
  )
}, SETUP_TIMEOUT)

afterEach(() => {
  resetFsMemo()
  fs.rmSync(root, { recursive: true, force: true })
}, SETUP_TIMEOUT)

test("a barrel chain deeper than the call stack resolves to its leaf", () => {
  const leaf = { file: path.join(root, "leaf.tsx"), name: "Leaf" }
  expect(exportsOf(path.join(root, "barrel-0.ts")).get("Leaf")).toEqual(leaf)
  expect(
    definingExportOf("./barrel-1", "Leaf", path.join(root, "page.tsx"))
  ).toEqual(leaf)
}, 60_000)
