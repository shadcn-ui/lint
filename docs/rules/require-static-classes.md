# require-static-classes

Keep component class values readable by the linter. If a class is built
from an unknown value, the other rules cannot check it. This rule reports
that unreadable part.

## Setup

Enable it alongside `no-restyle`:

```js
"shadcn/require-static-classes": "error"
```

Turn it off inside the component directory. Components often call their
own variant functions, which this rule cannot resolve at the call site.
See [the component override](../adoption.md#add-more-rules).

## Examples

The examples below assume this import:

```tsx
import { Button } from "@/components/ui/button"
```

### Complete class names

Static strings and conditional choices between complete classes pass:

```tsx
import { cn } from "@/lib/utils"

export function SaveButton({ wide }: { wide: boolean }) {
  return (
    <>
      <Button className="mt-4">Save changes</Button>
      <Button className={wide ? "w-full" : "w-auto"}>Save changes</Button>
      <Button className={cn("mt-4", wide && "w-full")}>Save changes</Button>
    </>
  )
}
```

Building a class name from a prop is reported:

```tsx
export function SaveButton({ color }: { color: string }) {
  return <Button className={`bg-${color}`}>Save changes</Button>
}
```

```text
Dynamically built className on <Button> cannot be checked. Use static class strings.
```

### Variables and functions

Same-file constants and never-reassigned variables can be read one hop
deep. Imported values and unknown function calls are reported:

```tsx
import { buttonClasses } from "./styles"

const layout = "mt-4 w-full"

// Allowed.
<Button className={layout}>Save changes</Button>

// Reported.
<Button className={buttonClasses}>Save changes</Button>
<Button className={getClasses()}>Save changes</Button>
```

In `cn("mt-4", extra)`, only the unreadable `extra` value is reported.
Other rules still check the known classes.

### Forwarding the received className

A wrapper can forward its received `className`:

```tsx
import * as React from "react"
import { cn } from "@/lib/utils"

export function SaveButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return <Button className={cn("w-full", className)} {...props} />
}
```

Defaults authored in the wrapper are checked. An opaque whole-props
spread is left alone because the rule cannot tell what it contains.

### Variant functions

The linter reads strings inside `cva()` and `tv()` definitions. It does
not resolve every function those factories return:

```tsx
import { cva } from "class-variance-authority"

const buttonVariants = cva("w-full")

// Reported by require-static-classes at this call site.
<Button className={buttonVariants()}>Save changes</Button>
```

This is why the rule is disabled inside component implementations.
Token and unknown-class rules still check the strings in the definition.

### Custom class helpers

Register a helper whose arguments contain class values:

```js
settings: {
  shadcn: {
    mergeFunctions: ["mergeClasses"],
  },
}
```

```tsx
// Allowed with the setting above.
<Button className={mergeClasses("mt-4", "w-full")}>Save changes</Button>
```

A dotted name matches a method call by its exact path. Effect's `Option`
constructors, for example:

```js
mergeFunctions: ["Option.some", "Option.none", "Option.fromNullishOr"]
```

```tsx
// Allowed: the classes are written out, and none() has none.
<OptionButton className={Option.some("w-full")} />
<OptionButton className={Option.none()} />

// Still dynamic: the argument is not static.
<OptionButton className={Option.some(load())} />
```

The linter reads the arguments; it does not execute the helper. Only
register helpers whose arguments accurately describe their output.

### Your own words

```js
"shadcn/require-static-classes": ["error", {
  message: "Use complete class names on {{component}} so the linter can check them.",
}]
```

## Options

| Option    | Default           | What it does                                                           |
| --------- | ----------------- | ---------------------------------------------------------------------- |
| `message` | Built-in guidance | Replaces the error text. `{{component}}` names the resolved component. |

The rule also accepts [recognition options](../rules.md#recognition):
`componentImports`, `ignoreImports`, `mergeFunctions`, and `variantFunctions`.

It has no `allow`, `deny`, or `contracts`. It checks whether a class value
can be read; the other rules decide whether that value is allowed.

## Limits

- Only recognized components and their forwarding wrappers are checked.
  Plain elements are outside this rule.
- Forwarding a component's received `className` is allowed. Its authored
  defaults and local classes are still checked.

See [wrappers](../how-it-works.md#wrappers) and
[analysis limits](../how-it-works.md#what-it-cannot-see).
