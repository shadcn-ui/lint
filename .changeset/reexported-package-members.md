---
"@shadcn/lint": patch
---

Resolve `<X.Member>` through its namespace before joining names, so a re-exported package's raw parts are no longer judged as the ui component their joined name matches.
