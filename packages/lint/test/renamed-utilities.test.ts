import * as path from "node:path"
import { describe, expect, test } from "vitest"

import { categoryOf } from "../src/grammar/categories"
import { groupOf } from "../src/grammar/classifier"
import { noRawColors } from "../src/rules/no-raw-colors"
import { noRestyle } from "../src/rules/no-restyle"
import { button, createTester, PAGE } from "./helpers"

// Issue 181's project: cn@0.5.2, which no longer lists bg-gradient-to.
const CN_052 = path.join(__dirname, "fixtures/cn-0.5.2/LegacyGradient.tsx")

const tester = createTester()

const layout = [{ allow: ["layout"] }]

// Tailwind still generates the Tailwind 3 names, so the rules read them
// as the utilities they are rather than as classes nobody recognizes.
describe("renamed utilities", () => {
  test("no-restyle allows them wherever the current name is allowed", () => {
    tester.run("no-restyle", noRestyle as any, {
      valid: [
        {
          filename: PAGE,
          options: layout,
          code: `${button}\nexport const A = () => <Button className="flex-grow flex-shrink-0">Go</Button>`,
        },
      ],
      invalid: [
        // Typography and shape still belong to the component.
        {
          filename: PAGE,
          options: layout,
          code: `${button}\nexport const A = () => <Button className="overflow-ellipsis">Go</Button>`,
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
      ],
    })
  })

  test("no-raw-colors reads decoration-clone as a box decoration", () => {
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: PAGE,
          code: `export const A = () => <div className="decoration-clone decoration-slice" />`,
        },
      ],
      invalid: [],
    })
  })

  // https://github.com/shadcn-ui/lint/issues/181
  test("no-raw-colors ignores bg-gradient-to-t and still reports a raw color", () => {
    expect(groupOf("bg-gradient-to-t", CN_052)).toBe("bg-image")
    expect(categoryOf(groupOf("bg-gradient-to-t", CN_052))).toBe("effects")
    expect(groupOf("*:data-[slot=card]:bg-gradient-to-t", CN_052)).toBe(
      "bg-image"
    )
    expect(groupOf("bg-red-500", CN_052)).toBe("bg-color")
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: CN_052,
          code: `export const Legacy = () => <div className="bg-gradient-to-t from-primary to-background" />
export const Modern = () => <div className="bg-linear-to-t from-primary to-background" />
export const Descendant = () => (
  <div className="*:data-[slot=card]:bg-gradient-to-t from-primary to-background" />
)`,
        },
      ],
      invalid: [
        {
          filename: CN_052,
          code: `export const Raw = () => <div className="bg-red-500" />`,
          errors: [{ messageId: "paletteClassFar" }],
        },
      ],
    })
  })
})
