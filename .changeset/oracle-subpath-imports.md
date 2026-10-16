---
"@shadcn/lint": patch
---

Resolve subpath imports such as `@import "#ds/styles.css"` when building the Tailwind theme, so `no-unknown-classes` reads a theme imported through the package's `imports` map instead of falling back to the bundled grammar.
