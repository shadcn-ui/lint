# @shadcn/lint

## 0.2.1

### Patch Changes

- [#82](https://github.com/shadcn-ui/lint/pull/82) [`32b37e4`](https://github.com/shadcn-ui/lint/commit/32b37e45ce08b4b504f755deb40199cf94ed7bb1) Thanks [@shadcn](https://github.com/shadcn)! - Allow `fill-none` and `stroke-none` in `no-raw-colors`.

- [#86](https://github.com/shadcn-ui/lint/pull/86) [`207c442`](https://github.com/shadcn-ui/lint/commit/207c442e713b8c6571455487b05dbd244573226e) Thanks [@shadcn](https://github.com/shadcn)! - Classify font sizes from a JavaScript `@config` or `@plugin` as typography, not color.

- [#78](https://github.com/shadcn-ui/lint/pull/78) [`60836cc`](https://github.com/shadcn-ui/lint/commit/60836cc2c3862e91e4fcb0d2b27ba904546a5441) Thanks [@shadcn](https://github.com/shadcn)! - Load `@config` and `@plugin` modules the way Tailwind does, so extensionless imports and TypeScript enums build.

- [#76](https://github.com/shadcn-ui/lint/pull/76) [`ab7658a`](https://github.com/shadcn-ui/lint/commit/ab7658a62333ed35f74d78594b8539644c3dc53a) Thanks [@shadcn](https://github.com/shadcn)! - Check cva and tv variant classes keyed by a computed name such as an enum member.

- [#81](https://github.com/shadcn-ui/lint/pull/81) [`334ded6`](https://github.com/shadcn-ui/lint/commit/334ded64dc3a8d0304eb44e776b799d679c09c1f) Thanks [@shadcn](https://github.com/shadcn)! - Match dotted `mergeFunctions` and `variantFunctions` entries such as `Option.some` against method calls.

- [#85](https://github.com/shadcn-ui/lint/pull/85) [`b16b8cf`](https://github.com/shadcn-ui/lint/commit/b16b8cff502f994c18f8a5e51c4a713652308491) Thanks [@shadcn](https://github.com/shadcn)! - Resolve a ui alias to a directory through a wildcard `package.json` imports key such as `"#components/*": "./src/components/*.tsx"`.

- [#83](https://github.com/shadcn-ui/lint/pull/83) [`a38ee04`](https://github.com/shadcn-ui/lint/commit/a38ee04d93df0175356227658a3f465bbbff868c) Thanks [@shadcn](https://github.com/shadcn)! - Only suggest variants from a cva/tv factory the component actually uses.

- [#77](https://github.com/shadcn-ui/lint/pull/77) [`bbe3a2a`](https://github.com/shadcn-ui/lint/commit/bbe3a2a6a7d2bf45d3568bd86e4689dca1a1a020) Thanks [@shadcn](https://github.com/shadcn)! - Under a Tailwind prefix, leave unprefixed classes to no-unknown-classes instead of reporting them as undeclared colors.

- [#84](https://github.com/shadcn-ui/lint/pull/84) [`557e75e`](https://github.com/shadcn-ui/lint/commit/557e75e476fe62a86f758a552a0e0904c3c173ab) Thanks [@shadcn](https://github.com/shadcn)! - Judge classes by the component itself when its `render` prop renders a plain element.

- [#80](https://github.com/shadcn-ui/lint/pull/80) [`8abc06b`](https://github.com/shadcn-ui/lint/commit/8abc06b9c83a35116f90dcb03f0958e52d7c339f) Thanks [@shadcn](https://github.com/shadcn)! - Read Svelte shorthand attributes such as `{className}` the way their long form is read.

- [#68](https://github.com/shadcn-ui/lint/pull/68) [`0e91da3`](https://github.com/shadcn-ui/lint/commit/0e91da36a4841ae729e3ad57ef3e1719896d52c9) Thanks [@shadcn](https://github.com/shadcn)! - Resolve Tailwind beside the stylesheet that imports it.

- [#52](https://github.com/shadcn-ui/lint/pull/52) [`ee93910`](https://github.com/shadcn-ui/lint/commit/ee9391038b5dc025f01777d8dbd0f72d5b885ab4) Thanks [@shadcn](https://github.com/shadcn)! - Classify a project's custom theme scales, such as `rounded-card`, the way cn 0.4.0 merges them.

- [#79](https://github.com/shadcn-ui/lint/pull/79) [`8455c18`](https://github.com/shadcn-ui/lint/commit/8455c18bedcaaf2ab3ebf7c6a7e722a1752e8763) Thanks [@shadcn](https://github.com/shadcn)! - Resolve a bare `aliases.ui` such as `src/` against the project, as the shadcn CLI does.

## 0.2.0

### Minor Changes

- [#50](https://github.com/shadcn-ui/lint/pull/50) [`b9572a8`](https://github.com/shadcn-ui/lint/commit/b9572a87ad3da8c6341b5d3d283b0e5c3a01323d) Thanks [@shadcn](https://github.com/shadcn)! - Add support for Vue and Svelte.

### Patch Changes

- [#50](https://github.com/shadcn-ui/lint/pull/50) [`b9572a8`](https://github.com/shadcn-ui/lint/commit/b9572a87ad3da8c6341b5d3d283b0e5c3a01323d) Thanks [@shadcn](https://github.com/shadcn)! - Read a barrel whose export list carries comments.

## 0.1.5

### Patch Changes

- [#47](https://github.com/shadcn-ui/lint/pull/47) [`7638587`](https://github.com/shadcn-ui/lint/commit/7638587e93ebff5bd7c8a7f9a8c42f236bb73c8e) Thanks [@shadcn](https://github.com/shadcn)! - Update the bundled cn grammar to 0.3.2. Axis utilities such as `px-2` now conflict with the logical sides they cover, and only Tailwind's own `animate-*` names share the `animate` group.

## 0.1.4

### Patch Changes

- [#45](https://github.com/shadcn-ui/lint/pull/45) [`b291b5b`](https://github.com/shadcn-ui/lint/commit/b291b5b25be39263b4b9921100714b19cfd8fde6) Thanks [@shadcn](https://github.com/shadcn)! - Read a project's animations from its CSS. An `animate-*` class now classifies as motion when the theme declares `--animate-<name>` or the CSS declares it with `@utility` or a selector, so the result no longer depends on cn grouping every `animate-*` name.

## 0.1.3

### Patch Changes

- [#42](https://github.com/shadcn-ui/lint/pull/42) [`505a37d`](https://github.com/shadcn-ui/lint/commit/505a37d3ff1a0e156d3171dc173519ac35f3db9f) Thanks [@shadcn](https://github.com/shadcn)! - Read a destructured binding's own slot of its initializer, and resolve a ui package's alias to its own name.

## 0.1.2

### Patch Changes

- [#35](https://github.com/shadcn-ui/lint/pull/35) [`28f102c`](https://github.com/shadcn-ui/lint/commit/28f102c533396cefb63bffa0119e2cfc5ccc6b6a) Thanks [@shadcn](https://github.com/shadcn)! - Fix theme reading past comments, scoped color namespaces, `exports` patterns, plain selectors hiding raw colors, and the TypeScript parser peer warning.

## 0.1.1

### Patch Changes

- [#25](https://github.com/shadcn-ui/lint/pull/25) [`f0df37d`](https://github.com/shadcn-ui/lint/commit/f0df37d79142d80e3a9a0ef2238d85ff53758884) Thanks [@shadcn](https://github.com/shadcn)! - Read Astro `class:list` as a class site.

- [#24](https://github.com/shadcn-ui/lint/pull/24) [`cba3775`](https://github.com/shadcn-ui/lint/commit/cba3775eab345fda66eceaf5d3565307cc2e7b6d) Thanks [@shadcn](https://github.com/shadcn)! - Fix `no-raw-colors` reporting declared `--text-*` and `--shadow-*` tokens as colors.

- [#30](https://github.com/shadcn-ui/lint/pull/30) [`a249aed`](https://github.com/shadcn-ui/lint/commit/a249aeda6ff8573be8df77ca0fb8955deffa6330) Thanks [@shadcn](https://github.com/shadcn)! - Resolve theme imports from a pnpm-linked package's real path.

- [#31](https://github.com/shadcn-ui/lint/pull/31) [`b6f1f70`](https://github.com/shadcn-ui/lint/commit/b6f1f705b8b5de4448946c877e93551c638b5fc4) Thanks [@shadcn](https://github.com/shadcn)! - Read base utilities from a discovered entry when `tailwind.css` is a partial.

- [#28](https://github.com/shadcn-ui/lint/pull/28) [`3df54f2`](https://github.com/shadcn-ui/lint/commit/3df54f21aa2ad79a654e64a11de1cb7dcc1b405f) Thanks [@shadcn](https://github.com/shadcn)! - Classify `flex-grow`, `flex-shrink`, and other Tailwind 3 utility names.

- [#29](https://github.com/shadcn-ui/lint/pull/29) [`d782dbb`](https://github.com/shadcn-ui/lint/commit/d782dbb2fdf9454f103115423e6ea69d1dcf48d9) Thanks [@shadcn](https://github.com/shadcn)! - Attribute classes to the component a `render` prop renders.

- [#34](https://github.com/shadcn-ui/lint/pull/34) [`be5f6c4`](https://github.com/shadcn-ui/lint/commit/be5f6c42288a80461967ab7230a425f9efe0c34f) Thanks [@shadcn](https://github.com/shadcn)! - Read a `class:list` Set, and keep classes on the trigger when a `render` prop cannot be read.

- [#26](https://github.com/shadcn-ui/lint/pull/26) [`0bc3bf2`](https://github.com/shadcn-ui/lint/commit/0bc3bf25dce572bd75c72af90b605bf72b883253) Thanks [@shadcn](https://github.com/shadcn)! - Fix `no-restyle` naming components after a package's minified exports.

- [#32](https://github.com/shadcn-ui/lint/pull/32) [`b2518be`](https://github.com/shadcn-ui/lint/commit/b2518becc85fa9163a4b28b8bfd4a6ffd7918a85) Thanks [@shadcn](https://github.com/shadcn)! - Read variant names through a type alias and a props union.

- [#27](https://github.com/shadcn-ui/lint/pull/27) [`3ac1d52`](https://github.com/shadcn-ui/lint/commit/3ac1d5232f8b7618bddf09b1597625c04983a13c) Thanks [@shadcn](https://github.com/shadcn)! - Stop `no-restyle` calling a declared `@utility` class a misspelling.

## 0.1.0

### Minor Changes

- initial release
