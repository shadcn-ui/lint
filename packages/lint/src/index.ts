// @shadcn/lint: the plugin, and a small window onto the project model.
// There is no preset; the README shows the setup.

import { plugin } from "./plugin"
import { componentsFor } from "./project/components"
import { projectFor } from "./project/components-json"
import { colorTokensFor, themeFileFor } from "./project/theme"
import { variantDefinitionsOf, variantNamesFor } from "./project/variants"

export { plugin } from "./plugin"

// What the linter knows about a project, for tooling that wants the same
// answers. Experimental: the shapes may change before 1.0.
export const project = {
  projectFor,
  themeFileFor,
  colorTokensFor,
  componentsFor,
  variantDefinitionsOf,
  variantNamesFor,
}

// Editor completion for the rule names: ESLint types `rules` with a
// string index signature, so nothing completes for a plugin's rules until
// they are named here.
//
// This block is the single source; scripts/postbuild.mjs copies it into
// dist, once for each of @eslint/core's dual types, because the dts
// bundler drops augmentations. Keep it self-contained, and in step with
// plugin.rules (test/eslint-completion.test.ts checks both).
declare module "@eslint/core" {
  interface RulesConfig {
    "shadcn/no-restyle"?: import("@eslint/core").RuleConfig<
      [
        {
          allow?: string[]
          deny?: string[]
          message?:
            | string
            | Partial<
                Record<
                  | "default"
                  | "layout"
                  | "color"
                  | "typography"
                  | "spacing"
                  | "shape"
                  | "effects"
                  | "motion",
                  string
                >
              >
          componentImports?: string[]
          ignoreImports?: string[]
          mergeFunctions?: string[]
          variantFunctions?: string[]
          contracts?: {
            pattern: string
            allow?: string[]
            deny?: string[]
            message?:
              | string
              | Partial<
                  Record<
                    | "default"
                    | "layout"
                    | "color"
                    | "typography"
                    | "spacing"
                    | "shape"
                    | "effects"
                    | "motion",
                    string
                  >
                >
          }[]
        },
      ]
    >
    "shadcn/no-raw-colors"?: import("@eslint/core").RuleConfig<
      [
        {
          allow?: string[]
          deny?: string[]
          contracts?: {
            pattern: string
            allow?: string[]
            deny?: string[]
            message?: string
          }[]
          message?: string
          scanAllStrings?: boolean
          componentImports?: string[]
          ignoreImports?: string[]
          mergeFunctions?: string[]
          variantFunctions?: string[]
        },
      ]
    >
    "shadcn/no-arbitrary-values"?: import("@eslint/core").RuleConfig<
      [
        {
          allow?: string[]
          deny?: string[]
          contracts?: {
            pattern: string
            allow?: string[]
            deny?: string[]
            message?: string
          }[]
          message?: string
          scanAllStrings?: boolean
          componentImports?: string[]
          ignoreImports?: string[]
          mergeFunctions?: string[]
          variantFunctions?: string[]
        },
      ]
    >
    "shadcn/no-inline-styles"?: import("@eslint/core").RuleConfig<
      [
        {
          allow?: string[]
          deny?: string[]
          contracts?: {
            pattern: string
            allow?: string[]
            deny?: string[]
            message?: string
          }[]
          message?: string
          allowDynamicIdentifiers?: string[]
        },
      ]
    >
    "shadcn/require-static-classes"?: import("@eslint/core").RuleConfig<
      [
        {
          message?: string
          componentImports?: string[]
          ignoreImports?: string[]
          mergeFunctions?: string[]
          variantFunctions?: string[]
        },
      ]
    >
    "shadcn/no-unknown-classes"?: import("@eslint/core").RuleConfig<
      [
        {
          allow?: string[]
          deny?: string[]
          contracts?: {
            pattern: string
            allow?: string[]
            deny?: string[]
            message?: string
          }[]
          message?: string
          componentImports?: string[]
          ignoreImports?: string[]
          mergeFunctions?: string[]
          variantFunctions?: string[]
        },
      ]
    >
  }
}

export default plugin
