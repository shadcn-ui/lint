// meta.name is the rule namespace in Oxlint, so ids are identical across
// both linters: shadcn/no-restyle.

import { noArbitraryValues } from "./rules/no-arbitrary-values"
import { noInlineStyles } from "./rules/no-inline-styles"
import { noRawColors } from "./rules/no-raw-colors"
import { noRestyle } from "./rules/no-restyle"
import { noUnknownClasses } from "./rules/no-unknown-classes"
import { requireStaticClasses } from "./rules/require-static-classes"
import { withTemplates } from "./sites/readers"

export const rules = {
  "no-restyle": withTemplates(noRestyle),
  "no-raw-colors": withTemplates(noRawColors),
  "no-arbitrary-values": withTemplates(noArbitraryValues),
  "no-inline-styles": withTemplates(noInlineStyles),
  "require-static-classes": withTemplates(requireStaticClasses),
  "no-unknown-classes": withTemplates(noUnknownClasses),
}

export const plugin = {
  meta: { name: "shadcn" },
  rules,
}
