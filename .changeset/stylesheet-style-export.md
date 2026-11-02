---
"@shadcn/lint": patch
---

Resolve a theme's `@import` the way Tailwind does, through a package's `style` condition or field, so `@import "tailwindcss"` reads its stylesheet instead of `dist/lib.mjs` and names from the JavaScript bundle no longer count as known classes.
