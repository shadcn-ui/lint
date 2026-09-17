// The Tailwind oracle: the project's own Tailwind decides which
// classes generate CSS. Tested directly (async, no worker) here; the
// synchronous bridge is exercised by the no-unknown-classes rule tests.

import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

import { query, resetOracle, resolveStylesheet } from "../src/tailwind/oracle"
import { PROJECT } from "./helpers"

const CSS = path.join(PROJECT, "app/globals.css")

const LINKED = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/pnpm-linked/src/app.css"
)

describe("tailwind oracle", () => {
  test("knows the theme, @utility rules and every variant", async () => {
    resetOracle()
    const answer = await query(CSS, [
      "flex",
      "items-center",
      "bg-primary/90",
      "tap-target",
      "tab-4",
      "hover:bg-primary",
      "data-[state=open]:flex",
      "group-has-data-[collapsible=icon]:hidden",
      "**:data-[slot=card]:shadow-xs",
      "@xl/main:grid-cols-2",
      "not-disabled:hover:bg-accent",
      "[&_svg]:size-4",
      "-mt-2",
      "!p-0",
      "bg-(--brand)",
      // From a package that exports only a style condition.
      "shimmer",
      // Tailwind 3 names Tailwind 4 still generates, bare and scaled.
      "flex-grow",
      "flex-shrink-0",
      "flex-grow-2",
      "flex-grow-[3]",
      "overflow-ellipsis",
      "decoration-clone",
    ])
    expect(answer).toEqual({
      ok: true,
      generation: expect.any(Number),
      hasModules: false,
      unknown: [],
    })
  })

  test("names the misspelled utility or variant", async () => {
    const answer = await query(CSS, [
      "flex-cols",
      "itms-center",
      "md:grd",
      "hovr:flex",
      "foucs:ring-2",
      "hover:roundedd",
      "rounded-huge",
      "tablet:flex",
      "items-top",
    ])
    expect(answer.ok).toBe(true)
    if (!answer.ok) return
    expect(answer.unknown).toEqual([
      { token: "flex-cols", suggestion: "flex-col", baseKnown: false },
      { token: "itms-center", suggestion: "items-center", baseKnown: false },
      { token: "md:grd", suggestion: "md:grid", baseKnown: false },
      { token: "hovr:flex", suggestion: "hover:flex", baseKnown: true },
      { token: "foucs:ring-2", suggestion: "focus:ring-2", baseKnown: true },
      {
        token: "hover:roundedd",
        suggestion: "hover:rounded-md",
        baseKnown: false,
      },
      { token: "rounded-huge", suggestion: null, baseKnown: false },
      { token: "tablet:flex", suggestion: null, baseKnown: true },
      { token: "items-top", suggestion: null, baseKnown: false },
    ])
  })

  test("markers and CSS-only classes are the rule's to settle", async () => {
    const answer = await query(CSS, ["group", "peer/x", "legacy-card"])
    expect(answer.ok && answer.unknown.map((u) => u.token)).toEqual([
      "group",
      "peer/x",
      "legacy-card",
    ])
  })

  // A pnpm-linked package installs its own dependencies beside the real
  // file: an @import inside it resolves from there, not from the link.
  test("builds a theme importing a pnpm-linked package", async () => {
    resetOracle()
    const answer = await query(LINKED, ["kit-frame", "flex", "kit-frmae"])
    expect(answer.ok).toBe(true)
    if (!answer.ok) return
    expect(answer.unknown).toEqual([
      { token: "kit-frmae", suggestion: "kit-frame", baseKnown: false },
    ])
  })

  test("a theme that cannot be read is unavailable, not wrong", async () => {
    const answer = await query("/nonexistent/app/globals.css", ["flex"])
    expect(answer.ok).toBe(false)
  })
})

describe("resolveStylesheet", () => {
  const app = path.join(PROJECT, "app")
  test("relative, tailwindcss, and style-only packages", () => {
    expect(resolveStylesheet(app, "./globals.css")).toBe(CSS)
    expect(resolveStylesheet(app, "./globals")).toBe(CSS)
    expect(resolveStylesheet(app, "tailwindcss")).toMatch(
      /tailwindcss[\\/]index\.css$/
    )
    expect(resolveStylesheet(app, "tailwindcss/theme.css")).toMatch(
      /theme\.css$/
    )
    expect(resolveStylesheet(app, "style-only")).toBe(
      path.join(PROJECT, "node_modules/style-only/styles/style-only.css")
    )
    expect(resolveStylesheet(app, "no-such-package")).toBeNull()
    expect(resolveStylesheet(app, "./missing.css")).toBeNull()
  })
})
