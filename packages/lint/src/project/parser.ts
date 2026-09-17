// Parses component files for variant axes and className forwarding.
// oxc-parser when installed, else @typescript-eslint/parser; either is
// loaded on first use, so a run that reads no component file loads none,
// and under Oxlint the TypeScript compiler can stay out of the process
// entirely. Both produce ESTree.

import { createRequire } from "node:module"
import * as path from "node:path"

import { warnOnce } from "./warn"

const require = createRequire(import.meta.url)

export type ParserKind = "oxc" | "typescript"

type Parser = { kind: ParserKind; parse: (source: string, file: string) => any }

function langOf(file: string) {
  switch (path.extname(file).toLowerCase()) {
    case ".tsx":
      return "tsx"
    case ".ts":
    case ".mts":
    case ".cts":
      return "ts"
    case ".jsx":
      return "jsx"
    default:
      return "js"
  }
}

function loadOxc(): Parser | null {
  try {
    const oxc = require("oxc-parser") as {
      parseSync: (
        file: string,
        source: string,
        options: { lang: string; sourceType: string }
      ) => { program: any; errors: { severity: string }[] }
    }
    return {
      kind: "oxc",
      parse(source, file) {
        const result = oxc.parseSync(path.basename(file), source, {
          lang: langOf(file),
          sourceType: "module",
        })
        // Recoverable errors still yield a usable program; a file that
        // did not parse at all is treated the way a throwing parser is.
        if (
          !result.program?.body?.length &&
          result.errors.some((e) => e.severity === "Error")
        ) {
          throw new Error("oxc-parser: unparsable")
        }
        return result.program
      },
    }
  } catch {
    return null
  }
}

function loadTypeScript(): Parser {
  let ts: { parse: (source: string, options: object) => any }
  try {
    ts = require("@typescript-eslint/parser")
  } catch {
    // Both parsers are optional installs; without either, component
    // files cannot be read and every caller degrades quietly, so say
    // so once.
    warnOnce(
      "parser:none",
      "Neither oxc-parser nor @typescript-eslint/parser is installed, so component files cannot be read: variants and wrappers are unknown until one is."
    )
    throw new Error("no parser is installed")
  }
  return {
    kind: "typescript",
    parse: (source) =>
      ts.parse(source, { jsx: true, range: false, loc: false }),
  }
}

// Creates a parser of the given kind, or the best available one.
export function createParser(kind?: ParserKind): Parser {
  if (kind === "typescript") return loadTypeScript()
  const oxc = loadOxc()
  if (oxc) return oxc
  if (kind === "oxc") throw new Error("oxc-parser is not installed")
  return loadTypeScript()
}

let active: Parser | null = null

// Parses `source` as the module at `file`. Throws when it cannot be
// parsed, the way the underlying parsers do.
export function parseSource(source: string, file: string) {
  active ??= createParser()
  return active.parse(source, file)
}

// The parser in use, for tests and diagnostics.
export function activeParserKind() {
  active ??= createParser()
  return active.kind
}

// Tests reach in to run the same analysis under both parsers.
export function useParser(kind: ParserKind | null) {
  active = kind ? createParser(kind) : null
}
