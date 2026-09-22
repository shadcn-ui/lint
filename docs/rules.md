# Rules

Enable each rule at `warn` or `error`. Start with the
[README setup](../README.md#get-started), then add the checks your project needs.

| Rule                                                        | What it checks                                         |
| ----------------------------------------------------------- | ------------------------------------------------------ |
| [no-restyle](./rules/no-restyle.md)                         | Classes passed to design-system components.            |
| [no-raw-colors](./rules/no-raw-colors.md)                   | Palette colors, undeclared tokens, and raw SVG colors. |
| [no-arbitrary-values](./rules/no-arbitrary-values.md)       | Arbitrary values such as `p-[13px]`.                   |
| [no-inline-styles](./rules/no-inline-styles.md)             | Inline styles and `<style>` elements.                  |
| [no-unknown-classes](./rules/no-unknown-classes.md)         | Classes the project's Tailwind cannot generate.        |
| [require-static-classes](./rules/require-static-classes.md) | Unreadable class values on components.                 |

Turn `no-restyle` off inside your component directory so components
can style themselves. The [setup](../README.md#get-started) includes
this override. When you enable `no-arbitrary-values` and
`require-static-classes`, turn them off there too. See
[Add more rules](./adoption.md#add-more-rules) for that override.

## Shared options

### The policy

Every rule accepts `message`. Every rule except `require-static-classes` also
accepts `allow`, `deny`, and `contracts`:

| Option      | What it does                                                            |
| ----------- | ----------------------------------------------------------------------- |
| `allow`     | Allows matching classes or properties through this rule.                |
| `deny`      | Removes matches from `allow`. Without `allow`, permits everything else. |
| `contracts` | Sets a policy for matching components.                                  |
| `message`   | Replaces the rule's error text.                                         |

For `no-restyle`, these options decide which classes a component accepts.
For token and class-existence rules, they define exceptions to the check.
For `no-inline-styles`, they apply to CSS property names.

```js
"shadcn/no-restyle": ["error", {
  allow: ["layout"],
  deny: ["w-*"],
}]
```

Margin passes. Width does not. Appearance classes are still reported.

An omitted `allow` and an empty `allow` are different when `deny` is present:

| Configuration                 | Policy                                          |
| ----------------------------- | ----------------------------------------------- |
| Neither `allow` nor `deny`    | No policy exceptions.                           |
| `allow: [...]`                | Only matching classes or properties are exempt. |
| `allow: []`                   | No policy exceptions.                           |
| `deny: [...]` without `allow` | Everything except these matches is exempt.      |
| `deny: []` without `allow`    | Everything is exempt.                           |

The policy only affects what the rule checks. For example,
`deny: ["bg-primary"]` does not make a declared token a raw color.
Likewise, class exceptions do not bypass SVG attribute checks, and
property exceptions do not bypass `<style>` or dynamic-style checks.

### Contracts

A contract's `pattern` is a regex on the resolved component name.
`^Button$` matches only Button; `Button` also matches IconButton.

A contract replaces the keys it writes and inherits the rest from the
top-level rule. If several contracts match, only the last one applies;
it does not inherit from earlier contracts.

```js
"shadcn/no-raw-colors": ["error", {
  allow: ["*-amber-*"],
  deny: ["bg-amber-500"],
  contracts: [
    {
      pattern: "^Badge$",
      allow: ["*-amber-500"],
      deny: [],
    },
  ],
}]
```

Outside Badge, amber classes pass except `bg-amber-500`. On Badge,
only amber-500 classes are exempt. `deny: []` clears the inherited denial,
so `bg-amber-500` passes there. Declared theme colors pass in both cases.

For `no-inline-styles`, contracts match the component name as written
(`Card.Title` in Svelte, `CardTitle` or `card-title` in Vue), without
resolving wrappers. Lowercase elements use the top-level policy.

Class rules accept these entries in `allow` and `deny`:

| Entry            | Example                          | What it matches                     |
| ---------------- | -------------------------------- | ----------------------------------- |
| Category         | `layout`, `spacing`, `color`     | Classes in that category.           |
| Class group      | `p`, `px`, `bg-color`, `rounded` | Values in that group.               |
| Class or pattern | `p-4`, `p-*`, `md:p-*`           | An exact class or wildcard pattern. |

Groups are separate. `p` does not include `px` or `py`; `rounded` does
not include `rounded-t-*`. An entry that is both a group and a class
matches both: `flex` covers `flex` and `flex-1`.

Entries without `:` match the base class, ignoring variants, important
markers, negative prefixes, and opacity modifiers. `p-*` matches
`md:!p-4`; `bg-primary` matches `bg-primary/50`.
Entries containing `:` match the full class. `[margin:*]` matches
`[margin:1rem]`, but not `md:[margin:1rem]` or `[margin:1rem]!`.

These are class-name checks, not checks for equivalent CSS effects.
`w-*` does not cover `inline-full` or `[width:100%]`. Allowing `p-*` also
allows `p-[13px]` through `no-restyle`; `no-arbitrary-values` still checks
that value.

Invalid regexes and misspellings of a category or class group such as
`spacig` produce a configuration error on line 1 and pause the rule for
that file. Other unknown names, such as `prose` from a Tailwind plugin
or a custom `btn`, may be real classes, so they produce a warning and
match a class named exactly that. `no-unknown-classes` accepts unknown
entries because they may name external classes.

### Recognition

Every rule except `no-inline-styles` accepts these options as arrays of strings:

| Option             | What it does                                          |
| ------------------ | ----------------------------------------------------- |
| `componentImports` | Recognizes component imports using regex patterns.    |
| `ignoreImports`    | Excludes matching imports from component recognition. |
| `mergeFunctions`   | Adds functions whose arguments contain classes.       |
| `variantFunctions` | Adds functions whose object values contain classes.   |

Import ignores take precedence over recognition. Function lists extend
the built-ins: `cn`, `cx`, `clsx`, `cva`, `tv`, `twMerge`, `twJoin`, and
`classNames` for class arguments; `cva` and `tv` for variant objects.

Set shared defaults through `settings.shadcn`:

```js
settings: {
  shadcn: {
    ui: "@/ds",
    mergeFunctions: ["mergeClasses"],
  },
}
```

`ui` is an import prefix: `@/ds` matches `@/ds` and `@/ds/button`, but
not `@/dsx`. Use an array for multiple prefixes. It always applies
alongside `componentImports`.

Shared recognition settings accept a string or an array. A rule's own
option takes precedence over the matching shared setting. See
[Settings](../README.md#settings) for all settings and a monorepo example.

### Your own words

Set `message` to replace a rule's error text:

```js
"shadcn/no-raw-colors": ["error", {
  message: 'Use a theme color for "{{className}}". See {{file}}.',
}]
```

Every finding provides these placeholders, empty when they do not apply:

| Placeholder       | Value                                                     |
| ----------------- | --------------------------------------------------------- |
| `{{className}}`   | The class, or an SVG attribute such as `fill="#f00"`.     |
| `{{property}}`    | The inline CSS property.                                  |
| `{{component}}`   | The component name.                                       |
| `{{suggestions}}` | Suggested tokens, scale values, or a spelling correction. |
| `{{file}}`        | The relevant theme or component file.                     |

`no-restyle` also accepts a message object with category keys:

```js
"shadcn/no-restyle": ["error", {
  allow: ["layout"],
  message: {
    spacing: "Use a {{component}} size: {{sizes|none defined}}.",
    default: "Use a {{component}} variant: {{variants|none defined}}.",
  },
}]
```

Category keys are `layout`, `color`, `typography`, `spacing`, `shape`,
`effects`, and `motion`. `default` covers the other categories, including
unclassified names. A contract can provide its own message in the same format.

Additional `no-restyle` placeholders:

| Placeholder    | Value                                                            |
| -------------- | ---------------------------------------------------------------- |
| `{{category}}` | The class category, including `layout` or `unclassified`.        |
| `{{variants}}` | Comma-separated variant names, or empty.                         |
| `{{wrapper}}`  | The forwarding component name, or empty.                         |
| `{{sizes}}`    | Size names on spacing findings, except explicit `deny` findings. |
| `{{around}}`   | Where spacing can go instead, on spacing findings.               |
| `{{entries}}`  | The relevant allow or deny entries.                              |

`{{around}}` names the places the contracts accept, for example
`margin here, gap on the parent, or spacing on <CardContent>`.

Other rules provide these placeholders on the findings that use them:

| Placeholder       | Value                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `{{tokens}}`      | Declared color names on `no-raw-colors` and `no-arbitrary-values` color findings, up to 12.                                           |
| `{{suggestion}}`  | The corrected class on `no-raw-colors` and `no-unknown-classes` spelling findings. On SVG attribute findings, the nearest token name. |
| `{{replacement}}` | The equivalent scale or token class on `no-arbitrary-values` findings, such as `p-3.25`.                                              |
| `{{attribute}}`   | The SVG attribute name on `no-raw-colors` attribute findings, such as `fill`.                                                         |
| `{{value}}`       | That attribute's value, such as `#f00`.                                                                                               |

`{{suggestions}}` already contains the `{{suggestion}}` or
`{{replacement}}` value when a finding provides one.

Use `{{variants|none defined}}` to supply a fallback for an empty value.
Unknown or unavailable placeholders stay literal, including their fallback.
Likely placeholder typos produce a warning. Messages are limited to
500 characters.

The linter first checks the contract's category message, then its `default`.
If neither applies, it checks the rule's message, then the built-in guidance.
This lets a contract customize one category and keep the rule's guidance
for everything else.

To append a note to every rule's findings, including custom messages:

```js
settings: {
  shadcn: {
    note: "See docs/design-rules.md for design rules and approved exceptions.",
  },
}
```

## Categories

Under `no-restyle` with `allow: ["layout"]`:

| Category     | Examples                                           | Result    |
| ------------ | -------------------------------------------------- | --------- |
| layout       | `mt-4`, `w-full`, `hidden`, `absolute`, `flex-1`   | Allowed.  |
| color        | `bg-primary`, `text-red-500`, `border-border`      | Reported. |
| typography   | `text-sm`, `font-bold`, `leading-none`, `truncate` | Reported. |
| spacing      | `p-4`, `gap-2`, `space-x-4`                        | Reported. |
| shape        | `rounded-lg`, `border`, `ring-2`, `outline-none`   | Reported. |
| effects      | `shadow-sm`, `opacity-50`, `blur`, `backdrop-blur` | Reported. |
| motion       | `animate-pulse`, `transition`, `duration-200`      | Reported. |
| unclassified | `flex-cols`, a custom class unknown to the grammar | Reported. |

Margin, transforms, and text alignment are layout. Padding and gap are
spacing. Tailwind markers such as `group`, `group/name`, and `peer` also
pass with layout allowed.

`unclassified` is a reported category, not an allowance you can configure.
Allow a custom class by name, for example `allow: ["layout", "tap-target"]`.
A class your own CSS declares with `@utility`, or as a plain selector, is
still `unclassified`: the rule cannot read what it changes. It is reported
in its own words, which do not call it a misspelling.
You can open a category for a component with a contract:

```js
{ pattern: "^CardContent$", allow: ["layout", "spacing"] }
```

The complete mapping is in
[`GROUP_CATEGORY`](../packages/lint/src/grammar/categories.ts).
It is an internal constant, not a package export.
