---
"@shadcn/lint": patch
---

Check a wrapper's other class props, such as `headerClassName`, in `no-restyle` against the component the wrapper hands them to, not the one that receives `className`.
