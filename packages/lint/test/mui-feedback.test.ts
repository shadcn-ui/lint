import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import parser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { expect, test } from "vitest"

import mui from "../src/mui/index"
import { binOf, PKG_DIR } from "./built"

const read = (name: string) =>
  JSON.parse(
    fs.readFileSync(
      new URL(`../../evals/benchmarks/${name}`, import.meta.url),
      "utf8"
    )
  )
const componentImports = [
  {
    source: "@design/icon",
    imported: "default",
    component: "Icon",
    styleProps: { color: "color" },
  },
  {
    source: "@design/components",
    imported: "Icon",
    component: "Icon",
    styleProps: { color: "color" },
  },
]
const catalog = read("mui-v1.json")
const contracts = Object.entries(catalog.policy.governedComponents).map(
  ([component, policy]: [string, any]) => ({
    pattern: `^${component}$`,
    allow: policy.allowedProperties,
  })
)
const cases = [
  catalog,
  read("mui-review-cases.json"),
  read("mui-feedback-cases.json"),
  read("mui-paint-feedback-cases.json"),
  read("mui-enforcement-cases.json"),
]
  .flatMap((input) => input.cases)
  .filter((example) => example.label !== "unknown")

function rules(example: any) {
  return {
    "mui/no-restyle": [
      "error",
      example.restylePolicy ?? { allow: ["*"], contracts },
    ],
    "mui/no-raw-colors": ["error", example.colorPolicy ?? {}],
  }
}

function signature(message: any, source: string) {
  const match = message.message.match(
    /^"([^"]+)" (?:is not allowed in|in) <([^>]+)> (?:sx|[\w-]+ prop)/
  )
  expect(match, message.message).not.toBeNull()
  const offset = (line: number, column: number) =>
    source
      .split("\n")
      .slice(0, line - 1)
      .reduce((n, text) => n + text.length + 1, 0) +
    column -
    1
  return {
    rule: message.ruleId,
    component: match![2],
    authoredProperty: match![1],
    sourceRange: [
      offset(message.line, message.column),
      offset(message.endLine, message.endColumn),
    ],
  }
}

const ordered = (items: any[]) =>
  [...items].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))

test("labeled syntax cases keep exact diagnostics and authored ranges", () => {
  for (const example of cases) {
    const messages = new Linter().verify(example.source, {
      languageOptions: {
        parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: { mui },
      settings: { mui: example.muiSettings ?? { componentImports } },
      rules: rules(example) as any,
    })
    expect(
      ordered(messages.map((message) => signature(message, example.source))),
      example.id
    ).toEqual(ordered(example.expected.diagnostics))
  }
})

test(
  "built-runtime Oxlint preserves the labeled syntax diagnostics",
  { timeout: 60_000 },
  () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "mui-feedback-parity-")
    )
    try {
      for (const example of cases)
        fs.writeFileSync(
          path.join(directory, `${example.id}.tsx`),
          example.source
        )
      const config = path.join(directory, ".oxlintrc.json")
      fs.writeFileSync(
        config,
        JSON.stringify({
          categories: { correctness: "off" },
          settings: { mui: { componentImports } },
          jsPlugins: [path.join(PKG_DIR, "dist/mui.js")],
          overrides: cases.map((example) => ({
            files: [`${example.id}.tsx`],
            rules: rules(example),
          })),
        })
      )
      const run = spawnSync(
        process.execPath,
        [binOf("oxlint"), "-c", config, "--format", "json", directory],
        { cwd: directory, encoding: "utf8", timeout: 60_000 }
      )
      if (run.error) throw run.error
      expect([0, 1], run.stderr || run.stdout).toContain(run.status)
      const findings = JSON.parse(run.stdout).diagnostics
      expect(Array.isArray(findings)).toBe(true)
      const expectedFiles = new Set(cases.map((example) => `${example.id}.tsx`))
      for (const finding of findings)
        expect(expectedFiles.has(path.basename(finding.filename))).toBe(true)
      for (const example of cases) {
        const actual = findings
          .filter(
            (finding: any) =>
              path.basename(finding.filename) === `${example.id}.tsx`
          )
          .map((finding: any) => {
            const match = finding.message.match(
              /^"([^"]+)" (?:is not allowed in|in) <([^>]+)> (?:sx|[\w-]+ prop)/
            )
            expect(match, finding.message).not.toBeNull()
            const span = finding.labels[0].span
            const bytes = Buffer.from(example.source)
            return {
              rule: finding.code.replace(/^mui\((.*)\)$/, "mui/$1"),
              component: match[2],
              authoredProperty: match[1],
              sourceRange: [
                bytes.subarray(0, span.offset).toString().length,
                bytes.subarray(0, span.offset + span.length).toString().length,
              ],
            }
          })
        expect(ordered(actual), example.id).toEqual(
          ordered(example.expected.diagnostics)
        )
      }
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  }
)
