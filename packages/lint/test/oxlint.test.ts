// The built plugin through Oxlint's jsPlugins, against the real
// fixtures: the project model, variants and file paths in messages,
// wrappers, SVG attributes, unknown classes, and contracts all have to
// come out the same as under ESLint. Needs a build: dist/index.js, or
// the file SHADCN_LINT_PLUGIN points at.

import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import { createRequire } from "node:module"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { stripVTControlCharacters } from "node:util"
import { describe, expect, test } from "vitest"

const PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// Oxlint's own entry, run with this Node: `npx` resolved it through a
// cmd.exe shim on Windows, where the resolution alone could take longer
// than a run and time the test out on a slow runner.
const OXLINT = (() => {
  const require = createRequire(import.meta.url)
  const manifest = require.resolve("oxlint/package.json")
  const bin = require(manifest).bin
  return path.join(
    path.dirname(manifest),
    typeof bin === "string" ? bin : bin.oxlint
  )
})()

// A run starts Oxlint, loads the plugin, and on the first call also
// starts the Tailwind worker cold; a shared CI runner takes its time.
const RUN_TIMEOUT = 60_000
const FIXTURES = path.join(PKG_DIR, "test/fixtures")
const plugin = process.env.SHADCN_LINT_PLUGIN
  ? path.resolve(process.env.SHADCN_LINT_PLUGIN)
  : path.join(PKG_DIR, "dist/index.js")

// The newest mtime under src/, so a build older than the source is
// recognized as stale rather than failing tests that are about the
// source. `pnpm test` builds first; SHADCN_LINT_PLUGIN names a side
// build explicitly and is trusted.
function newestSourceMtime(dir: string): number {
  let newest = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    newest = Math.max(
      newest,
      entry.isDirectory() ? newestSourceMtime(full) : fs.statSync(full).mtimeMs
    )
  }
  return newest
}

const buildUsable = (() => {
  if (!fs.existsSync(plugin)) return false
  if (process.env.SHADCN_LINT_PLUGIN) return true
  return (
    fs.statSync(plugin).mtimeMs >= newestSourceMtime(path.join(PKG_DIR, "src"))
  )
})()

const ALL_RULES = {
  "shadcn/no-restyle": "error",
  "shadcn/no-raw-colors": "error",
  "shadcn/no-arbitrary-values": "error",
  "shadcn/no-inline-styles": "error",
  "shadcn/require-static-classes": "error",
  "shadcn/no-unknown-classes": "error",
}

