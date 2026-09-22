# @shadcn/lint

**Write design system rules that agents can verify.**

<img src="./docs/assets/cover.png" width="2000" height="832" alt="A lint diagnostic explains why padding is not allowed on Button and suggests using an existing size." />

`@shadcn/lint` is an [agent-first linter](#built-for-agents) for Tailwind design systems.

You define what’s allowed. When an agent breaks a rule, the error explains what’s wrong and suggests a fix based on your components, variants, and theme.

**Works with your existing design system. No rewrite required.**

`@shadcn/lint` works with Tailwind v4 projects (**shadcn/ui not required**). Available for both **ESLint and Oxlint**. Works with **React, Svelte, and Vue**.

## Table of contents

- [Quickstart](#quickstart)
- [TypeScript vs @shadcn/lint](#typescript-vs-shadcnlint)
- [Built for agents](#built-for-agents)
- [Get started](#get-started)
- [Rules](#rules)
- [Frameworks](#frameworks)
- [Configuration](#settings)

## Quickstart

Give your coding agent this prompt:

```text
Read https://github.com/shadcn-ui/lint/blob/main/SETUP.md
and set up @shadcn/lint in this project.
```

Once installed, [choose your rules](#rules) and configure what’s allowed
in your design system.

Prefer to configure it yourself? See [Get started](#get-started).

## TypeScript vs @shadcn/lint

Take a Button that allows margin and width, but controls its own padding.
You can enforce that with types by limiting its `style` prop to
`Pick<React.CSSProperties, "margin" | "width">`.

```tsx
<Button style={{ padding: 16 }}>Submit</Button>
```

```text
TS2353: Object literal may only specify known properties, and 'padding' does not exist in type 'Pick<CSSProperties, "margin" | "width">'.
```

The rule works. But this error only tells the agent that padding is not
allowed. It doesn’t tell it how to size the Button.

With `@shadcn/lint`, the same rule comes with **guidance from your design
system**:

```tsx
<Button className="p-4">Submit</Button>
```

```text
"p-4" is not allowed on <Button>: <Button> owns its spacing.
Use a size (sm, lg), or margin here or gap on the parent for space around it.
Add a size in components/ui/button.tsx only if the design explicitly calls for one.
```

### You decide what can change

Expressing these policies in TypeScript can take complex types. With
`@shadcn/lint`, you configure them without changing your component API.

Here are some examples.

**Allow spacing with margin. Allow full width. Keep size and shape in the Button.**

```js
"shadcn/no-restyle": ["error", {
  allow: ["layout"],
  contracts: [
    { pattern: "^Button$", allow: ["w-full", "mt-*", "mb-*"] },
  ],
}]
```

```tsx
// Allowed: use a size and let the page control placement and full width.
<Button size="lg" className="mt-4 md:w-full" />

// Error: you are not allowed to change padding and shape.
<Button className="p-4 hover:rounded-full" />

// Error: you are not allowed to set a custom height or fixed width.
<Button className="md:h-12 w-48" />
```

**Give each part of a component its own rules.**

Let Card titles change typography, but keep their font family and weight.
Let Card content change spacing, but keep its typography.

```js
"shadcn/no-restyle": ["error", {
  allow: ["layout"],
  contracts: [
    {
      pattern: "^CardTitle$",
      allow: ["layout", "typography"],
      deny: ["font-*"],
    },
    { pattern: "^CardContent$", allow: ["layout", "spacing"] },
  ],
}]
```

```tsx
// Allowed: titles can change text size; content can change padding.
<CardTitle className="text-lg" />
<CardContent className="p-6" />

// Error: you are not allowed to change the title’s font weight.
<CardTitle className="md:font-bold" />

// Error: you are not allowed to change the content’s typography.
<CardContent className="text-lg" />
```

**Allow spacing changes. Require theme values.**

Opening up spacing doesn’t have to mean allowing arbitrary values.
Combine rules to let Card content change padding while keeping it on your
theme’s spacing scale.

```js
"shadcn/no-restyle": ["error", {
  allow: ["layout"],
  contracts: [
    { pattern: "^CardContent$", allow: ["layout", "spacing"] },
  ],
}],
"shadcn/no-arbitrary-values": "error",
```

```tsx
// Allowed: padding uses the theme’s spacing scale.
<CardContent className="p-6 md:p-8" />

// Error: you are not allowed to use an arbitrary padding value.
<CardContent className="md:p-[13px]" />
```

Both approaches enforce the rule. With `@shadcn/lint`, the agent also sees
how to fix the code using what’s already in your design system.

## Built for agents

We built `@shadcn/lint` for agents that write UI. The errors tell them
what broke, what to use instead, and where to find it. Suggestions come from your components, variants, and theme.

You can add
[custom messages](#custom-messages) and [contracts](#contracts) so agents
get your design system’s instructions with the error.

### It works

We tested these rules with coding agents across more than 150 task runs. Almost every task reached zero violations in one correction round.

Here are the errors before and after lint feedback in one run per model:

| Model         | Completed tasks | Errors before | Errors after |
| ------------- | --------------: | ------------: | -----------: |
| Sonnet 5      |             8/8 |            69 |            0 |
| Haiku 4.5     |             8/8 |            66 |            0 |
| Opus 5        |             8/8 |            42 |            0 |
| GPT 5.6 Terra |             8/8 |           117 |            0 |
| GPT 5.6 Sol   |             6/8 |            98 |            0 |

### It is cheaper

In the Claude control runs, fixing violations with lint feedback cost
**10% to 48% less** than with rules alone.

See the [evals](https://github.com/shadcn-ui/lint/blob/main/docs/evals.md) for results and methodology.

## Why a linter?

A linter is [programmable](#programmable). You can write rules for your design system
without changing your components.

You define what’s allowed and what to use instead. Agents run your lint
command to check their work.

- **Ship the same components with different rules.** Each project can
  define its own contracts without changing the component code.
- **Use components you don’t own.** Apply rules to components from
  third-party packages. No forks. No wrappers.
- **Share rules across projects.** Keep a shared configuration for your
  design system and let projects add their own rules.

Your components stay flexible. You decide how they should be used.

## Programmable

### Custom messages

You can write custom error messages that tell agents what to do.

```js
"shadcn/no-restyle": ["error", {
  allow: ["layout"],
  message: {
    spacing: "Use the size prop instead of padding.",
  },
}]
```

When an agent writes:

```tsx
<Button className="p-4">Save changes</Button>
```

It sees:

```text
Use the size prop instead of padding.
```

### Placeholders

Use your component’s sizes, variants, and file paths in error messages.
For spacing errors, `{{sizes}}` lists the available sizes:

```js
"shadcn/no-restyle": ["error", {
  allow: ["layout"],
  message: {
    spacing: "Use a {{component}} size: {{sizes}}.",
  },
}]
```

For a Button with `sm` and `lg` sizes, the error becomes:

```text
Use a Button size: sm, lg.
```

You can also tell agents where to find theme colors. For example, in
`no-raw-colors`:

```js
message: "Use a theme color from {{file}}."
```

If your theme is in `src/index.css`, the error becomes:

```text
Use a theme color from src/index.css.
```

See all [message placeholders](https://github.com/shadcn-ui/lint/blob/main/docs/rules.md#your-own-words).

### Contracts

Give each component its own rules. For example, let pages change a card
title's typography:

```js
"shadcn/no-restyle": ["error", {
  allow: ["layout"],
  contracts: [
    { pattern: "^CardTitle$", allow: ["layout", "typography"] },
  ],
}]
```

```tsx
// Allowed by the contract.
<CardTitle className="text-sm">Account settings</CardTitle>

// Reported: the contract does not allow color overrides.
<CardTitle className="text-pink-500">Account settings</CardTitle>
```

See [contracts and custom messages](https://github.com/shadcn-ui/lint/blob/main/docs/design-systems.md).

## Get started

Requires Node.js 20.19 or later and a version supported by your linter.

### React

#### ESLint

Requires ESLint 9.30 or later.

```bash
npm install -D @shadcn/lint eslint @typescript-eslint/parser
```

Create `eslint.config.mjs`. If your framework already configures ESLint,
keep its parser setup and add the plugin, rule, and component override.

```js
import { plugin as shadcn } from "@shadcn/lint"
import tsParser from "@typescript-eslint/parser"
import { defineConfig } from "eslint/config"

export default defineConfig([
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { shadcn },
    rules: {
      "shadcn/no-arbitrary-values": "error",
    },
  },
])
```

```bash
npx eslint .
```

#### Oxlint

Requires Oxlint 1.80 or later.

```bash
npm install -D @shadcn/lint oxlint
```

Create `.oxlintrc.json`:

```json
{
  "jsPlugins": ["@shadcn/lint"],
  "rules": {
    "shadcn/no-arbitrary-values": "error"
  }
}
```

```bash
npx oxlint
```

### Vue

#### ESLint

Requires ESLint 9.30 or later.

```bash
npm install -D @shadcn/lint eslint @typescript-eslint/parser vue-eslint-parser
```

Create `eslint.config.mjs`. If you already use `eslint-plugin-vue`, keep
its parser setup and add the plugin and rule to that block.

```js
import { plugin as shadcn } from "@shadcn/lint"
import tsParser from "@typescript-eslint/parser"
import { defineConfig } from "eslint/config"
import vueParser from "vue-eslint-parser"

export default defineConfig([
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tsParser },
    },
    plugins: { shadcn },
    rules: {
      "shadcn/no-arbitrary-values": "error",
    },
  },
])
```

```bash
npx eslint .
```

#### Oxlint

Requires Oxlint 1.80 or later. Oxlint reads the `<script>` blocks of
`.vue` files, not the template. See [the Oxlint limitation](https://github.com/shadcn-ui/lint/blob/main/docs/vue.md#oxlint).

```bash
npm install -D @shadcn/lint oxlint
```

Create `.oxlintrc.json`:

```json
{
  "jsPlugins": ["@shadcn/lint"],
  "rules": {
    "shadcn/no-arbitrary-values": "error"
  }
}
```

```bash
npx oxlint
```

### Svelte

#### ESLint

Requires ESLint 9.30 or later.

```bash
npm install -D @shadcn/lint eslint @typescript-eslint/parser svelte-eslint-parser
```

Create `eslint.config.mjs`. If you already use `eslint-plugin-svelte`,
keep its parser setup and add the plugin and rule to that block.

```js
import { plugin as shadcn } from "@shadcn/lint"
import tsParser from "@typescript-eslint/parser"
import { defineConfig } from "eslint/config"
import svelteParser from "svelte-eslint-parser"

export default defineConfig([
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parser: svelteParser,
      parserOptions: { parser: tsParser },
    },
    plugins: { shadcn },
    rules: {
      "shadcn/no-arbitrary-values": "error",
    },
  },
])
```

```bash
npx eslint .
```

#### Oxlint

Requires Oxlint 1.80 or later. Oxlint reads the `<script>` blocks of
`.svelte` files, not the markup. See [the Oxlint limitation](https://github.com/shadcn-ui/lint/blob/main/docs/svelte.md#oxlint).

```bash
npm install -D @shadcn/lint oxlint
```

Create `.oxlintrc.json`:

```json
{
  "jsPlugins": ["@shadcn/lint"],
  "rules": {
    "shadcn/no-arbitrary-values": "error"
  }
}
```

```bash
npx oxlint
```

### After setup

Add your chosen command (`eslint .` or `oxlint`) as the `lint` script in
`package.json`. Then put this in `AGENTS.md`:

```md
After making changes, run `npm run lint` and fix all errors.
```

Each framework has its own page with the full setup and what is read:
[React](https://github.com/shadcn-ui/lint/blob/main/docs/react.md),
[Vue](https://github.com/shadcn-ui/lint/blob/main/docs/vue.md),
[Svelte](https://github.com/shadcn-ui/lint/blob/main/docs/svelte.md).

## Rules

We developed these rules by studying production design systems and testing
them with coding agents. They’re built for Tailwind, with errors that help
agents follow your design system.

| Rule                                                                                                         | What it catches                                                        |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| [`no-restyle`](https://github.com/shadcn-ui/lint/blob/main/docs/rules/no-restyle.md)                         | Restyling a component with `className`.                                |
| [`no-raw-colors`](https://github.com/shadcn-ui/lint/blob/main/docs/rules/no-raw-colors.md)                   | Raw colors such as `bg-pink-500`.                                      |
| [`no-arbitrary-values`](https://github.com/shadcn-ui/lint/blob/main/docs/rules/no-arbitrary-values.md)       | Arbitrary values such as `p-[13px]`.                                   |
| [`no-inline-styles`](https://github.com/shadcn-ui/lint/blob/main/docs/rules/no-inline-styles.md)             | Inline styles and `<style>` elements.                                  |
| [`no-unknown-classes`](https://github.com/shadcn-ui/lint/blob/main/docs/rules/no-unknown-classes.md)         | Classes Tailwind cannot generate, such as `rounded-huge`.              |
| [`require-static-classes`](https://github.com/shadcn-ui/lint/blob/main/docs/rules/require-static-classes.md) | Component classes the linter cannot read, such as `` `bg-${color}` ``. |

See [rule options](https://github.com/shadcn-ui/lint/blob/main/docs/rules.md) and [how to add more rules](https://github.com/shadcn-ui/lint/blob/main/docs/adoption.md#add-more-rules).

## Frameworks

The same rules, options, contracts, and messages run on React, Vue, and Svelte. See also [Vue](#vue) and [Svelte](#svelte) docs.

| Feature                               | React (JSX)                 | Vue                                                       | Svelte                                  |
| ------------------------------------- | --------------------------- | --------------------------------------------------------- | --------------------------------------- |
| Static class string                   | `className="p-4"`           | `class="p-4"`                                             | `class="p-4"`                           |
| Expression class                      | `className={...}`           | `:class="..."`                                            | `class={...}`                           |
| Text and expression mixed             | template literal            | `class` + `:class` on one element                         | `class="p-4 {expr}"`                    |
| Arrays and objects (`clsx` shape)     | yes                         | `:class="[...]"`, `:class="{...}"`                        | `class={[...]}`, `class={{...}}`        |
| Helper calls (`cn`, `cva`, `tv`, ...) | yes                         | yes, in script and template                               | yes, in script and template             |
| One-hop variable resolution           | yes                         | yes, template to `<script setup>`                         | yes                                     |
| Spread with a class                   | `{...{ className }}`        | `v-bind="{ class }"`                                      | `{...{ class }}`                        |
| Class directive                       | n/a                         | n/a                                                       | `class:name={cond}`                     |
| Style as CSS text                     | no, JSX has no string style | `style="color: red"`                                      | `style="color: red"`                    |
| Style object                          | `style={{ ... }}`           | `:style="{ ... }"`                                        | n/a                                     |
| Style directive                       | n/a                         | n/a                                                       | `style:prop={value}`                    |
| `<style>` element or block            | reported                    | not read                                                  | not read                                |
| SVG color attributes                  | `fill`, `stroke`, ...       | same                                                      | same                                    |
| Component identity                    | export name                 | file name, `<CardTitle>` or `<card-title>`                | file name, `<Card.Title>` or `<Title>`  |
| Contracts                             | by component name           | same names as React                                       | same names as React                     |
| Variants from `cva` / `tv`            | component file              | component file, or the barrel beside it                   | component file, incl. `<script module>` |
| Variants from typed props             | yes                         | no                                                        | no                                      |
| Received class prop accepted          | `className` param           | `props.class` from `defineProps()`                        | `class` from `$props()`                 |
| Wrappers across files                 | `className` forwarding      | `props.class`, `v-bind="$attrs"`, single-root fallthrough | `className` and `{...rest}` forwarding  |
| Base UI `render` prop                 | yes                         | n/a                                                       | n/a                                     |
| Dynamic element                       | `<Comp>` from a variable    | `<component :is>`                                         | `<svelte:element>`                      |
| Suggestions rewrite source            | yes                         | yes                                                       | yes                                     |
| `require-static-classes`              | yes                         | yes                                                       | yes                                     |
| `no-unknown-classes`                  | yes                         | yes                                                       | yes                                     |
| Project without `components.json`     | yes, `componentImports`     | yes, `componentImports`                                   | yes, `componentImports`                 |
| ESLint                                | yes                         | yes, `vue-eslint-parser`                                  | yes, `svelte-eslint-parser`             |
| Oxlint                                | yes                         | script blocks only, warns once                            | script blocks only, warns once          |

Dynamic elements get the token rules but not `no-restyle`. `<style>` blocks in `.vue` and `.svelte` files are plain CSS; use a CSS linter for them.

## Settings

Use `settings.shadcn` to configure component imports, class functions,
and guidance shared across rules.

**You don’t need shadcn/ui to use `@shadcn/lint`. It works with your own
Tailwind components and theme.**

shadcn/ui projects get automatic component and theme discovery via
`components.json`.

For a custom setup, add `settings` at the root of `.oxlintrc.json`.
Include only the settings you need:

```json
{
  "settings": {
    "shadcn": {
      "ui": "@/ds",
      "componentImports": ["^@acme/ui(/|$)"],
      "ignoreImports": ["^@acme/ui/internal(/|$)"],
      "mergeFunctions": ["customMerge"],
      "variantFunctions": ["variants"],
      "note": "See DESIGN.md for design rules and approved exceptions."
    }
  }
}
```

For ESLint, add the same `settings` object to the config object containing
your rules.

| Setting            | What it does                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `ui`               | Recognizes component imports by prefix. `@/ds` matches `@/ds` and `@/ds/button`, but not `@/dsx`.         |
| `componentImports` | Recognizes component imports using regex patterns. Use it for additional directories or packages.         |
| `ignoreImports`    | Skips component recognition for imports matching these regex patterns. Takes precedence over recognition. |
| `mergeFunctions`   | Adds functions whose arguments contain classes, such as `customMerge("mt-4", "w-full")`.                  |
| `variantFunctions` | Adds functions whose object values contain classes.                                                       |
| `note`             | Appends your text to every rule's error or warning.                                                       |

All settings except `note` accept a string or an array of strings.
`note` accepts a string.

The built-in class functions are `cn`, `cx`, `clsx`, `cva`, `tv`,
`twMerge`, `twJoin`, and `classNames`. The built-in variant functions
are `cva` and `tv`. Your function lists add to these defaults.

A recognition option set on a rule overrides its shared setting.
`ui` prefixes always apply alongside `componentImports`. Recognition
settings do not apply to `no-inline-styles`; `note` applies to every rule.

When you change the component directory, update the setup's directory
override too, for example `src/ds/**`.
See [rule options](https://github.com/shadcn-ui/lint/blob/main/docs/rules.md#recognition) for more examples.

### Monorepos

Use your workspace package's import prefix for shared components.
For a UI package in `packages/ui`, add this to the root `.oxlintrc.json`:

```json
{
  "jsPlugins": ["@shadcn/lint"],
  "settings": {
    "shadcn": {
      "ui": "@workspace/ui/components"
    }
  },
  "rules": {
    "shadcn/no-restyle": ["error", { "allow": ["layout"] }]
  },
  "overrides": [
    {
      "files": ["packages/ui/src/components/**"],
      "rules": { "shadcn/no-restyle": "off" }
    }
  ]
}
```

Apps can use the shared components:

```tsx
import { Button } from "@workspace/ui/components/button"

export function SaveButton() {
  return <Button className="w-full">Save changes</Button>
}
```

For ESLint, use the same `settings` and `rules` in the setup above, and
change the component-directory override to `packages/ui/src/components/**`.
These paths assume your lint config is at the workspace root.

The linter resolves components through your apps' TypeScript paths and
package exports. If each app's `components.json` already points to the
shared UI package, you can omit `settings.shadcn.ui`. Each app keeps its
own theme configuration.

## Documentation

See the [documentation](https://github.com/shadcn-ui/lint/blob/main/docs/README.md) for rule examples, configuration,
troubleshooting, and evals.

## Contributing

Please read the [contributing guide](https://github.com/shadcn-ui/lint/blob/main/CONTRIBUTING.md).

## License

Licensed under the [MIT license](https://github.com/shadcn-ui/lint/blob/main/LICENSE.md).
