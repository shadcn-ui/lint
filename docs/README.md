# Documentation

Start with [Get started](../README.md#get-started) to set up ESLint or Oxlint.

## Frameworks

- [React](./react.md): Oxlint or ESLint, shadcn/ui or your own components.
- [Vue](./vue.md): ESLint with `vue-eslint-parser`, and what Oxlint can and cannot read.
- [Svelte](./svelte.md): ESLint with `svelte-eslint-parser`, and what Oxlint can and cannot read.

## Guides

- [Configuring your design system](./design-systems.md): variants, contracts, and custom messages.
- [Adding linting to an existing project](./adoption.md): start with warnings and add rules as you go.
- [How it works](./how-it-works.md): how the linter reads your components and theme, and what it can check.
- [Troubleshooting](./troubleshooting.md): stale results, missing components, and theme warnings.
- [Evals](./evals.md): how we measure the linter, results, and reproduction steps.

## Rules

See [shared options](./rules.md) for allowances, contracts, messages, and class categories.

- [no-restyle](./rules/no-restyle.md): control styling changes to components.
- [no-raw-colors](./rules/no-raw-colors.md): use theme colors.
- [no-arbitrary-values](./rules/no-arbitrary-values.md): use tokens and scale values.
- [no-inline-styles](./rules/no-inline-styles.md): use classes and CSS custom properties.
- [no-unknown-classes](./rules/no-unknown-classes.md): catch classes that produce no CSS.
- [require-static-classes](./rules/require-static-classes.md): keep class values readable by the linter.

## Reference

- [Settings](../README.md#settings): component imports, helpers, and monorepos.
- [API reference](./api.md): plugin exports and the experimental project API.
- [Contributing](../CONTRIBUTING.md): workspace setup, tests, and benchmarks.
