# Vue

`@shadcn/lint` reads `.vue` templates under ESLint with
`vue-eslint-parser`.

The examples enable `no-restyle` and allow layout classes such as `mt-4`
and `w-full`. Requires Node.js 20.19 or later.

## ESLint

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
      "shadcn/no-restyle": ["error", { allow: ["layout"] }],
    },
  },
])
```

```bash
npx eslint .
```

Add a second block for `**/*.ts` with `tsParser` alone so `cva` and `cn`
calls outside components are checked too.

## Oxlint

Oxlint lints the `<script>` blocks of `.vue` files. It does not parse the
template, so no plugin can see `class="..."` there. This is an Oxlint
limit: its [JS plugin API](https://oxc.rs/docs/guide/usage/linter/js-plugins)
lists custom file formats such as Vue and Svelte under "not supported
yet". Template support is tracked in
[oxc#15761](https://github.com/oxc-project/oxc/issues/15761), designed in
the [language plugins RFC](https://github.com/oxc-project/oxc/discussions/21936),
and prototyped in [oxc#19133](https://github.com/oxc-project/oxc/pull/19133).

Under Oxlint, `cva`, `tv`, and `cn` calls in the script are reported. The
template is not, and the run says so once:

```text
[@shadcn/lint] Templates in .svelte and .vue files are read under ESLint
with svelte-eslint-parser or vue-eslint-parser. This run has no template
parser, so only their script blocks are linted. See ...
```

To lint the templates, run ESLint for `.vue` files. Oxlint can keep the
rest. To stop the warning, leave them out of the Oxlint run:

```json
{
  "ignorePatterns": ["**/*.vue"]
}
```

## Without components.json

Without `components.json`, the theme is the stylesheet that imports
Tailwind, and components are whatever `componentImports` names:

```js
settings: {
  shadcn: {
    componentImports: ["^@/components/"],
  },
}
```

See [Settings](../README.md#settings) for the full list.

## Example

```vue
<script setup lang="ts">
import { Button } from "@/components/ui/button"
import { Card, CardTitle } from "@/components/ui/card"

defineProps<{ active?: boolean }>()
</script>

<template>
  <Card class="mt-4">
    <CardTitle class="text-2xl">Billing</CardTitle>
    <Button :class="{ 'bg-primary': active }">Save</Button>
  </Card>
</template>
```

```text
"text-2xl" is not allowed on <CardTitle>: <CardTitle> owns its typography.
Add a variant in src/components/ui/card/CardTitle.vue only if the design
explicitly calls for this treatment.

"bg-primary" is not allowed on <Button>: <Button> owns its color. Use a
variant: default, outline, link. Add a new variant in
src/components/ui/button/Button.vue only if the design explicitly calls
for a treatment none of these provides.
```

## Component names

A component is named after its file. `CardTitle.vue` is `CardTitle`,
written as `<CardTitle>` or `<card-title>`. A contract written for React
holds unchanged:

```js
contracts: [{ pattern: "^CardTitle$", allow: ["layout", "typography"] }]
```

## What is read

| Template                            | Read as                                |
| ----------------------------------- | -------------------------------------- |
| `class="p-4"`                       | a static class string                  |
| `:class="active ? 'a' : 'b'"`       | an expression, both branches           |
| `:class="cn(base, props.class)"`    | a helper call, `base` resolved one hop |
| `:class="['a', active && 'b']"`     | an array                               |
| `:class="{ 'bg-primary': active }"` | an object, keys as classes             |
| `v-bind="{ class: 'p-4' }"`         | a spread                               |
| `style="color: red"`                | a style, property by property          |
| `:style="{ color: tone }"`          | a style object                         |

A variable in the template resolves to `<script setup>`, one hop deep.

**Variants** come from `cva` and `tv` in the component's own script, or
from the barrel beside it, such as `buttonVariants` in `button/index.ts`
next to `Button.vue`.

**Received props** are accepted. `props.class` from `defineProps()` is
the component's own input, not a class someone wrote.

**Wrappers** work across files. A component that forwards `props.class`
or `v-bind="$attrs"` to a design-system component gets that component's
contract. A component with one root element and no `class` prop hands its
`class` to that root, and that counts as forwarding.

## What it cannot see

- **`<style>` blocks.** Scoped styles are plain CSS. Use a CSS linter.
- **`<component :is>`.** No known component, so `no-restyle` does not
  apply. Token rules still check its classes.
- **`$attrs.class`** read directly in the template.
- **Pug templates.**

Everything in [What it cannot see](./how-it-works.md#what-it-cannot-see)
applies too.
