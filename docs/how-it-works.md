# How it works

The linter reads your components, theme, and variants to check how you use
them. It analyzes source code without running your app.

## Your components, from imports

`components.json` points to your UI directory. The linter reads its
exported components and resolves imports through `@/`, tsconfig `paths`,
package `imports`, and workspace package `exports`.

It follows re-exports and renamed imports back to the defining file:

```tsx
// components/widgets.ts.
export { Button as Action } from "./ui/button"
```

```tsx
import { Action } from "@/components/widgets"

export function Page() {
  // no-restyle reports a color override on Button.
  return <Action className="bg-primary">Save</Action>
}
```

A default export counts under the component's own name, including one
wrapped as `export default memo(Button)` or `forwardRef`.

A component from another package does not become a design-system
component just because it has the same name. Name matching is a fallback
only when an import cannot be resolved. An unresolved UI alias produces
a warning with the configuration to fix.

A UI file may re-export a name from a package, which makes the linter
read that package's file. Only the names your UI directory exports are
its components; the rest of that package is not, whatever its bundled
locals are called. A component you do re-export from your UI directory
is checked, and its finding names no file: there is no variant to add
inside `node_modules`.

Without `components.json`, the linter uses the nearest `package.json`
and looks in `components/ui` or `src/components/ui`. For another import
location, set `settings.shadcn.ui`, such as `"@/ds"`. This recognizes
`@/ds` and `@/ds/button` across the rules. Use `componentImports`
for regex matching and `ignoreImports` to skip imports before
recognition. See [shared options](./rules.md#shared-options).

## Theme tokens

The theme CSS comes from `components.json`. If the path it names does
not exist, the linter warns once and discovers the theme the way it
does without `components.json`. It follows the theme's `@import`s and
reads `--color-*` declarations in `@theme`:

```css
@theme inline {
  --color-primary: var(--primary);
  --color-brand: var(--brand);
}
```

- `bg-brand` is allowed: it names a declared token.
- `bg-zinc-100` is reported: it uses a raw palette color.
- `bg-highlight` is reported: it names an undeclared token.

Imported stylesheets can contribute tokens and custom utilities.
Tailwind's built-in palette does not count as your project's declared
tokens. See [no-raw-colors](./rules/no-raw-colors.md).

Suggestions use token values too. The linter resolves variables from
`:root`, skips `.dark` blocks, and compares colors in OKLab. It also
reads the radius and text scales, including `calc()`. For example,
`rounded-[10px]` can suggest `rounded-lg` when that token is 10px.
Nearby colors and exact scale matches become editor suggestions.
For other sizes, the message lists the nearest scale values.

Without `components.json`, it finds a stylesheet that imports Tailwind.
If several qualify, it picks the one with the most color tokens, then
the one nearest the project root. A file containing only tokens is not
the entry; the stylesheet importing it is.

## Tailwind classes

`no-unknown-classes` asks your installed Tailwind v4 whether each class
generates CSS. It loads your theme with its imports, custom utilities,
variants, plugins, and config. This catches typos such as `hovr:flex`
and `rounded-huge`, and suggests a valid class when it finds a close match.

Tailwind runs in a worker thread because its loader is asynchronous.
Answers are cached per theme. If Tailwind or the theme cannot load, the
rule warns and uses a [grammar fallback](./rules/no-unknown-classes.md).

A theme CSS that declares tokens without importing Tailwind — the usual
shape for a component package — knows no base utilities, so the rule
would report every stock class. When `components.json` names such a file,
the linter warns once and asks a discovered entry instead, while the file
it names stays the one a token belongs in.

## Variants

`no-restyle` suggests variants found in the component file. It reads
`cva` and `tv` definitions, plus props typed as string unions, such as
`variant?: "default" | "destructive"` or `size?: "sm" | "lg"`.

Props resolve through intersections and same-file type aliases and
interfaces. Prop definitions apply only to their component; a factory
definition can be used for other components in the same file. Spacing
findings suggest values from the `size` axis.

The file can come from the UI directory or a resolved import, including
a barrel. Variant suggestions work without `components.json`.

## Class categories

The linter uses `cn`'s class groups to distinguish classes such as
`text-sm` (typography), `text-primary` (color), and `text-center` (layout).
Groups map to color, typography, spacing, shape, effects, motion, or
layout. `allow: ["layout"]` permits layout classes. A contract that
replaces `allow` must include `layout` to keep that allowance. See the
[category table](./rules.md#categories).

The linter uses your project's `cn` when it is at least version 0.2.6.
Otherwise, it uses the bundled grammar and warns if an older copy was
found. A class with no recognized group is `unclassified` and is not
allowed by `layout`. A recognized group with no appearance category is
treated as layout; newly unmapped groups produce a warning.

Utilities Tailwind still generates under their Tailwind 3 names read as
the utilities they are: `flex-grow` and `flex-shrink-0` classify with
`grow` and `shrink`, `overflow-ellipsis` with `text-ellipsis`, and
`decoration-slice` and `decoration-clone` as box decorations.

## Values in variables

The linter follows class values one hop into same-file variables:

```tsx
import { Button } from "@/components/ui/button"

function SaveAction({ active }: { active: boolean }) {
  const tone = active ? "bg-primary" : "bg-destructive"

  // no-restyle checks both colors on Button.
  return <Button className={tone}>Save</Button>
}
```

It reads `const` and never-reassigned `let` initializers, conditional
branches, template text, arrays, object values, and known helper calls.
This also applies to custom properties in `style`: storing a raw color
in a lookup table does not hide it.

Unknown function calls and unresolved template expressions may leave
part of a value unreadable. `require-static-classes` reports these when used on
a recognized component:

```tsx
// require-static-classes reports a value it cannot check.
<Button className={props.tone}>Save</Button>
```

## Wrappers

A wrapper that forwards `className` to a design-system component gets
that component's contract and variant suggestions:

```tsx
import * as React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function SaveButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return <Button className={cn("w-full", className)} {...props} />
}
```

```tsx
// no-restyle reports a color override on Button through SaveButton.
<SaveButton className="bg-primary">Save</SaveButton>
```

Wrapper chains can cross files and use namespace imports such as
`<W.SaveButton>`. They are separate from the one-hop limit on class
values. A props spread counts as forwarding only if it still contains
`className`. If several targets qualify, the first supplies the contract.

A `render` prop forwards the same way. Base UI renders another component
in a trigger's place, and the `className` goes with it:

```tsx
// no-restyle reports a color override on Button through DialogTrigger.
<DialogTrigger render={<Button />} className="bg-primary">
  Open
</DialogTrigger>
```

The suggestion lists Button's variants, since Button is what wears the
classes. `render={(props) => <Button {...props} />}` reads the same. A
trigger that renders a plain element, such as `render={<span />}`,
restyles nothing in the design system and is not reported.

## Where it looks

- `className` and similar props, including `wrapperClassName`,
  `classNames={{ day: "..." }}`, and Astro's `class:list`.
- Calls to `cn`, `cx`, `clsx`, `cva`, `tv`, `twMerge`, `twJoin`, and
  `classNames`, including calls outside JSX. Add functions through
  `mergeFunctions` and `variantFunctions` in shared settings or rule options.
- Same-file variables and object values, one hop deep.
- Readable objects spread onto elements, including nested spreads and
  computed keys.
- `style` attributes, `<style>` elements, and SVG color attributes:
  `fill`, `stroke`, `color`, `stopColor`, `floodColor`, and `lightingColor`.
- Every string literal when `scanAllStrings` is enabled on
  `no-raw-colors` or `no-arbitrary-values`.

## What it cannot see

A clean lint result does not mean every styling path was checked:

- **Parent selectors.** `no-restyle` does not trace
  `<div className="[&_button]:bg-primary">` to a child component. The
  same applies to `*:` and `**:`. Token rules still check these classes.
- **Unknown props objects.** `<Button {...props}>` is left alone if the
  object cannot be read. Readable objects are checked, and
  `require-static-classes` reports unreadable class values it can identify.
- **Imported values.** Class values are followed within a file, not
  across imports. Wrapper tracing only follows `className` forwarding.
- **Plain CSS.** Stylesheet declarations and `@apply` are outside these
  rules. Use a CSS linter for them.
- **Locally rebuilt components.** Token rules still apply, but
  `no-restyle` needs a recognized design-system component.
- **New tokens and disabled rules.** New `@theme` declarations are
  allowed by design, and `eslint-disable` comments can bypass rules.
  Review those changes; you can also require descriptions on disable
  comments and report unused directives.

To remove Tailwind's default palette entirely, use
`@theme { --color-*: initial; }`. Keep `--spacing` if you want to retain
the layout scale.

## Caching

If results stay unchanged after an edit, see
[troubleshooting](./troubleshooting.md#lint-results-did-not-change-after-an-edit).

## Performance

The linter caches project analysis across files. Performance depends on
the enabled rules, project size, imports, and number of diagnostics.
`no-unknown-classes` also loads Tailwind for each theme it checks.

The repository includes benchmarks for the pinned registry and generated
monorepos. See [Measuring](../CONTRIBUTING.md#measuring) to compare cold and
warm runs or measure individual rules.
