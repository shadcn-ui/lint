import { readFileSync } from "node:fs"
import { defaultConfig } from "cn/config"
import { validators as twValidators } from "tailwind-merge"
import { describe, expect, test } from "vitest"

import { createClassifier, groupOf } from "../src/grammar/classifier"
import * as cnValidators from "../src/grammar/validators"

describe("groupOf", () => {
  test.each([
    ["text-sm", "font-size"],
    ["text-red-500", "text-color"],
    ["text-center", "text-alignment"],
    ["text-muted-foreground", "text-color"],
    ["bg-pink-500", "bg-color"],
    ["bg-primary/90", "bg-color"],
    ["bg-[#333]", "bg-color"],
    ["bg-(--x)", "bg-color"],
    ["p-4", "p"],
    ["px-6", "px"],
    ["gap-2", "gap"],
    ["mt-4", "mt"],
    ["-mt-4", "mt"],
    ["!p-0", "p"],
    ["p-0!", "p"],
    ["w-full", "w"],
    ["w-[320px]", "w"],
    ["w-1/2", "w"],
    ["size-4", "size"],
    ["rounded-lg", "rounded"],
    ["rounded", "rounded"],
    ["border", "border-w"],
    ["border-2", "border-w"],
    ["border-border", "border-color"],
    ["ring-2", "ring-w"],
    ["ring-ring/50", "ring-color"],
    ["shadow-lg", "shadow"],
    ["shadow-lg/50", "shadow"],
    ["shadow-none", "shadow"],
    ["opacity-50", "opacity"],
    ["animate-spin", "animate"],
    ["transition-colors", "transition"],
    ["hover:bg-accent", "bg-color"],
    ["md:hover:text-sm", "font-size"],
    ["data-[state=open]:bg-accent", "bg-color"],
    ["[&_svg]:size-4", "size"],
    ["[color:red]", "arbitrary..color"],
    ["font-medium", "font-weight"],
    ["leading-none", "leading"],
    ["truncate", "text-overflow"],
    ["flex", "display"],
    ["hidden", "display"],
    ["absolute", "position"],
    ["z-50", "z"],
    ["col-start-2", "col-start"],
    ["self-end", "align-self"],
    ["sr-only", "sr"],
    // Tailwind 3 names Tailwind still generates.
    ["flex-grow", "grow"],
    ["flex-grow-0", "grow"],
    ["flex-shrink", "shrink"],
    ["flex-shrink-[2]", "shrink"],
    ["md:flex-grow", "grow"],
    ["overflow-ellipsis", "text-overflow"],
    ["decoration-slice", "box-decoration"],
    ["decoration-clone", "box-decoration"],
    ["decoration-sky-500", "text-decoration-color"],
  ])("%s -> %s", (token, group) => {
    expect(groupOf(token)).toBe(group)
  })

  test.each([
    "unknown-thing",
    "cn-accordion-item",
    "group/button",
    "[novalue]",
    "",
    "!",
  ])("%s -> null", (token) => {
    expect(groupOf(token)).toBeNull()
  })

  // Without the postfix-first lookup, text-sm/6 would fall through to
  // text-color, whose color validator accepts anything.
  test("looks up the class without its postfix modifier first", () => {
    expect(groupOf("text-sm/6")).toBe("font-size")
    expect(groupOf("text-white/50")).toBe("text-color")
  })
})

