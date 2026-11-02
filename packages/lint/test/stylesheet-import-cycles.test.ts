// A theme's @import graph comes from the repository being linted: a
// cycle or a fan-out ends the read, and what was read still counts. A
// package's @import reaches its stylesheet, never its script entry.

import * as fs from "node:fs"
import { createRequire } from "node:module"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { resetFsMemo } from "../src/project/fs"
import {
  colorTokensFor,
  declaresClass,
  knownClassesFor,
} from "../src/project/theme"
import { query, resetOracle } from "../src/tailwind/oracle"

let root: string

function write(name: string, source: string) {
  const file = path.join(root, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, source)
  return file
}

function project(css: string) {
  write("package.json", JSON.stringify({ private: true }))
  write(
    "components.json",
    JSON.stringify({
      aliases: { ui: "@/components/ui" },
      tailwind: { css },
    })
  )
  return path.join(root, "page.tsx")
}

beforeEach(() => {
  resetFsMemo()
  root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "shadcn-lint-css-cycles-"))
  )
})

afterEach(() => {
  resetFsMemo()
  fs.rmSync(root, { recursive: true, force: true })
})

describe("theme @import graphs", () => {
  test("a stylesheet that imports itself is read once", () => {
    const page = project("theme.css")
    write(
      "theme.css",
      `@import "./theme.css";\n@theme { --color-brand: #111; }\n.self-card {}\n`
    )
    expect([...(colorTokensFor(page) ?? [])]).toEqual(["brand"])
    expect(knownClassesFor(page).classes.has("self-card")).toBe(true)
  })

  test("a cycle through two stylesheets reads both", () => {
    const page = project("a.css")
    write("a.css", `@import "./b.css";\n@theme { --color-from-a: #111; }\n`)
    write(
      "b.css",
      `@import "./a.css";\n@theme { --color-from-b: #222; }\n.from-b {}\n`
    )
    expect(new Set(colorTokensFor(page))).toEqual(new Set(["from-a", "from-b"]))
    expect(knownClassesFor(page).classes.has("from-b")).toBe(true)
  })

  test("a fan-out beyond any real theme stops reading", () => {
    const page = project("theme.css")
    const parts = 200
    write(
      "theme.css",
      Array.from(
        { length: parts },
        (_, i) => `@import "./parts/p${i}.css";`
      ).join("\n")
    )
    for (let i = 0; i < parts; i++) {
      write(`parts/p${i}.css`, `@theme { --color-part-${i}: #000; }\n`)
    }
    const tokens = colorTokensFor(page) ?? new Set<string>()
    expect(tokens.has("part-0")).toBe(true)
    expect(tokens.has(`part-${parts - 1}`)).toBe(false)
  })
})

describe("a package @import reads the package's stylesheet", () => {
  // Minified JavaScript is full of `.name`: read as CSS, every property
  // access would be a class the project declares.
  const BUNDLE = "export const f = (a) => a.value.map((b) => b.length)\n"

  test("tailwindcss takes its style condition, not dist/lib.mjs", () => {
    const page = project("app.css")
    write(
      "app.css",
      `@import "tailwindcss";\n@theme { --color-primary: #111; }\n`
    )
    write(
      "node_modules/tailwindcss/package.json",
      JSON.stringify({
        name: "tailwindcss",
        exports: {
          ".": {
            types: "./dist/lib.d.mts",
            style: "./index.css",
            require: "./dist/lib.js",
            import: "./dist/lib.mjs",
          },
        },
      })
    )
    write("node_modules/tailwindcss/index.css", ".sr-only {}\n")
    write("node_modules/tailwindcss/dist/lib.mjs", BUNDLE)
    expect(declaresClass(page, "sr-only")).toBe(true)
    for (const name of ["value", "map", "length"]) {
      expect(declaresClass(page, name)).toBe(false)
    }
  })

  test("a style condition under another name wins over import", () => {
    const page = project("app.css")
    write("app.css", `@import "kit";\n`)
    write(
      "node_modules/kit/package.json",
      JSON.stringify({
        name: "kit",
        exports: { ".": { import: "./dist/kit.mjs", style: "./dist/kit.css" } },
      })
    )
    write("node_modules/kit/dist/kit.css", ".kit-card {}\n")
    write("node_modules/kit/dist/kit.mjs", BUNDLE)
    expect(declaresClass(page, "kit-card")).toBe(true)
    expect(declaresClass(page, "value")).toBe(false)
  })

  test("a top-level style field wins over main", () => {
    const page = project("app.css")
    write("app.css", `@import "fielded";\n`)
    write(
      "node_modules/fielded/package.json",
      JSON.stringify({
        name: "fielded",
        style: "./css/fielded.css",
        main: "./index.js",
      })
    )
    write("node_modules/fielded/css/fielded.css", ".fielded-card {}\n")
    write("node_modules/fielded/index.js", BUNDLE)
    expect(declaresClass(page, "fielded-card")).toBe(true)
    expect(declaresClass(page, "value")).toBe(false)
  })

  test("a package with no stylesheet is a missing import", () => {
    const page = project("app.css")
    write("app.css", `@import "scripted";\n.own-card {}\n`)
    write(
      "node_modules/scripted/package.json",
      JSON.stringify({
        name: "scripted",
        main: "./dist/index.js",
        exports: { ".": { import: "./dist/index.mjs" } },
      })
    )
    write("node_modules/scripted/dist/index.mjs", BUNDLE)
    write("node_modules/scripted/dist/index.js", BUNDLE)
    expect(declaresClass(page, "own-card")).toBe(true)
    expect(declaresClass(page, "value")).toBe(false)
  })
})

describe("the oracle on an @import cycle", () => {
  // Tailwind refuses the cycle, so the theme is unavailable, not wrong.
  test("answers instead of recursing forever", async () => {
    resetOracle()
    write("package.json", JSON.stringify({ private: true }))
    write("a.css", `@import "tailwindcss";\n@import "./b.css";\n`)
    write("b.css", `@import "./a.css";\n`)
    fs.mkdirSync(path.join(root, "node_modules"))
    fs.symlinkSync(
      path.dirname(
        createRequire(import.meta.url).resolve("tailwindcss/package.json")
      ),
      path.join(root, "node_modules/tailwindcss"),
      "dir"
    )
    const answer = await query(path.join(root, "a.css"), ["flex"])
    expect(answer.ok).toBe(false)
  })
})
