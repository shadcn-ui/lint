---
"@shadcn/lint": patch
---

Stop following package `exports` conditions 32 levels deep, so a manifest nested thousands of levels has no target instead of overflowing the stack in every rule.
