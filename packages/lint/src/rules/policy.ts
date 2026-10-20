// Thrown here, reported at the top of the file: Oxlint prints an
// uncaught error as a stack trace its extension hides in a log.
export class ContractConfigError extends Error {}

// A rule whose policy does not compile reports the error and nothing
// else: enforcing a policy the team did not write would be worse.
export function configErrorVisitors(context: any, error: unknown) {
  if (!(error instanceof ContractConfigError)) throw error
  const message = error.message
  return {
    Program(node: any) {
      context.report({ node, loc: { line: 1, column: 0 }, message })
    },
  }
}

// What a policy allows when it writes no `allow` (docs/rules.md).
export function allowListOf(
  policy: { allow?: string[]; deny?: string[] },
  inherited?: string[]
) {
  if (policy.allow !== undefined) return policy.allow
  if (inherited !== undefined) return inherited
  return policy.deny !== undefined ? ["*"] : []
}
