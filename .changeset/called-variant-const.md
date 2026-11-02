---
"@shadcn/lint": patch
---

Follow a call to a `cva` or `tv` result defined in the same file, so `no-restyle` checks every variant it can produce and `require-static-classes` no longer reports it as dynamic.
