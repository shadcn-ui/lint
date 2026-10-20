// Flat-config completion comes from the RulesConfig augmentation that
// scripts/postbuild.mjs writes into dist. These tests ask the TypeScript
// language service what it offers inside `rules: { | }` of a config that
// imports the built package, under the module settings projects actually
// use, so the feature is pinned by what an editor shows. They need
// `pnpm build` first and skip without it, like the Oxlint tests.

import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, test } from "vitest"

import { plugin } from "../src/plugin"

const ROOT = path.resolve(__dirname, "..")
const DIST = path.join(ROOT, "dist/index.d.ts")
const built = fs.existsSync(DIST)

const RULE_NAMES = Object.keys(plugin.rules).map((name) => `shadcn/${name}`)
// TypeScript offers a property that needs quoting as its quoted name.
const QUOTED = RULE_NAMES.map((name) => `"${name}"`)

const SETTINGS = {
  bundler: {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  },
  nodenext: {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
  },
  node10: {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
  },
}

function completionsIn(
  fileName: string,
  source: string,
  settings: (typeof SETTINGS)[keyof typeof SETTINGS]
) {
  const marker = source.indexOf("/*|*/")
  const text = source.replace("/*|*/", "")
  // The language service asks for files with forward slashes on every
  // platform, so the in-memory file is keyed that way too.
  const normalized = fileName.replace(/\\/g, "/")
  const files = new Map([[normalized, text]])
  const options: ts.CompilerOptions = {
    strict: true,
    allowJs: true,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
    ...settings,
  }
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [...files.keys()],
    getScriptVersion: () => "1",
    getScriptSnapshot: (f) =>
      files.has(f)
        ? ts.ScriptSnapshot.fromString(files.get(f)!)
        : ts.sys.fileExists(f)
          ? ts.ScriptSnapshot.fromString(ts.sys.readFile(f)!)
          : undefined,
    getCurrentDirectory: () => ROOT,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: (f) => files.has(f) || ts.sys.fileExists(f),
    readFile: (f) => files.get(f) ?? ts.sys.readFile(f),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath,
  }
  const service = ts.createLanguageService(host, ts.createDocumentRegistry())
  const result = service.getCompletionsAtPosition(normalized, marker, {})
  return (result?.entries ?? []).map((e) => e.name)
}

const defineConfigSource = `
import { defineConfig } from "eslint/config"
import { plugin as shadcn } from "../dist/index.js"

export default defineConfig([
  { plugins: { shadcn }, rules: { /*|*/ } },
])
`

const linterConfigSource = `
import type { Linter } from "eslint"
import { plugin as shadcn } from "../dist/index.js"

export const config: Linter.Config = { plugins: { shadcn }, rules: { /*|*/ } }
`

describe("flat config completion", () => {
  test("the augmentation names every rule in plugin.rules and nothing else", () => {
    const source = fs.readFileSync(path.join(ROOT, "src/index.ts"), "utf8")
    const block =
      source.match(/declare module "@eslint\/core" \{[\s\S]*?\n\}/)?.[0] ?? ""
    const declared = [...block.matchAll(/"(shadcn\/[a-z-]+)"\?:/g)].map(
      (m) => m[1]
    )
    expect(declared.sort()).toEqual([...RULE_NAMES].sort())
  })

  describe.skipIf(!built)("through the built types", () => {
    test.each(Object.entries(SETTINGS))(
      "MUI rules, %s resolution",
      (_, settings) => {
        const source =
          'import { defineConfig } from "eslint/config"; import mui from "../dist/mui.js"; export default defineConfig([{ plugins: { mui }, rules: { /*|*/ } }])'
        const names = completionsIn(
          path.join(ROOT, "test/eslint.config.ts"),
          source,
          settings
        )
        expect(names).toContain('"mui/no-restyle"')
        expect(names).toContain('"mui/no-raw-colors"')
      }
    )
    test.each(Object.entries(SETTINGS))(
      "defineConfig, %s resolution, .ts config",
      (_, settings) => {
        const names = completionsIn(
          path.join(ROOT, "test/eslint.config.ts"),
          defineConfigSource,
          settings
        )
        for (const rule of QUOTED) expect(names).toContain(rule)
      }
    )

    test.each(Object.entries(SETTINGS))(
      "defineConfig, %s resolution, .mjs config",
      (_, settings) => {
        const names = completionsIn(
          path.join(ROOT, "test/eslint.config.mjs"),
          defineConfigSource,
          settings
        )
        for (const rule of QUOTED) expect(names).toContain(rule)
      }
    )

    test("Linter.Config annotation, bundler resolution", () => {
      const names = completionsIn(
        path.join(ROOT, "test/eslint.config.ts"),
        linterConfigSource,
        SETTINGS.bundler
      )
      for (const rule of QUOTED) expect(names).toContain(rule)
    })
  })
})

// The option names each rule's augmentation offers, read from the type
// itself: the object type in RuleConfig's tuple, and the element type of
// its `contracts` array.
function declaredOptions() {
  const source = ts.createSourceFile(
    "index.ts",
    fs.readFileSync(path.join(ROOT, "src/index.ts"), "utf8"),
    ts.ScriptTarget.Latest,
    true
  )
  const keysOf = (node: ts.TypeNode | undefined) =>
    node && ts.isTypeLiteralNode(node)
      ? node.members
          .map((m) =>
            ts.isPropertySignature(m) && m.name && ts.isIdentifier(m.name)
              ? m.name.text
              : ""
          )
          .filter(Boolean)
          .sort()
      : []
  const contractsOf = (node: ts.TypeNode | undefined) => {
    if (!node || !ts.isTypeLiteralNode(node)) return null
    const contracts = node.members.find(
      (m) =>
        ts.isPropertySignature(m) &&
        m.name &&
        ts.isIdentifier(m.name) &&
        m.name.text === "contracts"
    ) as ts.PropertySignature | undefined
    const type = contracts?.type
    return type && ts.isArrayTypeNode(type) ? keysOf(type.elementType) : null
  }
  const out = new Map<
    string,
    { options: string[]; contracts: string[] | null }
  >()
  const visit = (node: ts.Node) => {
    // Each rule is `import("@eslint/core").RuleConfig<[ {...} ]>`.
    if (
      ts.isPropertySignature(node) &&
      ts.isStringLiteral(node.name) &&
      node.name.text.startsWith("shadcn/") &&
      node.type &&
      ts.isImportTypeNode(node.type)
    ) {
      const tuple = node.type.typeArguments?.[0]
      const options =
        tuple && ts.isTupleTypeNode(tuple) ? tuple.elements[0] : undefined
      out.set(node.name.text, {
        options: keysOf(options),
        contracts: contractsOf(options),
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return out
}

describe("the augmentation's option names", () => {
  test.each(Object.entries(plugin.rules))(
    "shadcn/%s offers exactly the options its schema accepts",
    (name, rule) => {
      const declared = declaredOptions().get(`shadcn/${name}`)
      const schema = (rule as any).meta.schema[0]
      expect(declared?.options).toEqual(Object.keys(schema.properties).sort())
      const contracts = schema.properties.contracts
      expect(declared?.contracts).toEqual(
        contracts ? Object.keys(contracts.items.properties).sort() : null
      )
    }
  )
})
