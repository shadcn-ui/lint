import { describe, test } from "vitest"

import { noRawColors } from "../src/rules/no-raw-colors"
import { noRestyle } from "../src/rules/no-restyle"
import { button, createTester, PAGE } from "./helpers"

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
})
