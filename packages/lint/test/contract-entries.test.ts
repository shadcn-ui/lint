// A contract entry that matches nothing enforces nothing. A bare word one
// slip away from a category or class group is a configuration error with
// a suggestion; any other literal nothing knows warns once and matches a
// class named exactly that; everything the grammar, the project's CSS
// or its Tailwind build knows passes silently. The vocabulary rules'
// `allow` option keeps accepting custom class names.

import * as path from "node:path"
import { afterEach, describe, expect, test } from "vitest"

import { resetWarnings, setWarningSink } from "../src/project/warn"
import { compileContracts, createMatcher } from "../src/rules/contracts"
import { noRestyle } from "../src/rules/no-restyle"
import { oracleAvailable } from "../src/tailwind/client"
import { button, createTester, PAGE } from "./helpers"

const PLUGIN_PAGE = path.join(__dirname, "fixtures/plugin-theme/app/page.tsx")
const BROKEN_PAGE = path.join(__dirname, "fixtures/broken-theme/app/page.tsx")

const warnings: string[] = []
setWarningSink((m) => warnings.push(m))
afterEach(() => {
  warnings.length = 0
  resetWarnings()
})

// Entries are checked before the deny-without-allow finding, so a deny
// under test gets an allow to subtract from.
const compile = (entries: Record<string, string[]>) =>
  compileContracts([{ pattern: "^Button$", allow: ["layout"], ...entries }], {
    fromFile: PAGE,
  })

describe("deny without allow", () => {
  test("is a denylist: everything else passes", () => {
    const top = compileContracts([], { deny: ["w-*"], fromFile: PAGE })
    expect(top.decide("Button", "w-full").kind).toBe("denied")
    for (const token of ["mt-4", "text-lg", "bg-primary"]) {
      expect(top.decide("Button", token)).toEqual({ kind: "ok" })
    }
    // A contract without allow keeps the top-level list and subtracts.
    const contract = compileContracts(
      [{ pattern: "^Button$", deny: ["w-*"] }],
      { allow: ["layout"], fromFile: PAGE }
    )
    expect(contract.decide("Button", "w-full").kind).toBe("denied")
    expect(contract.decide("Button", "mt-4")).toEqual({ kind: "ok" })
    expect(contract.decide("Button", "text-lg").kind).toBe("not-allowed")
    // A typo is still an error.
    expect(() =>
      compileContracts([{ pattern: "^Button$", deny: ["spacig"] }], {
        fromFile: PAGE,
      })
    ).toThrow(/Did you mean "spacing"/)
  })
})

describe("contract entries", () => {
  test("a misspelled category is an error with a suggestion", () => {
    expect(() => compile({ deny: ["spacig"] })).toThrow(
      /"spacig".*Did you mean "spacing"\?/
    )
    expect(() => compile({ allow: ["colour"] })).toThrow(
      /Did you mean "color"\?/
    )
    // The rule's top-level policy is checked the same way.
    expect(() =>
      compileContracts([], { allow: ["typograhpy"], fromFile: PAGE })
    ).toThrow(/Did you mean "typography"\?/)
    expect(warnings).toEqual([])
  })

  test("a misspelled class group is an error with a suggestion", () => {
    expect(() => compile({ deny: ["roundd"] })).toThrow(
      /Did you mean "rounded"\?/
    )
    expect(warnings).toEqual([])
  })

  test("a bare word nothing knows warns, listing what an entry can be", () => {
    compile({ deny: ["margin"] })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(
      /"margin" is not a category \(color, typography, spacing, shape, effects, motion, layout\), a class group, or a class/
    )
    expect(warnings[0]).toContain("matches only a class named exactly that")
  })

  test("an unknown hyphenated literal warns once and compiles", () => {
    // bg-colour is a color class to the grammar (theme color names are
    // open) and is no-raw-colors' business; flex-cols is nobody's class.
    compile({ deny: ["flex-cols"] })
    compileContracts([], { allow: ["flex-cols"], fromFile: PAGE })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('"flex-cols"')
  })

  test("a project's own @utility is a class", () => {
    expect(() => compile({ allow: ["tap-target"] })).not.toThrow()
    expect(warnings).toEqual([])
  })

  test.each([
    ["layout"],
    ["spacing", "color"],
    ["m", "mt", "bg-color", "rounded", "font-family"],
    ["p-4", "rounded-full", "flex", "sr-only"],
    ["p-*", "w-*", "md:p-*", "hover:!p-0"],
  ])("%j passes without a word", (...entries) => {
    expect(() => compile({ deny: entries })).not.toThrow()
    expect(warnings).toEqual([])
  })

  test("the vocabulary rules' allow keeps accepting custom class names", () => {
    expect(() => createMatcher(["toaster"], PAGE)).not.toThrow()
    expect(warnings).toEqual([])
  })
})

