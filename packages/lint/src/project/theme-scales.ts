// Reads the theme scales a project's stylesheets declare, the way `cn
// build` registers them: `--radius-card` in `@theme` adds `card` to the
// radius scale, and `--radius-*: initial` replaces the default scale with
// the declared names. Only `@theme` blocks are read. Relative `@import`s
// are followed; packages are not.
//
// A port of cn's `themeFromCss` (packages/cn/src/theme-css.ts), which cn
// 0.4.0 does not export. Kept in step with it so the linter and the
// project's runtime `cn` read one theme the same way; replace with the
// import once cn exports it.

import { readFileSync } from "node:fs"
import * as path from "node:path"
import type { ConfigExtension } from "cn/compiler"

// Tailwind namespace to cn theme scale. Longest first, so `--text-shadow-x`
// is a text shadow and `--font-weight-x` a weight. `--color-*` and
// `--font-*` are left out: cn already accepts any name on those scales.
const NAMESPACES: [string, string][] = [
  ["inset-shadow", "inset-shadow"],
  ["drop-shadow", "drop-shadow"],
  ["text-shadow", "text-shadow"],
  ["font-weight", "font-weight"],
  ["perspective", "perspective"],
  ["breakpoint", "breakpoint"],
  ["container", "container"],
  ["tracking", "tracking"],
  ["spacing", "spacing"],
  ["leading", "leading"],
  ["animate", "animate"],
  ["radius", "radius"],
  ["shadow", "shadow"],
  ["aspect", "aspect"],
  ["blur", "blur"],
  ["ease", "ease"],
  ["text", "text"],
]

function stripComments(css: string) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "")
}

// Bodies of every `@theme` block, at any nesting depth.
function themeBlocks(css: string) {
  const bodies: string[] = []
  const re = /@theme\b[^{;]*\{/g
  while (re.exec(css)) {
    let depth = 1
    let i = re.lastIndex
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === "{") depth++
      else if (css[i] === "}") depth--
    }
    bodies.push(css.slice(re.lastIndex, i - 1))
    re.lastIndex = i
  }
  return bodies
}

function importPaths(css: string) {
  const paths: string[] = []
  const re = /@import\s+(?:url\(\s*)?["']([^"']+)["']/g
  let match
  while ((match = re.exec(css))) {
    const spec = match[1]
    if (spec.startsWith("./") || spec.startsWith("../")) paths.push(spec)
  }
  return paths
}

// The theme scales declared in the stylesheets and the files they import,
// as a config extension: declared names under `extend`, and scales reset
// with `--<namespace>-*: initial` under `override`. Also returns every
// file read, so a cache can re-read when one changes. Throws when a
// stylesheet cannot be read.
export function themeScalesFromCss(entries: readonly string[]) {
  const files: string[] = []
  let entry = ""
  const names = new Map<string, Set<string>>()
  const reset = new Set<string>()
  const visit = (file: string) => {
    if (files.includes(file)) return
    files.push(file)
    let css
    try {
      css = stripComments(readFileSync(file, "utf8"))
    } catch (error) {
      throw new Error(
        `cannot read css ${file === entry ? file : `${file} (imported from ${entry})`}: ${(error as Error).message}`,
        { cause: error }
      )
    }
    for (const spec of importPaths(css)) {
      visit(path.resolve(path.dirname(file), spec))
    }
    for (const body of themeBlocks(css)) {
      for (const declaration of body.split(";")) {
        const colon = declaration.indexOf(":")
        if (colon === -1) continue
        const prop = declaration.slice(0, colon).trim()
        const value = declaration.slice(colon + 1).trim()
        if (!prop.startsWith("--")) continue
        if (prop === "--*" && value === "initial") {
          for (const [, scale] of NAMESPACES) reset.add(scale)
          continue
        }
        const namespace = NAMESPACES.find(([ns]) => prop.startsWith(`--${ns}-`))
        if (!namespace) continue
        const [ns, scale] = namespace
        const name = prop.slice(ns.length + 3)
        if (name === "*") {
          if (value === "initial") reset.add(scale)
          continue
        }
        // `--text-display--line-height` is a sub-property of `display`.
        if (!name || name.includes("--")) continue
        if (value === "initial") {
          names.get(scale)?.delete(name)
          continue
        }
        let set = names.get(scale)
        if (!set) names.set(scale, (set = new Set()))
        set.add(name)
      }
    }
  }
  for (const file of entries) {
    entry = path.resolve(file)
    visit(entry)
  }

  const extend: Record<string, string[]> = {}
  const override: Record<string, string[]> = {}
  for (const [scale, set] of names) {
    if (!reset.has(scale)) extend[scale] = [...set]
  }
  for (const scale of reset) override[scale] = [...(names.get(scale) ?? [])]
  const extension: ConfigExtension = {}
  if (Object.keys(extend).length) extension.extend = { theme: extend }
  if (Object.keys(override).length) extension.override = { theme: override }
  return { extension, files }
}
