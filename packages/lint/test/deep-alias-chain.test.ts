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
            "shadcn/require-static-classes": "error",
          },
        },
      ] as any,
      { filename: PAGE }
    )
    .map((m) => m.ruleId)
}

// `depth` consts, each read from the one before it, on a Button.
function chain(shape: string, depth: number) {
  const lines = [`const v0 = "bg-red-500"`]
  for (let i = 1; i <= depth; i++) {
    lines.push(`const v${i} = ${shape.replace("A", `v${i - 1}`)}`)
  }
  return `${lines.join("\n")}\nexport const B = () => <Button className={v${depth}}>Go</Button>`
}

describe("a chain of consts", () => {
  test.each(["A", "cn(A)"])("is followed while it is short: %s", (shape) => {
    expect(lint(chain(shape, 32))).toEqual(["shadcn/no-restyle"])
  })

  test.each([
    ["A", 5000],
    ["cn(A)", 3000],
  ])("too deep to follow is unreadable, not a crash: %s", (shape, depth) => {
    expect(lint(chain(shape, depth))).toEqual(["shadcn/require-static-classes"])
  })

  // `u10` is read twice at one site: first at the end of a long route,
  // where the chain is cut before its class, then directly, where the
  // class is in reach. The cut read is not the binding's whole value.
  test("cut on a long route is still read on a short one", () => {
    const lines = [`const u0 = "bg-red-500"`]
    for (let i = 1; i <= 10; i++) lines.push(`const u${i} = u${i - 1}`)
    lines.push(`const w0 = u10`)
    for (let i = 1; i <= 60; i++) lines.push(`const w${i} = w${i - 1}`)
    const code = `${lines.join("\n")}\nexport const B = ({ on }: { on: boolean }) => <Button className={on ? w60 : u10}>Go</Button>`
    expect(lint(code).sort()).toEqual([
      "shadcn/no-restyle",
      "shadcn/require-static-classes",
    ])
  })
})
