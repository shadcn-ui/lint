---
"@shadcn/lint": patch
---

Keep the numeric spacing scale when a theme sets `--spacing` after `--*: initial` or `--spacing-*: initial`, so `p-4` stays a spacing and `border-spacing-0` is no longer reported as an undeclared color.
