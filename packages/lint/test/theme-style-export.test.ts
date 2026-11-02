// Regression test for #108: a stylesheet import of a package must
// resolve through the package's `style` export condition, not its
// JavaScript entry. The fixture project's globals.css imports
// "tailwindcss", whose exports list `style: ./index.css` alongside
// `import: ./dist/lib.mjs`. Before this fix, the theme read followed
// `import`, read dist/lib.mjs as CSS, and collected roughly 300
// identifiers from the JavaScript bundle (value, map, length, ...) as
// known classes, so no-unknown-classes stopped reporting them.

import { describe, expect, test } from "vitest"

import { knownClassesFor } from "../src/project/theme"
import { PAGE } from "./helpers"

describe("stylesheet imports prefer the style export condition (#108)", () => {
  test("identifiers from tailwindcss's JS entry are not known classes", () => {
    const known = knownClassesFor(PAGE)
    expect(known.classes.has("value")).toBe(false)
    expect(known.classes.has("map")).toBe(false)
    expect(known.classes.has("length")).toBe(false)
  })

  test("the project's own classes are still read from its theme", () => {
    expect(knownClassesFor(PAGE).classes.has("legacy-card")).toBe(true)
  })
})
