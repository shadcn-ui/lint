---
"@shadcn/lint": patch
---

Read imports, export lists, and default exports in linear time, so a module with a long run of spaces or many unclosed `export {` lists no longer stalls the lint for seconds.
