import parser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { describe, expect, test } from "vitest"

import { plugin } from "../src/index"
import { button, cn, PAGE, PROJECT } from "./helpers"

function lint(code: string) {
  return new Linter({ cwd: PROJECT })
    .verify(
      `${button}\n${cn}\n${code}`,
      [
        {
          files: ["**/*.tsx"],
          languageOptions: {
            parser,
            parserOptions: { ecmaFeatures: { jsx: true } },
          },
          plugins: { shadcn: plugin },
          rules: {
            "shadcn/no-restyle": "error",
            "shadcn/no-raw-colors": "error",
            "shadcn/require-static-classes": "error",
          },
        },
      ] as any,
      { filename: PAGE }
    )
    .map((m) => `${m.ruleId} ${m.line}:${m.column}`)
    .sort()
}

// A const read from two places at one site, the way each shape below
// reads it, chained `depth` times.
function chain(shape: string, depth: number) {
  const lines = [`const a0 = on ? "p-1 bg-red-500" : "p-2"`]
  for (let i = 1; i <= depth; i++) {
    lines.push(`const a${i} = ${shape.replace(/A/g, `a${i - 1}`)}`)
  }
  return `const on = Math.random() > 0.5\n${lines.join("\n")}\nexport const B = () => <Button className={a${depth}}>Go</Button>`
}

describe("a binding reached twice at one site", () => {
  test.each(["on ? A : A", "[A, A]", "cn(A, A)", "A || A", "`${A} ${A}`"])(
    "is read once in a chain: %s",
    (shape) => {
      const messages = lint(chain(shape, 20))
      // Each class of a0 once, at its own literal.
      expect(messages).toEqual([
        "shadcn/no-raw-colors 4:17",
        "shadcn/no-restyle 4:17",
        "shadcn/no-restyle 4:17",
        "shadcn/no-restyle 4:36",
      ])
    }
  )

  test("reports a class through both branches once", () => {
    expect(
      lint(
        'const c = "bg-red-500"\nexport const B = ({ on }: { on: boolean }) => <Button className={on ? c : c}>Go</Button>'
      )
    ).toEqual(["shadcn/no-raw-colors 3:11", "shadcn/no-restyle 3:11"])
  })

  test("reports an unreadable value through both branches once", () => {
    expect(
      lint(
        "export const B = ({ on, d }: { on: boolean; d: string }) => {\n  const c = d\n  return <Button className={on ? c : c}>Go</Button>\n}"
      )
    ).toEqual(["shadcn/require-static-classes 4:13"])
  })

  test("still reports two literals of the same class twice", () => {
    expect(
      lint(
        'export const B = ({ on }: { on: boolean }) => <Button className={on ? "bg-red-500" : "bg-red-500"}>Go</Button>'
      )
    ).toEqual([
      "shadcn/no-raw-colors 3:71",
      "shadcn/no-raw-colors 3:86",
      "shadcn/no-restyle 3:71",
      "shadcn/no-restyle 3:86",
    ])
  })
})
