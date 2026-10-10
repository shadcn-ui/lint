// A theme that loads its type scale with @config names no --text-* in
// CSS, so the grammar reads text-body as a color. The project's own
// Tailwind knows it is a font size, and a typography contract covers it.

import * as path from "node:path"
import { describe, test } from "vitest"

import { noRawColors } from "../src/rules/no-raw-colors"
import { noRestyle } from "../src/rules/no-restyle"
import { oracleAvailable } from "../src/tailwind/client"
import { button, createTester, PROJECT } from "./helpers"

const PAGE = path.join(path.dirname(PROJECT), "config-theme/app/page.tsx")

describe.skipIf(!oracleAvailable())("a font size from @config", () => {
  test("is typography, not color", () => {
    createTester().run("no-restyle", noRestyle as any, {
      valid: [
        {
          filename: PAGE,
          options: [{ allow: ["layout", "typography"] }],
          code: `${button}\nexport const A = () => <Button className="text-body md:text-body/6 font-semibold" />`,
        },
      ],
      invalid: [
        {
          filename: PAGE,
          options: [{ allow: ["layout"] }],
          code: `${button}\nexport const A = () => <Button className="text-body" />`,
          errors: [{ message: /owns its typography/ }],
        },
        // A color from the same config is still a color.
        {
          filename: PAGE,
          options: [{ allow: ["layout", "typography"] }],
          code: `${button}\nexport const A = () => <Button className="text-brand" />`,
          errors: [{ message: /owns its color/ }],
        },
      ],
    })
  })

  test("is not a raw color", () => {
    createTester().run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: PAGE,
          code: `export const A = () => <p className="text-body" />`,
        },
      ],
      invalid: [],
    })
  })
})
