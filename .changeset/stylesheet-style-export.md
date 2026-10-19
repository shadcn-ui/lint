---
"@shadcn/lint": patch
---

Resolve a package imported from the theme through its `style` export first, as Tailwind does, so `@import "tailwindcss"` reads Tailwind's CSS instead of its JavaScript.
