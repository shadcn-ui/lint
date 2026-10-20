import { policyRule } from "./rules/policy-rule"

export type { ComponentImport } from "./imports"

export type MuiPolicy = {
  allow?: string[]
  deny?: string[]
  message?: string
  contracts?: {
    pattern: string
    allow?: string[]
    deny?: string[]
    message?: string
  }[]
}

export const plugin = {
  meta: { name: "mui" },
  rules: {
    "no-restyle": policyRule("no-restyle"),
    "no-raw-colors": policyRule("no-raw-colors"),
  },
}

declare module "@eslint/core" {
  interface RulesConfig {
    "mui/no-restyle"?: import("@eslint/core").RuleConfig<[MuiPolicy]>
    "mui/no-raw-colors"?: import("@eslint/core").RuleConfig<[MuiPolicy]>
  }
}

export default plugin
