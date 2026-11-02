import parser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { describe, expect, test } from "vitest"

import { plugin } from "../src/index"
import { button, cn, PAGE, PROJECT } from "./helpers"

// Every rule at once, the way a project that adopts the plugin runs it:
// one rule that throws on a hostile string fails the whole lint run.
const rules = Object.fromEntries(
  Object.keys(plugin.rules).map((name) => [`shadcn/${name}`, "error"])
)

function lint(body: string) {
  return new Linter({ cwd: PROJECT }).verify(
    `${button}\n${cn}\nexport function A({ on }: { on: boolean }) {\n${body}\n}\n`,
    [
      {
        files: ["**/*.tsx"],
        languageOptions: {
          parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        plugins: { shadcn: plugin },
        rules,
      },
    ] as any,
    { filename: PAGE }
  )
}

function fatal(messages: Linter.LintMessage[]) {
  return messages.filter((message) => message.fatal || !message.ruleId)
}

function raw(messages: Linter.LintMessage[]) {
  return messages
    .filter((message) => message.ruleId === "shadcn/no-raw-colors")
    .map((message) => message.message.match(/^"([^"]+)"/)?.[1])
}

// Half-typed and malformed tokens: what an editor lints on every
// keystroke, and what a generated or hostile file can hold.
const MALFORMED = [
  "w-[",
  "[",
  "]",
  "-[",
  "/[",
  "/(",
  "!",
  "!-",
  "-",
  "--",
  ":",
  "::::",
  "hover:",
  "bg-[rgb(",
  "bg-[#",
  "bg-(--",
  "bg-red-500/",
  "[--x:",
  "[&",
  "group-[",
  "@container/",
  "*:",
  "**",
  "text-[length:",
  "w-[calc(",
  "shadow-[",
  "\u0000",
  "\ud800",
  "​",
]

describe("malformed class tokens", () => {
  test("do not throw on an element", () => {
    // In an expression, so the control and surrogate characters are real.
    const messages = lint(
      `return <div className={${JSON.stringify(MALFORMED.join(" "))}} />`
    )
    expect(fatal(messages)).toEqual([])
  })

  test("do not throw on a component, in cn, or in a template", () => {
    const value = JSON.stringify(MALFORMED.join(" "))
    const messages = lint(
      [
        `const tpl = \`\${on ? ${value} : ""} p-4\``,
        "return <>",
        `  <Button className=${value} />`,
        `  <Button className={cn(${value}, on && ${value})} />`,
        "  <Button className={tpl} />",
        "</>",
      ].join("\n")
    )
    expect(fatal(messages)).toEqual([])
  })

  test("do not throw in inline styles or SVG color attributes", () => {
    const messages = lint(
      [
        "return <>",
        `  <div style={{ color: "rgb(", background: "var(", borderColor: "#", ["--x" as string]: "oklch(var(" }} />`,
        `  <svg fill="rgb(" stroke="var(--" stopColor="#" />`,
        "</>",
      ].join("\n")
    )
    expect(fatal(messages)).toEqual([])
  })
})

describe("large class strings", () => {
  test("a 20,000-token class string is read to its last token", () => {
    const value = `${"p-4 flex ".repeat(10_000)}bg-red-500`
    expect(raw(lint(`return <div className="${value}" />`))).toEqual([
      "bg-red-500",
    ])
  })

  test("a 20,000-character token does not throw", () => {
    const messages = lint(
      `return <div className="${"a".repeat(20_000)} w-[${"1".repeat(20_000)}]" />`
    )
    expect(fatal(messages)).toEqual([])
  })

  test("a style object with 1,000 properties reports each one", () => {
    const properties = Array.from(
      { length: 1000 },
      (_, i) => `p${i}: "red"`
    ).join(", ")
    const messages = lint(`return <div style={{ ${properties} }} />`)
    expect(fatal(messages)).toEqual([])
    expect(
      messages.filter((m) => m.ruleId === "shadcn/no-inline-styles").length
    ).toBe(1000)
  })
})

describe("deeply nested expressions", () => {
  test("the deepest branch of a 300-level ternary is read", () => {
    const chain = "on ? 'p-4' : ".repeat(300)
    expect(
      raw(lint(`return <div className={${chain}'bg-red-500'} />`))
    ).toEqual(["bg-red-500"])
  })

  test("the innermost argument of 200 nested cn calls is read", () => {
    const open = "cn(".repeat(200)
    const close = ")".repeat(200)
    expect(
      raw(lint(`return <div className={${open}'bg-red-500'${close}} />`))
    ).toEqual(["bg-red-500"])
  })

  test("a 300-level JSX tree is read to its innermost element", () => {
    const open = '<div className="p-4">'.repeat(300)
    const close = "</div>".repeat(300)
    expect(
      raw(lint(`return ${open}<span className="bg-red-500" />${close}`))
    ).toEqual(["bg-red-500"])
  })

  test("a template literal with 2,000 interpolations does not throw", () => {
    const spaced = Array.from({ length: 2000 }, () => "${on} p-4").join(" ")
    const glued = Array.from({ length: 2000 }, () => "a${on}").join("")
    const messages = lint(
      `return <><div className={\`${spaced}\`} /><div className={\`${glued}\`} /></>`
    )
    expect(fatal(messages)).toEqual([])
  })
})

describe("value resolution terminates", () => {
  test("a 50-deep chain of const aliases resolves to its source", () => {
    const aliases = Array.from(
      { length: 50 },
      (_, i) => `const v${i + 1} = v${i}`
    ).join("\n")
    expect(
      raw(
        lint(
          `const v0 = "bg-red-500"\n${aliases}\nreturn <div className={v50} />`
        )
      )
    ).toEqual(["bg-red-500"])
  })

  test("self and mutual references stop without a report", () => {
    const messages = lint(
      [
        "const a = b",
        "const b = a",
        'const c = cn(c, "p-4")',
        "const d = { e: d.e }",
        "return <div className={cn(a, b, c, d.e)} />",
      ].join("\n")
    )
    expect(fatal(messages)).toEqual([])
    expect(raw(messages)).toEqual([])
  })

  test("a const read from both branches is checked on each path", () => {
    const shared = Array.from(
      { length: 8 },
      (_, i) => `const v${i + 1} = on ? v${i} : v${i}`
    ).join("\n")
    const messages = lint(
      `const v0 = "bg-red-500"\n${shared}\nreturn <div className={v8} />`
    )
    expect(fatal(messages)).toEqual([])
    expect(new Set(raw(messages))).toEqual(new Set(["bg-red-500"]))
  })
})
