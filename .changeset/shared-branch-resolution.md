---
"@shadcn/lint": patch
---

Read a const once per class site, so a chain like `const b = on ? a : a` no longer takes exponential time, and a class reached through both branches is reported once.
