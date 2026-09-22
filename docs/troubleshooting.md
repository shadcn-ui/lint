# Troubleshooting

## Lint results did not change after an edit

Run lint without ESLint's `--cache` after changing a component, variant,
theme, or dependency. That cache can skip unchanged files that use the
changed code, leaving both errors and clean results stale.

```bash
npx eslint .
```

If you lint through a script, check that the script does not add `--cache`.

For a long-running editor integration, restart its lint process if results
still look stale. The linter keeps project information in memory and checks
file modification times during linting. Some checks are reused for about
one second; theme discovery without `components.json` refreshes about every
five seconds. There is no background watcher.

### Changes inside a Tailwind plugin or config

After editing a JavaScript module imported by your Tailwind plugin or
config, restart the linter or touch that plugin or config's entry file.

The Tailwind worker checks stylesheets and `@plugin`/`@config` entry files
about once a second. It does not track JavaScript modules imported by
those entries. Touching the entry rebuilds the theme in a fresh worker.

## A component is not being checked

Check that `components.json` points to your UI directory and that the
component's import resolves. For a different directory or package, set
`settings.shadcn.ui`:

```js
settings: {
  shadcn: {
    ui: "@/ds",
  },
}
```

This recognizes `@/ds` and `@/ds/button`. Also check that the file is
included in your lint command and that a config override has not disabled
the rule for it. See [Settings](../README.md#settings) and
[component discovery](./how-it-works.md#your-components-from-imports).

## A .svelte or .vue file reports nothing

Templates are read under ESLint with `svelte-eslint-parser` or
`vue-eslint-parser`. Check that a config block matches the file and sets
the parser:

```js
{
  files: ["**/*.svelte"],
  languageOptions: {
    parser: svelteParser,
    parserOptions: { parser: tsParser },
  },
  plugins: { shadcn },
}
```

Under Oxlint only the `<script>` blocks are linted, and the run prints a
warning that says so. See [Vue](./vue.md) and [Svelte](./svelte.md).

## The linter cannot load the theme

Check the stylesheet path in `components.json`, its imports, and any
`@plugin` or `@config` entries named in the warning. Without
`components.json`, the linter looks for a stylesheet that imports Tailwind.

`no-unknown-classes` needs the project's Tailwind v4 and a readable theme
for its full check. If loading fails, it uses a grammar fallback that
checks less and provides no spelling suggestions. Fix the warning before
relying on a clean result. Failed builds are retried on a later lint after
five seconds; restarting the linter also clears the cached failure.

See [theme discovery](./how-it-works.md#theme-tokens) and
[fallback limits](./rules/no-unknown-classes.md#without-a-resolvable-theme).
