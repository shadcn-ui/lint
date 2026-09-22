# Svelte

`@shadcn/lint` reads `.svelte` templates under ESLint with
`svelte-eslint-parser`.

The examples enable `no-restyle` and allow layout classes such as `mt-4`
and `w-full`. Requires Node.js 20.19 or later.

## ESLint

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
      "shadcn/no-restyle": ["error", { allow: ["layout"] }],
    },
  },
])
```

```bash
npx eslint .
```

Add a second block for `**/*.ts` with `tsParser` alone so `tv` and `cn`
calls outside components are checked too.

The `$lib` alias resolves through the `tsconfig.json` SvelteKit
generates. Before the first `svelte-kit sync`, it falls back to `src/lib`.

## Oxlint

Oxlint lints the `<script>` blocks of `.svelte` files. It does not parse
the markup, so no plugin can see `class="..."` there. This is an Oxlint
limit: its [JS plugin API](https://oxc.rs/docs/guide/usage/linter/js-plugins)
lists custom file formats such as Vue and Svelte under "not supported
yet". The work to change that is tracked in
[oxc#15761](https://github.com/oxc-project/oxc/issues/15761) and the
[language plugins RFC](https://github.com/oxc-project/oxc/discussions/21936).

Under Oxlint, `tv`, `cva`, and `cn` calls in the script are reported. The
markup is not, and the run says so once:

```text
[@shadcn/lint] Templates in .svelte and .vue files are read under ESLint
with svelte-eslint-parser or vue-eslint-parser. This run has no template
parser, so only their script blocks are linted. See ...
```

To lint the markup, run ESLint for `.svelte` files. Oxlint can keep the
rest. To stop the warning, leave them out of the Oxlint run:

```json
{
  "ignorePatterns": ["**/*.svelte"]
}
```

## Without components.json

Without `components.json`, the theme is the stylesheet that imports
Tailwind, and components are whatever `componentImports` names:

```js
settings: {
  shadcn: {
    componentImports: ["^\\$lib/components/"],
  },
}
```

See [Settings](../README.md#settings) for the full list.

## Example

```svelte
<script lang="ts">
  import * as Card from "$lib/components/ui/card"
  import { Button } from "$lib/components/ui/button"
</script>

<Card.Root class="mt-4">
  <Card.Title class="text-2xl">Billing</Card.Title>
  <Button class="p-4">Save</Button>
</Card.Root>
```

```text
"text-2xl" is not allowed on <CardTitle>: <CardTitle> owns its typography.
Add a variant in src/lib/components/ui/card/card-title.svelte only if the
design explicitly calls for this treatment.

"p-4" is not allowed on <Button>: <Button> owns its spacing. Use a size
(default, sm, lg), or margin here or gap on a plain wrapper around it for
space around it. Add a size in src/lib/components/ui/button/button.svelte
only if the design explicitly calls for one.
```

## Component names

A component is named after its file. `card-title.svelte` is `CardTitle`,
whatever the import calls it: `<Card.Title>` or `<Title>`. A contract
written for React holds unchanged:

```js
contracts: [{ pattern: "^CardTitle$", allow: ["layout", "typography"] }]
```

## What is read

| Markup                             | Read as                                |
| ---------------------------------- | -------------------------------------- |
| `class="p-4"`                      | a static class string                  |
| `class="p-4 {active ? 'a' : 'b'}"` | text and expression, both branches     |
| `class={cn(base, className)}`      | a helper call, `base` resolved one hop |
| `class={["a", active && "b"]}`     | an array                               |
| `class={{ "bg-primary": active }}` | an object, keys as classes             |
| `class:bg-primary={active}`        | a class directive                      |
| `{...{ class: "p-4" }}`            | a spread                               |
| `style="color: red"`               | a style, property by property          |
| `style:color={tone}`               | a style directive                      |

A variable in the markup resolves to the script, one hop deep.

**Variants** come from `tv` and `cva` in the component's scripts,
including `<script module>`.

**Received props** are accepted. `class` from `$props()` is the
component's own input, not a class someone wrote.

**Wrappers** work across files. A component that forwards its `class` or
`{...rest}` to a design-system component gets that component's contract:

```svelte
<script lang="ts">
  import { Button } from "$lib/components/ui/button"
  import { cn } from "$lib/utils"

  let { class: className, ...rest } = $props()
</script>

<Button class={cn("gap-2", className)} {...rest} />
```

## What it cannot see

- **`<style>` blocks.** Scoped styles are plain CSS. Use a CSS linter.
- **`<svelte:element>`.** No known component, so `no-restyle` does not
  apply. Token rules still check its classes.

Everything in [What it cannot see](./how-it-works.md#what-it-cannot-see)
applies too.
