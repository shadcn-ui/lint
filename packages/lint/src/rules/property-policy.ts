import { allowListOf, ContractConfigError } from "./policy"

function cssPropertyName(name: string) {
  if (name.startsWith("--")) return name
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).toLowerCase()
}

// Names or globs (border-*, --chart-*). The mistake this option invites
// is a class, caught by shape: no standard property carries a digit.
function propertyMatcher(entries: string[] | undefined, label: string) {
  const patterns = (entries ?? []).map((entry) => {
    const custom = /^--[\w*-]+$/.test(entry)
    if (!custom && !/^[a-zA-Z*][a-zA-Z*-]*$/.test(entry)) {
      throw new ContractConfigError(
        `${label}: entry "${entry}" is not a CSS property name (backgroundColor, background-color, border-*, --chart-1), so it would match nothing.`
      )
    }
    return new RegExp(`^${cssPropertyName(entry).replace(/\*/g, ".*")}$`)
  })
  return (property: string) => {
    const name = cssPropertyName(property)
    return patterns.some((pattern) => pattern.test(name))
  }
}

// The shared policy shape, over property names (docs/rules.md).
export function compilePropertyPolicy(
  options: {
    allow?: string[]
    deny?: string[]
    message?: string
    contracts?: {
      pattern: string
      allow?: string[]
      deny?: string[]
      message?: string
    }[]
  },
  label = "shadcn/no-inline-styles"
) {
  const topAllow = allowListOf(options)
  const topDeny = options.deny ?? []
  const compile = (
    policy: { allow?: string[]; deny?: string[]; message?: string },
    inherited?: { allow: string[]; deny: string[] }
  ) => ({
    allow: propertyMatcher(allowListOf(policy, inherited?.allow), label),
    deny: propertyMatcher(policy.deny ?? inherited?.deny, label),
    message: (inherited ? policy.message : undefined) ?? null,
  })
  const baseline = compile(options)
  const contracts = (options.contracts ?? []).map((c) => {
    let pattern: RegExp
    try {
      pattern = new RegExp(c.pattern)
    } catch {
      throw new ContractConfigError(
        `Contract pattern "${c.pattern}" is not a valid regular expression.`
      )
    }
    return { pattern, ...compile(c, { allow: topAllow, deny: topDeny }) }
  })
  const policyFor = (component: string) => {
    for (let i = contracts.length - 1; i >= 0; i--) {
      if (contracts[i].pattern.test(component)) return contracts[i]
    }
    return baseline
  }
  const decide = (component: string, property: string) => {
    const policy = component ? policyFor(component) : baseline
    if (policy.deny(property)) return { exempt: false, message: policy.message }
    if (policy.allow(property)) return { exempt: true, message: null }
    return { exempt: false, message: policy.message }
  }
  // The component's words for a finding about no single property.
  const wordsFor = (component: string) =>
    component ? policyFor(component).message : null
  return { decide, wordsFor }
}
