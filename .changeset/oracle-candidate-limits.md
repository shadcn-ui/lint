---
"@shadcn/lint": patch
---

Skip classes longer than 10,000 characters or with more than 64 variants in `no-unknown-classes`, and a class that makes Tailwind throw, instead of stalling the Tailwind worker or turning it off for the whole theme.
