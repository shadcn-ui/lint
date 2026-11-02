---
"@shadcn/lint": patch
---

Read a stylesheet whose `@import` has no closing `;` in one pass. Each `@import` rescanned the rest of the file for one, so a large unterminated stylesheet took seconds to lint.
