import { describe, expect, test } from "vitest"

import { withBase } from "../src/grammar/classes"
import { colorDistance, parseColor } from "../src/grammar/colors"
import { lengthInPx } from "../src/grammar/lengths"
import { parseDeclarations, resolveVariables } from "../src/project/theme"
import {
  didYouMean,
  nearestColorTokens,
  nearestSteps,
} from "../src/rules/suggest"

const close = (a: number[] | null, b: number[]) => {
  expect(a).not.toBeNull()
  for (let i = 0; i < 3; i++) expect(a![i]).toBeCloseTo(b[i], 2)
}

describe("parseColor", () => {
  test("a none channel is zero, as Tailwind writes its neutrals", () => {
    expect(parseColor("oklch(55.6% 0 none)")).toEqual(
      parseColor("oklch(55.6% 0 0)")
    )
    expect(parseColor("hsl(none 0% 50%)")).toEqual(parseColor("hsl(0 0% 50%)"))
  })

  test("hex, rgb, hsl, named and oklch agree on the same color", () => {
    // zinc-500 in four spellings.
    const hex = parseColor("#71717a")!
    close(parseColor("rgb(113, 113, 122)"), hex)
    close(parseColor("rgb(113 113 122 / 0.5)"), hex)
    close(parseColor("hsl(240 4% 46%)"), hex)
    expect(
      colorDistance(parseColor("oklch(55.2% 0.016 285.938)")!, hex)
    ).toBeLessThan(0.01)
    expect(
      colorDistance(parseColor("oklch(0.552 0.016 285.938)")!, hex)
    ).toBeLessThan(0.01)
  })

  test("white, black and named colors", () => {
    close(parseColor("#fff"), [1, 0, 0])
    close(parseColor("white"), [1, 0, 0])
    close(parseColor("#000"), [0, 0, 0])
    expect(parseColor("rebeccapurple")).not.toBeNull()
  })

  test("not literal colors", () => {
    expect(parseColor("var(--primary)")).toBeNull()
    expect(parseColor("color-mix(in oklch, red, blue)")).toBeNull()
    expect(parseColor("currentColor")).toBeNull()
    expect(parseColor("")).toBeNull()
  })
})

describe("lengthInPx", () => {
  test.each([
    ["10px", 10],
    ["0.625rem", 10],
    ["1em", 16],
    ["0", 0],
    ["calc(0.625rem - 2px)", 8],
    ["calc(0.625rem * 0.6)", 6],
    ["calc(10px + 0.25rem)", 14],
    ["calc((1rem + 4px) / 2)", 10],
    ["-4px", -4],
    ["50%", null],
    ["clamp(1rem, 2vw, 2rem)", null],
    ["auto", null],
    ["1", null],
  ])("%s -> %s", (value, expected) => {
    expect(lengthInPx(value)).toBe(expected)
  })
})

describe("parseDeclarations", () => {
  const css = `
    @import "tailwindcss";
    /* --color-commented: red; */
    @theme inline {
      --color-primary: var(--primary);
      --radius-lg: var(--radius);
      --radius-md: calc(var(--radius) - 2px);
    }
    :root { --radius: 0.625rem; --primary: oklch(0.205 0 0); }
    .dark { --primary: oklch(0.922 0 0); }
    @layer base {
      @media (prefers-color-scheme: dark) { :root { --primary: white; } }
      :root { --brand: #ff0000; }
    }
  `
  test("light values win, dark blocks are skipped, theme names are marked", () => {
    const { values, themeNames } = parseDeclarations(css)
    expect(values.get("primary")).toBe("oklch(0.205 0 0)")
    expect(values.get("radius")).toBe("0.625rem")
    expect(values.get("brand")).toBe("#ff0000")
    expect(values.has("color-commented")).toBe(false)
    expect([...themeNames]).toEqual(["color-primary", "radius-lg", "radius-md"])
  })

  test(":root and @theme values win over a scoped selector's", () => {
    const { values } = parseDeclarations(`
      .before { --gap: 2px; }
      :root, :host { --radius: 0.5rem; }
      .compact { --radius: 0.25rem; --gap: 1px; }
      [data-density="compact"] :root { --radius: 0.125rem; }
      @theme { --spacing: 4px; }
      .tight { --spacing: 2px; }
    `)
    expect(values.get("radius")).toBe("0.5rem")
    expect(values.get("spacing")).toBe("4px")
    // Set only by scoped selectors: the last one still resolves.
    expect(values.get("gap")).toBe("1px")
  })

  test("resolveVariables substitutes a few hops deep", () => {
    const { values } = parseDeclarations(css)
    expect(resolveVariables("var(--primary)", values)).toBe("oklch(0.205 0 0)")
    expect(resolveVariables("calc(var(--radius) - 2px)", values)).toBe(
      "calc(0.625rem - 2px)"
    )
    expect(resolveVariables("var(--missing, 4px)", values)).toBe("4px")
    expect(resolveVariables("var(--missing)", values)).toBeNull()
    expect(resolveVariables("hsl(var(--nope))", values)).toBeNull()
  })
})

