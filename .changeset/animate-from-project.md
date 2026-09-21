---
"@shadcn/lint": patch
---

Read a project's animations from its CSS. An `animate-*` class now classifies as motion when the theme declares `--animate-<name>` or the CSS declares it with `@utility` or a selector, so the result no longer depends on cn grouping every `animate-*` name.
