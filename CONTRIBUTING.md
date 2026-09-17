# Contributing

Run the checks below before submitting a change. For publishing, see the
[release guide](./.github/RELEASING.md).

## Layout

This pnpm workspace has two packages:

- `packages/lint`: the publishable `@shadcn/lint` package, with rules,
  class classification, project analysis, and tests.
- `packages/evals`: tools for agent evals, visual comparison,
  registry scans, classifier parity, and bypass checks. This package is not published.

Run the commands below from the repository root.

## Commands

```bash
pnpm install
pnpm build          # ESM and types in packages/lint/dist
pnpm test           # Build, then run rule and Oxlint integration tests
pnpm typecheck
pnpm lint
pnpm format:write
pnpm corpus         # Report findings in the pinned registry
pnpm corpus:check   # Check that per-rule counts have not increased
pnpm evals          # Run agent evals; requires the Claude CLI
```

See [Evals](./docs/evals.md) for methodology, results, and commands.

## The registry corpus

The corpus is a fixed snapshot of the shadcn/ui registry, used to test
the rules against real code. `packages/evals/scripts/registry.json`
pins its commit. The scripts fetch a sparse clone into the ignored
`.registry/` directory, including in CI.

To update the snapshot, change the pinned ref, run
`pnpm corpus:check --update`, and include the ref and baseline in the
same commit. Review count changes before accepting a new baseline.

To inspect every finding for one rule using the current build:

```bash
node packages/evals/scripts/corpus.mjs --rule no-unknown-classes
```

To check a separate build without replacing `packages/lint/dist`:

```bash
pnpm --filter @shadcn/lint exec tsdown --out-dir dist-next
SHADCN_LINT_PLUGIN=packages/lint/dist-next/index.js node packages/evals/scripts/corpus.mjs
```

`dist-next/` is ignored by Git, ESLint, and Prettier. The corpus check
and Oxlint tests also accept `SHADCN_LINT_PLUGIN`; relative paths are
resolved from the process's working directory. Oxlint tests use the
built plugin through `jsPlugins` and skip when no build exists.

## When Tailwind releases new classes

Three parts of the linter need different updates:

| Part                        | Source                                      | What to update                                                              |
| --------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| Class existence             | The project's Tailwind v4                   | Nothing in the linter; new classes are recognized when the project upgrades |
| Class categories            | `cn` groups and `src/grammar/categories.ts` | Update `cn` and map new groups to categories                                |
| Token and scale suggestions | Generated `src/grammar/tailwind-theme.ts`   | Regenerate from the Tailwind dev dependency                                 |

Paths in this section are relative to `packages/lint`.

1. Update `tailwindcss` in `packages/lint`, then regenerate the theme:

   ```bash
   pnpm --filter @shadcn/lint exec node scripts/generate-tailwind-theme.mjs
   ```

   Include the generated file with the update. `test/generated.test.ts`
   checks that it matches the installed Tailwind version.

2. When `cn` adds the new class groups, update it and `BUNDLED_CN` in
   `src/grammar/classifier.ts`. Run tests and add missing entries to
   `GROUP_CATEGORY`. `test/options.test.ts` lists unmapped groups.
3. Run `pnpm corpus:check` and inspect changes before updating the
   baseline.

An unknown class is `unclassified`, not layout. A recognized group without
an appearance category is treated as layout; newly unmapped groups
produce a warning. Add missing groups to `cn` and map appearance groups
in the linter. Projects with an older `cn` use the bundled version.

## Measuring

```bash
pnpm --filter evals bench
```

This benchmarks the pinned registry through the ESLint API: no rules,
the five configured rules, all six rules, and each rule alone. Each
configuration runs once to warm caches, then again for measurement.
Subtract the no-rules time to estimate plugin overhead. Node and ESLint
startup are excluded.

For generated projects with many files and shared components:

```bash
pnpm build
pnpm --filter evals bench:large --files 10000 --components 1000
pnpm --filter evals bench:large --files 10000 --components 1000 --direct
pnpm --filter evals bench:large --files 10000 --components 1000 --wrappers
```

The default uses a shared barrel; `--direct` imports individual components.
`--wrappers` adds forwarding components that import through the barrel.
Add `--clean` to measure files that produce no findings.
Each run reports elapsed time, resident memory, finding count, and a hash
of all diagnostics, including suggestions. `--runs` defaults to 2.
The temporary project is removed afterward. `SHADCN_LINT_PLUGIN` selects
a separate build for comparison.

To collect garbage outside the timed runs before sampling memory:

```bash
node --expose-gc packages/evals/scripts/bench-large.mjs --files 10000 --components 1000
```

For an ESLint CPU profile:

```bash
pnpm --filter evals exec node --cpu-prof scripts/bench.mjs
```

Inspect function self time in `packages/lint/dist`. For Oxlint, add an
`.oxlintrc.json` to the corpus directory with `jsPlugins` pointing to
the built plugin. Time `oxlint .` with and without the plugin. Set
`NODE_OPTIONS=--cpu-prof` to profile its JavaScript side. The plugin
bridge builds an AST for each file visited by a JavaScript rule.

Project analysis uses the optional `oxc-parser`, falling back to
`@typescript-eslint/parser`, an optional peer so that an Oxlint project
on a TypeScript the parser does not yet support sees no peer warning.
With `oxc-parser` installed, this analysis does not load TypeScript
under Oxlint. Same-file wrapper analysis
reuses the linter's AST. Measure `no-unknown-classes` separately when
cold-start cost matters: its first query also loads Tailwind.

## Install test

After building, run:

```bash
pnpm --filter @shadcn/lint exec node scripts/smoke-install.mjs
```

This packs the package, installs it with ESLint and Oxlint in a temporary
project outside the workspace, and lints a small fixture. It checks the
exports, the build, optional parser resolution, packaged README, and
user-facing messages. It requires network access to install dependencies.
