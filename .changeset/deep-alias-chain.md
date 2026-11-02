---
"@shadcn/lint": patch
---

Stop following a chain of consts after 64 links and treat the rest as dynamic, so a generated chain such as `const v2 = cn(v1)` no longer overflows the stack and aborts the run.
