// A project's own words on a message: a contract's `message` replaces the
// rule's text on the boundary findings for its components, and
// `settings.shadcn.note` trails every finding of every rule. Both fill the
// finding's data slots; absent, the rules report exactly as before.

import parser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { describe, expect, test } from "vitest"

import { plugin } from "../src/index"
import { resetWarnings, setWarningSink } from "../src/project/warn"
import { noRawColors } from "../src/rules/no-raw-colors"
import { noRestyle } from "../src/rules/no-restyle"
import { button, card, createTester, PAGE, PROJECT } from "./helpers"

const tester = createTester()
const NOTE = "Design system rules and the exceptions log: DESIGN.md."
const settings = { shadcn: { note: NOTE } }
const BUTTON_FILE = "test/fixtures/project/components/ui/button.tsx"

describe("contract messages", () => {
  test("replace the rule's text on denied, layout and appearance findings", () => {
    tester.run("no-restyle", noRestyle as any, {
      valid: [
        // A message changes nothing about what passes.
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="mt-4">Go</Button>`,
          options: [
            {
              contracts: [
                {
                  pattern: "^Button$",
                  allow: ["layout"],
                  deny: ["w-*"],
                  message: "Put width on the parent.",
                },
              ],
            },
          ],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="w-full">Go</Button>`,
          options: [
            {
              contracts: [
                {
                  pattern: "^Button$",
                  allow: ["layout"],
                  deny: ["w-*"],
                  message:
                    "Buttons size to their content. Put width on the parent Stack.",
                },
              ],
            },
          ],
          errors: [
            {
              message:
                "Buttons size to their content. Put width on the parent Stack.",
            },
          ],
        },
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="text-lg">Go</Button>`,
          options: [
            {
              contracts: [
                {
                  pattern: "^Button$",
                  allow: ["layout"],
                  message:
                    'Tone is a variant on <{{component}}>, not "{{className}}" ({{category}}).',
                },
              ],
            },
          ],
          errors: [
            {
              message:
                'Tone is a variant on <Button>, not "text-lg" (typography).',
            },
          ],
        },
        // Appearance findings fill the variant list and the file too.
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="bg-red-500">Go</Button>`,
          options: [
            {
              contracts: [
                {
                  pattern: "^Button$",
                  message:
                    "Pick a variant ({{variants}}) or add one in {{file}}.",
                },
              ],
            },
          ],
          errors: [
            {
              message: `Pick a variant (default, outline, secondary, ghost, destructive, link) or add one in ${BUTTON_FILE}.`,
            },
          ],
        },
      ],
    })
  })

  test("one message per category, with default for the rest", () => {
    const contracts = [
      {
        pattern: "^Button$",
        allow: ["layout"],
        deny: ["w-*"],
        message: {
          color: "Colors are theme tokens; pick a Button variant.",
          layout: "Width belongs to the parent.",
          default: "Appearance belongs to the component's variants.",
        },
      },
    ]
    tester.run("no-restyle", noRestyle as any, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="bg-red-500">Go</Button>`,
          options: [{ contracts }],
          errors: [
            { message: "Colors are theme tokens; pick a Button variant." },
          ],
        },
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="w-full">Go</Button>`,
          options: [{ contracts }],
          errors: [{ message: "Width belongs to the parent." }],
        },
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="text-lg">Go</Button>`,
          options: [{ contracts }],
          errors: [
            { message: "Appearance belongs to the component's variants." },
          ],
        },
      ],
    })
  })

  test("a table without words for the category leaves the rule's text", () => {
    tester.run("no-restyle", noRestyle as any, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="text-lg">Go</Button>`,
          options: [
            {
              contracts: [
                {
                  pattern: "^Button$",
                  message: { color: "Colors are tokens." },
                },
              ],
            },
          ],
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
      ],
    })
  })

  test("the deciding contract speaks, and an earlier one does not reach its components", () => {
    const contracts = [
      {
        pattern: ".*",
        allow: ["layout"],
        deny: ["mt"],
        message: { layout: "No margins on components." },
      },
      {
        pattern: "^Button$",
        allow: ["layout"],
        deny: ["w-*"],
        message: { layout: "Buttons size to their label." },
      },
    ]
    tester.run("no-restyle", noRestyle as any, {
      valid: [
        // The Button contract is Button's whole policy. The global deny on
        // margins, and its words, stop at the components it still names.
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="mt-4">Go</Button>`,
          options: [{ contracts }],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: `${card}\nexport const A = () => <Card className="mt-4">Go</Card>`,
          options: [{ contracts }],
          errors: [{ message: "No margins on components." }],
        },
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="w-full">Go</Button>`,
          options: [{ contracts }],
          errors: [{ message: "Buttons size to their label." }],
        },
        // The top-level policy has no words of its own; the rule speaks.
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="mt-4">Go</Button>`,
          options: [{ allow: ["layout"], deny: ["mt"] }],
          errors: [{ messageId: "deniedClass" }],
        },
      ],
    })
  })

  test("an empty slot takes its fallback", () => {
    tester.run("no-restyle", noRestyle as any, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          code: `import { Card } from "@/components/ui/card"\nexport const A = () => <Card className="shadow-lg">Go</Card>`,
          options: [
            {
              contracts: [
                {
                  pattern: "^Card$",
                  message:
                    "Variants: {{variants|none yet}}. Wrapper: {{wrapper|none}}. Unknown: {{nope|x}}.",
                },
              ],
            },
          ],
          errors: [
            {
              message:
                "Variants: none yet. Wrapper: none. Unknown: {{nope|x}}.",
            },
          ],
        },
      ],
    })
  })

  test("{{sizes}} is the list on every finding kind", () => {
    const contracts = [
      {
        pattern: "^Button$",
        allow: ["layout"],
        deny: ["w-*"],
        message: "Sizes: {{sizes}}.",
      },
      {
        pattern: "^CardTitle$",
        message: "Sizes: {{sizes|none yet}}.",
      },
    ]
    tester.run("no-restyle", noRestyle as any, {
      valid: [],
      invalid: [
        // A denied class names the sizes, not a literal placeholder.
        {
          filename: PAGE,
          code: `${button}
export const A = () => <Button className="w-full">Go</Button>`,
          options: [{ contracts }],
          errors: [
            {
              message:
                "Sizes: default, xs, sm, lg, icon, icon-xs, icon-sm, icon-lg.",
            },
          ],
        },
        // So does an appearance class.
        {
          filename: PAGE,
          code: `${button}
export const A = () => <Button className="font-bold">Go</Button>`,
          options: [{ contracts }],
          errors: [
            {
              message:
                "Sizes: default, xs, sm, lg, icon, icon-xs, icon-sm, icon-lg.",
            },
          ],
        },
        // And a spacing class, as before.
        {
          filename: PAGE,
          code: `${button}
export const A = () => <Button className="p-4">Go</Button>`,
          options: [{ contracts }],
          errors: [
            {
              message:
                "Sizes: default, xs, sm, lg, icon, icon-xs, icon-sm, icon-lg.",
            },
          ],
        },
        // A component without sizes takes the fallback on a non-spacing
        // finding too, rather than printing the placeholder.
        {
          filename: PAGE,
          code: `import { CardTitle } from "@/components/ui/card"
export const A = () => <CardTitle className="font-bold">Go</CardTitle>`,
          options: [{ contracts }],
          errors: [{ message: "Sizes: none yet." }],
        },
      ],
    })
  })

  test("{{variants}} is the bare list on every finding kind", () => {
    tester.run("no-restyle", noRestyle as any, {
      valid: [],
      invalid: [
        // A spacing finding on a component without variants takes the
        // fallback.
        {
          filename: PAGE,
          code: `import { CardTitle } from "@/components/ui/card"\nexport const A = () => <CardTitle className="p-4">Go</CardTitle>`,
          options: [
            {
              contracts: [
                {
                  pattern: "^CardTitle$",
                  message: { spacing: "Variants: {{variants|none yet}}." },
                },
              ],
            },
          ],
          errors: [{ message: "Variants: none yet." }],
        },
        // A spacing finding with variants lists them.
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="p-4">Go</Button>`,
          options: [
            {
              contracts: [
                {
                  pattern: "^Button$",
                  message: { spacing: "Variants: {{variants}}." },
                },
              ],
            },
          ],
          errors: [
            {
              message:
                "Variants: default, outline, secondary, ghost, destructive, link.",
            },
          ],
        },
        // Through a wrapper, the list carries no punctuation of its own.
        {
          filename: PAGE,
          code: `import { SaveButton } from "@/components/save-button"\nexport const A = () => <SaveButton className="bg-red-500">Go</SaveButton>`,
          options: [
            {
              contracts: [
                {
                  pattern: "^Button$",
                  message: { color: "Choose a variant: {{variants}}." },
                },
              ],
            },
          ],
          errors: [
            {
              message:
                "Choose a variant: default, outline, secondary, ghost, destructive, link.",
            },
          ],
        },
      ],
    })
  })

  test("the last matching contract speaks, with or without words for the finding", () => {
    tester.run("no-restyle", noRestyle as any, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="bg-red-500">Go</Button>`,
          options: [
            {
              contracts: [
                { pattern: "^Button$", allow: ["spacing"], message: "First." },
                {
                  pattern: "Button$",
                  allow: ["layout"],
                  deny: ["w-*"],
                  message: { layout: "Width on the parent." },
                },
                { pattern: "^Button$", allow: ["shape"], message: "Last." },
              ],
            },
          ],
          errors: [{ message: "Last." }],
        },
        // The last contract has no words for color. An earlier contract is
        // not part of Button's policy, so its words do not fill in; the
        // rule's own text does.
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="bg-red-500">Go</Button>`,
          options: [
            {
              contracts: [
                { pattern: "^Button$", message: "Earlier default." },
                {
                  pattern: "^Button$",
                  message: { layout: "Width on the parent." },
                },
              ],
            },
          ],
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
      ],
    })
  })
})

