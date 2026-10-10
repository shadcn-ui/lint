// The Tailwind oracle: the project's own Tailwind decides which
// classes generate CSS. Tested directly (async, no worker) here; the
// synchronous bridge is exercised by the no-unknown-classes rule tests.

import * as fs from "node:fs"
import Module, { createRequire } from "node:module"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, test, vi } from "vitest"

import { query, resetOracle, resolveStylesheet } from "../src/tailwind/oracle"
import { PROJECT } from "./helpers"

const CSS = path.join(PROJECT, "app/globals.css")

const LINKED = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/pnpm-linked/src/app.css"
)

const PATTERN = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/exports-pattern"
)

const temporary: string[] = []

afterAll(() => {
  for (const dir of temporary) fs.rmSync(dir, { recursive: true, force: true })
})

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shadcn-lint-"))
  temporary.push(root)
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), content)
  }
  const link = (target: string, file: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.symlinkSync(target, path.join(root, file), "dir")
  }
  write("apps/web/src/app.css", `@import "@acme/ui/styles.css";\n`)
  write("packages/ui/package.json", `{ "name": "@acme/ui" }\n`)
  write(
    "packages/ui/styles.css",
    `@import "tailwindcss";\n@utility kit-frame { display: flex; }\n`
  )
  link(path.join(root, "packages/ui"), "apps/web/node_modules/@acme/ui")
  const tailwind = path.dirname(
    createRequire(import.meta.url).resolve("tailwindcss/package.json")
  )
  link(tailwind, "packages/ui/node_modules/tailwindcss")
  return path.join(root, "apps/web/src/app.css")
}

