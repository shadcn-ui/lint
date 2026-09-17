// Variants written as a prop typed with a union of string literals, the
// same shape as a cva axis without the factory: read for the messages'
// "use an existing variant" list and for the size list.

import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { describe, expect, test } from "vitest"

import {
  extractVariantDefinitions,
  sizeNamesFor,
  variantNamesFor,
} from "../src/project/variants"

describe("variants from props", () => {
  test("an inline props type on a function component", () => {
    const source = `
      function Text({ children, className, variant = "default" }: {
        children: React.ReactNode
        className?: string
        variant?: "default" | "h1" | "h2" | "h3"
      }) {
        return <p className={\`text-2xl \${className}\`}>{children}</p>
      }
      export { Text }
    `
    expect(extractVariantDefinitions(source)).toEqual([
      {
        name: "Text",
        axes: { variant: ["default", "h1", "h2", "h3"] },
        source: "props",
      },
    ])
  })

  test("an intersection with React.ComponentProps, on an arrow component", () => {
    const source = `
      export const Card = ({ className, size = "default", ...props }: React.ComponentProps<"div"> & { size?: "default" | "sm" }) => (
        <div data-size={size} className={cn("rounded-xl", className)} {...props} />
      )
    `
    expect(extractVariantDefinitions(source)).toEqual([
      { name: "Card", axes: { size: ["default", "sm"] }, source: "props" },
    ])
  })

  test("a props type alias or interface referenced by name", () => {
    const source = `
      type BadgeProps = { tone?: "neutral" | "info"; variant?: "solid" | "outline" }
      interface ChipProps extends Base { size?: "sm" | "lg"; label: string }
      export function Badge(props: BadgeProps) { return <span /> }
      export function Chip(props: ChipProps) { return <span /> }
    `
    expect(extractVariantDefinitions(source)).toEqual([
      {
        name: "Badge",
        axes: { tone: ["neutral", "info"], variant: ["solid", "outline"] },
        source: "props",
      },
      { name: "Chip", axes: { size: ["sm", "lg"] }, source: "props" },
    ])
  })

  test("an alias on the prop, and keyof typeof a lookup object", () => {
    const source = `
      const VARIANTS = { primary: "bg-accent", secondary: "bg-accent-soft" } as const
      type ButtonVariant = keyof typeof VARIANTS
      type ButtonSize = "sm" | "lg"
      type ButtonProps = { variant?: ButtonVariant; size?: ButtonSize; className?: string }
      export function Button({ variant = "primary", className }: ButtonProps) {
        return <button className={cn(VARIANTS[variant], className)} />
      }
    `
    expect(extractVariantDefinitions(source)).toEqual([
      {
        name: "Button",
        axes: { variant: ["primary", "secondary"], size: ["sm", "lg"] },
        source: "props",
      },
    ])
  })

  test("a lookup object a spread or a computed key hides is not a list", () => {
    const source = `
      const VARIANTS = { ...BASE, primary: "bg-accent" } as const
      type Props = { variant?: keyof typeof VARIANTS }
      export function Tag(props: Props) { return <span /> }
    `
    expect(extractVariantDefinitions(source)).toEqual([])
  })

  // A component that renders as an anchor or a button declares its props
  // as a union: the variants it accepts are the ones every member does.
  test("a props union keeps the variants every member accepts", () => {
    const source = `
      type Base = { variant?: "primary" | "secondary"; className?: string }
      type AsLink = Base & Omit<ComponentProps<typeof Link>, keyof Base>
      type AsButton = Base &
        Omit<ComponentProps<"button">, keyof Base> & { href?: undefined }
      type ButtonProps = AsLink | AsButton
      export function Button(props: ButtonProps) { return <button /> }
    `
    expect(extractVariantDefinitions(source)).toEqual([
      {
        name: "Button",
        axes: { variant: ["primary", "secondary"] },
        source: "props",
      },
    ])
  })

  test("a variant one member of the union does not accept is left out", () => {
    const source = `
      type AsLink = { variant?: "primary" | "ghost" }
      type AsButton = { variant?: "primary" }
      type ChipProps = AsLink | AsButton
      export function Chip(props: ChipProps) { return <span /> }
    `
    expect(extractVariantDefinitions(source)).toEqual([
      { name: "Chip", axes: { variant: ["primary"] }, source: "props" },
    ])
  })

  test("non-literal unions and plain strings are not axes", () => {
    const source = `
      export function Field({ label, kind, width }: { label: string; kind?: Kind | "auto"; width?: number | "full" }) {
        return <div />
      }
    `
    expect(extractVariantDefinitions(source)).toEqual([])
  })

  test("a cva named after the component still wins over its props", () => {
    const source = `
      const buttonVariants = cva("", { variants: { variant: { default: "", ghost: "" } } })
      export function Button({ variant }: { variant?: "default" | "ghost" | "unlisted" }) { return <button /> }
    `
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shadcn-lint-variants-"))
    const file = path.join(dir, "button.tsx")
    fs.writeFileSync(file, source)
    expect(variantNamesFor(file, "Button")).toEqual(["default", "ghost"])
  })

  test("another component's props in the same file are not borrowed", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shadcn-lint-variants-"))
    const file = path.join(dir, "card.tsx")
    fs.writeFileSync(
      file,
      `export function Card({ size }: { size?: "default" | "sm" }) { return <div /> }
       export function CardTitle(props: { className?: string }) { return <div /> }`
    )
    expect(sizeNamesFor(file, "Card")).toEqual(["default", "sm"])
    expect(sizeNamesFor(file, "CardTitle")).toBeNull()
  })

  test("variantNamesFor reads an alias and a lookup object from the file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shadcn-lint-variants-"))
    const file = path.join(dir, "button.tsx")
    fs.writeFileSync(
      file,
      `const VARIANTS = { primary: "", secondary: "" } as const
       type ButtonVariant = keyof typeof VARIANTS
       export function Button({ variant }: { variant?: ButtonVariant }) { return <button /> }`
    )
    expect(variantNamesFor(file, "Button")).toEqual(["primary", "secondary"])
  })

  test("variantNamesFor and sizeNamesFor read the component's props", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shadcn-lint-variants-"))
    const file = path.join(dir, "text.tsx")
    fs.writeFileSync(
      file,
      `export function Text({ variant, size }: { variant?: "default" | "h1"; size?: "sm" | "lg" }) { return <p /> }`
    )
    expect(variantNamesFor(file, "Text")).toEqual(["default", "h1"])
    expect(sizeNamesFor(file, "Text")).toEqual(["sm", "lg"])
  })
})
