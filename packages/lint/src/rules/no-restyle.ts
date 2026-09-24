// no-restyle: a component's className carries only what its contract
// allows; appearance comes from its variants. See docs/rules/no-restyle.md.

import { CATEGORIES } from "../grammar/categories"
import { splitClasses } from "../grammar/classes"
import { componentsFor } from "../project/components"
import { declaresClass } from "../project/theme"
import { sizeNamesFor, variantNamesFor } from "../project/variants"
import { classSiteVisitors, type ClassSite } from "../sites/collect"
import { compileContracts, configErrorVisitors } from "./contracts"
import { displayPath, fileOf, reporter } from "./messages"
import { entriesSchema, recognitionSchema } from "./policy-schema"
import { withSettings } from "./settings"

const messageSchema = {
  anyOf: [
    { type: "string", maxLength: 500 },
    {
      type: "object",
      properties: Object.fromEntries(
        ["default", "layout", ...CATEGORIES].map((key) => [
          key,
          { type: "string", maxLength: 500 },
        ])
      ),
      additionalProperties: false,
    },
  ],
}

// No message tells the reader to change the config: a diagnostic reaches
// agents, and an agent must never be handed the policy as the fix.
const NOT_ALLOWED = '"{{className}}" is not allowed on <{{component}}>:'
const OWNS = "<{{component}}> owns its {{category}}."
const OWNS_VIA_WRAPPER =
  "<{{wrapper}}> forwards className to <{{component}}>, which owns its {{category}}."
const NEW_VARIANT_GUARD =
  "only if the design explicitly calls for a treatment none of these provides."
const SPACING_SIZES =
  "Use a size ({{sizes}}), or {{around}} for space around it."
const SPACING_AROUND = "For space around it, use {{around}}."
const SPACING_NEW_SIZE =
  "Add a size in {{file}} only if the design explicitly calls for one."

const MESSAGES = {
  appearanceClass: `${NOT_ALLOWED} ${OWNS} Use one of its variants. Add a new variant only if the design explicitly calls for a treatment none of them provides.`,
  appearanceClassWithVariants: `${NOT_ALLOWED} ${OWNS} Use a variant: {{variants}}. Add a new variant in {{file}} ${NEW_VARIANT_GUARD}`,
  appearanceClassNoVariants: `${NOT_ALLOWED} ${OWNS} Add a variant in {{file}} only if the design explicitly calls for this treatment.`,
  appearanceClassViaWrapper: `"{{className}}" is not allowed on <{{wrapper}}>: ${OWNS_VIA_WRAPPER} Use a variant{{variantsSuffix}}. Add a new variant {{where}} ${NEW_VARIANT_GUARD}`,
  deniedClass: `${NOT_ALLOWED} its contract denies {{entries}}.`,
  layoutClass: `${NOT_ALLOWED} its contract allows {{entries}}. Use one of those, or put layout classes on a parent element.`,
  layoutClassClosed: `${NOT_ALLOWED} its contract allows no classes. Put layout classes on a parent element instead.`,
  unclassifiedClass: `${NOT_ALLOWED} the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates.`,
  // The project's CSS declares it, so Tailwind does generate it. What it
  // changes is unreadable, so the contract still owns the decision.
  declaredClass: `${NOT_ALLOWED} your CSS declares it, and the grammar cannot tell what it changes. Use a variant, or put it on a parent element.`,
  // Padding on a button usually means size; space around it is layout
  // the page owns. A component with no size axis is offered layout only.
  spacingClassWithSizes: `${NOT_ALLOWED} ${OWNS} ${SPACING_SIZES} ${SPACING_NEW_SIZE}`,
  spacingClassNoSizes: `${NOT_ALLOWED} ${OWNS} ${SPACING_AROUND}`,
  spacingClassViaWrapperWithSizes: `"{{className}}" is not allowed on <{{wrapper}}>: ${OWNS_VIA_WRAPPER} ${SPACING_SIZES} ${SPACING_NEW_SIZE}`,
  spacingClassViaWrapperNoSizes: `"{{className}}" is not allowed on <{{wrapper}}>: ${OWNS_VIA_WRAPPER} ${SPACING_AROUND}`,
}

