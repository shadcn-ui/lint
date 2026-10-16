---
"@shadcn/lint": patch
---

Accept a color function whose channels are one theme variable, such as `oklch(var(--primary-oklch) / 0.2)`, in `no-raw-colors` SVG attributes and `no-inline-styles` custom properties. Literal channels and a `var()` fallback are still reported.
