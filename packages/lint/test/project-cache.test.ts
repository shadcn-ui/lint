import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { componentsFor } from "../src/project/components"
import { resetFsMemo } from "../src/project/fs"
import {
  colorTokensFor,
  spacingBaseFor,
  themeFileFor,
} from "../src/project/theme"
import { clearWrapperCache, wrapperTargetOf } from "../src/project/wrappers"
import {
  oracleAvailable,
  resetOracleMemo,
  stopOracleForTests,
  unknownClasses,
} from "../src/tailwind/client"
import { PAGE, PROJECT } from "./helpers"

const directories = new Set<string>()

function createProject() {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "lint-cache-"))
  )
  directories.add(root)
  const write = (name: string, source: string) => {
    const file = path.join(root, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, source)
    return file
  }
  write("package.json", JSON.stringify({ private: true }))
  write(
    "components.json",
    JSON.stringify({
      aliases: { ui: "@/components/ui" },
      tailwind: { css: "theme.css" },
    })
  )
  const button = write(
    "components/ui/button.tsx",
    "export function Button(props) { return <button {...props} /> }"
  )
  return { root, write, button, page: path.join(root, "page.tsx") }
}

afterEach(() => {
  vi.useRealTimers()
  clearWrapperCache()
  resetFsMemo()
  for (const dir of directories)
    fs.rmSync(dir, { recursive: true, force: true })
  directories.clear()
})

describe("incomplete project caches", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }))

  test("derived spacing refreshes after theme edits, including a removed unit", () => {
    const { write, page } = createProject()
    for (const [declaration, expected] of [
      ["--spacing: 2px", 2],
      ["--spacing: initial", null],
      ["--spacing: var(--grid); --grid: 6px", 6],
      ["--*: initial", null],
    ] as const) {
      vi.setSystemTime(Date.now() + 1500)
      const file = write("theme.css", `@theme { ${declaration}; }`)
      fs.utimesSync(file, new Date(Date.now()), new Date(Date.now()))
      expect(spacingBaseFor(page)).toBe(expected)
      expect(spacingBaseFor(page)).toBe(expected)
    }
  })

  test("warm wrapper chains refresh when a named barrel redirects", () => {
    const { write, button } = createProject()
    const input = write(
      "components/ui/input.tsx",
      "export function Input(props) { return <input {...props} /> }"
    )
    const barrel = write(
      "components/controls.ts",
      'export { Button as Control } from "./ui/button"'
    )
    const inner = write(
      "components/inner.tsx",
      'import { Control } from "./controls"; export function Inner(props) { return <Control {...props} /> }'
    )
    const outer = write(
      "components/outer.tsx",
      'import { Inner } from "./inner"; export function Outer(props) { return <Inner {...props} /> }'
    )
    expect(wrapperTargetOf(outer, "Outer")).toEqual({
      component: "Button",
      file: button,
    })
    expect(wrapperTargetOf(inner, "Inner")).toEqual({
      component: "Button",
      file: button,
    })

    vi.setSystemTime(Date.now() + 1500)
    fs.writeFileSync(barrel, 'export { Input as Control } from "./ui/input"')
    fs.utimesSync(barrel, new Date(Date.now()), new Date(Date.now()))
    expect(wrapperTargetOf(inner, "Inner")).toEqual({
      component: "Input",
      file: input,
    })
    expect(wrapperTargetOf(outer, "Outer")).toEqual({
      component: "Input",
      file: input,
    })
  })

  test("a missing wrapper invalidates every ancestor when it appears", () => {
    const { root, write, button } = createProject()
    const outer = write(
      "components/outer.tsx",
      'import { Middle } from "./middle"\nexport function Outer(props) { return <Middle {...props} /> }'
    )
    const middle = write(
      "components/middle.tsx",
      'import { Inner } from "./inner"\nexport function Middle(props) { return <Inner {...props} /> }'
    )
    const innerSource =
      'import { Button } from "./ui/button"\nexport function Inner(props) { return <Button {...props} /> }'
    const target = { component: "Button", file: button }

    expect(wrapperTargetOf(outer, "Outer")).toBeNull()
    write("components/inner.tsx", innerSource)
    vi.setSystemTime(Date.now() + 1500)
    expect(wrapperTargetOf(middle, "Middle")).toEqual(target)
    expect(wrapperTargetOf(outer, "Outer")).toEqual(target)

    fs.unlinkSync(path.join(root, "components/inner.tsx"))
    vi.setSystemTime(Date.now() + 1500)
    expect(wrapperTargetOf(outer, "Outer")).toBeNull()
    write("components/inner.tsx", innerSource)
    vi.setSystemTime(Date.now() + 1500)
    expect(wrapperTargetOf(outer, "Outer")).toEqual(target)
  })

  test.each([
    ["./tokens.css", "tokens.css"],
    ["./tokens", "tokens.css"],
    ["./tokens", "tokens/index.css"],
    ["@/tokens", "tokens.css"],
  ])("a missing stylesheet %s resolves when %s appears", (spec, name) => {
    const { root, write, page } = createProject()
    write(
      "theme.css",
      `@import "tailwindcss"; @import "${spec}"; @theme { --color-primary: black; }`
    )
    expect(colorTokensFor(page)).toEqual(new Set(["primary"]))

    write(name, "@theme { --color-brand: red; }")
    vi.setSystemTime(Date.now() + 1500)
    expect(colorTokensFor(page)).toEqual(new Set(["brand", "primary"]))

    fs.unlinkSync(path.join(root, name))
    vi.setSystemTime(Date.now() + 1500)
    expect(colorTokensFor(page)).toEqual(new Set(["primary"]))
    write(name, "@theme { --color-accent: blue; }")
    vi.setSystemTime(Date.now() + 1500)
    expect(colorTokensFor(page)).toEqual(new Set(["accent", "primary"]))
  })

  test("an unresolved stylesheet is retried after its alias is configured", () => {
    const { write, page } = createProject()
    write(
      "theme.css",
      '@import "tailwindcss"; @import "#tokens"; @theme { --color-primary: black; }'
    )
    expect(colorTokensFor(page)).toEqual(new Set(["primary"]))
    write("tokens.css", "@theme { --color-brand: red; }")
    const manifest = write(
      "package.json",
      JSON.stringify({ private: true, imports: { "#tokens": "./tokens.css" } })
    )
    // Two writes in one timestamp tick keep the old mtime, and the
    // package.json cache would still be the manifest from before imports.
    vi.setSystemTime(Date.now() + 1500)
    fs.utimesSync(manifest, new Date(), new Date())
    expect(colorTokensFor(page)).toEqual(new Set(["brand", "primary"]))
  })

  test("theme discovery still chooses the stylesheet importing Tailwind", () => {
    const { root, write, page } = createProject()
    fs.unlinkSync(path.join(root, "components.json"))
    write(
      "tokens.css",
      "@theme { --color-one: red; --color-two: blue; --color-three: green; }"
    )
    const main = write("src/main.css", '@import "tailwindcss";')
    expect(themeFileFor(page)).toBe(main)
  })
})

