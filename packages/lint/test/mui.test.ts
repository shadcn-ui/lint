import fs from "node:fs"
import { fileURLToPath } from "node:url"
import parser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { describe, expect, test } from "vitest"

import mui from "../src/mui/index"
import { collectSx } from "../src/mui/sites"

const catalog = JSON.parse(
  fs.readFileSync(
    fileURLToPath(
      new URL("../../evals/benchmarks/mui-v1.json", import.meta.url)
    ),
    "utf8"
  )
)
const contracts = Object.entries(catalog.policy.governedComponents).map(
  ([component, policy]: [string, any]) => ({
    pattern: `^${component}$`,
    allow: policy.allowedProperties,
  })
)
const reviewed = JSON.parse(
  fs.readFileSync(
    new URL("../../evals/benchmarks/mui-review-cases.json", import.meta.url),
    "utf8"
  )
)
const settings = {
  mui: {
    guidance: Object.fromEntries(
      Object.entries(catalog.policy.governedComponents).map(
        ([component, policy]: [string, any]) => [component, policy.guidance]
      )
    ),
  },
}

function lint(
  source: string,
  restyle: any = { allow: ["*"], contracts },
  colors: any = {},
  shared: any = settings
) {
  return new Linter().verify(source, {
    languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { mui },
    settings: shared,
    rules: {
      "mui/no-restyle": ["error", restyle],
      "mui/no-raw-colors": ["error", colors],
    },
  })
}

function normalized(messages: any[], source: string) {
  const offset = (line: number, column: number) =>
    source
      .split("\n")
      .slice(0, line - 1)
      .reduce((sum, row) => sum + row.length + 1, 0) +
    column -
    1
  return messages
    .map((message) => {
      const match = message.message.match(
        /^"([^"]+)" (?:is not allowed in|in) <([^>]+)> sx/
      )
      expect(match, message.message).not.toBeNull()
      return {
        rule: message.ruleId,
        component: match![2],
        authoredProperty: match![1],
        sourceRange: [
          offset(message.line, message.column),
          offset(message.endLine, message.endColumn),
        ],
      }
    })
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

describe("MUI frozen catalog", () => {
  test("preserves exact CSS custom property policy keys and casing", () => {
    const source =
      'import { Tabs } from "@mui/material"; <Tabs sx={{ "--indicator-radius": "4px", "--Accent": "blue", width: 1 }} />'
    expect(
      lint(source, { allow: ["--indicator-radius", "--Accent", "width"] })
    ).toHaveLength(0)
    const denied = lint(source, { allow: ["*"], deny: ["--indicator-radius"] })
    expect(denied).toHaveLength(1)
    expect(denied[0].message).toContain('"--indicator-radius"')
    expect(
      lint(source, {
        allow: ["width"],
        contracts: [
          { pattern: "^Tabs$", allow: ["--*", "width"], deny: ["--Accent"] },
        ],
      })
    ).toHaveLength(1)
  })
  for (const example of [...catalog.cases, ...reviewed.cases].filter(
    (example: any) => example.label !== "unknown"
  )) {
    test(`${example.partition}: ${example.id}`, () => {
      const actual = normalized(lint(example.source), example.source)
      expect(actual).toEqual(
        [...example.expected.diagnostics].sort((a, b) =>
          JSON.stringify(a).localeCompare(JSON.stringify(b))
        )
      )
    })
  }
})

const button = 'import { Button } from "@mui/material";\n'
const box = 'import Box from "@mui/material/Box";\n'
const style = (sx: string) =>
  `${button}export const Subject = () => <Button sx={${sx}}>Save</Button>`

