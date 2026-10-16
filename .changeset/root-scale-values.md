---
"@shadcn/lint": patch
---

Resolve theme variables such as `--radius` from `:root` and `@theme` for scale and color suggestions, not from a scoped selector such as `.compact` declared after them.
