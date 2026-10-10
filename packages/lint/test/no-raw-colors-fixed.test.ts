import { describe, test } from "vitest"

import { noRawColors } from "../src/rules/no-raw-colors"
import { button, createTester, PAGE } from "./helpers"

const tester = createTester()
const rule = noRawColors as any

// Tailwind declares white and black in every theme, and shadcn/ui uses
// them, so they pass until deny names them.
describe("no-raw-colors white and black", () => {
  test("accepted by default, reported where deny names them", () => {
    tester.run("no-raw-colors", rule, {
      valid: [
        {
          filename: PAGE,
          code: `export const A = () => <div className="text-white bg-black/50" />`,
        },
        {
          filename: PAGE,
          code: `export const A = () => <div className="text-white bg-black/50" />`,
          options: [{ allow: ["*-red-*"] }],
        },
        // Denying white leaves black alone.
        {
          filename: PAGE,
          code: `export const A = () => <div className="bg-black/50" />`,
          options: [{ deny: ["*-white"] }],
        },
        // A contract with its own deny lets one component keep them.
        {
          filename: PAGE,
          code: `${button}\nexport const A = () => <Button className="text-white">Go</Button>`,
          options: [
            {
              deny: ["*-white"],
              contracts: [{ pattern: "^Button$", deny: [] }],
            },
          ],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: `export const A = () => <div className="hover:text-white bg-black/50" />`,
          options: [{ deny: ["*-white", "*-black"] }],
          errors: [
            {
              messageId: "paletteClassNear",
              suggestions: [
                {
                  messageId: "useToken",
                  data: { replacement: "hover:text-background" },
                  output: `export const A = () => <div className="hover:text-background bg-black/50" />`,
                },
                {
                  messageId: "useToken",
                  data: { replacement: "hover:text-primary-foreground" },
                  output: `export const A = () => <div className="hover:text-primary-foreground bg-black/50" />`,
                },
              ],
            },
            { messageId: "paletteClassFar" },
          ],
        },
      ],
    })
  })
})
