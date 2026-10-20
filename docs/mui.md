# MUI

The opt-in `@shadcn/lint/mui` entry point checks authored MUI styling in JSX and TSX.
It exports `mui/no-restyle` and `mui/no-raw-colors` independently of the Tailwind plugin.
This entry point is proposed source code; verify that your installed package exports it before adopting it.

## Setup

```js
import mui from "@shadcn/lint/mui"
import parser from "@typescript-eslint/parser"

export default [
  {
    files: ["src/**/*.{jsx,tsx}"],
    languageOptions: {
      parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { mui },
    rules: {
      "mui/no-raw-colors": "error",
      "mui/no-restyle": [
        "error",
        {
          allow: ["*"],
          contracts: [
            {
              pattern: "^Button$",
              deny: ["background", "backgroundColor", "backgroundImage"],
            },
          ],
        },
      ],
    },
  },
]
```

For Oxlint, add `"@shadcn/lint/mui"` to `jsPlugins` and use the same rule names,
options and `settings.mui`. This export does not require a Tailwind stylesheet or an installed MUI runtime.

The example assigns Button backgrounds to the shared theme while allowing other local properties.
Choose contracts from your project's actual component ownership.
Box, Stack and ButtonBase remain useful styling primitives; the plugin assigns them no universal visual restrictions.

## Property and color policies

Both rules accept `allow`, `deny`, `contracts` and `message` using the
[shared policy precedence](./rules.md). Entries match CSS property names or globs.
Contracts match canonical component names; the last matching contract wins.
`deny` takes priority over `allow`. An explicit `allow` list exempts only those properties.
Without either option the rule exempts nothing; a `deny` list alone allows other properties.

MUI aliases are normalized: `bgcolor` matches `backgroundColor`, and `px` matches
`paddingLeft` and `paddingRight`. Kebab-case properties also match their camel-case forms.
Selectors retain their root component owner, so `Button` owns declarations under its own `&:hover`.
The collector preserves authored shorthand and longhand declarations rather than calculating their final CSS cascade.

```tsx
import { Box, Button } from "@mui/material"

// Reported by the example's Button contract, even though the value is a token.
;<Button sx={{ bgcolor: "primary.main" }} />

// Reported by no-raw-colors.
;<Box sx={{ border: "1px solid #123456" }} />

// Accepted by the example's policies.
;<Button variant="contained" color="primary" sx={{ width: 160 }} />
;<Box sx={{ color: "text.primary", border: 1, boxShadow: 2, p: 2 }} />
```

