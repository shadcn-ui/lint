---
"@shadcn/lint": patch
---

Read an export list past a `}` inside a comment, so `export { A /* } */, B }` and a `// }` line in a multi-line list keep every name after it.
