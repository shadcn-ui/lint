# Configuring your design system

Use variants for appearances you want to reuse. Use contracts to define
which styling changes a page can make.

Start with the [setup](../README.md#get-started). For an existing
codebase, follow [Adding linting to an existing project](./adoption.md).

## Variants

Use a variant for a named appearance that callers should reuse:

```tsx
<Button variant="destructive">Delete</Button>
```

If an existing variant fits, use it. When the design needs a new treatment,
add it to the component. For example, a brand variant can use these tokens:

```css
@theme {
  --color-brand: #ec4899;
  --color-brand-foreground: #fff;
}
```

Add this entry to the Button's existing `cva` `variant` definition:

```js
brand: "bg-brand text-brand-foreground hover:bg-brand/90"
```

Then use it by name:

```tsx
<Button variant="brand">Subscribe</Button>
```

The linter reads the new variant and can suggest it in later findings.

## Contracts

Use a contract when callers should control part of a component's styling.
For example, titles might accept typography while avatars accept only size.

Set `no-restyle` in your config's `rules` object:

```js
"shadcn/no-restyle": ["error", {
  allow: ["layout"],
  contracts: [
    { pattern: "^CardTitle$", allow: ["layout", "typography"] },
    { pattern: "(Content|Footer)$", allow: ["layout", "spacing"], deny: ["p-0", "px-0"] },
    { pattern: "^Avatar$", allow: ["size-*"] },
  ],
}]
```

- `pattern` matches component names with a regex.
- `allow` is the complete list of what the component accepts. Include
  `layout` if callers may place it.
- `deny` rejects classes `allow` would otherwise cover.

The top-level settings apply to components without a matching contract.
A contract replaces the keys it writes and inherits the rest from those
settings. If several contracts match, only the last one applies.
Entries can be categories (`spacing`), class groups (`bg-color`), or
patterns (`size-*`).

With these contracts:

```tsx
// Passes.
<CardTitle className="text-sm">Account settings</CardTitle>
<Avatar className="size-8" />

// Reports a contract violation.
<Avatar className="w-full" />
<CardContent className="px-0" />
```

Add spacing allowances for containers whose padding and gap belong to
the page. For example:

```js
{ pattern: "^Card$|(Content|Header|Footer|Group|Panel)$", allow: ["layout", "spacing"] }
```

Contracts do not bypass other rules. Allowing padding on a component
still leaves `p-[13px]` subject to `no-arbitrary-values`.
See [Contracts](./rules.md#contracts) for matching details and limits.

## Custom messages

Write guidance that explains your team's decisions. A contract can use
one message for all findings, or a different message for each category:

```js
{
  pattern: "^Button$",
  allow: ["layout"],
  deny: ["w-*"],
  message: {
    layout: "Set width on the parent container.",
    spacing: "Use a Button size: {{sizes|none defined}}.",
    default: "Use a Button variant: {{variants|none defined}}.",
  },
}
```

For `<Button className="w-full">`, the message is:

```txt
Set width on the parent container.
```

Placeholders use the component's actual names and values. The other five
rules also accept a `message` option. See
[Your own words](./rules.md#your-own-words) for placeholders and examples.

To append a note to every rule's findings, set `settings.shadcn.note`,
for example `"See docs/design-rules.md for approved exceptions."`. See
[Your own words](./rules.md#your-own-words) for the full settings block.

## Share a policy

ESLint and Oxlint can read the same rule settings. Put `rules` and
`overrides` in `design-system.lint.json`:

```json
{
  "rules": { "shadcn/no-restyle": ["error", { "allow": ["layout"] }] },
  "overrides": [
    {
      "files": ["components/ui/**"],
      "rules": { "shadcn/no-restyle": "off" }
    }
  ]
}
```

In `.oxlintrc.json`:

```json
{
  "jsPlugins": ["@shadcn/lint"],
  "extends": ["./design-system.lint.json"]
}
```

In the [ESLint setup](../README.md#react), import the policy and use
`policy.rules` for the main config object's rules. Replace the component
override with `...policy.overrides`:

```js
import policy from "./design-system.lint.json" with { type: "json" }
```

The plugin requires Node.js 20.19 or later, which supports this import
syntax.

Keep Oxlint's `settings` in the root `.oxlintrc.json`; they are not inherited
through `extends`.

## Review changes

Run lint in CI and make it part of [agent instructions](./adoption.md#agents).
Review new tokens, variants, contracts, and suppression comments as design
decisions. Lint checks the configured rules; it cannot decide whether a new
appearance belongs in the system.