describe("MUI policy compatibility and aliases", () => {
  test("omitted, empty and deny-only allowances retain their distinct meanings", () => {
    expect(lint(style("{ p: 2 }"), {}).length).toBe(1)
    expect(lint(style("{ p: 2 }"), { deny: ["color"] })).toHaveLength(0)
    expect(
      lint(style("{ p: 2 }"), { allow: [], deny: ["color"] })
    ).toHaveLength(1)
    expect(lint(style("{ p: 2 }"), { deny: [] })).toHaveLength(0)
  })
  test("partial permission cannot authorize an alias; a denied affected side wins", () => {
    expect(lint(style("{ px: 2 }"), { allow: ["paddingLeft"] })).toHaveLength(1)
    expect(lint(style("{ px: 2 }"), { allow: ["padding"] })).toHaveLength(0)
    expect(
      lint(style("{ p: 2 }"), { allow: ["padding"], deny: ["paddingLeft"] })
    ).toHaveLength(1)
    expect(
      lint(style("{ padding: 2 }"), { allow: ["p"], deny: ["pl"] })
    ).toHaveLength(1)
  })
  test("last matching contract inherits only global keys", () => {
    const policy = {
      allow: ["margin"],
      deny: ["paddingLeft"],
      contracts: [
        { pattern: "Button", allow: ["padding"] },
        { pattern: "^Button$", message: "Use approved treatments." },
      ],
    }
    expect(
      lint(style("{ px: 2, m: 1 }"), policy).map((finding) => finding.message)
    ).toEqual(["Use approved treatments."])
  })
  test("contract and rule messages plus shared guidance/note stay scoped to MUI", () => {
    const shared = {
      mui: { note: "See DESIGN.md." },
      shadcn: { note: "Wrong namespace." },
    }
    expect(
      lint(
        style("{ p: 2 }"),
        {
          message: "{{component}} owns {{property}}.",
          contracts: [{ pattern: "Button", message: "" }],
        },
        {},
        shared
      )[0].message
    ).toBe("Button owns p. See DESIGN.md.")
    expect(lint(style("{ p: 2 }"))[0].message).toContain(
      "size: small, medium, large"
    )
  })
  test("a restyle exception cannot exempt literal colors", () => {
    expect(
      lint(style('{ color: "red" }'), { allow: ["*"] }).map(
        (finding) => finding.ruleId
      )
    ).toEqual(["mui/no-raw-colors"])
  })
  test("prototype-shaped keys cannot crash property normalization", () => {
    expect(lint(style("{ constructor: 1, toString: 2 }"))).toHaveLength(2)
    expect(lint(style("{ p: 2 }"), { allow: ["constructor"] })).toHaveLength(1)
  })
})