test("touching a plugin entry refreshes its native worker dependencies", async () => {
  const { root, write } = createProject()
  fs.symlinkSync(
    path.resolve(__dirname, "../node_modules"),
    path.join(root, "node_modules"),
    "junction"
  )
  const css = write(
    "theme.css",
    '@import "tailwindcss"; @plugin "./plugin.mjs";'
  )
  const entry = write(
    "plugin.mjs",
    'import utilities from "./utilities.mjs"\nexport default ({ addUtilities }) => addUtilities(utilities)'
  )
  write(
    "utilities.mjs",
    'export default { ".plugin-old": { display: "grid" } }'
  )
  const candidates = ["plugin-old", "plugin-new"]
  expect(unknownClasses(css, candidates)?.map((entry) => entry.token)).toEqual([
    "plugin-new",
  ])

  write(
    "utilities.mjs",
    'export default { ".plugin-new": { display: "grid" } }'
  )
  fs.appendFileSync(entry, "\n// Reload the imported utilities.\n")
  await new Promise((resolve) => setTimeout(resolve, 1200))
  expect(unknownClasses(css, candidates)?.map((entry) => entry.token)).toEqual([
    "plugin-old",
  ])
})

describe("caches see files appear and disappear", () => {
  test("a new ui file joins the index", () => {
    const file = path.join(PROJECT, "components/ui/tmp-new-control.tsx")
    try {
      vi.useFakeTimers({ toFake: ["Date"] })
      expect(componentsFor(PAGE).has("TmpNewControl")).toBe(false)
      fs.writeFileSync(
        file,
        `export function TmpNewControl() { return null }\n`
      )
      vi.setSystemTime(Date.now() + 1500)
      expect(componentsFor(PAGE).has("TmpNewControl")).toBe(true)
      fs.unlinkSync(file)
      vi.setSystemTime(Date.now() + 1500)
      expect(componentsFor(PAGE).has("TmpNewControl")).toBe(false)
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file)
    }
  })

  test("a deleted theme is missed and a recreated one is read", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "theme-cycle-"))
    fs.mkdirSync(path.join(dir, "app"))
    fs.writeFileSync(
      path.join(dir, "package.json"),
      `{ "name": "cycle", "private": true }`
    )
    fs.writeFileSync(
      path.join(dir, "components.json"),
      `{ "aliases": { "ui": "@/components/ui" }, "tailwind": { "css": "app/globals.css" } }`
    )
    const css = path.join(dir, "app/globals.css")
    const page = path.join(dir, "app/page.tsx")
    const theme = `@import "tailwindcss";\n@theme { --color-brand: black; }\n`
    try {
      vi.useFakeTimers({ toFake: ["Date"] })
      fs.writeFileSync(css, theme)
      expect(colorTokensFor(page)).toEqual(new Set(["brand"]))
      fs.unlinkSync(css)
      vi.setSystemTime(Date.now() + 1500)
      expect(colorTokensFor(page)).toBeNull()
      fs.writeFileSync(css, theme)
      vi.setSystemTime(Date.now() + 1500)
      expect(colorTokensFor(page)).toEqual(new Set(["brand"]))
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe.skipIf(!oracleAvailable())(
  "a replaced worker forgets nothing it should remember",
  () => {
    test("answers survive a worker restart without stale memos", () => {
      const css = path.join(PROJECT, "app/globals.css")
      resetOracleMemo()
      const before = unknownClasses(css, ["flex-cols", "flex"])
      expect(before?.map((u) => u.token)).toEqual(["flex-cols"])
      stopOracleForTests()
      const after = unknownClasses(css, ["flex-cols", "flex"])
      expect(after?.map((u) => u.token)).toEqual(["flex-cols"])
      expect(after?.[0].suggestion).toBe("flex-col")
    })
  }
)
