import { reporter } from "../../rules/messages"
import { configErrorVisitors } from "../../rules/policy"
import { policySchema } from "../../rules/policy-schema"
import { compilePropertyPolicy } from "../../rules/property-policy"
import { isRawColor } from "../colors"
import { componentImportsOf } from "../imports"
import { colorProperties, normalizePolicy } from "../properties"
import { collectSx } from "../sites"

export function policyRule(kind: "no-restyle" | "no-raw-colors") {
  const rule = `mui/${kind}`
  const messages = {
    restyle:
      '"{{property}}" is not allowed in <{{component}}> {{channel}}. Use an approved component treatment.{{suggestions}}',
    rawColor:
      '"{{property}}" in <{{component}}> {{channel}} hardcodes a color. Use a project semantic palette reference or approved CSS theme variable.{{suggestions}}',
  }
  return {
    meta: {
      type: "problem" as const,
      docs: {
        description:
          kind === "no-restyle"
            ? "Enforce property contracts on recognized MUI root sx."
            : "Report literal colors in recognized static MUI sx color properties.",
      },
      schema: [
        {
          type: "object",
          properties: policySchema,
          additionalProperties: false,
        },
      ],
      messages,
    },
    create(context: any) {
      const options = context.options[0] ?? {}
      let policy: ReturnType<typeof compilePropertyPolicy>
      try {
        componentImportsOf(context)
        policy = compilePropertyPolicy(normalizePolicy(options), rule)
      } catch (error) {
        return configErrorVisitors(context, error)
      }
      const report = reporter(context, messages, {
        rule,
        message: options.message,
        namespace: "mui",
      })
      return {
        JSXOpeningElement(node: any) {
          const collection = collectSx(context, node)
          for (const site of collection.sites) {
            const decisions = site.properties.map((property) =>
              policy.decide(site.component, property)
            )
            const decision = decisions.find((value) => !value.exempt)
            if (!decision) continue
            if (
              kind === "no-raw-colors" &&
              (!site.properties.some((property) =>
                colorProperties.has(property)
              ) ||
                !site.values.some(isRawColor))
            )
              continue
            const guidance = context.settings?.mui?.guidance?.[site.component]
            const choices = ["size", "color", "variant"].flatMap((prop) => {
              const values = guidance?.[prop]
              return Array.isArray(values) &&
                values.every((value: any) => typeof value === "string")
                ? [` ${prop}: ${values.join(", ")}.`]
                : []
            })
            const file =
              typeof guidance?.themeFile === "string" ? guidance.themeFile : ""
            const suggestions =
              kind === "no-restyle"
                ? choices.join("") +
                  (file ? ` See ${file} for approved treatments.` : "")
                : file
                  ? ` See ${file}.`
                  : ""
            report(
              {
                node: site.node,
                messageId: kind === "no-restyle" ? "restyle" : "rawColor",
                data: {
                  component: site.component,
                  property: site.property,
                  channel: site.channel,
                  suggestions,
                  file,
                },
              },
              decision.message
            )
          }
        },
      }
    },
  }
}