describe("createClassifier", () => {
  test("builds from a custom config", () => {
    const { groupOf } = createClassifier({
      theme: { tone: ["loud", { $v: "isNumber" }] },
      classGroups: {
        tone: [{ tone: ["", "quiet", { $t: "tone" }] }],
        "tone-x": [{ "tone-x": [{ $v: "isTshirtSize" }] }],
      },
      conflictingClassGroups: {},
      conflictingClassGroupModifiers: {},
      orderSensitiveModifiers: [],
    })
    expect(groupOf("tone")).toBe("tone")
    expect(groupOf("tone-quiet")).toBe("tone")
    expect(groupOf("tone-loud")).toBe("tone")
    expect(groupOf("tone-3")).toBe("tone")
    expect(groupOf("tone-x-sm")).toBe("tone-x")
    expect(groupOf("tone-x")).toBeNull()
    expect(groupOf("bg-red-500")).toBeNull()
  })

  test("first matching group wins, in config order", () => {
    const base = {
      theme: {},
      conflictingClassGroups: {},
      conflictingClassGroupModifiers: {},
      orderSensitiveModifiers: [],
    }
    const numberFirst = createClassifier({
      ...base,
      classGroups: {
        a: [{ x: [{ $v: "isNumber" }] }],
        b: [{ x: [{ $v: "isAny" }] }],
      },
    })
    const anyFirst = createClassifier({
      ...base,
      classGroups: {
        b: [{ x: [{ $v: "isAny" }] }],
        a: [{ x: [{ $v: "isNumber" }] }],
      },
    })
    expect(numberFirst.groupOf("x-1")).toBe("a")
    expect(anyFirst.groupOf("x-1")).toBe("b")
  })

  test("rejects unknown validators", () => {
    expect(() =>
      createClassifier({
        theme: {},
        classGroups: { a: [{ x: [{ $v: "isNope" }] }] },
        conflictingClassGroups: {},
        conflictingClassGroupModifiers: {},
        orderSensitiveModifiers: [],
      })
    ).toThrow(/unknown validator "isNope"/)
  })
})

describe("cn-validators", () => {
  const samples = [
    "",
    "0",
    "1",
    "1.5",
    "-2",
    "1/2",
    "1.5/3",
    "50%",
    "x%",
    "sm",
    "2xl",
    "base",
    "auto",
    "full",
    "[#333]",
    "[10px]",
    "[0]",
    "[1.5rem]",
    "[calc(100%-2rem)]",
    "[length:10px]",
    "[length:var(--x)]",
    "[size:10px]",
    "[bg-size:cover]",
    "[number:3]",
    "[weight:bold]",
    "[family-name:Inter]",
    "[position:center]",
    "[percentage:50%]",
    "[image:var(--x)]",
    "[url(/x.png)]",
    "[url:var(--x)]",
    "[linear-gradient(red,blue)]",
    "[0_0_1px_red]",
    "[shadow:var(--x)]",
    "[rgb(0,0,0)]",
    "[10vh]",
    "[3ch]",
    "[color:red]",
    "(--x)",
    "(length:--x)",
    "(size:--x)",
    "(family-name:--x)",
    "(position:--x)",
    "(image:--x)",
    "(shadow:--x)",
    "(weight:--x)",
    "(number:--x)",
    "@container",
    "@container/main",
    "@container-size/main",
    "@container-normal/main",
    "@container-size/",
  ]

  test("agrees with tailwind-merge's validators", () => {
    const names = Object.keys(cnValidators) as (keyof typeof cnValidators)[]
    expect(names.length).toBe(Object.keys(twValidators).length)
    for (const name of names) {
      for (const value of samples) {
        expect(cnValidators[name](value), `${name}(${value})`).toBe(
          twValidators[name](value)
        )
      }
    }
  })
})

describe("registry corpus", () => {
  const corpus = JSON.parse(
    readFileSync(new URL("./fixtures/registry-corpus.json", import.meta.url), {
      encoding: "utf8",
    })
  ) as { defaults: string[]; callers: string[] }
  const tokens = [
    ...new Set(
      [...corpus.defaults, ...corpus.callers].flatMap((value) =>
        value.split(/\s+/).filter(Boolean)
      )
    ),
  ]

  // Seeded so a failing sample is reproducible.
  const random = (() => {
    let state = 0x2f6e2b1
    return () => {
      state = (state + 0x6d2b79f5) | 0
      let t = Math.imul(state ^ (state >>> 15), 1 | state)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  })()
  const sample = [...tokens]
  for (let i = sample.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[sample[i], sample[j]] = [sample[j], sample[i]]
  }
  const picked = sample.slice(0, 200)

  test("classifies 200 random tokens without throwing", () => {
    const groups = defaultConfig().classGroups
    expect(picked.length).toBe(200)
    for (const token of picked) {
      let group: string | null = null
      expect(() => {
        group = groupOf(token)
      }, token).not.toThrow()
      const valid =
        group === null ||
        (group as string).startsWith("arbitrary..") ||
        Object.hasOwn(groups, group)
      expect(valid, `${token} -> ${group}`).toBe(true)
    }
  })
})
