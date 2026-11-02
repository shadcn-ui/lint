// The synchronous bridge to the Tailwind worker: which timeout a
// question gets, and how many transport failures the process tolerates.
// Needs the built worker (pnpm build); skipped without it.

import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { resetWarnings, setWarningSink } from "../src/project/warn"
import {
  failOracleTransportForTests,
  oracleAvailable,
  oracleStateForTests,
  resetOracleMemo,
  stopOracleForTests,
  unknownClasses,
} from "../src/tailwind/client"
import { PROJECT } from "./helpers"

const CSS = path.join(PROJECT, "app/globals.css")

describe.skipIf(!oracleAvailable())("tailwind worker bridge", () => {
  const warnings: string[] = []

  beforeEach(() => {
    warnings.length = 0
    resetWarnings()
    setWarningSink((message) => warnings.push(message))
  })

  afterEach(() => {
    resetOracleMemo()
    stopOracleForTests()
    setWarningSink((message) => console.warn(message))
  })

  test("the first question after every start gets the long timeout", () => {
    stopOracleForTests()
    const cold = oracleStateForTests().nextTimeout
    expect(unknownClasses(CSS, ["flex"])).toEqual([])
    const warm = oracleStateForTests().nextTimeout
    expect(warm).toBeLessThan(cold)
    // Only a dead worker should time out, not a slow one on a busy machine.
    expect(warm).toBeGreaterThanOrEqual(30_000)
    // A deliberate restart (a theme with @plugin) or one after a crash
    // starts cold again.
    stopOracleForTests()
    expect(oracleStateForTests().nextTimeout).toBe(cold)
    expect(unknownClasses(CSS, ["flex"])).toEqual([])
    expect(oracleStateForTests().nextTimeout).toBe(warm)
  })

  test("a successful answer resets the restart budget", () => {
    failOracleTransportForTests()
    expect(oracleStateForTests().restarts).toBe(1)
    expect(oracleAvailable()).toBe(true)
    resetOracleMemo()
    expect(unknownClasses(CSS, ["flex"])).toEqual([])
    expect(oracleStateForTests().restarts).toBe(0)
    // One failure after a healthy stretch does not turn the oracle off.
    failOracleTransportForTests()
    expect(oracleAvailable()).toBe(true)
  })

  test("a restart says the current file fell back to the bundled grammar", () => {
    // A healthy answer first, so this is the first failure, not the second.
    expect(unknownClasses(CSS, ["flex"])).toEqual([])
    failOracleTransportForTests()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("failed (test) and is restarting")
    expect(warnings[0]).toContain("bundled with @shadcn/lint")
  })
})

describe("tailwind worker timeout override", () => {
  afterEach(() => {
    delete process.env.SHADCN_LINT_TAILWIND_TIMEOUT
  })

  test("a positive number of milliseconds replaces the wait", () => {
    stopOracleForTests()
    process.env.SHADCN_LINT_TAILWIND_TIMEOUT = "120000"
    expect(oracleStateForTests().nextTimeout).toBe(120_000)
  })

  test("anything else keeps the default", () => {
    stopOracleForTests()
    const cold = oracleStateForTests().nextTimeout
    for (const value of ["", "0", "-5", "soon", "Infinity"]) {
      process.env.SHADCN_LINT_TAILWIND_TIMEOUT = value
      expect(oracleStateForTests().nextTimeout).toBe(cold)
    }
  })
})
