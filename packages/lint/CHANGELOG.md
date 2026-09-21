# @shadcn/lint

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