`no-raw-colors` reads literal paint in color properties, backgrounds, gradients,
border and outline shorthands, shadows, fill and stroke. It skips quoted image paths and URL contents.
Literal fallbacks such as `var(--surface, red)` are still paint.
Semantic palette paths, CSS variables and inheritance keywords pass this rule.
Numeric System values retain their [MUI `sx` semantics](https://mui.com/system/getting-started/the-sx-prop/).

Acceptance does not establish token existence, valid CSS, contrast or suitable component usage.
For example, `common.white` on `primary.main` needs rendering or a contrast test across your theme presets.
The rules provide no automatic fixes because removing an override or choosing a replacement token requires project context.

## Readable styling

The collector reads static objects, responsive values, conditional branches, `&&`
composition, `sx` arrays and safe local constants or object spreads.
Readable callbacks may return a style expression directly, or contain one return statement.
Async functions, generators and callbacks with additional statements stay unresolved.
The linter never executes callbacks or loads application theme code.

[MUI recommends callbacks for the entire `sx` value](https://mui.com/system/getting-started/the-sx-prop/#callback-values).
The collector also reads simple legacy property callbacks.
Theme lookups and function calls inside either form remain unresolved while readable sibling declarations still receive checks.

```tsx
import { Box } from "@mui/material"

// The literal background is reported; the theme lookup is unresolved.
;<Box sx={(theme) => ({ color: theme.palette.text.primary, bgcolor: "red" })} />

// The interpolated value is unresolved. Its authored property can still violate a contract.
;<Box sx={{ color: `var(--${prefix}-red)` }} />
```

Unknown spreads invalidate earlier potentially replaced keys.
An unknown JSX spread after `sx` can replace that entire prop, so the earlier value stays unresolved.
Interpolation can change CSS names, comments and function boundaries; templates with expressions stay unresolved in full.
Templates without expressions remain readable strings.

## Component bindings

Recognition follows imported bindings, including aliases, supported deep imports and namespace imports.
Shadowed names, type-only imports, providers and arbitrary capitalized names establish no styling ownership.
The explicit catalog lives in [imports.ts](../packages/lint/src/mui/imports.ts).
For Drawer and Popover, root `sx` belongs to their root container; paper slot styling remains outside this channel.

| Import family                  | Included surface                                            | Other styling channels                                                       |
| ------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `@mui/material`, `@mui/system` | Cataloged public roots, including Box, Stack and ButtonBase | Tooltip, slots and `styled()` remain unresolved                              |
| `@mui/x-data-grid`             | DataGrid root `sx`                                          | Column definitions, cell callbacks and Pro/Premium exports remain unresolved |
| `@mui/x-date-pickers`          | DatePicker and TimePicker root `sx`                         | Picker slots and other picker exports remain unresolved                      |
| `@mui/x-charts`                | BarChart and LineChart root `sx`                            | Series configuration and chart composition remain unresolved                 |
| `@mui/x-tree-view`             | RichTreeView, SimpleTreeView and TreeItem root `sx`         | Render callbacks and slot styling remain unresolved                          |

Projects may declare wrappers whose source has been reviewed for `sx` forwarding.
Each declaration matches an exact import source and exported binding.
Optional `styleProps` maps additional CSS-valued JSX props to CSS properties.
The plugin does not infer these mappings from a wrapper's name.

```js
settings: {
  mui: {
    componentImports: [
      {
        source: "@design/icon",
        imported: "default",
        component: "Icon",
        styleProps: { color: "color" },
      },
    ],
    guidance: {
      Button: {
        variant: ["contained", "outlined", "text"],
        themeFile: "src/theme/components/button.ts",
      },
    },
    note: "Use the shared theme and verify foreground/background contrast.",
  },
}
```

`component` supplies the canonical name for contracts and diagnostics.
`imported` is `default` or the named export; namespace imports match named exports.
`styleProps` maps only reviewed CSS channels: a semantic `color` variant on Button or Label is not a CSS color prop.
Malformed or duplicate import declarations produce configuration diagnostics.

Scope relative source declarations to the exact importing files using ESLint `files` overrides.
The same `../icon` spelling can resolve to different modules elsewhere.
Keep `guidance` for approved size, color and variant examples or the shared theme location.
Messages support the [shared message templates](./rules.md#your-own-words) with `channel` identifying `sx` or a configured prop.

A configured `<Icon color="red" sx={{ color: "primary.main" }} />` still reports the authored `color` prop.
Each authored channel receives its own policy check even when another channel later overrides its rendered value.

## Validation and limits

[mui.test.ts](../packages/lint/test/mui.test.ts) covers policy decisions, source ranges,
MUI numeric semantics and conservative handling of unresolved syntax.
[mui-components.test.ts](../packages/lint/test/mui-components.test.ts) adds callback bounds,
binding recognition, configured props and interpolation controls.
[mui-feedback.test.ts](../packages/lint/test/mui-feedback.test.ts) checks labeled syntax fixtures against ESLint and the built Oxlint plugin.
The normal type-completion tests include this export under each supported TypeScript resolution mode.

These checks measure syntax diagnostics and package compatibility.
The fixtures are deterministic regression inputs, with historical unknown labels preserved rather than rewritten when supported syntax expands.
They do not establish agent effectiveness, visual quality or complete library coverage.
Runtime tests remain necessary for styling outside these readable channels, including HTML tooltips and foreground/background contrast.
