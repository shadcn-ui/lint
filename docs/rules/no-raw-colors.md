# no-raw-colors

Use colors from your theme. This rule reports raw Tailwind palette
colors, undeclared color tokens, and literal colors in SVG attributes.
It suggests nearby theme colors when it can resolve their values.

## Setup

```js
"shadcn/no-raw-colors": "error"
```

Keep this rule enabled inside your component directory too. It checks
class values on plain elements, components, and known class helpers.

## Examples

### Theme colors

Given a theme that declares `primary` and `muted-foreground`:

```tsx
// Allowed.
<div className="bg-primary text-muted-foreground">Account settings</div>

// Reported: raw palette color.
<div className="bg-pink-500">Account settings</div>

// Reported: the theme has no highlight token.
<div className="bg-highlight">Account settings</div>
```

The error lists theme tokens, suggests a nearby color or spelling
correction, and names the theme file. Suggestions appear in the editor.
Variants, opacity, and important markers are preserved in replacements.

`white`, `black`, `transparent`, `current`, and `inherit` are accepted
color names. Arbitrary colors such as `bg-[#333]` belong to
[no-arbitrary-values](./no-arbitrary-values.md).

Some theme namespaces share a prefix with a color utility. Declaring
`--text-stat-label` makes `text-stat-label` a font size, and
`--shadow-card-glow` makes `shadow-card-glow` a box shadow. Neither is a
color, and neither is reported as one; the same holds for
`--inset-shadow-*`, `--drop-shadow-*`, `--text-shadow-*`, and
`--background-image-*`. Classes your CSS declares with `@utility` are
your vocabulary too. A plain selector is not: with
`.text-danger { color: #f00 }` in your CSS, `text-danger` is still
reported, since the color behind it is raw.

Tailwind also reads a color from the utility's own namespace before
`--color-*`. `--background-color-surface` declares `bg-surface`,
`--text-color-ink` declares `text-ink`, and `--border-color-edge`
declares `border-edge`. Such a token counts for that utility only:
`text-surface` is still undeclared.

### SVG attributes

Use `currentColor` with a text color class, or reference a theme variable:

```tsx
// Allowed.
<svg className="text-primary" fill="currentColor" />
<svg fill="var(--color-primary)" />

// Reported.
<svg fill="#ec4899" />
<svg fill={"#ec4899"} />
<path stroke="red" />
```

The rule checks literal strings in `fill`, `stroke`, `color`,
`stopColor`, `floodColor`, and `lightingColor` on intrinsic elements.
Class exceptions do not exempt these attributes.

### Allow an exception

Use class names or patterns for colors your design system permits:

```js
"shadcn/no-raw-colors": ["error", {
  allow: ["*-amber-*"],
  deny: ["bg-amber-500"],
}]
```

```tsx
// Allowed by the exception.
<div className="text-amber-500">Pending</div>

// Reported by deny.
<div className="bg-amber-500">Pending</div>

// Reported: no exception allows pink.
<div className="bg-pink-500">Pending</div>
```

Use a full class pattern such as `*-amber-500`, not a color name such
as `amber-500`. With `deny` alone, only the named raw colors are checked;
other raw colors pass. See [the policy](../rules.md#the-policy).

### Contracts

An exception can apply to one component:

```js
"shadcn/no-raw-colors": ["error", {
  contracts: [
    { pattern: "^Badge$", allow: ["*-amber-500"] },
  ],
}]
```

```tsx
import { Badge } from "@/components/ui/badge"

// Allowed by the contract.
<Badge className="bg-amber-500">Pending</Badge>

// Reported: the exception applies only to Badge.
<div className="bg-amber-500">Pending</div>
```

This exception does not allow the class through `no-restyle`. Each rule
has its own policy. See [contracts](../rules.md#contracts).

### Your own words

```js
"shadcn/no-raw-colors": ["error", {
  message: 'Use a theme color for "{{className}}". See {{file}}.',
}]
```

For `bg-pink-500`, with the theme in `app/globals.css`:

```text
Use a theme color for "bg-pink-500". See app/globals.css.
```

`{{suggestions}}` contains nearby colors or a spelling correction;
`{{tokens}}` contains the declared color names on class findings.
A contract can also set `message`. See
[message placeholders](../rules.md#your-own-words).

### scanAllStrings

By default, the rule checks recognized [class sites](../how-it-works.md#where-it-looks).
Use `scanAllStrings` to check every string literal in a file:

```js
"shadcn/no-raw-colors": ["error", { scanAllStrings: true }]
```

This also checks strings that are not used as classes. Limit the rule's
file scope if your files contain examples or other text that resembles classes.

## Options

| Option           | Default           | What it does                                                          |
| ---------------- | ----------------- | --------------------------------------------------------------------- |
| `allow`          | Not set           | Exempts matching color classes.                                       |
| `deny`           | Not set           | Removes exemptions. Without `allow`, exempts every other color class. |
| `contracts`      | `[]`              | Sets exceptions and messages for matching components.                 |
| `message`        | Built-in guidance | Replaces error text. Editor suggestions remain available.             |
| `scanAllStrings` | `false`           | Checks all string literals, beyond recognized class sites.            |

The rule also accepts [recognition options](../rules.md#recognition).
`allow` and `deny` support categories, class groups, and class patterns.
Invalid entries produce a configuration error; see
[entry matching](../rules.md#contracts).

## Limits

- Tokens come from the [theme and its imports](../how-it-works.md#theme-tokens).
  Without a readable theme, palette colors are still reported, but
  undeclared tokens cannot be checked.
- Color suggestions use resolved light-mode values. A nearby color is
  a suggestion, not a guarantee that it matches the design.
- Variable references such as `bg-(--brand)` pass. This rule does not
  check whether that CSS variable is declared.
- Dynamic SVG expressions, component props, and inline `style` values are not
  covered by the SVG attribute check. Use
  [no-inline-styles](./no-inline-styles.md) for inline styles.

See [analysis limits](../how-it-works.md#what-it-cannot-see) for shared limits.
