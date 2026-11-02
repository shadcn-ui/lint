// settings.shadcn: recognition options written once for every rule, and
// `ui`, an import prefix like components.json's aliases.ui for projects
// without that file. A rule's own option wins over the setting. Plus the
// `allow` validation on the color and value rules: an entry that could
// match nothing is a configuration finding on line 1, not silence.

import * as path from "node:path"
import parser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { plugin } from "../src/index"
import { resetWarnings, setWarningSink } from "../src/project/warn"
import { PAGE, PROJECT } from "./helpers"

const NO_JSON = path.join(__dirname, "fixtures/no-json")
const NO_JSON_PAGE = path.join(NO_JSON, "src/app/page.tsx")

const warnings: string[] = []
beforeEach(() => {
  warnings.length = 0
  resetWarnings()
  setWarningSink((m) => warnings.push(m))
})
afterEach(() => setWarningSink((m) => console.warn(m)))

function lint(
  cwd: string,
  filename: string,
  code: string,
  rules: Record<string, unknown>,
  settings?: object
) {
  return new Linter({ cwd })
    .verify(
      code,
      [
        {
          files: ["**/*.tsx"],
          languageOptions: {
            parser,
            parserOptions: { ecmaFeatures: { jsx: true } },
          },
          plugins: { shadcn: plugin },
          ...(settings ? { settings } : {}),
          rules,
        },
      ] as any,
      { filename }
    )
    .map(({ ruleId, line, message }) => ({ ruleId, line, message }))
}

const restyle = `import { Button } from "@/ds"\nexport const A = () => <Button className="bg-highlight">Go</Button>`
const rules = {
  "shadcn/no-restyle": "error",
  "shadcn/require-static-classes": "error",
}

describe("settings.shadcn.ui", () => {
  test("without it, a project with no components.json recognizes nothing", () => {
    expect(lint(NO_JSON, NO_JSON_PAGE, restyle, rules)).toEqual([])
  })

  test("a prefix makes every rule recognize the design system", () => {
    const found = lint(NO_JSON, NO_JSON_PAGE, restyle, rules, {
      shadcn: { ui: "@/ds" },
    })
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ ruleId: "shadcn/no-restyle", line: 2 })
    expect(found[0].message).toContain("is not allowed on <Button>")

    const dynamic = `import { Button } from "@/ds/button"\nexport const A = ({ c }: { c: string }) => <Button className={c}>Go</Button>`
    expect(
      lint(NO_JSON, NO_JSON_PAGE, dynamic, rules, { shadcn: { ui: ["@/ds"] } })
    ).toMatchObject([{ ruleId: "shadcn/require-static-classes", line: 2 }])
  })

  test("the prefix is literal, not a regex, and matches whole segments", () => {
    const other = `import { Button } from "@/dsx"\nexport const A = () => <Button className="bg-highlight">Go</Button>`
    expect(
      lint(NO_JSON, NO_JSON_PAGE, other, rules, { shadcn: { ui: "@/ds" } })
    ).toEqual([])
  })

  test("follows the app's own barrel back to a component it names", () => {
    // src/components re-exports the ds button. The barrel's source matches
    // no prefix; the file it resolves to is what the setting names.
    const barrel = `import { Button } from "@/components"\nexport const A = () => <Button className="bg-highlight">Go</Button>`
    expect(lint(NO_JSON, NO_JSON_PAGE, barrel, rules)).toEqual([])
    const found = lint(NO_JSON, NO_JSON_PAGE, barrel, rules, {
      shadcn: { ui: "@/ds" },
    })
    expect(found).toMatchObject([{ ruleId: "shadcn/no-restyle", line: 2 }])
    expect(found[0].message).toContain("is not allowed on <Button>")

    // So does a wrapper in the app that renders it through the barrel.
    const wrapped = `import { SaveButton } from "@/components/save-button"\nexport const A = () => <SaveButton className="bg-highlight">Go</SaveButton>`
    expect(lint(NO_JSON, NO_JSON_PAGE, wrapped, rules)).toEqual([])
    expect(
      lint(NO_JSON, NO_JSON_PAGE, wrapped, rules, { shadcn: { ui: "@/ds" } })
    ).toMatchObject([{ ruleId: "shadcn/no-restyle", line: 2 }])

    // The same name from a file outside the ui directory is not one.
    const lookalike = `import { Button } from "@/lookalike"\nexport const A = () => <Button className="bg-highlight">Go</Button>`
    expect(
      lint(NO_JSON, NO_JSON_PAGE, lookalike, rules, { shadcn: { ui: "@/ds" } })
    ).toEqual([])
  })

  test("a spacing message lists the components it names", () => {
    const spacing = `import { Button } from "@/ds"\nexport const A = () => <Button className="p-4">Go</Button>`
    const found = lint(
      NO_JSON,
      NO_JSON_PAGE,
      spacing,
      {
        "shadcn/no-restyle": [
          "error",
          {
            allow: ["layout"],
            contracts: [{ pattern: "^Car.$", allow: ["spacing"] }],
          },
        ],
      },
      { shadcn: { ui: "@/ds" } }
    )
    expect(found).toHaveLength(1)
    expect(found[0].message).toMatch(/, or Card for space around it\./)
  })

  test("adds to a rule's own patterns instead of replacing them", () => {
    const found = lint(
      NO_JSON,
      NO_JSON_PAGE,
      restyle,
      {
        "shadcn/no-restyle": ["error", { componentImports: ["^nothing$"] }],
      },
      { shadcn: { ui: "@/ds" } }
    )
    expect(found).toHaveLength(1)
  })

  test("a wrong type warns once and is ignored", () => {
    expect(
      lint(NO_JSON, NO_JSON_PAGE, restyle, rules, { shadcn: { ui: 42 } })
    ).toEqual([])
    expect(warnings).toEqual([
      "[@shadcn/lint] settings.shadcn.ui must be a string or an array of strings; it is ignored.",
    ])
  })
})

