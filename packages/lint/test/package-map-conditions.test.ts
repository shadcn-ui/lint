// package.json `exports` and `imports` maps come from the repository
// being linted: condition objects pick one target, and keys such as
// __proto__ and constructor are plain keys, never the prototype's.

import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { resetFsMemo } from "../src/project/fs"
import { resolveFile } from "../src/project/resolve"
import { resolveStylesheet } from "../src/tailwind/oracle"

let root: string

function write(name: string, source: unknown = "") {
  const file = path.join(root, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    typeof source === "string" ? source : JSON.stringify(source)
  )
  return file
}

beforeEach(() => {
  resetFsMemo()
  root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "shadcn-lint-conditions-"))
  )
})

afterEach(() => {
  resetFsMemo()
  fs.rmSync(root, { recursive: true, force: true })
})

describe("condition objects", () => {
  test("exports take import over require and types", () => {
    write("package.json", { private: true })
    write("node_modules/kit/package.json", {
      name: "kit",
      exports: {
        ".": {
          types: "./index.d.ts",
          require: "./index.cjs",
          import: "./index.mjs",
        },
      },
    })
    for (const file of ["index.d.ts", "index.cjs", "index.mjs"]) {
      write(`node_modules/kit/${file}`, "export {}\n")
    }
    expect(resolveFile("kit", root, root)).toBe(
      path.join(root, "node_modules/kit/index.mjs")
    )
  })

  test("nested conditions and a fallback array reach a target", () => {
    write("package.json", {
      imports: {
        "#nested": { import: { types: "./nested.d.ts", default: "./a.ts" } },
        "#array": [{ unknown: { deeper: {} } }, "./b.ts"],
        "#custom": { "react-server": "./c.ts" },
      },
    })
    for (const file of ["a.ts", "b.ts", "c.ts"]) write(file, "export {}\n")
    expect(resolveFile("#nested", root, root)).toBe(path.join(root, "a.ts"))
    expect(resolveFile("#array", root, root)).toBe(path.join(root, "b.ts"))
    expect(resolveFile("#custom", root, root)).toBe(path.join(root, "c.ts"))
  })

  test("a condition object with no string target maps to nothing", () => {
    write("package.json", {
      imports: { "#empty": { import: null, default: {}, require: [] } },
    })
    expect(resolveFile("#empty", root, root)).toBeNull()
  })

  test("a stylesheet takes a package's style condition, then its style field", () => {
    write("node_modules/styled/package.json", {
      name: "styled",
      exports: {
        ".": { import: "./index.js", style: "./dist/styled.css" },
        "./theme.css": { default: { style: "./dist/theme.css" } },
      },
    })
    write("node_modules/styled/dist/styled.css", ".styled {}\n")
    write("node_modules/styled/dist/theme.css", ".theme {}\n")
    write("node_modules/fielded/package.json", {
      name: "fielded",
      style: "./css/fielded.css",
      main: "./index.js",
    })
    write("node_modules/fielded/css/fielded.css", ".fielded {}\n")
    expect(resolveStylesheet(root, "styled")).toBe(
      path.join(root, "node_modules/styled/dist/styled.css")
    )
    expect(resolveStylesheet(root, "styled/theme.css")).toBe(
      path.join(root, "node_modules/styled/dist/theme.css")
    )
    expect(resolveStylesheet(root, "fielded")).toBe(
      path.join(root, "node_modules/fielded/css/fielded.css")
    )
  })
})

describe("prototype keys", () => {
  const prototypeKeys = () => Object.getOwnPropertyNames(Object.prototype)

  test("__proto__ and constructor in an imports map are plain keys", () => {
    const before = prototypeKeys()
    write(
      "package.json",
      `{"imports":{"__proto__":{"#polluted":"./p.ts"},"#own":{"__proto__":"./own.ts"},"constructor":"./c.ts"}}`
    )
    for (const file of ["p.ts", "own.ts", "c.ts"]) write(file, "export {}\n")
    expect(resolveFile("#polluted", root, root)).toBeNull()
    expect(resolveFile("#constructor", root, root)).toBeNull()
    expect(resolveFile("#toString", root, root)).toBeNull()
    expect(resolveFile("#own", root, root)).toBe(path.join(root, "own.ts"))
    expect(prototypeKeys()).toEqual(before)
    expect(({} as Record<string, unknown>)["#polluted"]).toBeUndefined()
  })

  test("a package subpath named after a prototype key resolves as a file", () => {
    const before = prototypeKeys()
    write(
      "node_modules/proto/package.json",
      `{"name":"proto","exports":{"__proto__":{"./x":"./x.css"},"./constructor":null,"./kit.css":"./kit.css"}}`
    )
    write("node_modules/proto/kit.css", ".kit {}\n")
    for (const subpath of ["__proto__", "constructor", "toString", "x"]) {
      expect(resolveStylesheet(root, `proto/${subpath}`)).toBeNull()
      expect(resolveFile(`proto/${subpath}`, root, root, [".css"])).toBeNull()
    }
    expect(resolveStylesheet(root, "proto/kit.css")).toBe(
      path.join(root, "node_modules/proto/kit.css")
    )
    expect(prototypeKeys()).toEqual(before)
  })
})
