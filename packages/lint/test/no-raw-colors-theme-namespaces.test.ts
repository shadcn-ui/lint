// Tailwind resolves a utility against a theme namespace of its own as
// well as --color-*, so --text-stat-label makes text-stat-label a
// font-size and --shadow-card-glow a box-shadow. Both share a prefix
// with a color utility and neither is a color: reporting them as
// undeclared theme colors sends an agent to delete a token the theme
// declares. The classes that are still colors need the oracle to settle
// who owns the typo, so they skip without it.

import * as path from "node:path"
import { describe, test } from "vitest"

import { noRawColors } from "../src/rules/no-raw-colors"
import { noRestyle } from "../src/rules/no-restyle"
import { oracleAvailable } from "../src/tailwind/client"
import { createTester, PROJECT } from "./helpers"

const PAGE = path.join(path.dirname(PROJECT), "namespace-theme/app/page.tsx")

const oracle = oracleAvailable()

describe("no-raw-colors and theme namespaces", () => {
  test("a declared non-color namespace is not an undeclared color", () => {
    createTester().run("no-raw-colors", noRawColors as any, {
      valid: [
        // --text-stat-label: a font-size, not a color.
        {
          filename: PAGE,
          code: `export const A = () => <p className="text-stat-label" />`,
        },
        // --shadow-card-glow and --drop-shadow-lift: box-shadows.
        {
          filename: PAGE,
          code: `export const A = () => <div className="shadow-card-glow drop-shadow-lift" />`,
        },
        // bg-* reads --background-image-*, where the namespace and the
        // prefix are not the same word.
        {
          filename: PAGE,
          code: `export const A = () => <div className="bg-stripes" />`,
        },
        // A variant and a modifier do not change the namespace.
        {
          filename: PAGE,
          code: `export const A = () => <p className="md:text-stat-label hover:shadow-card-glow/50" />`,
        },
        // The project's own @utility is its own vocabulary.
        {
          filename: PAGE,
          code: `export const A = () => <p className="text-callout" />`,
        },
        // With a variant and an opacity, still the same @utility.
        {
          filename: PAGE,
          code: `export const A = () => <p className="hover:text-callout/50" />`,
        },
        // The declared color still reads as a color.
        {
          filename: PAGE,
          code: `export const A = () => <div className="bg-primary text-primary" />`,
        },
      ],
      invalid: [
        // A plain `.text-legacy { color: #f00 }` selector is not vocabulary:
        // the color behind it is exactly the raw color to report.
        {
          filename: PAGE,
          code: `export const A = () => <p className="text-legacy" />`,
          errors: [{ messageId: "undeclaredToken" }],
        },
      ],
    })
  })

  // A namespace declared for one prefix does not open another.
  describe.skipIf(!oracle)("with the oracle", () => {
    test("an undeclared color is still an undeclared color", () => {
      createTester().run("no-raw-colors", noRawColors as any, {
        valid: [],
        invalid: [
          {
            filename: PAGE,
            code: `export const A = () => <div className="bg-stat-label" />`,
            errors: [{ messageId: "undeclaredToken" }],
          },
          {
            filename: PAGE,
            code: `export const A = () => <div className="text-brand" />`,
            errors: [{ messageId: "undeclaredToken" }],
          },
        ],
      })
    }, 60_000)
  })
})

// no-restyle reads the same classifier, so a declared --text-* token is
// typography under a contract, not a color.
describe("no-restyle and theme namespaces", () => {
  test("a declared font-size token is typography", () => {
    const button = `import { Button } from "@/components/ui/button"`
    createTester().run("no-restyle", noRestyle as any, {
      valid: [
        {
          filename: PAGE,
          options: [{ allow: ["typography"] }],
          code: `${button}\nexport const A = () => <Button className="text-stat-label" />`,
        },
      ],
      invalid: [
        {
          filename: PAGE,
          options: [{ allow: ["layout"] }],
          code: `${button}\nexport const A = () => <Button className="text-stat-label" />`,
          errors: [{ message: /owns its typography/ }],
        },
      ],
    })
  })

  // A scale the theme declares is read the way cn merges it: rounded-card
  // is a radius, so a contract that allows shape accepts it.
  test("a declared radius is shape", () => {
    const button = `import { Button } from "@/components/ui/button"`
    createTester().run("no-restyle", noRestyle as any, {
      valid: [
        {
          filename: PAGE,
          options: [{ allow: ["shape"] }],
          code: `${button}\nexport const A = () => <Button className="rounded-card" />`,
        },
      ],
      invalid: [
        {
          filename: PAGE,
          options: [{ allow: ["layout"] }],
          code: `${button}\nexport const A = () => <Button className="rounded-card" />`,
          errors: [{ message: /owns its shape/ }],
        },
      ],
    })
  })
})
