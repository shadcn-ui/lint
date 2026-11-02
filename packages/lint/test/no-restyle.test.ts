import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { describe, test } from "vitest"

import { noRestyle } from "../src/rules/no-restyle"
import { button, card, cn, createTester, OUTSIDE, PAGE } from "./helpers"

const tester = createTester()
const rule = noRestyle as any

// Nothing crosses until config says so. Most cases open layout at the
// top level, the policy a project starts from, and test the boundary
// from there.
const layout = [{ allow: ["layout"] }]

describe("no-restyle", () => {
  test("layout crosses when allowed, appearance does not", () => {
    tester.run("no-restyle", rule, {
      valid: [
        {
          filename: PAGE,
          options: layout,
          code: `${button}\nexport const A = () => <Button className="mt-4 w-full col-start-2 hidden md:inline-flex">Go</Button>`,
        },
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button variant="destructive">Go</Button>`,
        },
        // Plain elements and unknown components are unrestricted.
        {
          filename: PAGE,
          code: `export const A = () => <div className="bg-red-500 rounded-full" />`,
        },
        {
          filename: PAGE,
          code: `import { Hero } from "./hero"\nexport const A = () => <Hero className="bg-muted" />`,
        },
        {
          filename: PAGE,
          options: layout,
          code: `${button}\n${cn}\nexport const A = ({ className }: { className?: string }) => <Button className={cn("w-full", className)}>Go</Button>`,
        },
        // Outside a project nothing is a design-system component.
        {
          filename: OUTSIDE,
          code: `${button}\nexport const A = () => <Button className="bg-red-500">Go</Button>`,
        },
      ],
      invalid: [
        // With no allow list, placement is a finding too, and it says so
        // in its own words rather than through the variant ladder.
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="mt-4 bg-red-500">Go</Button>`,
          errors: [
            { messageId: "layoutClassClosed" },
            { messageId: "appearanceClassWithVariants" },
          ],
        },
        {
          filename: PAGE,
          options: layout,
          code: `${button}\nexport const A = () => <Button className="bg-red-500 rounded-full">Go</Button>`,
          errors: [
            { messageId: "appearanceClassWithVariants" },
            { messageId: "appearanceClassWithVariants" },
          ],
        },
        // Recognized by name: a re-export from outside /ui/ is still Button.
        {
          filename: PAGE,
          options: layout,
          code: `import { Button } from "@/components/widgets"\nexport const A = () => <Button className="text-xs">Go</Button>`,
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        // An arbitrary property that paints or casts a shadow is
        // appearance; layout does not open it. Margin stays layout.
        {
          filename: PAGE,
          options: layout,
          code: `${button}\nexport const A = () => <Button className="[margin:1rem] [background:red] [border-top-color:red] [text-shadow:0_0_1px_red] [border:1px_solid_red]">Go</Button>`,
          errors: [
            {
              message:
                /"\[background:red\]" is not allowed on <Button>: <Button> owns its color/,
            },
            {
              message:
                /"\[border-top-color:red\]" is not allowed on <Button>: <Button> owns its color/,
            },
            {
              message:
                /"\[text-shadow:0_0_1px_red\]" is not allowed on <Button>: <Button> owns its effects/,
            },
            {
              message:
                /"\[border:1px_solid_red\]" is not allowed on <Button>: <Button> owns its shape/,
            },
          ],
        },
        {
          filename: PAGE,
          options: layout,
          code: `${button}\n${cn}\nexport const A = () => <Button className={cn("w-full", "shadow-lg")}>Go</Button>`,
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        {
          filename: PAGE,
          options: layout,
          code: `${button}\nexport const A = ({ on }: { on: boolean }) => <Button className={on ? "bg-accent" : "mt-2"}>Go</Button>`,
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        {
          filename: PAGE,
          options: layout,
          code: `${button}\nexport const A = () => <Button className="hover:bg-emerald-500">Go</Button>`,
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        // Closed widgets do not take spacing; the message offers sizes.
        {
          filename: PAGE,
          options: layout,
          code: `${button}\nexport const A = () => <Button className="p-0">Go</Button>`,
          errors: [{ messageId: "spacingClassWithSizes" }],
        },
        // Any class-like prop is a boundary.
        {
          filename: PAGE,
          options: layout,
          code: `${button}\nexport const A = () => <Button classNames={{ root: "bg-red-500" }}>Go</Button>`,
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
      ],
    })
  })

  test("one-hop resolution keeps the component context", () => {
    tester.run("no-restyle", rule, {
      valid: [
        {
          filename: PAGE,
          options: layout,
          code: `${button}\nconst layout = "mt-4 w-full"\nexport const A = () => <Button className={layout}>Go</Button>`,
        },
      ],
      invalid: [
        {
          filename: PAGE,
          options: layout,
          code: `${button}\nexport const A = ({ active }: { active: boolean }) => { const tone = active ? "bg-primary" : "mt-2"; return <Button className={tone}>Go</Button> }`,
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        // Every variant of a called cva result is a possible output.
        {
          filename: PAGE,
          options: layout,
          code: `${button}\nimport { cva } from "class-variance-authority"\nconst tone = cva("mt-2", { variants: { tone: { loud: "bg-primary", quiet: "mb-2" } } })\nexport const A = () => <Button className={tone({ tone: "quiet" })}>Go</Button>`,
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        {
          filename: PAGE,
          options: layout,
          code: `${button}\nimport { tv } from "tailwind-variants"\nconst tone = tv({ base: "mt-2", variants: { shape: { flat: "rounded-none" } } })\nexport const A = () => <Button className={tone()}>Go</Button>`,
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
      ],
    })
  })

  test("open containers accept spacing when a contract opens them", () => {
    // The policy the old default shipped, written where it can be read.
    const options = [
      {
        allow: ["layout"],
        contracts: [
          {
            pattern: "^Card$|(Content|Header|Footer|Group|Panel)$",
            allow: ["layout", "spacing"],
          },
        ],
      },
    ]
    tester.run("no-restyle", rule, {
      valid: [
        {
          filename: PAGE,
          options,
          code: `${card}\nexport const A = () => <Card className="p-0"><CardContent className="px-2 pt-4 md:px-6">Hi</CardContent></Card>`,
        },
      ],
      invalid: [
        {
          filename: PAGE,
          options,
          code: `${card}\nexport const A = () => <CardContent className="px-2 rounded-xl text-xs">Hi</CardContent>`,
          errors: [
            { messageId: "appearanceClassNoVariants" },
            { messageId: "appearanceClassNoVariants" },
          ],
        },
        // Without the contract, spacing on a slot is a finding like any other.
        {
          filename: PAGE,
          options: layout,
          code: `${card}\nexport const A = () => <CardContent className="px-2">Hi</CardContent>`,
          errors: [{ messageId: "spacingClassNoSizes" }],
        },
      ],
    })
  })

  test("contracts: allow, deny, and replacing the top-level policy", () => {
    tester.run("no-restyle", rule, {
      valid: [
        // Class globs match the base utility at every breakpoint.
        {
          filename: PAGE,
          code: `${card}\nexport const A = () => <CardTitle className="p-2 md:p-4 hover:!px-3">Hi</CardTitle>`,
          options: [
            { contracts: [{ pattern: "^CardTitle$", allow: ["p-*", "px-*"] }] },
          ],
        },
        // A cn group id allows every value of that utility.
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="rounded-full">Go</Button>`,
          options: [
            { contracts: [{ pattern: "^Button$", allow: ["rounded"] }] },
          ],
        },
        // A contract's allow is the whole list for the components it
        // names; it does not add to the top-level one.
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="w-full w-[320px]">Go</Button>`,
          options: [
            {
              allow: ["layout"],
              contracts: [{ pattern: "^Button$", allow: ["w-*"] }],
            },
          ],
        },
        // Opacity modifiers are ignored when matching.
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="bg-primary/50">Go</Button>`,
          options: [
            { contracts: [{ pattern: "^Button$", allow: ["bg-primary"] }] },
          ],
        },
        // The last matching contract is the policy; earlier ones do not merge in.
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="mt-4">Go</Button>`,
          options: [
            {
              contracts: [
                { pattern: "^Button$", allow: ["color"] },
                { pattern: "Button", allow: ["layout"] },
              ],
            },
          ],
        },
      ],
      invalid: [
        // deny subtracts from the contract's own allow, at every
        // breakpoint and with markers.
        {
          filename: PAGE,
          code: `${card}\nexport const A = () => <CardContent className="md:p-0 hover:!px-0 p-4">Hi</CardContent>`,
          options: [
            {
              contracts: [
                {
                  pattern: "^CardContent$",
                  allow: ["spacing"],
                  deny: ["p-0", "px-0"],
                },
              ],
            },
          ],
          errors: [{ messageId: "deniedClass" }, { messageId: "deniedClass" }],
        },
        // A pattern with a colon matches only that variant form.
        {
          filename: PAGE,
          code: `${card}\nexport const A = () => <CardContent className="md:p-0 p-0">Hi</CardContent>`,
          options: [
            {
              contracts: [
                {
                  pattern: "^CardContent$",
                  allow: ["spacing"],
                  deny: ["md:p-*"],
                },
              ],
            },
          ],
          errors: [{ messageId: "deniedClass" }],
        },
        // A contract replaces the top-level allow: layout opened there
        // does not reach a component whose contract leaves it out.
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="mt-4">Go</Button>`,
          options: [
            {
              allow: ["layout"],
              contracts: [{ pattern: "^Button$", allow: ["w-*"] }],
            },
          ],
          errors: [
            {
              messageId: "layoutClass",
              data: { className: "mt-4", component: "Button", entries: "w-*" },
            },
          ],
        },
        // The last matching contract decides; the color one is shadowed.
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="bg-red-500">Go</Button>`,
          options: [
            {
              contracts: [
                { pattern: "^Button$", allow: ["color"] },
                { pattern: "Button", allow: ["layout"] },
              ],
            },
          ],
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        // A contract with only a message keeps the top-level list and
        // speaks for its components: mt-4 passes, px-2 gets its words.
        {
          filename: PAGE,
          code: `${card}\nexport const A = () => <CardContent className="px-2 mt-4">Hi</CardContent>`,
          options: [
            {
              allow: ["layout"],
              contracts: [
                {
                  pattern: "^CardContent$",
                  message:
                    "<CardContent> takes layout from outside, not {{className}}.",
                },
              ],
            },
          ],
          errors: [
            { message: "<CardContent> takes layout from outside, not px-2." },
          ],
        },
        // Allowing a boundary never bypasses the vocabulary rules, but
        // the boundary itself is open: p-[13px] passes here.
        {
          filename: PAGE,
          code: `${card}\nexport const A = () => <CardTitle className="p-[13px] text-xs">Hi</CardTitle>`,
          options: [
            { contracts: [{ pattern: "^CardTitle$", allow: ["p-*"] }] },
          ],
          errors: [{ messageId: "appearanceClassNoVariants" }],
        },
      ],
    })
  })

  test("componentImports works without a project", () => {
    tester.run("no-restyle", rule, {
      valid: [],
      invalid: [
        {
          filename: OUTSIDE,
          code: `import { Button } from "@acme/ui"\nexport const A = () => <Button className="bg-red-500">Go</Button>`,
          options: [{ componentImports: ["^@acme/ui"] }],
          errors: [{ messageId: "appearanceClass" }],
        },
      ],
    })
  })
})

// shadcn-ui/lint#136: buttonVariants kept in button-variants.ts so
// button.tsx exports only components. Button gets the same sizes and
// variants as Toggle, whose factory sits in its own file.
test("a factory imported into the component file lists its sizes and variants", () => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "lint-imported-factory-"))
  )
  const write = (name: string, source: string) => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    fs.writeFileSync(path.join(root, name), source)
  }
  const axes = `{
    variants: {
      variant: { default: "bg-black text-white", outline: "border" },
      size: { default: "h-9 px-4", sm: "h-8 px-3", lg: "h-10 px-6" },
    },
  }`
  try {
    write("package.json", JSON.stringify({ private: true }))
    write(
      "components.json",
      JSON.stringify({
        tailwind: { css: "app/globals.css" },
        aliases: { components: "@/components", ui: "@/components/ui" },
      })
    )
    write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { paths: { "@/*": ["./*"] } } })
    )
    write("app/globals.css", `@import "tailwindcss";`)
    write(
      "components/ui/button-variants.ts",
      `import { cva } from "class-variance-authority"
export const buttonVariants = cva("inline-flex items-center rounded-md", ${axes})`
    )
    write(
      "components/ui/button.tsx",
      `import type { VariantProps } from "class-variance-authority"
import { buttonVariants } from "@/components/ui/button-variants"
export function Button({ className, variant, size, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button className={buttonVariants({ variant, size, className })} {...props} />
}`
    )
    write(
      "components/ui/toggle.tsx",
      `import { cva, type VariantProps } from "class-variance-authority"
const toggleVariants = cva("inline-flex items-center rounded-md", ${axes})
export function Toggle({ className, variant, size, ...props }: React.ComponentProps<"button"> & VariantProps<typeof toggleVariants>) {
  return <button className={toggleVariants({ variant, size, className })} {...props} />
}`
    )
    const spacing = (name: string) =>
      new RegExp(
        `^"p-8" is not allowed on <${name}>: <${name}> owns its spacing\\. Use a size \\(default, sm, lg\\), or margin here or gap on the parent for space around it\\.`
      )
    const shape = (name: string) =>
      new RegExp(
        `^"border-2" is not allowed on <${name}>: <${name}> owns its shape\\. Use a variant: default, outline\\.`
      )
    tester.run("no-restyle", rule, {
      valid: [],
      invalid: ["Button", "Toggle"].map((name) => ({
        filename: path.join(root, "app/page.tsx"),
        options: layout,
        code: `import { ${name} } from "@/components/ui/${name.toLowerCase()}"
export const A = () => <${name} className="p-8 border-2" />`,
        errors: [{ message: spacing(name) }, { message: shape(name) }],
      })),
    })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe("contract entries that are both a class and a group", () => {
  test("flex opens the class and the group", () => {
    tester.run("no-restyle", noRestyle as any, {
      valid: [
        {
          filename: PAGE,
          code: `${card}\nexport const A = () => <CardTitle className="flex flex-1 text-xs">Hi</CardTitle>`,
          options: [
            {
              contracts: [
                { pattern: "^CardTitle$", allow: ["flex", "typography"] },
              ],
            },
          ],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="flex flex-1">Go</Button>`,
          options: [
            {
              contracts: [
                { pattern: "^Button$", allow: ["layout"], deny: ["flex"] },
              ],
            },
          ],
          errors: [{ messageId: "deniedClass" }, { messageId: "deniedClass" }],
        },
      ],
    })
  })
})
