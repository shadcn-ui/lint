import parser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { describe, expect, test } from "vitest"

import { plugin } from "../src/index"
import { noRestyle } from "../src/rules/no-restyle"
import { requireStaticClasses } from "../src/rules/require-static-classes"
import { button, cn, createTester, PAGE, PROJECT } from "./helpers"

function lint(code: string) {
  return new Linter({ cwd: PROJECT }).verify(
    `${button}\n${cn}\n${code}`,
    [
      {
        files: ["**/*.tsx"],
        languageOptions: {
          parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        plugins: { shadcn: plugin },
        rules: Object.fromEntries(
          Object.keys(plugin.rules).map((rule) => [
            `shadcn/${rule}`,
            // Layout is what a forwarded value usually carries, so the
            // boundary opens it and only appearance is reported.
            rule === "no-restyle" ? ["error", { allow: ["layout"] }] : "error",
          ])
        ),
      },
    ] as any,
    { filename: PAGE }
  )
}

const tester = createTester()

// Layout may cross in these cases: they exercise how a value reaches the
// boundary, not what the boundary allows.
const options = [{ allow: ["layout"] }]

describe("forwarded values retain their local alternatives", () => {
  test.each([
    'function Save({ className = "bg-red-500 rounded-full" }) { return <Button className={className} /> }',
    'function Save({ className: cls = "bg-red-500 rounded-full" }) { return <Button className={cls} /> }',
    'function Save(props = { className: "bg-red-500 rounded-full" }) { return <Button className={props.className} /> }',
    'function Save({ className } = { className: "bg-red-500 rounded-full" }) { return <Button className={className} /> }',
  ])("checks parameter defaults: %s", (code) => {
    const messages = lint(code)
    expect(
      messages.filter((m) => m.ruleId === "shadcn/no-restyle")
    ).toHaveLength(2)
    expect(
      messages.filter((m) => m.ruleId === "shadcn/no-raw-colors")
    ).toHaveLength(1)
    expect(
      messages.some((m) => m.ruleId === "shadcn/require-static-classes")
    ).toBe(false)
  })

  test.each([
    'function Save({ className }) { className ??= "bg-red-500"; return <Button className={className} /> }',
    'function Save({ className: cls }) { cls = "bg-red-500"; return <Button className={cls} /> }',
    'function Save(props) { props = { className: "bg-red-500" }; return <Button className={props.className} /> }',
    'function Save(props) { props.className = "bg-red-500"; return <Button className={props.className} /> }',
    'function Save(props) { props.className ??= "bg-red-500"; return <Button className={props.className} /> }',
    'function Save(props) { Object.assign(props, { className: "bg-red-500" }); return <Button className={props.className} /> }',
    'function Save(props) { Object.assign(props as object, { className: "bg-red-500" }); return <Button className={props.className} /> }',
    'function Save(props) { ({ className: props.className } = { className: "bg-red-500" }); return <Button className={props.className} /> }',
    'function Save(props) { [props.className] = ["bg-red-500"]; return <Button className={props.className} /> }',
  ])("revokes forwarding after a write: %s", (code) => {
    expect(lint(code).map((m) => m.ruleId)).toContain(
      "shadcn/require-static-classes"
    )
  })

  test.each([
    "const alias = theme; alias.className = 'bg-red-500'",
    "let alias; alias = theme",
    "mutate(theme)",
    "const stored = { theme }",
    "function expose() { return theme }",
    "const expose = () => theme",
    "const alias = theme as object",
  ])("treats an escaped object's member as uncertain: %s", (escape) => {
    const code = `const theme = { className: "w-full" }; ${escape}; <Button className={theme.className} />`
    expect(lint(code).map((m) => m.ruleId)).toContain(
      "shadcn/require-static-classes"
    )
  })

  test.each([
    "const alias = props",
    "mutate(props)",
    "const stored = { props }",
    "function expose() { return props }",
  ])("revokes forwarding when the props object escapes: %s", (escape) => {
    const code = `function Save(props) { ${escape}; return <Button className={props.className} /> }`
    expect(lint(code).map((m) => m.ruleId)).toContain(
      "shadcn/require-static-classes"
    )
  })

  test.each([
    "function Save({ className }) { return <Button className={className} /> }",
    "function Save({ className: cls }) { return <Button className={cls} /> }",
    "function Save(props) { return <Button className={props.className} {...props} /> }",
    "function Save({ ...props }) { return <Button className={props.className} /> }",
    "function Save(props) { const { disabled } = props; return <Button className={props.className} disabled={disabled} /> }",
    'function Save({ className = "w-full" }) { return <Button className={cn("mt-4", className)} /> }',
    'const theme = { className: "w-full" }; read(theme.className); <Button className={theme.className} {...theme} />',
    'const theme = { className: "w-full" }; const copy = { ...theme }; <Button className={theme.className} />',
    'const classes = { root: "w-full" }; <Button classNames={classes} />',
    'const classes = { "w-full": true }; <Button className={cn(classes)} />',
    'const spacing = { "--gap": "4px" }; <div style={spacing} />',
    'import { props } from "./opaque"; <Button {...props} />',
    "function Save(props) { return <Button {...props} /> }",
  ])("keeps untouched forwarding and non-escaping reads clean: %s", (code) => {
    expect(lint(code)).toEqual([])
  })

  test("a helper call escapes an object for later member reads", () => {
    expect(
      lint(
        'const classes = { root: "w-full" }; cn(classes); <Button className={classes.root} />'
      ).map((m) => m.ruleId)
    ).toContain("shadcn/require-static-classes")
  })

  test.each([
    'const classes = { root: "w-full" }; const alias = classes; alias.root = "bg-red-500"; <Button classNames={classes} />',
    'const classes = { "w-full": true }; const alias = classes; alias["bg-red-500"] = true; <Button className={cn(classes)} />',
    'const styles = { "--gap": "4px" }; const alias = styles; alias.color = "red"; <div style={styles} />',
    'const classes = { root: "w-full" }; mutate(classes); <Button classNames={classes} />',
  ])(
    "does not trust an escaped object at a class or style site: %s",
    (code) => {
      expect(
        lint(code).some((m) =>
          ["shadcn/require-static-classes", "shadcn/no-inline-styles"].includes(
            m.ruleId ?? ""
          )
        )
      ).toBe(true)
    }
  )

  test.each([
    'const classes = { root: "w-full" }; <><Button classNames={classes} /><Button classNames={classes} /></>',
    'const classes = { "w-full": true }; <><Button className={cn(classes)} /><Button className={cn(classes)} /></>',
    'const styles = { "--gap": "4px" }; <><div style={styles} /><div style={styles} /></>',
  ])(
    "can check the same literal object at multiple styling sites: %s",
    (code) => {
      expect(lint(code)).toEqual([])
    }
  )

  test("a dynamic default is not an untouched forwarded value", () => {
    expect(
      lint(
        "function Save({ className = build() }) { return <Button className={className} /> }"
      ).map((m) => m.ruleId)
    ).toContain("shadcn/require-static-classes")
  })

  test("a forwarded interpolation glued to text is uncertain", () => {
    expect(
      lint(
        "function Save({ className }) { return <Button className={`prefix-${className}`} /> }"
      ).map((m) => m.ruleId)
    ).toContain("shadcn/require-static-classes")
  })
})

describe("a call to a same-file variant function is read", () => {
  const cva = `import { cva } from "class-variance-authority"`
  const ruleIds = (code: string) => lint(`${cva}\n${code}`).map((m) => m.ruleId)
  const count = (ids: (string | null)[], rule: string) =>
    ids.filter((id) => id === `shadcn/${rule}`).length

  test.each([
    [
      'const restyle = cva("bg-red-500 rounded-none")\nexport const A = () => <Button className={restyle()} />',
      2,
    ],
    [
      'const restyleTone = cva("", { variants: { tone: { loud: "bg-red-500" } } })\nexport const B = () => <Button className={restyleTone({ tone: "loud" })} />',
      1,
    ],
    [
      'const asString = "bg-red-500 rounded-none"\nexport const C = () => <Button className={asString} />',
      2,
    ],
  ])("checks every class it can produce: %s", (code, restyles) => {
    const ids = ruleIds(code)
    expect(count(ids, "no-restyle")).toBe(restyles)
    expect(count(ids, "require-static-classes")).toBe(0)
    // The raw color is reported once, where it is written.
    expect(count(ids, "no-raw-colors")).toBe(1)
  })

  test("a className passed in the call is read with it", () => {
    const ids = ruleIds(
      'const tone = cva("mt-2")\nexport const A = () => <Button className={tone({ className: "rounded-none" })} />'
    )
    expect(count(ids, "no-restyle")).toBe(1)
    expect(count(ids, "require-static-classes")).toBe(0)
  })

  test.each([
    // A reassigned binding may hold anything by the time it is called.
    'let restyle = cva("mt-2")\nrestyle = cva("bg-red-500")\nexport const A = () => <Button className={restyle()} />',
    // tv with slots returns functions, not classes.
    'import { tv } from "tailwind-variants"\nconst card = tv({ slots: { base: "mt-2" } })\nexport const A = () => <Button className={card()} />',
    // An argument the call cannot see into.
    'const tone = cva("mt-2")\nexport const A = (props: any) => <Button className={tone(props)} />',
  ])("leaves what it cannot read unresolved: %s", (code) => {
    expect(count(ruleIds(code), "require-static-classes")).toBe(1)
  })
})

describe("partly understood values stay unresolved", () => {
  test("require-static-classes sees the unreadable part", () => {
    tester.run("require-static-classes", requireStaticClasses as any, {
      valid: [
        // Forwarded by provenance: a destructured className parameter.
        {
          filename: PAGE,
          code: `${button}\nexport function Save({ className }: { className?: string }) { return <Button className={className}>Go</Button> }`,
        },
      ],
      invalid: [
        // A number glued to text is a class the collector cannot read.
        {
          filename: PAGE,
          code: `${button}\nconst n = 8\nexport const A = () => <Button className={\`p-\${n}\`}>Go</Button>`,
          errors: [{ messageId: "dynamicClasses" }],
        },
        // Spelled className, but not the component's prop.
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => { let className\n className ??= "bg-red-500"\n return <Button className={className}>Go</Button> }`,
          errors: [{ messageId: "dynamicClasses" }],
        },
        // An object written to after creation.
        {
          filename: PAGE,
          code: `${button}\nconst theme = { className: "mt-4" }\ntheme.className = "bg-red-500"\nexport const A = () => <Button className={theme.className}>Go</Button>`,
          errors: [{ messageId: "dynamicClasses" }],
        },
        // A member of an imported object.
        {
          filename: PAGE,
          code: `${button}\nimport { theme } from "./theme"\nexport const A = () => <Button className={theme.className}>Go</Button>`,
          errors: [{ messageId: "dynamicClasses" }],
        },
      ],
    })
  })

  test("the boundary reads the final value of an object", () => {
    tester.run("no-restyle", noRestyle as any, {
      valid: [
        // A later spread may override: the literal before it does not decide.
        {
          filename: PAGE,
          options,
          code: `${button}\nconst base = { className: "mt-4" }\nexport const A = () => <Button {...{ className: "bg-red-500", ...base }} />`,
        },
      ],
      invalid: [
        // The last write wins.
        {
          filename: PAGE,
          options,
          code: `${button}\nconst base = { className: "mt-4" }\nexport const A = () => <Button {...{ ...base, className: "bg-red-500" }} />`,
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        // Nested spreads and static computed keys.
        {
          filename: PAGE,
          options,
          code: `${button}\nexport const A = () => <Button {...{ ...{ className: "bg-red-500" } }} />`,
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        {
          filename: PAGE,
          options,
          code: `${button}\nexport const A = () => <Button {...{ ["className"]: "bg-red-500" }} />`,
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        // A nested classNames map is read by its values.
        {
          filename: PAGE,
          options,
          code: `${button}\nexport const A = () => <Button classNames={{ root: { inner: "bg-red-500" } }}>Go</Button>`,
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        // A same-file object never written to is read.
        {
          filename: PAGE,
          options,
          code: `${button}\nconst theme = { className: "bg-red-500" }\nexport const A = () => <Button className={theme.className}>Go</Button>`,
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
      ],
    })
  })
})
