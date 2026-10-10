// settings.shadcn.ui names a directory as well as an import prefix: a
// tag with no import, such as one unplugin-vue-components registers
// globally, is matched by name against the components there (#60).

import * as path from "node:path"
import parser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { describe, expect, test } from "vitest"

import { plugin } from "../src/index"
import { lintSfc, summarize } from "./sfc-helpers"

const NO_JSON = path.join(__dirname, "fixtures/no-json")
const NO_JSON_PAGE = path.join(NO_JSON, "src/app/page.tsx")
const AUTO = path.join(__dirname, "fixtures/vue-auto-import")
const AUTO_PAGE = path.join(AUTO, "src/App.vue")

const rules = { "shadcn/no-restyle": ["error", { allow: ["layout"] }] }

function lintTsx(code: string, settings?: object) {
  return new Linter({ cwd: NO_JSON })
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
      { filename: NO_JSON_PAGE }
    )
    .map(({ ruleId, message }) => ({ ruleId, message }))
}

describe("settings.shadcn.ui for tags with no import", () => {
  const vue = `<template>\n  <UiButton class="bg-primary p-4">Save</UiButton>\n</template>\n`

  test("an auto-imported Vue component is checked", () => {
    expect(lintSfc(vue, AUTO_PAGE, rules)).toEqual([])
    const found = summarize(
      lintSfc(vue, AUTO_PAGE, rules, { shadcn: { ui: "@/ui" } })
    )
    expect(found).toHaveLength(2)
    expect(found[0]).toContain('"bg-primary" is not allowed on <UiButton>')
  })

  test("so is its kebab-case spelling", () => {
    const kebab = `<template>\n  <ui-button class="bg-primary">Save</ui-button>\n</template>\n`
    expect(
      lintSfc(kebab, AUTO_PAGE, rules, { shadcn: { ui: ["@/ui"] } })
    ).toHaveLength(1)
  })

  test("a JSX tag with no import is checked too", () => {
    const code = `export const A = () => <Button className="bg-highlight">Go</Button>`
    expect(lintTsx(code)).toEqual([])
    expect(lintTsx(code, { shadcn: { ui: "@/ds" } })).toMatchObject([
      { ruleId: "shadcn/no-restyle" },
    ])
  })

  // An import still resolves the way it did: one from a path that does
  // not exist is not matched against the setting's directory by name.
  test("an unresolvable import is not matched by name", () => {
    const code = `import { Button } from "@/dsx"\nexport const A = () => <Button className="bg-highlight">Go</Button>`
    expect(lintTsx(code, { shadcn: { ui: "@/ds" } })).toEqual([])
  })

  test("a prefix that names no directory recognizes nothing", () => {
    expect(
      lintSfc(vue, AUTO_PAGE, rules, { shadcn: { ui: "@/nope" } })
    ).toEqual([])
  })
})
