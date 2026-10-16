---
"@shadcn/lint": patch
---

Skip plain object property keys such as `"fill-color"` in the `scanAllStrings` scan. Class object keys like `cn({ "bg-red-500": on })` are still checked.
