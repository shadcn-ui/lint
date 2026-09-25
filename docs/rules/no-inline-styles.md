# no-inline-styles

Use classes for styling. Pass dynamic values through CSS custom properties
when a class needs them. This rule reports ordinary inline properties,
hardcoded colors in custom properties, unreadable style objects, and
`<style>` elements.

## Setup

```js
"shadcn/no-inline-styles": "error"
```

Keep this rule enabled inside your component directory too. It checks
all JSX elements and does not need component import settings.

## Examples

### Classes and custom properties

```tsx
// Allowed.
<div className="text-primary">Account settings</div>
<div className="text-(--label-color)" style={{ "--label-color": "var(--color-primary)" }} />

// Reported: an ordinary inline property.
<div style={{ color: "var(--color-primary)" }}>Account settings</div>

// Reported: a hardcoded color in a custom property.
<div style={{ "--label-color": "#ec4899" }}>Account settings</div>
```

The rule reports each disallowed property separately. A custom property
can carry a dynamic value:

```tsx
import * as React from "react"

export function Panel({ width }: { width: number }) {
  return (
    <div
      className="w-(--panel-width)"
      style={{ "--panel-width": `${width}px` } as React.CSSProperties}
    />
  )
}
```

Custom properties are checked for colors, not every kind of hardcoded
value. Hex colors, named colors, color functions, and colors in gradients
or shadows are reported. Theme variable references pass.

### Variables and style objects

The rule reads same-file objects and lookup values one hop deep:

```tsx
const colors = { accent: "#ec4899" }

// Reported: the lookup contains a raw color.
<div style={{ "--label-color": colors.accent }} />
```

An imported object, unknown function call, unreadable spread, or mutated
object is reported as a dynamic style value:

```tsx
import { panelStyle } from "./styles"

// Reported: the object cannot be checked here.
;<div style={panelStyle} />
```

### Forwarded style props

A component can forward the `style` prop it received:

```tsx
import * as React from "react"

export function Panel({ style, ...props }: React.ComponentProps<"div">) {
  return <div style={style} {...props} />
}
```

A local object named `style` is still checked. Defaults for the received
prop are also checked because they are defined in the current file.

### Style elements

A `<style>` element is reported, including CSS-in-JSX blocks:

```tsx
// Reported.
<style>{".panel { color: red; }"}</style>
```

Class and property exceptions do not exempt `<style>` elements or
unreadable style objects.

### Allow an exception

For a property controlled by an animation library:

```js
"shadcn/no-inline-styles": ["error", { allow: ["transform"] }]
```

```tsx
// Allowed.
<div style={{ transform: "translateX(10px)" }} />

// Reported.
<div style={{ color: "red" }} />
```

Use CSS property names, not Tailwind classes. `backgroundColor` and
`background-color` match the same property. `border-*` matches a family;
`--*` matches every custom property.

An allowed property is not checked further, including for hardcoded
colors. Use narrow exceptions when possible.

### Dynamic style identifiers

Some libraries expose computed style objects that cannot be inspected statically.
You can allow specific identifiers for those integrations:

```js
"shadcn/no-inline-styles": ["error", {
  allowDynamicIdentifiers: ["floatingStyles"],
}]
```

This exempts only the named identifier. Other dynamic identifiers remain
reported, and inline object literals are still checked normally. Use narrow,
library-specific names rather than broad names such as `style` or `props`.

### Contracts

A contract can allow a property on one component:

```js
"shadcn/no-inline-styles": ["error", {
  contracts: [
    { pattern: "^Motion$", allow: ["transform"] },
  ],
}]
```

```tsx
// Allowed by the contract.
<Motion style={{ transform: "translateX(10px)" }} />

// Reported: the contract does not apply to div.
<div style={{ transform: "translateX(10px)" }} />
```

This rule matches the JSX component name as written. It does not resolve
wrappers to their underlying component. Lowercase elements use the
top-level policy. See [contract inheritance](../rules.md#contracts).

### Your own words

```js
"shadcn/no-inline-styles": ["error", {
  message: 'Use a class instead of {{property|inline CSS}}.',
}]
```

For `style={{ color: "red" }}`:

```text
Use a class instead of color.
```

`{{property}}` uses the source spelling, such as `backgroundColor`.
It is empty for dynamic style objects and `<style>` elements, so provide
a fallback. `{{component}}` is empty on lowercase elements.

## Options

| Option                    | Default           | What it does                                                       |
| ------------------------- | ----------------- | ------------------------------------------------------------------ |
| `allow`                   | Not set           | Exempts CSS properties from inline-style checks.                   |
| `deny`                    | Not set           | Removes exemptions. Without `allow`, exempts every other property. |
| `contracts`               | `[]`              | Sets property exceptions and messages for matching components.     |
| `allowDynamicIdentifiers` | Not set           | Exempts named dynamic style identifiers from static analysis.      |
| `message`                 | Built-in guidance | Replaces error text.                                               |

A `deny` list can also report custom properties that would otherwise
pass. Invalid entries such as `bg-red-500` produce a configuration error.
This rule has no [recognition options](../rules.md#recognition).

## Limits

- Imported style values are reported as unreadable rather than inspected.
- Forwarding a received `style` prop is allowed. Its authored defaults
  and any local properties added alongside it are checked.
- A Button contract does not apply to a wrapper named SaveButton.

See [analysis limits](../how-it-works.md#what-it-cannot-see) for shared limits.
