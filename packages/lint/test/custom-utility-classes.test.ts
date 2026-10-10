// A class the project's own CSS declares with @utility is one Tailwind
// generates, and its body says what it changes: a utility that sets
// min-height is layout, one that sets font-size is typography. A class
// the CSS declares some other way still has no readable body, so a
// contract does not let it through, but the finding must not call it a
// typo.

import { describe, expect, test } from "vitest"

import { projectClassifierFor } from "../src/project/namespaces"
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

describe("the group an @utility gives its class", () => {
  const groupOf = (token: string) => projectClassifierFor(PAGE).groupOf(token)

  test("reads the body, not the name", () => {
    expect(groupOf("tap-target")).toBe("arbitrary..min-height")
    expect(groupOf("max-w-chat")).toBe("arbitrary..max-width")
    expect(groupOf("heading-2xs")).toBe("arbitrary..font-size")
    // text-* is a color to the grammar; the body says otherwise.
    expect(groupOf("text-md-regular")).toBe("arbitrary..font-size")
    // A variant or an opacity modifier does not change what it sets.
    expect(groupOf("hover:heading-2xs")).toBe("arbitrary..font-size")
    // A prefix utility takes the body of its @utility tab-*.
    expect(groupOf("tab-4")).toBe("tab-size")
    // A plain selector is not an @utility, so nothing is read from it.
    expect(groupOf("legacy-card")).toBe(null)
    expect(groupOf("flex-cols")).toBe(null)
  })
})

describe("no-restyle", () => {
  test("allows a declared utility the contract's categories cover", () => {
    createTester().run("no-restyle", noRestyle as any, {
      valid: [
        // min-height and max-width are layout, so layout covers them.
        {
          filename: PAGE,
          code: `${button}\nconst a = <Button className="tap-target max-w-chat" />`,
          options: [{ allow: ["layout"] }],
        },
        // A package's @utility shimmer sets an animation: motion, so a
        // contract that allows every category allows it.
        {
          filename: PAGE,
          code: `${button}\nconst a = <Button className="shimmer" />`,
          options: [
            {
              allow: [
                "layout",
                "typography",
                "color",
                "spacing",
                "shape",
                "effects",
                "motion",
              ],
            },
          ],
        },
        // Allowing it by name stays the way through.
        {
          filename: PAGE,
          code: `${button}\nconst a = <Button className="heading-2xs" />`,
          options: [{ allow: ["layout", "heading-2xs"] }],
        },
      ],
      invalid: [
        // A utility that sets font-size is typography, not a color and
        // not a misspelling.
        {
          filename: PAGE,
          code: `${button}\nconst a = <Button className="text-md-regular" />`,
          options: [{ allow: ["layout"] }],
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        {
          filename: PAGE,
          code: `${button}\nconst a = <Button className="shimmer" />`,
          options: [{ allow: ["layout"] }],
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        {
          filename: PAGE,
          code: `${button}\nconst a = <Button className="tap-target" />`,
          options: [{ allow: [] }],
          errors: [{ messageId: "layoutClassClosed" }],
        },
      ],
    })
  })

  test("does not report a declared class as a misspelling", () => {
    createTester().run("no-restyle", noRestyle as any, {
      valid: [],
      invalid: [
        // A plain selector has no body a group can be read from.
        {
          filename: PAGE,
          code: `${button}\nconst a = <Button className="legacy-card" />`,
          options: [{ allow: ["layout"] }],
          errors: [
            {
              message:
                '"legacy-card" is not allowed on <Button>: your CSS declares it, and the grammar cannot tell what it changes. Use a variant, or put it on a parent element.',
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