describe("settings.shadcn as shared defaults", () => {
  test("componentImports applies to every rule", () => {
    const settings = { shadcn: { componentImports: ["^@/ds(/|$)"] } }
    expect(lint(NO_JSON, NO_JSON_PAGE, restyle, rules, settings)).toMatchObject(
      [{ ruleId: "shadcn/no-restyle" }]
    )
  })

  test("mergeFunctions from settings counts for readability, as the option does", () => {
    // An object handed to an unknown function is dynamic; handed to a
    // named helper it stays readable. The shared setting names helpers
    // the same way the rule's option does.
    const code = `import { Button } from "@/components/ui/button"\nimport { merge } from "./merge"\nconst o = { className: "bg-red-500" }\nmerge(o)\nexport const A = () => <Button {...o}>Go</Button>`
    const restyle = {
      "shadcn/no-restyle": ["error", { allow: ["layout"] }],
    }
    expect(lint(PROJECT, PAGE, code, restyle)).toEqual([])
    const viaOption = lint(PROJECT, PAGE, code, {
      "shadcn/no-restyle": [
        "error",
        { allow: ["layout"], mergeFunctions: ["merge"] },
      ],
    })
    const viaSetting = lint(PROJECT, PAGE, code, restyle, {
      shadcn: { mergeFunctions: ["merge"] },
    })
    expect(viaOption).toMatchObject([{ ruleId: "shadcn/no-restyle", line: 3 }])
    expect(viaSetting).toEqual(viaOption)
  })

  test("a rule's own option wins over the setting", () => {
    const settings = { shadcn: { componentImports: ["^@/ds(/|$)"] } }
    const found = lint(
      NO_JSON,
      NO_JSON_PAGE,
      restyle,
      {
        "shadcn/no-restyle": ["error", { componentImports: ["^nothing$"] }],
      },
      settings
    )
    expect(found).toEqual([])
  })

  test("ignoreImports from settings hides a package", () => {
    const code = `import { Button } from "@/components/ui/button"\nexport const A = () => <Button className="bg-red-500">Go</Button>`
    expect(
      lint(PROJECT, PAGE, code, { "shadcn/no-restyle": "error" })
    ).toHaveLength(1)
    expect(
      lint(
        PROJECT,
        PAGE,
        code,
        { "shadcn/no-restyle": "error" },
        { shadcn: { ignoreImports: ["^@/components/ui/"] } }
      )
    ).toEqual([])
  })
})

describe("allow validation", () => {
  const red = `export const A = () => <div className="bg-blue-500" />`

  test('"blue-500" names a color, not a class: a line-1 finding with the fix', () => {
    const found = lint(PROJECT, PAGE, red, {
      "shadcn/no-raw-colors": ["error", { allow: ["blue-500"] }],
    })
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ ruleId: "shadcn/no-raw-colors", line: 1 })
    expect(found[0].message).toContain(
      'allow entry "blue-500" names a color, not a class'
    )
    expect(found[0].message).toContain('"*-blue-500"')
  })

  test("a misspelled category is a line-1 finding with a suggestion", () => {
    const found = lint(
      PROJECT,
      PAGE,
      `export const A = () => <div className="p-[13px]" />`,
      {
        "shadcn/no-arbitrary-values": ["error", { allow: ["spacig"] }],
      }
    )
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      ruleId: "shadcn/no-arbitrary-values",
      line: 1,
    })
    expect(found[0].message).toContain("spacing")
  })

  test("well-formed entries lint normally", () => {
    for (const allow of [
      ["*-blue-500"],
      ["bg-blue-500"],
      ["color"],
      ["bg-*"],
    ]) {
      expect(
        lint(PROJECT, PAGE, red, {
          "shadcn/no-raw-colors": ["error", { allow }],
        })
      ).toEqual([])
    }
    expect(
      lint(
        PROJECT,
        PAGE,
        `export const A = () => <div className="w-[320px] p-[13px]" />`,
        {
          "shadcn/no-arbitrary-values": ["error", { allow: ["w-[320px]"] }],
        }
      )
    ).toMatchObject([{ line: 1, message: expect.stringContaining("p-[13px]") }])
  })

  test("a real class from the scale is not mistaken for a color", () => {
    const found = lint(PROJECT, PAGE, red, {
      "shadcn/no-raw-colors": ["error", { allow: ["opacity-50", "z-10"] }],
    })
    expect(found).toHaveLength(1)
    expect(found[0].message).not.toContain("allow entry")
  })

  test("no-unknown-classes keeps accepting bare custom names", () => {
    expect(
      lint(
        PROJECT,
        PAGE,
        `export const A = () => <div className="toaster" />`,
        {
          "shadcn/no-unknown-classes": ["error", { allow: ["toaster"] }],
        }
      )
    ).toEqual([])
  })
})
