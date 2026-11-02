---
"@shadcn/lint": patch
---

Read class tokens and theme values in one pass, so a token of thousands of unclosed brackets such as `w-[w-[w-[` or `bg-red-500/[/[/[` no longer takes seconds to lint.
