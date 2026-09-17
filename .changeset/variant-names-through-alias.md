---
"@shadcn/lint": patch
---

Variant names are now read through a type alias and a props union. A prop
typed `variant?: ButtonVariant` reads the same as the union written
inline, `keyof typeof VARIANTS` lists the keys of a lookup object declared
in the file, and props declared as a union of shapes — an anchor or a
button — list the variants every member accepts. Before, each of these
shapes listed nothing, so a message offered no variant to reuse.
