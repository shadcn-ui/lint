import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { classifierFor, groupOf } from "../src/grammar/classifier"
import { componentsFor } from "../src/project/components"
import {
  findProject,
  projectFor,
  uiDirectory,
} from "../src/project/components-json"
import { definingFileOf, exportsOf } from "../src/project/modules"
import {
  readJsonc,
  resolveDirectory,
  resolveFile,
  tsconfigPaths,
} from "../src/project/resolve"
import {
  colorTokensFor,
  parseImports,
  themeFileFor,
} from "../src/project/theme"
import { resetWarnings, setWarningSink } from "../src/project/warn"
import { PROJECT } from "./helpers"

const FIXTURES = path.join(__dirname, "fixtures")
const NO_JSON = path.join(FIXTURES, "no-json")
const NO_JSON_PAGE = path.join(NO_JSON, "src/app/page.tsx")
const DS_BUTTON = path.join(NO_JSON, "src/ds/button.tsx")
const DS_INDEX = path.join(NO_JSON, "src/ds/index.ts")
const MONO = path.join(FIXTURES, "monorepo")
const WEB = path.join(MONO, "apps/web")
const ADMIN = path.join(MONO, "apps/admin")
const WEB_PAGE = path.join(WEB, "app/page.tsx")
const ADMIN_PAGE = path.join(ADMIN, "app/page.tsx")
const BROKEN_PAGE = path.join(MONO, "apps/broken/app/page.tsx")
const UI_COMPONENTS = path.join(MONO, "packages/ui/src/components")
const UI_BUTTON = path.join(UI_COMPONENTS, "button.tsx")

describe("resolve", () => {
  test("readJsonc tolerates comments and trailing commas", () => {
    expect(readJsonc(path.join(NO_JSON, "tsconfig.json"))).toEqual({
      compilerOptions: { paths: { "@/*": ["./src/*"] } },
    })
  })

  test("tsconfig paths, inherited entries resolved against their own file", () => {
    const entries = tsconfigPaths(WEB)
    expect(entries.map((e) => e.pattern)).toEqual(["@/*", "@workspace/ui/*"])
    expect(resolveDirectory("@workspace/ui/components", WEB, WEB)).toBe(
      UI_COMPONENTS
    )
    expect(resolveFile("@/app/globals.css", WEB, WEB)).toBe(
      path.join(WEB, "app/globals.css")
    )
  })

  test("package.json imports", () => {
    expect(resolveFile("#ds/button", NO_JSON, NO_JSON)).toBe(DS_BUTTON)
    expect(resolveFile("#ds", NO_JSON, NO_JSON)).toBe(DS_INDEX)
  })

  test("packages through their exports, past the node_modules symlink", () => {
    expect(resolveDirectory("@workspace/ui/components", ADMIN, ADMIN)).toBe(
      UI_COMPONENTS
    )
    expect(resolveFile("@workspace/ui/components/button", ADMIN, ADMIN)).toBe(
      UI_BUTTON
    )
    expect(
      resolveFile("@workspace/ui/globals.css", ADMIN, ADMIN, [".css"])
    ).toBe(path.join(MONO, "packages/ui/src/styles/globals.css"))
  })

  test("relative paths and the @/ convention", () => {
    expect(resolveFile("./ds", path.join(NO_JSON, "src"), NO_JSON)).toBe(
      DS_INDEX
    )
    expect(
      resolveFile("@/ds/button", path.join(NO_JSON, "src/app"), NO_JSON)
    ).toBe(DS_BUTTON)
    expect(resolveFile("@/nothing", NO_JSON, NO_JSON)).toBeNull()
  })
})

describe("modules", () => {
  test("follows barrels to the defining file", () => {
    const exports = exportsOf(DS_INDEX)
    expect(exports.get("Button")).toEqual({ file: DS_BUTTON, name: "Button" })
    expect(exports.get("buttonVariants")?.file).toBe(DS_BUTTON)
    expect(exports.get("CardBody")?.file).toBe(
      path.join(NO_JSON, "src/ds/card.tsx")
    )
  })

  test("definingFileOf through an import specifier", () => {
    expect(definingFileOf("@/ds", "Button", NO_JSON_PAGE)).toBe(DS_BUTTON)
    // An unknown name falls back to the module itself.
    expect(definingFileOf("@/ds", "Nope", NO_JSON_PAGE)).toBe(DS_INDEX)
    expect(definingFileOf("@/missing", "Button", NO_JSON_PAGE)).toBeNull()
  })
})

describe("project without components.json", () => {
  test("falls back to the package root", () => {
    expect(findProject(NO_JSON_PAGE)).toBeNull()
    const project = projectFor(NO_JSON_PAGE)!
    expect(project.file).toBeNull()
    expect(project.root).toBe(NO_JSON)
    expect(uiDirectory(project)).toBeNull()
  })

  test("discovers the theme with the most tokens and follows imports", () => {
    expect(themeFileFor(NO_JSON_PAGE)).toBe(
      path.join(NO_JSON, "src/styles.css")
    )
    const tokens = colorTokensFor(NO_JSON_PAGE)!
    expect([...tokens].sort()).toEqual([
      "accent",
      "accent-ink",
      "ink",
      "ink-muted",
      "line",
      "paper",
    ])
  })

  test("parseImports reads every @import form", () => {
    expect(
      parseImports(
        `@import "tailwindcss";\n@import url("./a.css") layer(base);\n@import './b.css';`
      )
    ).toEqual(["tailwindcss", "./a.css", "./b.css"])
  })
})