describe("nearestColorTokens", () => {
  const tokens = new Map(
    Object.entries({
      background: "oklch(1 0 0)",
      foreground: "oklch(0.145 0 0)",
      primary: "oklch(0.205 0 0)",
      "primary-foreground": "oklch(0.985 0 0)",
      secondary: "oklch(0.97 0 0)",
      muted: "oklch(0.97 0 0)",
      "muted-foreground": "oklch(0.556 0 0)",
      accent: "oklch(0.97 0 0)",
      destructive: "oklch(0.577 0.245 27.325)",
      border: "oklch(0.922 0 0)",
    }).map(([name, value]) => [name, parseColor(value)!])
  )
  const zinc100 = parseColor("oklch(96.7% 0.001 286.375)")!
  const zinc900 = parseColor("oklch(21% 0.006 285.885)")!
  const blue500 = parseColor("oklch(62.3% 0.214 259.815)")!

  test("shared values collapse to one name, chosen by role and priority", () => {
    expect(nearestColorTokens(zinc100, tokens, "surface")).toEqual([
      "muted",
      "background",
    ])
    expect(nearestColorTokens(zinc100, tokens, "surface", 3)).toEqual([
      "muted",
      "background",
      "border",
    ])
    expect(nearestColorTokens(zinc900, tokens, "text")).toEqual([
      "primary",
      "foreground",
    ])
  })

  test("a surface is not offered -foreground tokens while a surface is close", () => {
    // primary-foreground is closer to zinc-100 than background is.
    expect(nearestColorTokens(zinc100, tokens, "surface")).not.toContain(
      "primary-foreground"
    )
    expect(nearestColorTokens(zinc100, tokens, "text", 3)).toEqual([
      "muted",
      "primary-foreground",
      "background",
    ])
  })

  test("nothing within the threshold", () => {
    expect(nearestColorTokens(blue500, tokens, "surface")).toEqual([])
  })
})

describe("didYouMean", () => {
  const declared = [
    "primary",
    "primary-foreground",
    "muted",
    "muted-foreground",
    "ring",
    "input",
  ]
  test.each([
    ["primry", "primary"],
    ["mutedforeground", "muted-foreground"],
    ["muted-forground", "muted-foreground"],
    ["rng", "ring"],
    ["highlight", null],
    ["brand", null],
    ["primary", null],
  ])("%s -> %s", (value, expected) => {
    expect(didYouMean(value, declared)).toBe(expected)
  })
})

describe("nearestSteps", () => {
  const scale = new Map([
    ["xs", 12],
    ["sm", 14],
    ["base", 16],
    ["lg", 18],
  ])
  test("exact first, then by distance, smaller first on ties", () => {
    expect(nearestSteps(14, scale)).toEqual([
      { name: "sm", px: 14, exact: true },
      { name: "xs", px: 12, exact: false },
    ])
    expect(nearestSteps(13, scale).map((s) => s.name)).toEqual(["xs", "sm"])
    expect(nearestSteps(40, scale, 1).map((s) => s.name)).toEqual(["lg"])
  })
})

describe("withBase", () => {
  test.each([
    ["bg-zinc-100", "bg-muted", "bg-muted"],
    ["hover:bg-zinc-100/50", "bg-muted/50", "hover:bg-muted/50"],
    [
      "md:dark:!text-zinc-500",
      "text-muted-foreground",
      "md:dark:!text-muted-foreground",
    ],
    ["-mt-[13px]", "mt-3.25", "-mt-3.25"],
    ["data-[state=open]:bg-zinc-100", "bg-muted", "data-[state=open]:bg-muted"],
  ])("%s with %s -> %s", (token, base, expected) => {
    expect(withBase(token, base)).toBe(expected)
  })
})