describe("tailwind oracle", () => {
  test("knows the theme, @utility rules and every variant", async () => {
    resetOracle()
    const answer = await query(CSS, [
      "flex",
      "items-center",
      "bg-primary/90",
      "tap-target",
      "tab-4",
      "hover:bg-primary",
      "data-[state=open]:flex",
      "group-has-data-[collapsible=icon]:hidden",
      "**:data-[slot=card]:shadow-xs",
      "@xl/main:grid-cols-2",
      "not-disabled:hover:bg-accent",
      "[&_svg]:size-4",
      "-mt-2",
      "!p-0",
      "bg-(--brand)",
      // From a package that exports only a style condition.
      "shimmer",
      // Tailwind 3 names Tailwind 4 still generates, bare and scaled.
      "flex-grow",
      "flex-shrink-0",
      "flex-grow-2",
      "flex-grow-[3]",
      "overflow-ellipsis",
      "decoration-clone",
    ])
    expect(answer).toEqual({
      ok: true,
      generation: expect.any(Number),
      hasModules: false,
      unknown: [],
    })
  })

  test("names the misspelled utility or variant", async () => {
    const answer = await query(CSS, [
      "flex-cols",
      "itms-center",
      "md:grd",
      "hovr:flex",
      "foucs:ring-2",
      "hover:roundedd",
      "rounded-huge",
      "tablet:flex",
      "items-top",
    ])
    expect(answer.ok).toBe(true)
    if (!answer.ok) return
    expect(answer.unknown).toEqual([
      { token: "flex-cols", suggestion: "flex-col", baseKnown: false },
      { token: "itms-center", suggestion: "items-center", baseKnown: false },
      { token: "md:grd", suggestion: "md:grid", baseKnown: false },
      { token: "hovr:flex", suggestion: "hover:flex", baseKnown: true },
      { token: "foucs:ring-2", suggestion: "focus:ring-2", baseKnown: true },
      {
        token: "hover:roundedd",
        suggestion: "hover:rounded-md",
        baseKnown: false,
      },
      { token: "rounded-huge", suggestion: null, baseKnown: false },
      { token: "tablet:flex", suggestion: null, baseKnown: true },
      { token: "items-top", suggestion: null, baseKnown: false },
    ])
  })

  test("markers and CSS-only classes are the rule's to settle", async () => {
    const answer = await query(CSS, ["group", "peer/x", "legacy-card"])
    expect(answer.ok && answer.unknown.map((u) => u.token)).toEqual([
      "group",
      "peer/x",
      "legacy-card",
    ])
  })

  // A pnpm-linked package installs its own dependencies beside the real
  // file: an @import inside it resolves from there, not from the link.
  test("builds a theme importing a pnpm-linked package", async () => {
    resetOracle()
    const answer = await query(LINKED, ["kit-frame", "flex", "kit-frmae"])
    expect(answer.ok).toBe(true)
    if (!answer.ok) return
    expect(answer.unknown).toEqual([
      { token: "kit-frmae", suggestion: "kit-frame", baseKnown: false },
    ])
  })

  // A package can publish its CSS behind an exports pattern such as
  // "./*.css"; the theme importing it builds, so its tokens are known.
  test("builds a theme importing through an exports pattern", async () => {
    resetOracle()
    const answer = await query(path.join(PATTERN, "src/app.css"), [
      "p-card",
      "p-crad",
    ])
    expect(answer.ok).toBe(true)
    if (!answer.ok) return
    expect(answer.unknown).toEqual([
      { token: "p-crad", suggestion: "p-card", baseKnown: false },
    ])
  })

  // Only the UI package depends on Tailwind, so it is installed beside
  // that package and the app's stylesheet cannot resolve it. Built
  // outside the repository, where nothing above it or the working
  // directory has Tailwind either.
  test("finds Tailwind beside the stylesheet that imports it", async () => {
    resetOracle()
    const css = workspace()
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(path.dirname(css))
    // A pnpm bin shim puts the hoisted modules on NODE_PATH, which would
    // hide the bug; editors and Vite+ start the linter without one.
    const nodePath = process.env.NODE_PATH
    const paths = Module as unknown as { _initPaths(): void }
    delete process.env.NODE_PATH
    paths._initPaths()
    try {
      const answer = await query(css, ["kit-frame", "flex", "kit-frmae"])
      expect(answer.ok).toBe(true)
      if (!answer.ok) return
      expect(answer.unknown).toEqual([
        { token: "kit-frmae", suggestion: "kit-frame", baseKnown: false },
      ])
    } finally {
      cwd.mockRestore()
      if (nodePath !== undefined) process.env.NODE_PATH = nodePath
      paths._initPaths()
    }
  })

  // Tailwind loads @config and @plugin through jiti, so a config may
  // import without an extension and use TypeScript that type stripping
  // rejects. Native import() refuses both.
  test("loads @config modules the way Tailwind does", async () => {
    resetOracle()
    const root = fs.mkdtempSync(path.join(PROJECT, ".config-modules-"))
    temporary.push(root)
    fs.mkdirSync(path.join(root, "src"))
    fs.writeFileSync(path.join(root, "package.json"), `{ "type": "module" }\n`)
    fs.writeFileSync(
      path.join(root, "src/app.css"),
      `@import "tailwindcss";\n@config "../tailwind.config.ts";\n`
    )
    fs.writeFileSync(
      path.join(root, "tailwind.config.ts"),
      [
        `import { brand } from "./theme"`,
        `export default {`,
        `  theme: { extend: { colors: { brand } } },`,
        `  plugins: [`,
        `    ({ addUtilities }: { addUtilities: (u: object) => void }) =>`,
        `      addUtilities({ ".body-2": { "font-size": "14px" } }),`,
        `  ],`,
        `}`,
      ].join("\n")
    )
    const theme = path.join(root, "theme.ts")
    fs.writeFileSync(
      theme,
      `enum Brand { Blue = "#0af" }\nexport const brand = Brand.Blue\n`
    )
    const css = path.join(root, "src/app.css")
    const answer = await query(css, ["bg-brand", "body-2", "bg-brnd"])
    expect(answer.ok).toBe(true)
    if (!answer.ok) return
    expect(answer.unknown.map((entry) => entry.token)).toEqual(["bg-brnd"])

    // An edit to a module the config imports rebuilds the theme.
    fs.writeFileSync(theme, `export const brand = { 500: "#0af" }\n`)
    const future = new Date(Date.now() + 5000)
    fs.utimesSync(theme, future, future)
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const edited = await query(css, ["bg-brand-500", "bg-brand"])
    expect(edited.ok).toBe(true)
    if (!edited.ok) return
    expect(edited.unknown.map((entry) => entry.token)).toEqual(["bg-brand"])
  })

  test("a theme that cannot be read is unavailable, not wrong", async () => {
    const answer = await query("/nonexistent/app/globals.css", ["flex"])
    expect(answer.ok).toBe(false)
  })
})

describe("resolveStylesheet", () => {
  const app = path.join(PROJECT, "app")
  test("relative, tailwindcss, and style-only packages", () => {
    expect(resolveStylesheet(app, "./globals.css")).toBe(CSS)
    expect(resolveStylesheet(app, "./globals")).toBe(CSS)
    expect(resolveStylesheet(app, "tailwindcss")).toMatch(
      /tailwindcss[\\/]index\.css$/
    )
    expect(resolveStylesheet(app, "tailwindcss/theme.css")).toMatch(
      /theme\.css$/
    )
    expect(resolveStylesheet(app, "style-only")).toBe(
      path.join(PROJECT, "node_modules/style-only/styles/style-only.css")
    )
    expect(resolveStylesheet(app, "no-such-package")).toBeNull()
    expect(resolveStylesheet(app, "./missing.css")).toBeNull()
  })

  test("exports subpath patterns, longest key first", () => {
    const src = path.join(PATTERN, "src")
    const dist = path.join(PATTERN, "node_modules/demo-widgets/dist")
    expect(resolveStylesheet(src, "demo-widgets/styles.css")).toBe(
      path.join(dist, "styles.css")
    )
    expect(resolveStylesheet(src, "demo-widgets/themes/dark")).toBe(
      path.join(dist, "themes/dark.css")
    )
    expect(resolveStylesheet(src, "demo-widgets/missing.css")).toBeNull()
  })
})
