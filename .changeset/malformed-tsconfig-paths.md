---
"@shadcn/lint": patch
---

Ignore a tsconfig `baseUrl` that is not a string, a `paths` value that is not an object, and `paths` targets that are not strings, instead of throwing from every rule.