describe("MUI adversarial ownership and value flow", () => {
  test("shadows, providers, type-only bindings, unrelated imports and preview packages are not owners", () => {
    for (const source of [
      `${button}function Subject(Button: any) { return <Button sx={{ color: "red" }} /> }`,
      'import { ThemeProvider } from "@mui/material/styles"; export const Subject = () => <ThemeProvider sx={{ color: "red" }} />',
      'import type { Button } from "@mui/material"; export const Subject = () => <Button sx={{ color: "red" }} />',
      'import { Button } from "@mui/material-imposter"; export const Subject = () => <Button sx={{ color: "red" }} />',
      'import { Chat } from "@mui/x-chat"; export const Subject = () => <Chat sx={{ color: "red" }} />',
    ])
      expect(lint(source)).toHaveLength(0)
  })
  test("mutations and escapes cannot make const styles readable", () => {
    for (const escape of [
      'styles.color = "primary.main"',
      "delete styles.color",
      "styles.color++",
      'const alias = styles; alias.color = "primary.main"',
      "touch(styles)",
      "export { styles }",
    ]) {
      const source = `${box}declare function touch(value: any): void; const styles = { color: "red" }; ${escape}; export const Subject = () => <Box sx={styles} />`
      expect(lint(source)).toHaveLength(0)
      expect(collection(source).unknown).toBeGreaterThan(0)
    }
  })
  test("source order preserves overwrites and unresolved coverage", () => {
    expect(
      lint(
        `${box}export const Subject = () => <Box sx={{ color: "red", color: "primary.main" }} />`
      )
    ).toHaveLength(0)
    expect(
      lint(
        `${box}declare const external: any; export const Subject = () => <Box sx={{ color: "red", ...external }} />`
      )
    ).toHaveLength(0)
    expect(
      lint(
        `${box}declare const external: any; export const Subject = () => <Box sx={{ ...external, color: "red" }} />`
      )
    ).toHaveLength(1)
    expect(
      collection(
        `${box}declare const external: any; export const Subject = () => <Box sx={{ ...external, color: "red" }} />`
      ).unknown
    ).toBeGreaterThan(0)
  })
  test("unknown values still preserve known forbidden properties", () => {
    expect(lint(style("{ p: runtimeValue }"))).toHaveLength(1)
    expect(
      lint(style("{ color: runtimeValue }"), { allow: ["*"] })
    ).toHaveLength(0)
  })
  test("responsive values respect overwrites and proven literal spreads", () => {
    expect(
      lint(
        `${box}export const Subject = () => <Box sx={{ color: { xs: "red", xs: "primary.main" } }} />`
      )
    ).toHaveLength(0)
    expect(
      lint(
        `${box}export const Subject = () => <Box sx={{ color: { ...{ xs: "red" } } }} />`
      )
    ).toHaveLength(1)
    const source = `${box}declare const external: any; export const Subject = () => <Box sx={{ color: { xs: "red", ...external } }} />`
    expect(lint(source)).toHaveLength(0)
    expect(collection(source).unknown).toBeGreaterThan(0)
  })
  test("bare type and universal selectors retain the enclosing owner", () => {
    for (const selector of ["button", "svg", "*"])
      expect(
        lint(
          `${box}export const Subject = () => <Box sx={{ ${JSON.stringify(selector)}: { color: "red" } }} />`
        )
      ).toHaveLength(1)
    expect(lint(style("{ button: { p: 2 } }"))).toHaveLength(1)
  })
  test("property collisions stay responsive and ambiguous objects stay unknown", () => {
    expect(lint(style("{ p: { xs: 2 } }"))).toHaveLength(1)
    expect(
      collection(
        `${box}export const Subject = () => <Box sx={{ filter: { xs: "blur(2px)" } }} />`
      ).unknown
    ).toBe(0)
    for (const sx of [
      '{ filter: { color: "red" } }',
      '{ customElement: { color: "red" } }',
      '{ color: { mobile: "red" } }',
      '{ p: { color: "red" } }',
    ])
      expect(
        collection(`${box}export const Subject = () => <Box sx={${sx}} />`)
          .unknown
      ).toBeGreaterThan(0)
  })
  test("quoted paint URLs do not contribute color names or fragments", () => {
    for (const value of [
      'url("/icons/foo(bar)/red.svg#paint")',
      "url('/icons/foo(bar)/red.svg#fff')",
      'url("/icons/red.svg") currentColor',
    ])
      expect(
        lint(
          `${box}export const Subject = () => <Box sx={{ fill: ${JSON.stringify(value)} }} />`
        )
      ).toHaveLength(0)
    expect(
      lint(
        `${box}export const Subject = () => <Box sx={{ fill: 'url("/icons/foo(bar)/red.svg#paint") red' }} />`
      )
    ).toHaveLength(1)
  })
  test("invalid prototype-shaped color names do not crash analysis", () => {
    for (const value of [
      "constructor",
      "__proto__",
      "var(--brand, constructor)",
    ])
      expect(
        lint(
          `${box}export const Subject = () => <Box sx={{ color: ${JSON.stringify(value)} }} />`
        )
      ).toHaveLength(0)
  })
  test("spreading a constant into an untrusted owner can leak nested objects", () => {
    const source = `${box}function Other(props: any) { props.sx.color.xs = "red"; return null } const styles = { color: { xs: "primary.main" } }; export const Subject = () => <><Other sx={{ ...styles }} /><Box sx={styles} /></>`
    expect(lint(source)).toHaveLength(0)
    expect(collection(source).unknown).toBeGreaterThan(0)
  })
  test("computed keys and getters remain unknown without executing code", () => {
    for (const sx of [
      '{ [runtimeKey]: "red" }',
      '{ get color() { throw new Error("must not run") } }',
    ]) {
      const source = `${box}export const Subject = () => <Box sx={${sx}} />`
      expect(lint(source)).toHaveLength(0)
      expect(collection(source).unknown).toBeGreaterThan(0)
    }
  })
  test("token-backed functions pass while raw operands and fallbacks do not", () => {
    for (const value of [
      "rgb(var(--mui-palette-primary-mainChannel) / 0.5)",
      "oklch(from var(--mui-palette-primary-main) l c h)",
      "color-mix(in srgb, var(--red) 80%, transparent)",
    ]) {
      expect(
        lint(
          `${box}export const Subject = () => <Box sx={{ color: ${JSON.stringify(value)} }} />`
        )
      ).toHaveLength(0)
    }
    for (const value of [
      "var(--brand, red)",
      "color-mix(in srgb, var(--brand) 80%, red)",
      "rgb(255 0 0 / var(--alpha))",
      "rgb(calc(255) 0 0)",
      "hsl(calc(0) 100% 50%)",
    ]) {
      expect(
        lint(
          `${box}export const Subject = () => <Box sx={{ color: ${JSON.stringify(value)} }} />`
        )
      ).toHaveLength(1)
    }
  })
})

function collection(source: string) {
  const result = { sites: 0, unknown: 0 }
  new Linter().verify(source, {
    languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: {
      probe: {
        rules: {
          sites: {
            create(context: any) {
              return {
                JSXOpeningElement(node: any) {
                  const found = collectSx(context, node)
                  result.sites += found.sites.length
                  result.unknown += found.unknown.length
                },
              }
            },
          },
        },
      },
    },
    rules: { "probe/sites": "error" },
  })
  return result
}
