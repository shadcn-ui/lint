// tw-animate-css, which shadcn init installs, generates animate-in from
// its own @theme and fade-in, slide-in-from-top-1 and the rest from
// @utility rules that set the custom properties its keyframes read. A
// theme that imports it makes all of them motion, the way Tailwind's own
// animate-spin is (#118).

import * as path from "node:path"
import { describe, expect, test } from "vitest"

import { categoryOf } from "../src/grammar/categories"
import { projectClassifierFor } from "../src/project/namespaces"
import { noRestyle } from "../src/rules/no-restyle"
import { createTester } from "./helpers"

const PAGE = path.join(__dirname, "fixtures/animate-theme/app/page.tsx")
const table = `import { TableRow } from "@/components/ui/table"`
const classes = "animate-in fade-in slide-in-from-top-1 animation-duration-200"

describe("tw-animate-css classes", () => {
  const categoryFor = (token: string) =>
    categoryOf(projectClassifierFor(PAGE).groupOf(token))

  test.each([
    "animate-in",
    "animate-out",
    "data-[state=open]:animate-in",
    "fade-in",
    "fade-in-50",
    "fade-out",
    "blur-in",
    "zoom-in-95",
    "spin-in",
    "slide-in-from-top",
    "slide-in-from-top-1",
    "slide-in-from-start",
    "slide-out-to-bottom-2",
    "animation-duration-200",
    "repeat-2",
  ])("%s is motion", (token) => {
    expect(categoryFor(token)).toBe("motion")
  })

  test("an animation the package does not declare is still unknown", () => {
    expect(projectClassifierFor(PAGE).groupOf("animate-wiggle")).toBeNull()
    expect(projectClassifierFor(PAGE).groupOf("slide-in-sideways")).toBeNull()
  })
})

describe("no-restyle", () => {
  test("the issue's classes fall under motion", () => {
    createTester().run("no-restyle", noRestyle as any, {
      valid: [
        {
          filename: PAGE,
          options: [{ allow: ["layout", "motion"] }],
          code: `${table}\nexport const A = () => <TableRow className="${classes}" />`,
        },
      ],
      invalid: [
        {
          filename: PAGE,
          options: [{ allow: ["layout"] }],
          code: `${table}\nexport const A = () => <TableRow className="${classes}" />`,
          errors: classes.split(" ").map((className) => ({
            messageId: "appearanceClassNoVariants",
            data: {
              className,
              component: "TableRow",
              category: "motion",
              where: "in test/fixtures/animate-theme/components/ui/table.tsx",
            },
          })),
        },
      ],
    })
  })
})
