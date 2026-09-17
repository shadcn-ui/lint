# no-restyle

Use component variants for appearance and `className` for the changes your
policy allows. The error lists the component's variants or sizes and the
file that defines them.

## Setup

Start with layout classes allowed:

```js
"shadcn/no-restyle": ["error", { allow: ["layout"] }]
```

Turn this rule off inside your component directory so components can
style their own internals. See [Get started](../../README.md#get-started).

## Examples

The examples below assume these imports:

```tsx
import { Button } from "@/components/ui/button"
import { CardContent, CardTitle } from "@/components/ui/card"
```

### Layout and appearance

With the setup above, margin and width pass. Padding, colors, and shape
changes are reported:

```tsx
// Allowed.
<Button className="mt-4 w-full">Save changes</Button>
<Button size="lg" variant="destructive">Delete account</Button>

// Reported.
<Button className="p-4 bg-pink-500 rounded-full">Save changes</Button>
```

Spacing errors suggest sizes defined by the component. Other appearance
errors list its variants. The linter reads those values from your code.

### Contracts

You can give components different rules. This allows typography on
CardTitle and spacing on CardContent:

```js
"shadcn/no-restyle": ["error", {
  allow: ["layout"],
  contracts: [
    { pattern: "^CardTitle$", allow: ["layout", "typography"] },
    { pattern: "^CardContent$", allow: ["layout", "spacing"] },
  ],
}]
```

```tsx
// Allowed.
<CardTitle className="text-sm">Account settings</CardTitle>
<CardContent className="p-4">Profile details</CardContent>

// Reported: color is not allowed by either contract.
<CardTitle className="text-pink-500">Account settings</CardTitle>
```

A contract replaces the keys it writes and inherits the rest from the
rule. If several contracts match, only the last one applies. Include
`layout` in a contract's `allow` list when it should keep layout classes.
See [contract matching](../rules.md#contracts).

### Deny specific classes

Use `deny` to remove classes from the allowed set:

```js
"shadcn/no-restyle": ["error", {
  allow: ["layout"],
  deny: ["w-*"],
}]
```

```tsx
// Allowed.
<Button className="mt-4">Save changes</Button>

// Reported.
<Button className="w-full">Save changes</Button>
```

With `deny` alone, every class except the denied classes is allowed.
With neither `allow` nor `deny`, every class on a recognized component is
reported, including layout. See [the policy](../rules.md#the-policy).

### Your own words

Use one message for every error, or write a message for each category:

```js
"shadcn/no-restyle": ["error", {
  allow: ["layout"],
  message: {
    spacing: "Use a {{component}} size: {{sizes|none defined}}.",
    default: "Use a {{component}} variant: {{variants|none defined}}.",
  },
}]
```

For `<Button className="p-4">`, when Button defines `sm` and `lg` sizes:

```text
Use a Button size: sm, lg.
```

`{{sizes}}` is available on spacing findings, except explicit `deny`
findings. `{{variants}}`, `{{component}}`, and `{{file}}` are available
across this rule's findings. Missing component data may be empty.
A contract can provide its own `message` using the same format.
See [message placeholders](../rules.md#your-own-words).

### Wrappers and variables

The rule follows imports, re-exports, and wrappers that forward
`className`, including a Base UI `render` prop: the classes on
`<DialogTrigger render={<Button />} className="...">` belong to Button. A
`render` value the rule cannot read leaves them on the trigger. A wrapper
uses the underlying component's contract and variant suggestions.

It also reads same-file values and known class helpers:

```tsx
import { cn } from "@/lib/utils"

export function SaveButton({ active }: { active: boolean }) {
  return (
    <Button className={cn("w-full", active && "bg-pink-500")}>
      Save changes
    </Button>
  )
}
```

`w-full` passes under `allow: ["layout"]`; `bg-pink-500` is reported.
See [wrappers](../how-it-works.md#wrappers) and
[values in variables](../how-it-works.md#values-in-variables).

## Options

| Option      | Default           | What it does                                                            |
| ----------- | ----------------- | ----------------------------------------------------------------------- |
| `allow`     | Not set           | Allows categories, class groups, or class patterns.                     |
| `deny`      | Not set           | Removes classes from `allow`. Without `allow`, permits everything else. |
| `contracts` | `[]`              | Sets `allow`, `deny`, and `message` for matching components.            |
| `message`   | Built-in guidance | Replaces the error text with a string or category-to-message object.    |

The rule also accepts [recognition options](../rules.md#recognition):
`componentImports`, `ignoreImports`, `mergeFunctions`, and `variantFunctions`.

## Limits

- Only recognized design-system components are checked. Plain elements
  and unrelated components are outside this rule.
- A class the grammar cannot classify is reported as `unclassified`,
  even with `allow: ["layout"]`. Allow a custom class by name when needed.
  The rule does not inspect that class's CSS. A class your CSS declares
  with `@utility` is reported the same way, in words that do not treat it
  as a misspelling.
- Contracts match class names and groups, not every equivalent CSS effect.
  For example, `w-*` does not match `[width:100%]` or `inline-full`.
- Allowing `p-*` also allows `p-[13px]` through this rule. Use
  [no-arbitrary-values](./no-arbitrary-values.md) to check the value.
- Unreadable class values are handled by [require-static-classes](./require-static-classes.md).

See [analysis limits](../how-it-works.md#what-it-cannot-see) for shared limits.
