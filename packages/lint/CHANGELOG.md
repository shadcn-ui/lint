# @shadcn/lint

## 0.2.3

### Patch Changes

- [#122](https://github.com/shadcn-ui/lint/pull/122) [`cf6487f`](https://github.com/shadcn-ui/lint/commit/cf6487f0ed45438e00363b2698ae2fb92b84bd39) Thanks [@shadcn](https://github.com/shadcn)! - Accept `--border-color-*` tokens for `divide-*` in `no-raw-colors`, the way Tailwind falls back from `--divide-color-*`.

- [#107](https://github.com/shadcn-ui/lint/pull/107) [`f1c81bd`](https://github.com/shadcn-ui/lint/commit/f1c81bdad723a8127a2e6b62a8b2b723762aff3e) Thanks [@shadcn](https://github.com/shadcn)! - Check a component reached through a nested namespace, `<UI.Button.Root>`, resolving each segment through `export * as` barrels.

- [#126](https://github.com/shadcn-ui/lint/pull/126) [`cbc8d4d`](https://github.com/shadcn-ui/lint/commit/cbc8d4dc75728a64fae5e29ea6f3644e354ec788) Thanks [@shadcn](https://github.com/shadcn)! - Classify tw-animate-css classes such as `animate-in`, `fade-in`, and `slide-in-from-top-1` as `motion` in `no-restyle` when the theme imports the package.

- [#121](https://github.com/shadcn-ui/lint/pull/121) [`24a73ee`](https://github.com/shadcn-ui/lint/commit/24a73eec93d6362a9fd0ff321ded13095338fe5f) Thanks [@shadcn](https://github.com/shadcn)! - Resolve theme variables such as `--radius` from `:root` and `@theme` for scale and color suggestions, not from a scoped selector such as `.compact` declared after them.

- [#123](https://github.com/shadcn-ui/lint/pull/123) [`c0d164b`](https://github.com/shadcn-ui/lint/commit/c0d164b9f438a0ecccc93a07f3fbc178cca6186c) Thanks [@shadcn](https://github.com/shadcn)! - Skip plain object property keys such as `"fill-color"` in the `scanAllStrings` scan. Class object keys like `cn({ "bg-red-500": on })` are still checked.

- [#106](https://github.com/shadcn-ui/lint/pull/106) [`355eb51`](https://github.com/shadcn-ui/lint/commit/355eb51f3eadace985a33b1dd5e8e23710d4896e) Thanks [@shadcn](https://github.com/shadcn)! - Check a CSS custom property passed to a Svelte component, `<Button --tone="red">`, the way `no-inline-styles` checks it in a `style` attribute.

- [#104](https://github.com/shadcn-ui/lint/pull/104) [`acee889`](https://github.com/shadcn-ui/lint/commit/acee88913d52995aa8a19af1d47ab03059dadd1f) Thanks [@shadcn](https://github.com/shadcn)! - Resolve a Svelte `$derived(expr)` binding to `expr`, so reactive class and style values are read like a `const`.

- [#105](https://github.com/shadcn-ui/lint/pull/105) [`808970e`](https://github.com/shadcn-ui/lint/commit/808970e87adfd9f672edffb490b94e9ca5d46038) Thanks [@shadcn](https://github.com/shadcn)! - Check `stop-color`, `flood-color`, and `lighting-color` in Svelte and Vue markup the way `no-raw-colors` checks `stopColor` in JSX.

- [#124](https://github.com/shadcn-ui/lint/pull/124) [`118a109`](https://github.com/shadcn-ui/lint/commit/118a109902a88fbad36454feaf7815847b62c38d) Thanks [@shadcn](https://github.com/shadcn)! - Accept a color function whose channels are one theme variable, such as `oklch(var(--primary-oklch) / 0.2)`, in `no-raw-colors` SVG attributes and `no-inline-styles` custom properties. Literal channels and a `var()` fallback are still reported.

- [#125](https://github.com/shadcn-ui/lint/pull/125) [`1d31b7f`](https://github.com/shadcn-ui/lint/commit/1d31b7f954b7f46bbccabacc15cbdd8c624f2f95) Thanks [@shadcn](https://github.com/shadcn)! - Check a wrapper's other class props, such as `headerClassName`, in `no-restyle` against the component the wrapper hands them to, not the one that receives `className`.

## 0.2.2

### Patch Changes

- [#92](https://github.com/shadcn-ui/lint/pull/92) [`868955e`](https://github.com/shadcn-ui/lint/commit/868955e9a89fbb1886ee74e8ceae7fde547f2f78) Thanks [@shadcn](https://github.com/shadcn)! - Add `allowDynamicIdentifiers` to `no-inline-styles` for style objects a library computes, such as Floating UI's `floatingStyles`.

- [#95](https://github.com/shadcn-ui/lint/pull/95) [`ea6b078`](https://github.com/shadcn-ui/lint/commit/ea6b078e178d0df0d29183ece35fc4873cfa8f47) Thanks [@shadcn](https://github.com/shadcn)! - Treat a received class prop such as `labelClass` as forwarded in `require-static-classes`, the way a received `className` is.

- [#88](https://github.com/shadcn-ui/lint/pull/88) [`1561353`](https://github.com/shadcn-ui/lint/commit/15613532d328ef660c1e42c43d20073e8c891f0b) Thanks [@shadcn](https://github.com/shadcn)! - Let `deny` report `white` and `black` in `no-raw-colors`, with the nearest theme tokens suggested.

- [#87](https://github.com/shadcn-ui/lint/pull/87) [`44d6cbf`](https://github.com/shadcn-ui/lint/commit/44d6cbfe30dba144bdca04f4707803e5b61d3f4f) Thanks [@shadcn](https://github.com/shadcn)! - Stop `no-restyle` naming a package file as the place to add a variant when `componentImports` recognizes a package's component.

- [#91](https://github.com/shadcn-ui/lint/pull/91) [`dde45eb`](https://github.com/shadcn-ui/lint/commit/dde45eb0b401c110c61d0fb45f2afaa426de21fa) Thanks [@shadcn](https://github.com/shadcn)! - Resolve `{{sizes}}` in `no-restyle` contract messages on every finding, not only spacing.

- [#87](https://github.com/shadcn-ui/lint/pull/87) [`44d6cbf`](https://github.com/shadcn-ui/lint/commit/44d6cbfe30dba144bdca04f4707803e5b61d3f4f) Thanks [@shadcn](https://github.com/shadcn)! - Add `settings.shadcn.themeImports`, so a design system installed as a package can supply the project's theme tokens.

- [#115](https://github.com/shadcn-ui/lint/pull/115) [`f15b93d`](https://github.com/shadcn-ui/lint/commit/f15b93d46f8ea3628b98c8e8280a99f3174d9624) Thanks [@shadcn](https://github.com/shadcn)! - Read theme scales such as `--text-*` and `--radius-*` from aliased imports, `themeImports` packages, and after a nested `@keyframes`.

- [#94](https://github.com/shadcn-ui/lint/pull/94) [`9a55f6d`](https://github.com/shadcn-ui/lint/commit/9a55f6d1b3fc78e6342c39c26cb6093342fd1b67) Thanks [@shadcn](https://github.com/shadcn)! - Match a tag with no import, such as an auto-imported Vue component, against the directory `settings.shadcn.ui` names.

- [#90](https://github.com/shadcn-ui/lint/pull/90) [`5ef03bf`](https://github.com/shadcn-ui/lint/commit/5ef03bf4bab4de604e773c69fdd995e6ffab2994) Thanks [@shadcn](https://github.com/shadcn)! - Classify a class declared with `@utility` by the properties its body sets.

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