// Runs Oxlint in `cwd` on `file` with the given rules and returns its
// stdout. The config lives outside the fixture so nothing is written
// into the tree.
function oxlint(
  cwd: string,
  file: string,
  rules: Record<string, unknown>,
  settings?: Record<string, unknown>,
  overrides?: Record<string, unknown>[]
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shadcn-lint-oxlint-"))
  const config = path.join(dir, ".oxlintrc.json")
  fs.writeFileSync(
    config,
    JSON.stringify({
      jsPlugins: [plugin],
      rules,
      ...(settings ? { settings } : {}),
      ...(overrides ? { overrides } : {}),
    })
  )
  try {
    const result = spawnSync(
      process.execPath,
      // Keep message assertions independent of CI's automatic GitHub reporter.
      [OXLINT, "--format", "default", "-c", config, file],
      { cwd, encoding: "utf-8", timeout: RUN_TIMEOUT }
    )
    if (result.error) throw result.error
    return stripVTControlCharacters(result.stdout + result.stderr)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// Locally a stale or missing build skips the suite; in CI that would hide
// a parity break behind a green run, so there it fails instead.
if (!buildUsable && process.env.CI) {
  throw new Error(
    "test/oxlint.test.ts needs a fresh build: run `pnpm build` before `pnpm test`."
  )
}

describe.skipIf(!buildUsable)("oxlint", { timeout: RUN_TIMEOUT }, () => {
  // The first run also starts the Tailwind worker cold on shared CI runners.
  test("shadcn project: every rule reports, with variants, file paths, wrappers, SVG, unknown classes", () => {
    const out = oxlint(
      path.join(FIXTURES, "project"),
      "app/oxlint.tsx",
      ALL_RULES
    )
    // The rule ids print in Oxlint's form, all six of them.
    for (const rule of Object.keys(ALL_RULES)) {
      expect(out).toContain(`shadcn(${rule.slice("shadcn/".length)})`)
    }
    // The off-token value names the scale, the inline style names the property.
    expect(out).toMatch(/"text-\[13px\]" hardcodes an off-token value/)
    expect(out).toContain("Inline style sets color")
    // The boundary message lists variants and names the file.
    expect(out).toMatch(
      /"bg-red-500" is not allowed on <Button>: <Button> owns its color\. Use a variant: default, outline, secondary, ghost, destructive, link\. Add a new variant in components\/ui\/button\.tsx/
    )
    // Through a wrapper.
    expect(out).toMatch(
      /"rounded-full" is not allowed on <SaveButton>: <SaveButton> forwards className to <Button>, which owns its shape/
    )
    // A component with a file but no variants.
    expect(out).toMatch(
      /<Card> owns its color\. Add a variant in components\/ui\/card\.tsx only if the design explicitly calls for this treatment\./
    )
    // Theme tokens read through components.json, file named.
    expect(out).toMatch(
      /"bg-highlight" is not a declared theme color\. Use one of: .*\. To add a color, declare --color-<name> in app\/globals\.css first\./
    )
    expect(out).toContain('fill="#ff00aa" hardcodes a color')
    expect(out).toContain('"flex-cols" is not a class')
    expect(out).toContain("Dynamically built className on <Button>")
  }, 15_000)

  test("a contract message and the settings note reach the message", () => {
    const out = oxlint(
      path.join(FIXTURES, "project"),
      "app/oxlint.tsx",
      {
        "shadcn/no-restyle": [
          "error",
          {
            contracts: [
              { pattern: "^Button$", message: "Buttons are variants only." },
            ],
          },
        ],
      },
      { shadcn: { note: "See DESIGN.md." } }
    )
    // The contract's words replace the rule's text; the note trails.
    expect(out).toMatch(
      /shadcn\(no-restyle\): Buttons are variants only\. See DESIGN\.md\./
    )
    expect(out).not.toMatch(
      /<Button> owns its color\. .*Buttons are variants only/
    )
  })

  test("no components.json: settings.shadcn.ui, discovered theme, barrel variants", () => {
    const out = oxlint(
      path.join(FIXTURES, "no-json"),
      "src/app/oxlint.tsx",
      { "shadcn/no-restyle": "error", "shadcn/no-raw-colors": "error" },
      { shadcn: { ui: "@/ds" } }
    )
    expect(out).toMatch(
      /<Button> owns its color\. Use a variant: primary, secondary\. Add a new variant in src\/ds\/button\.tsx/
    )
    expect(out).toMatch(
      /"bg-highlight" is not a declared theme color\. Use one of: accent, accent-ink, ink, ink-muted, line, paper\. To add a color, declare --color-<name> in src\/styles\.css first\./
    )
  })

  test("an allow entry that matches nothing is a line-1 finding, not a crash", () => {
    const out = oxlint(path.join(FIXTURES, "no-json"), "src/app/oxlint.tsx", {
      "shadcn/no-raw-colors": ["error", { allow: ["blue-500"] }],
    })
    expect(out).toMatch(
      /allow entry "blue-500" names a color, not a class, so it would match nothing\. Did you mean "\*-blue-500"/
    )
    expect(out).toMatch(/oxlint\.tsx:1:1/)
    expect(out).not.toMatch(/at .*contracts/)
  })

  test("monorepo: the ui alias resolves through tsconfig paths", () => {
    const out = oxlint(
      path.join(FIXTURES, "monorepo/apps/web"),
      "app/oxlint.tsx",
      { "shadcn/no-restyle": "error" }
    )
    expect(out).toMatch(
      /<Button> owns its color\. Use a variant: default, brand\. Add a new variant in .*packages\/ui\/src\/components\/button\.tsx/
    )
  })

  test("an override turns a rule off for a directory, as the README's setup does", () => {
    const out = oxlint(
      path.join(FIXTURES, "project"),
      "app/oxlint.tsx",
      { "shadcn/no-restyle": "error", "shadcn/no-raw-colors": "error" },
      undefined,
      // Oxlint resolves override globs against the config file's directory,
      // and this config lives in a temp dir, so the glob is unanchored.
      [{ files: ["**/app/**"], rules: { "shadcn/no-restyle": "off" } }]
    )
    expect(out).not.toContain("shadcn(no-restyle)")
    expect(out).toContain("shadcn(no-raw-colors)")
  })

  test("contracts and the layout keyword apply under Oxlint", () => {
    // A contract replaces the top-level list: an unclassified name on Card
    // is a finding under any list, and a layout class one that says what
    // the contract allows instead.
    const closed = oxlint(path.join(FIXTURES, "project"), "app/oxlint.tsx", {
      "shadcn/no-restyle": [
        "error",
        {
          allow: ["layout"],
          contracts: [{ pattern: "^Card$", allow: ["spacing"] }],
        },
      ],
    })
    expect(closed).toMatch(
      /"flex-cols" is not allowed on <Card>: the grammar does not recognize it\./
    )
    expect(closed).toMatch(
      /"bg-highlight" is not allowed on <Card>: <Card> owns its color/
    )
    // The keyword inside a contract opens placement, not an unclassified
    // name.
    const open = oxlint(path.join(FIXTURES, "project"), "app/oxlint.tsx", {
      "shadcn/no-restyle": [
        "error",
        { contracts: [{ pattern: "^Card$", allow: ["layout"] }] },
      ],
    })
    expect(open).toMatch(
      /"flex-cols" is not allowed on <Card>: the grammar does not recognize it/
    )
    expect(open).toMatch(
      /"bg-highlight" is not allowed on <Card>: <Card> owns its color/
    )
  })

  // Oxlint hands a plugin the script blocks of an SFC and no template.
  test.each([
    ["svelte-project", "src/routes/oxlint.svelte"],
    ["vue-project", "src/Oxlint.vue"],
  ])("%s: lints the script and says the template was not read", (dir, file) => {
    const out = oxlint(path.join(FIXTURES, dir), file, {
      "shadcn/no-raw-colors": "error",
    })
    expect(out).toContain('"bg-red-500" uses the raw Tailwind palette')
    expect(out).not.toContain("bg-blue-500")
    expect(out).toContain("only their script blocks are linted")
    expect(out).toContain("Found 0 warnings and 1 error")
  })
})
