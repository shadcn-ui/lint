---
"@shadcn/lint": patch
---

`no-restyle` no longer treats a package's own exports as the project's
components. A ui file that wraps a package primitive and re-exports
something else from the same package — shadcn's `message-scroller.tsx`,
for one — pulled that package's bundled file into the ui directory's
export closure, so its primitives were reported under the minifier's
local name (`<erButton>`). Only a name the ui directory actually exports
counts now, and no finding names a file inside `node_modules`: a vendor
component re-exported from the ui directory is still checked, without
being told to add a variant in a package.
