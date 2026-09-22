import * as path from "node:path"
import { fileURLToPath } from "node:url"
import tsParser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import * as svelteParser from "svelte-eslint-parser"
import vueParser from "vue-eslint-parser"

import { plugin } from "../src/plugin"

const FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures"
)

export const SVELTE_PROJECT = path.join(FIXTURES, "svelte-project")
export const VUE_PROJECT = path.join(FIXTURES, "vue-project")
export const SVELTE_PAGE = path.join(SVELTE_PROJECT, "src/routes/+page.svelte")
export const VUE_PAGE = path.join(VUE_PROJECT, "src/App.vue")

const POLICY = { allow: ["layout"] }

export const RULES = {
  "shadcn/no-restyle": ["error", POLICY],
  "shadcn/no-raw-colors": "error",
  "shadcn/no-arbitrary-values": ["error", POLICY],
  "shadcn/no-inline-styles": "error",
  "shadcn/require-static-classes": "error",
} as const

// Runs the plugin the way a project does: ESLint, the framework's own
// parser, and the TypeScript parser for the script blocks.
export function lintSfc(
  code: string,
  filename: string,
  rules: Record<string, unknown> = RULES
) {
  const vue = filename.endsWith(".vue")
  const linter = new Linter({ cwd: vue ? VUE_PROJECT : SVELTE_PROJECT })
  const parser = vue ? vueParser : svelteParser
  return linter.verify(
    code,
    [
      {
        files: ["**/*.svelte", "**/*.vue"],
        languageOptions: {
          parser: parser as any,
          parserOptions: { parser: tsParser },
        },
        plugins: { shadcn: plugin as any },
        rules: rules as any,
      },
    ],
    { filename }
  )
}

export function summarize(messages: Linter.LintMessage[]) {
  return messages.map((m) => `${m.ruleId} ${m.line}:${m.column} ${m.message}`)
}
