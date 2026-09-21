import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, test } from "vitest"

import { categoryOf } from "../src/grammar/categories"
import {
  BUNDLED_CN,
  classifierFor,
  groupOf,
  resolveCnConfig,
} from "../src/grammar/classifier"
import {
  animationGroupFor,
  projectClassifierFor,
} from "../src/project/namespaces"
import { resetWarnings, setWarningSink } from "../src/project/warn"

describe("animate values, from cn's grammar", () => {
  test.each(["animate-spin", "animate-none", "hover:animate-pulse"])(
    "%s classifies as animate (motion)",
    (token) => {
      expect(groupOf(token)).toBe("animate")
      expect(categoryOf(groupOf(token))).toBe("motion")
    }
  )
})

// cn groups only Tailwind's own animations, so a project's animation is
// read from its CSS. These hold whichever cn grammar is installed.
describe("animate values, from the project's CSS", () => {
  const PAGE = path.join(__dirname, "fixtures/namespace-theme/app/page.tsx")

  test.each([
    "animate-shimmer",
    "animate-in",
    "data-[state=open]:animate-in",
    "animate-in!",
    "animate-duration-500",
  ])("%s classifies as animate (motion)", (token) => {
    expect(animationGroupFor(PAGE, token)).toBe("animate")
    const group = projectClassifierFor(PAGE).groupOf(token)
    expect(group).toBe("animate")
    expect(categoryOf(group)).toBe("motion")
  })

  test.each(["animate-wiggle", "animate-[spin_1s]", "fade-in", "text-sm"])(
    "%s is not a project animation",
    (token) => {
      expect(animationGroupFor(PAGE, token)).toBeNull()
    }
  )

  test("no file means no project to read", () => {
    expect(animationGroupFor(undefined, "animate-shimmer")).toBeNull()
  })
})

describe("resolveCnConfig", () => {
  test("falls back to the bundled config where cn is not installed", () => {
    const config = resolveCnConfig("/nonexistent/project/app/page.tsx")
    expect(Object.keys(config.classGroups).length).toBeGreaterThan(300)
  })

  test("resolves the installed cn from the linted file upward", () => {
    const fromFile = path.join(__dirname, "fixtures/registry-corpus.json")
    const config = resolveCnConfig(fromFile)
    expect(Object.keys(config.classGroups).length).toBeGreaterThan(300)
    // The workspace cn is the bundled version, so its grammar is used as is.
    expect(config.classGroups["contain-size"]).toBeDefined()
  })

  test("BUNDLED_CN is the cn this package depends on", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../package.json"), "utf8")
    ) as { dependencies: Record<string, string> }
    expect(pkg.dependencies.cn.replace(/^[\^~]/, "")).toBe(BUNDLED_CN)
  })

  // A fake cn at a chosen version: package.json plus a config.js that
  // `require("cn/config")` resolves without an exports map.
  function projectWithCn(version: string) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "shadcn-lint-cn-"))
    const pkg = path.join(root, "node_modules/cn")
    fs.mkdirSync(pkg, { recursive: true })
    fs.writeFileSync(
      path.join(pkg, "package.json"),
      JSON.stringify({ name: "cn", version })
    )
    fs.writeFileSync(
      path.join(pkg, "config.js"),
      `module.exports = { defaultConfig: () => ({ classGroups: { "from-this-cn": ["x"] }, theme: {}, conflictingClassGroups: {}, conflictingClassGroupModifiers: {}, orderSensitiveModifiers: [] }) }`
    )
    return path.join(root, "app/page.tsx")
  }

  const warnings: string[] = []
  setWarningSink((m) => warnings.push(m))
  afterEach(() => {
    warnings.length = 0
    resetWarnings()
  })

  test("uses the project's cn when it is at least the bundled version", () => {
    const config = resolveCnConfig(projectWithCn(BUNDLED_CN))
    expect(config.classGroups["from-this-cn"]).toBeDefined()
    expect(warnings).toEqual([])
  })

  test("an older project cn falls back to the bundled grammar, with one warning", () => {
    const file = projectWithCn("0.2.2")
    const config = resolveCnConfig(file)
    expect(config.classGroups["from-this-cn"]).toBeUndefined()
    expect(config.classGroups["contain-size"]).toBeDefined()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("cn is 0.2.2")
    expect(warnings[0]).toContain(`bundled cn ${BUNDLED_CN}`)
    // Another file in the same project shares the decision and the warning.
    resolveCnConfig(path.join(path.dirname(file), "other.tsx"))
    expect(warnings).toHaveLength(1)
  })

  test("one classifier per resolved config", () => {
    const a = classifierFor("/nonexistent/one/page.tsx")
    const b = classifierFor("/nonexistent/two/page.tsx")
    // Both fall back to the same bundled config object, so they share.
    expect(a).toBe(b)
  })
})
