---
"@shadcn/lint": patch
---

Follow a package `exports` or `imports` target only when it is `./` relative and stays inside the package, the way Node does, and never stat a UNC path outside the project.
