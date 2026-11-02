---
"@shadcn/lint": patch
---

Leave a plain element alone when it is the `render` target of a component that adds no classes, such as a `PopoverTrigger` that only spreads its props onto Base UI, so `no-restyle` and `require-static-classes` no longer judge it by that component.
