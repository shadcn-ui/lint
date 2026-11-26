---
"@shadcn/lint": patch
---

Classify Tailwind's legacy `bg-gradient-to-*` utilities as background images, so `no-raw-colors` does not report them as undeclared theme colors when a project uses cn 0.5.2.
