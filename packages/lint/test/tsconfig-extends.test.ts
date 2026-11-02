// tsconfig `extends` chains come from the repository being linted, so a
// cycle, a long chain or a malformed value ends the read instead of the
// lint run.

import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { resetFsMemo } from "../src/project/fs"
import { resolveFile, tsconfigPaths } from "../src/project/resolve"

let root: string

function write(name: string, source: unknown) {
  const file = path.join(root, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    typeof source === "string" ? source : JSON.stringify(source)
  )
  return file
}

const patterns = (dir: string) =>
  tsconfigPaths(dir).map((entry) => entry.pattern)

beforeEach(() => {
  resetFsMemo()
  root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "shadcn-lint-tsconfig-"))
  )
})

afterEach(() => {
  resetFsMemo()
  fs.rmSync(root, { recursive: true, force: true })
})

describe("tsconfig extends chains", () => {
  test("a tsconfig that extends itself reads its own paths once", () => {
    write("tsconfig.json", {
      extends: "./tsconfig.json",
      compilerOptions: { paths: { "@/*": ["./src/*"] } },
    })
    expect(patterns(root)).toEqual(["@/*"])
  })

  test("a cycle through two files reads each once, own paths first", () => {
    write("tsconfig.json", {
      extends: "./tsconfig.a.json",
      compilerOptions: { paths: { "@root/*": ["./root/*"] } },
    })
    write("tsconfig.a.json", {
      extends: ["./tsconfig.b.json", "./tsconfig.json"],
      compilerOptions: { paths: { "@a/*": ["./a/*"] } },
    })
    write("tsconfig.b.json", {
      extends: "./tsconfig.a.json",
      compilerOptions: { paths: { "@b/*": ["./b/*"] } },
    })
    expect(patterns(root)).toEqual(["@root/*", "@a/*", "@b/*"])
  })

  test("a chain longer than any real one stops before its end", () => {
    const links = 40
    for (let i = 0; i < links; i++) {
      write(`configs/tsconfig.${i}.json`, {
        extends: `./tsconfig.${i + 1}.json`,
        compilerOptions: { paths: { [`@${i}/*`]: [`./${i}/*`] } },
      })
    }
    write("tsconfig.json", { extends: "./configs/tsconfig.0.json" })
    const read = patterns(root)
    expect(read[0]).toBe("@0/*")
    expect(read).not.toContain(`@${links - 1}/*`)
  })

  test("an edit anywhere in the chain is read again", () => {
    write("tsconfig.json", { extends: "./tsconfig.base.json" })
    const base = write("tsconfig.base.json", {
      compilerOptions: { paths: { "@old/*": ["./old/*"] } },
    })
    expect(patterns(root)).toEqual(["@old/*"])
    write("tsconfig.base.json", {
      compilerOptions: { paths: { "@new/*": ["./new/*"] } },
    })
    const future = new Date(Date.now() + 5000)
    fs.utimesSync(base, future, future)
    resetFsMemo()
    expect(patterns(root)).toEqual(["@new/*"])
  })
})

describe("malformed tsconfig values", () => {
  test("are ignored, not thrown, and the valid entries still resolve", () => {
    write("tsconfig.json", {
      extends: [
        42,
        { name: "object" },
        "./missing.json",
        "./tsconfig.bad.json",
      ],
      compilerOptions: {
        paths: {
          "@/*": ["./src/*"],
          "@string/*": "./src/*",
          "@null/*": null,
          "@object/*": { target: "./src/*" },
        },
      },
    })
    write("tsconfig.bad.json", { compilerOptions: "not an object" })
    write("src/button.tsx", "export const Button = () => null\n")
    const entries = tsconfigPaths(root)
    expect(entries.map((entry) => [entry.pattern, entry.targets])).toEqual([
      ["@/*", ["./src/*"]],
      ["@string/*", []],
      ["@null/*", []],
      ["@object/*", []],
    ])
    expect(resolveFile("@/button", root, root)).toBe(
      path.join(root, "src/button.tsx")
    )
    expect(resolveFile("@string/button", root, root)).toBeNull()
  })

  test("a tsconfig that is not JSON reads as no paths", () => {
    write("tsconfig.json", "{ compilerOptions: ")
    expect(tsconfigPaths(root)).toEqual([])
    write("tsconfig.json", "[1, 2, 3]")
    resetFsMemo()
    expect(tsconfigPaths(root)).toEqual([])
  })
})