describe("a broken contract in the rule", () => {
  test("an invalid regex reports a configuration error in each file", () => {
    createTester().run("no-restyle", noRestyle as any, {
      valid: [],
      invalid: [PAGE, PAGE.replace("page.tsx", "other.tsx")].map(
        (filename) => ({
          filename,
          code: `${button}\nexport const A = () => <Button className="bg-red-500">Go</Button>`,
          options: [{ contracts: [{ pattern: "[" }] }],
          errors: [
            {
              line: 1,
              column: 1,
              message:
                'Contract pattern "[" is not a valid regular expression.',
            },
          ],
        })
      ),
    })
  })

  test("a misspelled entry is reported once at the top of the file, and the rule pauses", () => {
    createTester().run("no-restyle", noRestyle as any, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          // Would be a finding under a working contract; not reported here.
          code: `${button}\nexport const A = () => <Button className="bg-red-500">Go</Button>`,
          options: [{ contracts: [{ pattern: ".*", deny: ["layouts"] }] }],
          errors: [
            {
              line: 1,
              column: 1,
              message:
                /Contract entry "layouts" is not a category .*Did you mean "layout"\?/,
            },
          ],
        },
      ],
    })
    expect(warnings).toEqual([])
  })
})

describe("a plugin's one-word class", () => {
  test("is allowed by name with a warning, and then matches", () => {
    const contracts = compileContracts(
      [{ pattern: "^Button$", allow: ["prose"] }],
      { fromFile: PAGE }
    )
    expect(contracts.decide("Button", "prose")).toEqual({ kind: "ok" })
    expect(contracts.decide("Button", "prose-sm").kind).toBe("not-allowed")
    expect(contracts.decide("Button", "md:prose")).toEqual({ kind: "ok" })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('"prose"')
  })

  test("the rule lets it through", () => {
    createTester().run("no-restyle", noRestyle as any, {
      valid: [
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="prose">Go</Button>`,
          options: [{ contracts: [{ pattern: "^Button$", allow: ["prose"] }] }],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="btn">Go</Button>`,
          options: [{ contracts: [{ pattern: "^Button$", allow: ["prose"] }] }],
          errors: [{ message: /"btn"/ }],
        },
      ],
    })
  })

  // The theme's Tailwind build answers for plugin output, which no CSS
  // declares (#135).
  test.skipIf(!oracleAvailable())(
    "is known without a word when the theme's plugin generates it",
    () => {
      const contracts = compileContracts(
        [
          {
            pattern: "^Article$",
            allow: ["layout", "prose", "prose-undeclared"],
          },
        ],
        { fromFile: PLUGIN_PAGE }
      )
      expect(contracts.decide("Article", "prose")).toEqual({ kind: "ok" })
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('"prose-undeclared"')
    }
  )

  // A build that cannot load must not accept entries silently.
  test("still warns when the theme's build fails", () => {
    const contracts = compileContracts(
      [{ pattern: "^Article$", allow: ["prose"] }],
      { fromFile: BROKEN_PAGE }
    )
    expect(contracts.decide("Article", "prose")).toEqual({ kind: "ok" })
    expect(warnings.some((w) => w.includes('Contract entry "prose"'))).toBe(
      true
    )
  })
})

describe("a fraction is a value, an opacity is a modifier", () => {
  test("w-1/2 allows w-1/2 and nothing wider", () => {
    const top = compileContracts([], { allow: ["w-1/2"], fromFile: PAGE })
    expect(top.decide("Button", "w-1/2")).toEqual({ kind: "ok" })
    expect(top.decide("Button", "md:w-1/2")).toEqual({ kind: "ok" })
    expect(top.decide("Button", "w-1").kind).toBe("not-allowed")
    expect(top.decide("Button", "w-1/3").kind).toBe("not-allowed")
    expect(top.decide("Button", "w-1/20").kind).toBe("not-allowed")
    // A color keeps covering its opacities.
    const color = compileContracts([], {
      allow: ["bg-red-500/50", "bg-primary"],
      fromFile: PAGE,
    })
    expect(color.decide("Button", "bg-red-500")).toEqual({ kind: "ok" })
    expect(color.decide("Button", "bg-red-500/80")).toEqual({ kind: "ok" })
    expect(color.decide("Button", "bg-primary/50")).toEqual({ kind: "ok" })
    expect(warnings).toEqual([])
  })

  test("the standalone matcher agrees", () => {
    const matches = createMatcher(["w-1/2", "aspect-16/9"], PAGE)
    expect(matches("w-1/2")).toBe(true)
    expect(matches("w-1")).toBe(false)
    expect(matches("aspect-16/9")).toBe(true)
    expect(matches("aspect-16")).toBe(false)
  })
})
