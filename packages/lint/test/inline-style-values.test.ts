import parser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { describe, expect, test } from "vitest"

import { plugin } from "../src/index"

function messages(code: string, options?: Record<string, unknown>) {
  const linter = new Linter()
  return linter
    .verify(
      code,
      {
        files: ["**/*.tsx"],
        languageOptions: {
          parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        plugins: { shadcn: plugin },
        rules: {
          "shadcn/no-inline-styles": options ? ["error", options] : "error",
        },
      },
      { filename: "page.tsx" }
    )
    .map((message) => message.messageId ?? message.message)
}

describe("final inline-style properties", () => {
  test.each([
    {
      name: "a local style binding is checked",
      code: `const style = { color: "red" }; <div style={style} />`,
      expected: ["inlineStyle"],
    },
    {
      name: "an explicitly allowed dynamic identifier is exempt",
      code: `<div style={floatingStyles} />`,
      options: { allowDynamicIdentifiers: ["floatingStyles"] },
      expected: [],
    },
    {
      name: "an unlisted dynamic identifier remains reported",
      code: `<div style={otherStyles} />`,
      options: { allowDynamicIdentifiers: ["floatingStyles"] },
      expected: ["dynamicStyle"],
    },
    {
      name: "an allowed identifier bypasses same-file resolution by intent",
      code: `const floatingStyles = { color: "red" }; <div style={floatingStyles} />`,
      options: { allowDynamicIdentifiers: ["floatingStyles"] },
      expected: [],
    },
    {
      name: "ordinary custom properties in a local object remain readable",
      code: `const spacing = { "--gap": "4px" }; <div style={spacing} />`,
      expected: [],
    },
    {
      name: "a mutated local style binding is uncertain",
      code: `const style = { "--gap": "4px" }; style.color = "red"; <div style={style} />`,
      expected: ["dynamicStyle"],
    },
    {
      name: "an escaped style member is uncertain",
      code: `const theme = { style: { "--gap": "4px" } }; const alias = theme; alias.style = { color: "red" }; <div style={theme.style} />`,
      expected: ["dynamicStyle"],
    },
    {
      name: "a style member passed to an opaque owner is uncertain",
      code: `const theme = { style: { "--gap": "4px" } }; mutate(theme); <div style={theme.style} />`,
      expected: ["dynamicStyle"],
    },
    {
      name: "a received style under a local alias stays forwardable",
      code: `function View({ style: inherited }: { style: object }) { return <div style={inherited} /> }`,
      expected: [],
    },
    {
      name: "a computed received style stays forwardable",
      code: "function View(props) { return <div style={props[`style`]} /> }",
      expected: [],
    },
    {
      name: "a written received style loses forwarding",
      code: `function View({ style }) { style = { color: "red" }; return <div style={style} /> }`,
      expected: ["dynamicStyle"],
    },
    {
      name: "a written received props style loses forwarding",
      code: `function View(props) { props.style = { color: "red" }; return <div style={props.style} /> }`,
      expected: ["dynamicStyle"],
    },
    {
      name: "a received style default is checked",
      code: `function View({ style = { color: "red" } }) { return <div style={style} /> }`,
      expected: ["inlineStyle"],
    },
    {
      name: "a received style default under an alias is checked",
      code: `function View({ style: inherited = { color: "red" } }) { return <div style={inherited} /> }`,
      expected: ["inlineStyle"],
    },
    {
      name: "a custom-property style default stays clean",
      code: `function View({ style = { "--gap": "4px" } }) { return <div style={style} /> }`,
      expected: [],
    },
    {
      name: "a raw default is checked when the received style is spread",
      code: `function View({ style = { color: "red" } }) { return <div style={{ "--gap": "4px", ...style }} /> }`,
      expected: ["inlineStyle"],
    },
    {
      name: "a default props object's style is checked",
      code: `function View(props = { style: { color: "red" } }) { return <div style={props.style} /> }`,
      expected: ["inlineStyle"],
    },
    {
      name: "a destructured default props object's style is checked",
      code: `function View({ style } = { style: { color: "red" } }) { return <div style={style} /> }`,
      expected: ["inlineStyle"],
    },
    {
      name: "a custom-property style in default props stays clean",
      code: `function View(props = { style: { "--gap": "4px" } }) { return <div style={props.style} /> }`,
      expected: [],
    },
    {
      name: "an unreadable style default is uncertain",
      code: `function View({ style = buildStyle() }) { return <div style={style} /> }`,
      expected: ["dynamicStyle"],
    },
    {
      name: "an unreadable default props object is uncertain",
      code: `function View(props = buildProps()) { return <div style={props.style} /> }`,
      expected: ["dynamicStyle"],
    },
    {
      name: "nested literal props",
      code: `<div {...{ ...{ style: { color: "red" } } }} />`,
      expected: ["inlineStyle"],
    },
    {
      name: "nested same-file props",
      code: `const props = { style: { color: "red" } }; const combined = { ...props }; <div {...combined} />`,
      expected: ["inlineStyle"],
    },
    {
      name: "a member reads the final style through nested props",
      code: `const theme = { style: { color: "red" }, ...{ style: { "--gap": "4px" } } }; <div style={theme.style} />`,
      expected: [],
    },
    {
      name: "a computed member reads nested style props",
      code: 'const theme = { ...{ style: { color: "red" } } }; <div style={theme[`style`]} />',
      expected: ["inlineStyle"],
    },
    {
      name: "computed template style key",
      code: '<div {...{ [`style`]: { color: "red" } }} />',
      expected: ["inlineStyle"],
    },
    {
      name: "safe style overwrites a nested violation",
      code: `<div {...{ ...{ style: { color: "red" } }, style: { "--gap": "4px" } }} />`,
      expected: [],
    },
    {
      name: "nested safe style overwrites a direct violation",
      code: `<div {...{ style: { color: "red" }, ...{ style: { "--gap": "4px" } } }} />`,
      expected: [],
    },
    {
      name: "nested violation overwrites safe style",
      code: `<div {...{ style: { "--gap": "4px" }, ...{ style: { color: "red" } } }} />`,
      expected: ["inlineStyle"],
    },
    {
      name: "duplicate direct style uses its final value",
      code: `<div {...{ style: { color: "red" }, style: { "--gap": "4px" } }} />`,
      expected: [],
    },
    {
      name: "opaque whole-prop spread remains exempt",
      code: `function View(props: object) { return <div {...props} /> }`,
      expected: [],
    },
    {
      name: "nested opaque whole-prop spread remains exempt",
      code: `function View(props: object) { return <div {...{ ...props }} /> }`,
      expected: [],
    },
    {
      name: "unknown overwrite of a known style is dynamic",
      code: `function View(props: object) { return <div {...{ style: { "--gap": "4px" }, ...props }} /> }`,
      expected: ["dynamicStyle"],
    },
    {
      name: "a final known style after opaque props is checked",
      code: `function View(props: object) { return <div {...{ ...props, style: { color: "red" } }} /> }`,
      expected: ["inlineStyle"],
    },
    {
      name: "nested safe style value",
      code: `<div style={{ ...{ "--gap": "4px" } }} />`,
      expected: [],
    },
    {
      name: "nested forbidden style value",
      code: `<div style={{ ...{ color: "red" } }} />`,
      expected: ["inlineStyle"],
    },
    {
      name: "computed template custom property",
      code: '<div style={{ [`--gap`]: "4px" }} />',
      expected: [],
    },
    {
      name: "a token overwrites a raw custom-property color",
      code: `<div style={{ "--tint": "red", ...{ "--tint": "var(--color-primary)" } }} />`,
      expected: [],
    },
    {
      name: "a raw color overwrites a token",
      code: `<div style={{ "--tint": "var(--color-primary)", ...{ "--tint": "red" } }} />`,
      expected: ["customPropColor"],
    },
    {
      name: "received style remains forwardable",
      code: `function View({ style }: { style: object }) { return <div style={{ "--gap": "4px", ...style }} /> }`,
      expected: [],
    },
  ])("$name", ({ code, options, expected }) => {
    expect(messages(code, options)).toEqual(expected)
  })
})

describe("CSS color leaves", () => {
  test.each([
    ["color word at the end of a URL", "url(/icons/red)", []],
    ["color word inside a URL", "url(/assets/blue/icon.svg)", []],
    ["URL hash", "url(/icons.svg#abc)", []],
    ["quoted URL", 'url("/icons/red")', []],
    ["uppercase URL function", "URL(/icons/red)", []],
    ["quoted parentheses in a URL", 'url("/icons/)red")', []],
    ["escaped parentheses in a URL", String.raw`url(/icons/\)red)`, []],
    ["nested image URLs", "image-set(url(/red) 1x, url(/blue) 2x)", []],
    ["SVG data URL", "url(\"data:image/svg+xml,<svg fill='red'/>\")", []],
    ["CSS string", '"red blue #abc rgb(0 0 0)"', []],
    ["CSS comment", "4px /* red #abc rgb(0 0 0) */", []],
    ["token reference", "var(--color-primary)", []],
    ["named color outside a URL", "url(/icons/red) blue", ["customPropColor"]],
    ["named gradient", "linear-gradient(red, blue)", ["customPropColor"]],
    [
      "color function",
      "linear-gradient(rgb(0 0 0), var(--color-primary))",
      ["customPropColor"],
    ],
    ["shadow color", "0 0 4px red", ["customPropColor"]],
  ])("%s", (_name, value, expected) => {
    const code = `<div className="bg-(image:--icon)" style={{ "--icon": ${JSON.stringify(value)} }} />`
    expect(messages(code)).toEqual(expected)
  })

  test("a static template still reports its named color", () => {
    expect(messages('<div style={{ "--tint": `red` }} />')).toEqual([
      "customPropColor",
    ])
  })

  test("a template URL keeps all literal pieces inside the URL", () => {
    expect(
      messages('<div style={{ "--icon": `url(/icons/${name}/red)` }} />')
    ).toEqual([])
  })
})
