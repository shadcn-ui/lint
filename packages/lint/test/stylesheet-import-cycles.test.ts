// A theme's @import graph comes from the repository being linted: a
// cycle or a fan-out ends the read, and what was read still counts.

import * as fs from "node:fs"
import { createRequire } from "node:module"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { resetFsMemo } from "../src/project/fs"
import { colorTokensFor, knownClassesFor } from "../src/project/theme"
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
