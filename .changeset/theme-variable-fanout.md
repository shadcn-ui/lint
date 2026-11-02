---
"@shadcn/lint": patch
---

Stop resolving a theme variable once its value would grow past 100,000 characters, such as one that names another variable ten times at each of six levels, and treat it as unresolved instead of building megabytes or overflowing the longest string V8 allows.
