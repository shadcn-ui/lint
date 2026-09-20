// A class the project's own CSS declares with @utility is one Tailwind
// generates. The grammar still cannot say what it changes, so a contract
// does not let it through, but the finding must not call it a typo.

import { describe, expect, test } from "vitest"

import { declaresClass, declaresUtility } from "../src/project/theme"
import { noRestyle } from "../src/rules/no-restyle"
import { button, createTester, OUTSIDE, PAGE } from "./helpers"

describe("declaresClass", () => {
  test("knows the project's @utility names, prefixes, and selectors", () => {
    expect(declaresClass(PAGE, "tap-target")).toBe(true)
    expect(declaresClass(PAGE, "hover:tap-target")).toBe(true)
    expect(declaresClass(PAGE, "tab-4")).toBe(true)
    expect(declaresClass(PAGE, "legacy-card")).toBe(true)
    // A plain selector is a class, not an @utility.
    expect(declaresUtility(PAGE, "legacy-card")).toBe(false)
    expect(declaresUtility(PAGE, "tap-target")).toBe(true)
    expect(declaresUtility(PAGE, "hover:tab-4/50")).toBe(true)
    // The reporter's case: an @utility from an imported package's CSS.
    expect(declaresClass(PAGE, "shimmer")).toBe(true)
    expect(declaresClass(PAGE, "flex-cols")).toBe(false)
    expect(declaresClass(OUTSIDE, "tap-target")).toBe(false)
  })
})

describe("no-restyle", () => {
  test("does not report a declared utility as a misspelling", () => {
    createTester().run("no-restyle", noRestyle as any, {
      valid: [
        // Allowing it by name stays the way through.
        {
          filename: PAGE,
          code: `${button}\nconst a = <Button className="tap-target" />`,
          options: [{ allow: ["layout", "tap-target"] }],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: `${button}\nconst a = <Button className="tap-target" />`,
          options: [{ allow: ["layout"] }],
          errors: [
            {
              message:
                '"tap-target" is not allowed on <Button>: your CSS declares it, and the grammar cannot tell what it changes. Use a variant, or put it on a parent element.',
            },
          ],
        },
        // A name nothing declares is still a spelling finding.
        {
          filename: PAGE,
          code: `${button}\nconst a = <Button className="flex-cols" />`,
          options: [{ allow: ["layout"] }],
          errors: [{ messageId: "unclassifiedClass" }],
        },
      ],
    })
  })
})
