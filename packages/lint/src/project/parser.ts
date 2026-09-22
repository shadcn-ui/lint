// Parses component files for variant axes and className forwarding.
// oxc-parser when installed, else @typescript-eslint/parser; either is
// loaded on first use, so a run that reads no component file loads none,
// and under Oxlint the TypeScript compiler can stay out of the process
// entirely. Both produce ESTree.

import { createRequire } from "node:module"
import * as path from "node:path"

import { parseClassSelectors } from "./theme"
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

const SFC_RE = /\.(svelte|vue)$/i
const SCRIPT_RE = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi

// A single-file component: its scripts are the module, its file the
// component.
export function isSfc(file: string) {
  return SFC_RE.test(file)
}

// `card-title.svelte` and `CardTitle.vue` are both CardTitle: an SFC is
// its file's default export, and the file is the only name it has.
export function sfcNameOf(file: string) {
  return path
    .basename(file, path.extname(file))
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
}

const STYLE_RE = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi

// The classes an SFC's own <style> blocks select.
export function styleClassesOf(source: string) {
  const out = new Set<string>()
  for (const match of source.matchAll(STYLE_RE)) {
    for (const name of parseClassSelectors(match[1])) out.add(name)
  }
  return out
}

// The script blocks of an SFC with everything else blanked, so every
// range still points at the file's own offsets.
export function scriptOf(source: string) {
  let out = ""
  let last = 0
  const blank = (text: string) => text.replace(/[^\n\r]/g, " ")
  for (const match of source.matchAll(SCRIPT_RE)) {
    const start = match.index + match[0].indexOf(">") + 1
    const end = start + match[1].length
    out += blank(source.slice(last, start)) + source.slice(start, end)
    last = end
  }
  return out + blank(source.slice(last))
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
  // An SFC's scripts are TypeScript or a subset of it.
  return isSfc(file)
    ? active.parse(scriptOf(source), `${file}.ts`)
    : active.parse(source, file)
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
