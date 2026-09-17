---
"@shadcn/lint": patch
---

Utilities Tailwind still generates under their Tailwind 3 names are read
as the utilities they are. `flex-grow` and `flex-shrink-0` classify as
`grow` and `shrink`, so `allow: ["layout"]` lets them through instead of
`no-restyle` calling them a misspelling, and `decoration-clone` is a box
decoration rather than a text-decoration color, so `no-raw-colors` stops
reporting it as an undeclared theme color. `overflow-ellipsis` and
`decoration-slice` read the same way.