describe("monorepo", () => {
  afterEach(() => {
    resetWarnings()
    setWarningSink((message) => console.warn(message))
  })

  test("ui alias through tsconfig paths", () => {
    const project = findProject(WEB_PAGE)!
    expect(uiDirectory(project)).toBe(UI_COMPONENTS)
    expect(componentsFor(WEB_PAGE).files.get("Button")).toBe(UI_BUTTON)
  })

  test("ui alias through package exports", () => {
    expect(componentsFor(ADMIN_PAGE).files.get("Button")).toBe(UI_BUTTON)
  })

  // The ui package's own components.json names the package itself, the
  // way the official monorepo template does; from inside the package
  // there is no node_modules entry to find, only the package.json above.
  test("ui alias through the package's own name, from inside it", () => {
    const warnings: string[] = []
    setWarningSink((message) => warnings.push(message))
    const ui = path.join(MONO, "packages/ui")
    expect(
      resolveDirectory("@workspace/ui/components", UI_COMPONENTS, ui)
    ).toBe(UI_COMPONENTS)
    expect(componentsFor(UI_BUTTON).files.get("Button")).toBe(UI_BUTTON)
    expect(warnings).toEqual([])
  })

  test("theme through a workspace @import, not through tailwindcss itself", () => {
    const tokens = colorTokensFor(WEB_PAGE)!
    expect(tokens.has("brand")).toBe(true)
    expect(tokens.has("primary")).toBe(true)
    expect(tokens.has("red-500")).toBe(false)
  })

  test("an alias that resolves nowhere warns once and recognizes nothing", () => {
    const warnings: string[] = []
    setWarningSink((message) => warnings.push(message))
    expect(componentsFor(BROKEN_PAGE).has("Button")).toBe(false)
    componentsFor(BROKEN_PAGE)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("@nowhere/ui/components")
    expect(warnings[0]).toContain("componentImports")
  })
})

describe("resolution", () => {
  test("a tsconfig that extends a package resolves without recursing", () => {
    const entries = tsconfigPaths(ADMIN)
    expect(entries.map((e) => e.pattern)).toEqual(["@/*", "@workspace/ui/*"])
    expect(componentsFor(path.join(ADMIN, "app/page.tsx")).has("Button")).toBe(
      true
    )
  })

  test("a .js specifier resolves to the .tsx source", () => {
    expect(resolveFile("@/components/ui/button.js", PROJECT, PROJECT)).toBe(
      path.join(PROJECT, "components/ui/button.tsx")
    )
  })

  test("a barrel cycle resolves both ways and caches nothing partial", () => {
    const a = path.join(NO_JSON, "src/ds/cycle-a.ts")
    const b = path.join(NO_JSON, "src/ds/cycle-b.ts")
    expect(exportsOf(a).get("CycleB")?.file).toBe(b)
    expect(exportsOf(b).get("CycleA")?.file).toBe(a)
    expect(exportsOf(a).get("CycleA")?.file).toBe(a)
  })
})

describe("graceful degradation", () => {
  function captureWarnings() {
    const warnings: string[] = []
    setWarningSink((message) => warnings.push(message))
    return warnings
  }

  afterEach(() => {
    resetWarnings()
    setWarningSink((message) => console.warn(message))
  })

  test("a project cn the classifier cannot build falls back with a warning", () => {
    const warnings = captureWarnings()
    const file = path.join(FIXTURES, "bad-cn/app/page.tsx")
    expect(() => classifierFor(file)).not.toThrow()
    expect(groupOf("bg-primary", file)).toBe("bg-color")
    expect(warnings.some((w) => w.includes("isFutureThing"))).toBe(true)
  })

  test("a malformed components.json warns and falls back to the package root", () => {
    const warnings = captureWarnings()
    const project = projectFor(path.join(FIXTURES, "broken-json/app/page.tsx"))
    expect(project?.file).toBeNull()
    expect(warnings.some((w) => w.includes("could not be parsed"))).toBe(true)
  })
})

describe("components.json with bad aliases", () => {
  const dirs: string[] = []
  // A throwaway project whose components.json has the given aliases.
  function pageIn(aliases: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shadcn-lint-aliases-"))
    dirs.push(dir)
    fs.writeFileSync(path.join(dir, "package.json"), "{}")
    fs.writeFileSync(
      path.join(dir, "components.json"),
      `{ "aliases": ${aliases}, "tailwind": { "css": "app/globals.css" } }`
    )
    return path.join(dir, "app/page.tsx")
  }
  const warnings: string[] = []
  beforeEach(() => {
    warnings.length = 0
    setWarningSink((message) => warnings.push(message))
  })
  afterEach(() => {
    resetWarnings()
    setWarningSink((message) => console.warn(message))
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true })
  })

  test("a non-string ui alias is ignored with a warning, not thrown", () => {
    const project = projectFor(pageIn(`{ "ui": true, "components": "@/c" }`))!
    expect(project.file).not.toBeNull()
    expect(project.aliases).toEqual({ components: "@/c" })
    expect(() => uiDirectory(project)).not.toThrow()
    expect(warnings.some((w) => w.includes("aliases.ui"))).toBe(true)
  })

  test("a non-string components alias is ignored, not coerced", () => {
    const project = projectFor(pageIn(`{ "components": 1 }`))!
    expect(project.aliases).toEqual({})
    expect(() => uiDirectory(project)).not.toThrow()
    expect(warnings.some((w) => w.includes("aliases.components"))).toBe(true)
  })

  test.each([
    ["an array", "[]"],
    ["a string", '"x"'],
  ])("aliases that is %s is ignored with one warning", (_, aliases) => {
    const page = pageIn(aliases)
    const project = projectFor(page)!
    expect(project.file).not.toBeNull()
    expect(project.aliases).toEqual({})
    expect(() => uiDirectory(project)).not.toThrow()
    uiDirectory(project)
    expect(warnings.filter((w) => w.includes("not an object"))).toHaveLength(1)
  })
})