describe("settings.shadcn.note", () => {
  const cases: [string, string, string][] = [
    [
      "no-restyle",
      `${button}\nexport const A = () => <Button className="bg-red-500">Go</Button>`,
      "is not allowed on <Button>",
    ],
    [
      "no-raw-colors",
      `export const A = () => <div className="bg-pink-500" />`,
      "raw Tailwind palette",
    ],
    [
      "no-arbitrary-values",
      `export const A = () => <div className="p-[13px]" />`,
      "off-token value",
    ],
    [
      "no-inline-styles",
      `export const A = () => <div style={{ padding: 4 }} />`,
      "Inline style sets padding",
    ],
    [
      "require-static-classes",
      `${button}\nexport const A = ({ tone }: { tone: string }) => <Button className={tone}>Go</Button>`,
      "cannot be checked",
    ],
    [
      "no-unknown-classes",
      `export const A = () => <div className="flex-cols" />`,
      "not a class this project's Tailwind knows",
    ],
  ]
  const linter = new Linter({ cwd: PROJECT })
  for (const [name, code, marker] of cases) {
    test(`ends every ${name} finding`, () => {
      const messages = linter.verify(
        code,
        [
          {
            files: ["**/*.tsx"],
            languageOptions: {
              parser,
              parserOptions: { ecmaFeatures: { jsx: true } },
            },
            plugins: { shadcn: plugin },
            settings,
            rules: { [`shadcn/${name}`]: "error" },
          },
        ] as any,
        { filename: PAGE }
      )
      expect(messages.length).toBeGreaterThan(0)
      for (const m of messages) {
        expect(m.message).toContain(marker)
        expect(m.message.endsWith(` ${NOTE}`)).toBe(true)
      }
    })
  }

  test("the note trails a contract message", () => {
    tester.run("no-restyle", noRestyle as any, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="w-full">Go</Button>`,
          settings,
          options: [
            {
              contracts: [
                {
                  pattern: "^Button$",
                  allow: ["layout"],
                  deny: ["w-*"],
                  message: "Put width on the parent.",
                },
              ],
            },
          ],
          errors: [
            {
              message: `Put width on the parent. ${NOTE}`,
            },
          ],
        },
      ],
    })
  })

  test("a note that is not a string is ignored, with one warning", () => {
    const warnings: string[] = []
    resetWarnings()
    setWarningSink((message) => warnings.push(message))
    try {
      tester.run("no-raw-colors", noRawColors as any, {
        valid: [],
        invalid: [
          {
            filename: PAGE,
            code: `export const A = () => <div className="bg-pink-500" />`,
            settings: { shadcn: { note: 42 } },
            errors: [{ messageId: "paletteClassFar" }],
          },
        ],
      })
    } finally {
      setWarningSink((message) => console.warn(message))
    }
    expect(warnings.some((w) => w.includes("settings.shadcn.note"))).toBe(true)
  })
})
