import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    mui: "src/mui/index.ts",
    // The Tailwind oracle's worker thread; loaded by URL from index.
    "tailwind-worker": "src/tailwind/worker.ts",
  },
  // ESM only: Node 20.19+ and 22.12+ require() ESM without a flag, and
  // ESLint and Oxlint both import the plugin.
  format: ["esm"],
  dts: true,
  hash: false,
  target: "es2022",
  minify: false,
  clean: true,
})