export const noRestyle = {
  meta: {
    type: "problem" as const,
    docs: {
      description:
        "Disallow classes on design-system components except what the rule's allow list and the component's contract permit.",
      url: "https://github.com/shadcn-ui/lint/blob/main/docs/rules/no-restyle.md",
    },
    schema: [
      {
        type: "object",
        properties: {
          allow: entriesSchema,
          deny: entriesSchema,
          message: messageSchema,
          ...recognitionSchema,
          contracts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                pattern: { type: "string" },
                allow: entriesSchema,
                deny: entriesSchema,
                message: messageSchema,
              },
              required: ["pattern"],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: MESSAGES,
  },
  create(context: any) {
    const emit = reporter(context, MESSAGES)
    const options = withSettings(context, context.options?.[0] ?? {})
    const filename = fileOf(context)
    let contracts: ReturnType<typeof compileContracts>
    try {
      contracts = compileContracts(options.contracts, {
        allow: options.allow,
        deny: options.deny,
        message: options.message,
        fromFile: filename,
      })
    } catch (error) {
      return configErrorVisitors(context, error)
    }

    return classSiteVisitors(context, options, (site) => {
      if (!site.component) return
      const component = site.component
      const file = site.componentFile
      const where = file ? displayPath(file, context) : ""
      let details: ReturnType<typeof appearanceDetails> | undefined
      // Read once per site, on the first finding, like the variants.
      let sizes: string[] | null | undefined

      for (const { value, node } of site.contextualStrings) {
        for (const token of splitClasses(value)) {
          const verdict = contracts.decide(component, token)
          if (verdict.kind === "ok") continue
          details ??= appearanceDetails(site)
          if (sizes === undefined) {
            sizes = file ? sizeNamesFor(file, component) : null
          }
          const { messageId, variantNames, variantsSuffix } = details
          // Every finding carries the same slots, whatever the category,
          // so a contract's own words can interpolate any of them.
          const data: Record<string, string> = {
            className: token,
            component,
            entries: verdict.entries.join(" "),
            category: verdict.category,
            variants: variantNames,
            sizes: sizes?.join(", ") ?? "",
            wrapper: site.wrapper ?? "",
            file: where,
          }

          if (
            verdict.kind === "denied" ||
            verdict.category === "layout" ||
            verdict.category === "unclassified"
          ) {
            emit(
              {
                node,
                messageId:
                  verdict.kind === "denied"
                    ? "deniedClass"
                    : verdict.category === "unclassified"
                      ? declaresClass(filename, token)
                        ? "declaredClass"
                        : "unclassifiedClass"
                      : verdict.entries.length
                        ? "layoutClass"
                        : "layoutClassClosed",
                data,
              },
              verdict.message
            )
          } else if (verdict.category === "spacing") {
            emit(
              {
                node,
                messageId: site.wrapper
                  ? sizes
                    ? "spacingClassViaWrapperWithSizes"
                    : "spacingClassViaWrapperNoSizes"
                  : sizes
                    ? "spacingClassWithSizes"
                    : "spacingClassNoSizes",
                data: {
                  ...data,
                  around: aroundFor(
                    site,
                    contracts,
                    component,
                    token,
                    filename
                  ),
                },
              },
              verdict.message
            )
          } else {
            emit(
              {
                node,
                messageId,
                data: {
                  ...data,
                  variantsSuffix,
                  where: where ? `in ${where}` : `to <${component}>`,
                },
              },
              verdict.message
            )
          }
        }
      }
    })
  },
}

// Where space around a component goes, as a noun phrase, built only from
// what this project's contracts actually allow.
function aroundFor(
  site: {
    enclosingContainer: ClassSite["enclosingContainer"]
    closedParent: ClassSite["closedParent"]
  },
  contracts: ReturnType<typeof compileContracts>,
  component: string,
  token: string,
  filename: string | undefined
) {
  const accepts = (name: string) => contracts.decide(name, token).kind === "ok"
  const places: string[] = []
  if (contracts.decide(component, "m-4").kind === "ok") {
    places.push("margin here")
  }
  const container = site.enclosingContainer(accepts)
  if (!container?.direct) {
    places.push(
      site.closedParent(accepts)
        ? "gap on a plain wrapper around it"
        : "gap on the parent"
    )
  }
  if (container) places.push(`spacing on <${container.name}>`)
  const primitives = contracts.primitivesFor(
    token,
    container ? [component, container.name] : [component],
    () => (filename ? componentsFor(filename).files.keys() : [])
  )
  if (primitives.length) places.push(listOf(primitives))
  const last = places.pop()
  if (!places.length) return last
  if (places.length === 1) return `${places[0]} or ${last}`
  return `${places.join(", ")}, or ${last}`
}

// "Row", "Row and Stack", "Row, Stack and Box".
function listOf(names: string[]) {
  if (names.length < 3) return names.join(" and ")
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

// Only diagnostics need variants, so an accepted class parses nothing.
function appearanceDetails(site: ClassSite) {
  const variants = site.componentFile
    ? variantNamesFor(site.componentFile, site.component!)
    : null
  const messageId = site.wrapper
    ? "appearanceClassViaWrapper"
    : !site.componentFile
      ? "appearanceClass"
      : variants
        ? "appearanceClassWithVariants"
        : "appearanceClassNoVariants"
  const variantNames = variants?.join(", ") ?? ""
  const variantsSuffix = variantNames ? `: ${variantNames}` : ""
  return { messageId, variantNames, variantsSuffix }
}
