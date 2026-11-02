// The theme scales a project declares, the way `cn build` registers them:
// `--radius-card` in `@theme` adds `card` to the radius scale, and
// `--radius-*: initial` replaces the default scale with the declared
// names.
//
// Built from the declarations theme.ts reads, not from cn's own
// `themeFromCss`: that reader follows relative imports only and splits a
// block on `;`, so an aliased import, a themeImports package, and the
// declaration after a nested `@keyframes` were lost. One theme read gives
// the scales, the color tokens, and the suggestions.

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

// In cascade order: a reset drops what was declared before it, as in
// Tailwind. Declared names go under `extend`, and reset scales under
// `override` with the names declared after the reset.
export function themeScalesOf(
  declarations: readonly { name: string; value: string; theme: boolean }[]
) {
  const names = new Map<string, Set<string>>()
  const reset = new Set<string>()
  const resetScale = (scale: string) => {
    reset.add(scale)
    names.delete(scale)
  }
  for (const { name: property, value, theme } of declarations) {
    if (!theme) {
      continue
    }
    const initial = value.trim() === "initial"
    if (property === "*") {
      if (initial) {
        for (const [, scale] of NAMESPACES) resetScale(scale)
      }
      continue
    }
    // `--spacing` is the base Tailwind multiplies for `p-4` and the rest
    // of the numeric scale, so setting it after a reset brings that
    // scale back. Named spacing values declared after it still extend.
    if (property === "spacing") {
      if (!initial) {
        reset.delete("spacing")
      }
      continue
    }
    const namespace = NAMESPACES.find(([ns]) => property.startsWith(`${ns}-`))
    if (!namespace) {
      continue
    }
    const [ns, scale] = namespace
    const name = property.slice(ns.length + 1)
    if (name === "*") {
      if (initial) {
        resetScale(scale)
      }
      continue
    }
    // `--text-display--line-height` is a sub-property of `display`.
    if (!name || name.includes("--")) {
      continue
    }
    if (initial) {
      names.get(scale)?.delete(name)
      continue
    }
    let set = names.get(scale)
    if (!set) {
      names.set(scale, (set = new Set()))
    }
    set.add(name)
  }

  const extend: Record<string, string[]> = {}
  const override: Record<string, string[]> = {}
  for (const [scale, set] of names) {
    if (!reset.has(scale)) {
      extend[scale] = [...set]
    }
  }
  for (const scale of reset) override[scale] = [...(names.get(scale) ?? [])]
  const extension: ConfigExtension = {}
  if (Object.keys(extend).length) {
    extension.extend = { theme: extend }
  }
  if (Object.keys(override).length) {
    extension.override = { theme: override }
  }
  return extension
}
