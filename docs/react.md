# React

`@shadcn/lint` reads JSX under Oxlint and ESLint.

The examples enable `no-restyle` and allow layout classes such as `mt-4`
and `w-full`. Requires Node.js 20.19 or later.

## ESLint

Requires ESLint 9.30 or later.

```bash
npm install -D @shadcn/lint eslint @typescript-eslint/parser
```

Create `eslint.config.mjs`. If your framework already configures ESLint,
keep its parser setup and add the plugin and rule.

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
      "shadcn/no-restyle": ["error", { allow: ["layout"] }],
    },
  },
])
```

```bash
npx eslint .
```

## Oxlint

Requires Oxlint 1.80 or later. Its [JS plugin API](https://oxc.rs/docs/guide/usage/linter/js-plugins) is currently in alpha.

```bash
npm install -D @shadcn/lint oxlint
```

Create `.oxlintrc.json`:

```json
{
  "jsPlugins": ["@shadcn/lint"],
  "rules": {
    "shadcn/no-restyle": ["error", { "allow": ["layout"] }]
  }
}
```

```bash
npx oxlint
```

## Without components.json

Without `components.json`, the theme is the stylesheet that imports
Tailwind, and components are whatever `componentImports` names:

```json
{
  "settings": {
    "shadcn": {
      "componentImports": ["^@/components/"]
    }
  }
}
```

See [Settings](../README.md#settings) for the full list.

## Example

```tsx
import { Button } from "@/components/ui/button"
import { CardTitle } from "@/components/ui/card"

export function Billing() {
  return (
    <>
      <CardTitle className="text-2xl">Billing</CardTitle>
      <Button className="p-4">Save</Button>
    </>
  )
}
```

```text
"text-2xl" is not allowed on <CardTitle>: <CardTitle> owns its typography.
Add a variant in components/ui/card.tsx only if the design explicitly
calls for this treatment.

"p-4" is not allowed on <Button>: <Button> owns its spacing. Use a size
(default, sm, lg, icon), or margin here or gap on a plain wrapper around
it for space around it. Add a size in components/ui/button.tsx only if
the design explicitly calls for one.
```

## What is read

- `className` and similar props, including `wrapperClassName` and
  `classNames={{ day: "..." }}`.
- Calls to `cn`, `cx`, `clsx`, `cva`, `tv`, `twMerge`, `twJoin`, and
  `classNames`, in and outside JSX.
- Same-file variables and object values, one hop deep.
- Readable objects spread onto elements.
- `style={{ ... }}`, `<style>` elements, and SVG color attributes.
- Base UI's `render` prop: the classes land on what it renders.
- Variants from `cva`, `tv`, and props typed as a union of string
  literals.
- Wrappers that forward `className` to a design-system component.

See [How it works](./how-it-works.md) for the details and
[What it cannot see](./how-it-works.md#what-it-cannot-see) for the limits.
