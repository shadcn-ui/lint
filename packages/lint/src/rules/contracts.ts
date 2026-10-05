// The policy engine every class rule shares. What the options mean is
// documented in docs/rules.md.

import { CATEGORIES, categoryOf } from "../grammar/categories"
import { isMarkerClass, normalizeClass } from "../grammar/classes"
import { resolveCnConfig, themedCnConfig } from "../grammar/classifier"
import { didYouMean } from "../grammar/similar"
import { projectClassifierFor } from "../project/namespaces"
import { knownClassesFor } from "../project/theme"
import { warnOnce } from "../project/warn"
import { checkMessage } from "./messages"

type Classifier = ReturnType<typeof projectClassifierFor>

export type MessageKey = (typeof CATEGORIES)[number] | "layout" | "default"

export type ContractInput = {
  pattern: string
  allow?: string[]
  deny?: string[]
  message?: string | Partial<Record<MessageKey, string>>
}

export type PolicyInput = {
  allow?: string[]
  deny?: string[]
  message?: ContractInput["message"]
  // no-unknown-classes exempts classes nothing knows, so its entries
  // cannot be checked against what is known.
  uncheckedEntries?: boolean
}

type EntrySet = {
  source: string[]
  categories: Set<string>
  // Unclassified is not layout: only an entry by name opens it.
  layout: boolean
  groups: Set<string>
  basePatterns: RegExp[]
  fullPatterns: RegExp[]
}

function globToRegExp(glob: string) {
  const escaped = glob
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^\\s]+")
  return new RegExp(`^${escaped}$`)
}

function compileEntries(
  entries: string[] | undefined,
  groupIds: Set<string>,
  classifier: Classifier
) {
  const set: EntrySet = {
    source: entries ?? [],
    categories: new Set(),
    layout: false,
    groups: new Set(),
    basePatterns: [],
    fullPatterns: [],
  }
  for (const raw of entries ?? []) {
    if (raw === "layout") set.layout = true
    else if ((CATEGORIES as readonly string[]).includes(raw))
      set.categories.add(raw)
    else if (raw.includes(":")) set.fullPatterns.push(globToRegExp(raw))
    else {
      const entry = stripModifier(normalizeClass(raw), classifier)
      // "flex" is a group id and a class; such an entry opens both.
      if (groupIds.has(entry)) set.groups.add(entry)
      if (!groupIds.has(entry) || classifier.groupOf(entry)) {
        set.basePatterns.push(globToRegExp(entry))
      }
    }
  }
  return set
}

// An opacity or line height is not part of the utility, but a fraction
// is the value itself: w-1/2 keeps it, bg-red-500/50 does not.
function stripModifier(base: string, classifier: Classifier) {
  if (
    /-\d+\/\d+$/.test(base) &&
    categoryOf(classifier.groupOf(base)) !== "color"
  ) {
    return base
  }
  return base.replace(/\/[\w.%]+$/, "")
}

function matches(set: EntrySet, token: string, classifier: Classifier) {
  if (!set.source.length) return false
  const group = classifier.groupOf(token)
  if (group && set.groups.has(group)) return true
  const category = categoryOf(group)
  if (category && set.categories.has(category)) return true
  if (!category && set.layout && (group || isMarkerClass(token))) return true
  const base = stripModifier(normalizeClass(token), classifier)
  if (set.basePatterns.some((re) => re.test(base))) return true
  if (set.fullPatterns.some((re) => re.test(token))) return true
  return false
}

const groupIdsByConfig = new WeakMap<object, Set<string>>()

function groupIdsFor(config: object & { classGroups: object }) {
  let ids = groupIdsByConfig.get(config)
  if (!ids) {
    ids = new Set(Object.keys(config.classGroups))
    groupIdsByConfig.set(config, ids)
  }
  return ids
}

// Per grammar and option value, so a thousand files compile once. The
// themed grammar, so a project's own scales and an edited theme are read.
const compiledByConfig = new WeakMap<object, Map<string, unknown>>()

function compiledOnce<T>(
  fromFile: string | undefined,
  key: string,
  build: () => T
) {
  const config = themedCnConfig(fromFile)
  let byKey = compiledByConfig.get(config)
  if (!byKey) {
    byKey = new Map()
    compiledByConfig.set(config, byKey)
  }
  let value = byKey.get(key) as T | undefined
  if (value === undefined) {
    value = build()
    byKey.set(key, value)
  }
  return value
}

// The same matching as a contract, for a rule's bare `allow`.
export function createMatcher(
  entries: string[] | undefined,
  fromFile?: string
) {
  return compiledOnce(
    fromFile,
    `matcher:${JSON.stringify(entries ?? [])}`,
    () => {
      const classifier = projectClassifierFor(fromFile)
      const set = compileEntries(
        entries,
        groupIdsFor(resolveCnConfig(fromFile)),
        classifier
      )
      return (token: string) => matches(set, token, classifier)
    }
  )
}

// `entries` is the list that decided: the deny that matched, or the
// allow that did not.
export type Verdict =
  | { kind: "ok" }
  | {
      kind: "denied"
      entries: string[]
      category: string
      message: string | null
    }
  | {
      kind: "not-allowed"
      entries: string[]
      category: string
      message: string | null
    }

function messageTable(message: ContractInput["message"]) {
  if (typeof message === "string") return { default: message }
  if (!message || typeof message !== "object") return null
  const table: Record<string, string> = {}
  for (const [key, value] of Object.entries(message)) {
    if (typeof value === "string") table[key] = value
  }
  return Object.keys(table).length ? table : null
}

export function compileContracts(
  inputs: ContractInput[] | undefined,
  options: PolicyInput & { fromFile?: string } = {}
) {
  // Absent and empty lists mean different things, so both stay in the key.
  const key = `contracts:${JSON.stringify([options.allow ?? null, options.deny ?? null, options.message ?? null, options.uncheckedEntries ?? false, inputs ?? []])}`
  return compiledOnce(options.fromFile, key, () =>
    buildContracts(inputs, options)
  )
}

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

function compilePattern(pattern: string) {
  try {
    return new RegExp(pattern)
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error
    }
    throw new ContractConfigError(
      `Contract pattern "${pattern}" is not a valid regular expression.`
    )
  }
}

// An entry that matches nothing enforces nothing, silently, which is the
// one failure an enforcement tool must not have. A near-miss of a real
// name (spacig) is an error; any other unknown literal may be a plugin's
// class (prose, btn), so it warns and matches by name.
function checkEntries(
  entries: string[] | undefined,
  groupIds: Set<string>,
  classifier: Classifier,
  fromFile: string | undefined
) {
  for (const entry of entries ?? []) {
    if (entry === "layout" || entry.includes("*") || entry.includes(":"))
      continue
    if ((CATEGORIES as readonly string[]).includes(entry)) continue
    if (groupIds.has(entry)) continue
    if (classifier.groupOf(entry)) continue
    const known = fromFile ? knownClassesFor(fromFile) : null
    if (known?.utilities.has(entry) || known?.classes.has(entry)) continue
    const hint = /^[A-Za-z][A-Za-z0-9]*$/.test(entry)
      ? didYouMean(entry, [...CATEGORIES, "layout", ...groupIds])
      : null
    if (hint) {
      throw new ContractConfigError(
        `Contract entry "${entry}" is not a category (${[...CATEGORIES, "layout"].join(", ")}), a class group, or a class, so it would match nothing. Did you mean "${hint}"?`
      )
    }
    warnOnce(
      `contract-entry:${entry}`,
      `Contract entry "${entry}" is not a category (${[...CATEGORIES, "layout"].join(", ")}), a class group, or a class cn or your theme knows; it matches only a class named exactly that.`
    )
  }
}

// Adds the mistake a bare `allow` invites: a palette color written
// without its utility, "blue-500" for "*-blue-500".
export function checkAllowEntries(
  entries: string[] | undefined,
  fromFile: string | undefined,
  rule: string
) {
  if (!entries?.length) return
  const classifier = projectClassifierFor(fromFile)
  const groupIds = groupIdsFor(resolveCnConfig(fromFile))
  for (const entry of entries) {
    if (
      /^[a-z]+-\d{2,3}$/.test(entry) &&
      !groupIds.has(entry) &&
      !classifier.groupOf(entry)
    ) {
      throw new ContractConfigError(
        `${rule}: allow entry "${entry}" names a color, not a class, so it would match nothing. Did you mean "*-${entry}" (the color on any utility), or "bg-${entry}"?`
      )
    }
  }
  checkEntries(entries, groupIds, classifier, fromFile)
}

// The same engine, where `ok` means exempt from the rule.
export function compileVocabularyPolicy(
  options: PolicyInput & { contracts?: ContractInput[]; fromFile?: string },
  rule: string
) {
  if (!options.uncheckedEntries) {
    checkAllowEntries(options.allow, options.fromFile, rule)
    checkAllowEntries(options.deny, options.fromFile, rule)
    for (const c of options.contracts ?? []) {
      checkAllowEntries(c.allow, options.fromFile, rule)
      checkAllowEntries(c.deny, options.fromFile, rule)
    }
  }
  return compileContracts(options.contracts, {
    allow: options.allow,
    deny: options.deny,
    message: options.message,
    uncheckedEntries: options.uncheckedEntries,
    fromFile: options.fromFile,
  })
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

function buildContracts(
  inputs: ContractInput[] | undefined,
  options: PolicyInput & { fromFile?: string }
) {
  const classifier = projectClassifierFor(options.fromFile)
  const groupIds = groupIdsFor(resolveCnConfig(options.fromFile))
  // Entries first, so a typo is named before a list that does nothing.
  if (!options.uncheckedEntries) {
    checkEntries(options.allow, groupIds, classifier, options.fromFile)
    checkEntries(options.deny, groupIds, classifier, options.fromFile)
    for (const c of inputs ?? []) {
      checkEntries(c.allow, groupIds, classifier, options.fromFile)
      checkEntries(c.deny, groupIds, classifier, options.fromFile)
    }
  }

  const topAllow = allowListOf(options)
  const topDeny = options.deny ?? []
  const compiled = (inputs ?? []).map((c) => {
    const pattern = compilePattern(c.pattern)
    const message = messageTable(c.message)
    for (const text of Object.values(message ?? {}))
      checkMessage(text, c.pattern)
    return {
      pattern,
      allow: compileEntries(allowListOf(c, topAllow), groupIds, classifier),
      deny: compileEntries(c.deny ?? topDeny, groupIds, classifier),
      message,
    }
  })
  const baselineMessage = messageTable(options.message)
  for (const text of Object.values(baselineMessage ?? {})) {
    checkMessage(text, "no-restyle")
  }
  const baseline = {
    allow: compileEntries(topAllow, groupIds, classifier),
    deny: compileEntries(topDeny, groupIds, classifier),
    message: baselineMessage,
  }
  type Policy = (typeof compiled)[number] | typeof baseline
  const cache = new Map<string, Policy>()
  // (component, token) pairs repeat across a project.
  const verdicts = new Map<string, Verdict>()

  const policyFor = (name: string): Policy => {
    const cached = cache.get(name)
    if (cached) return cached
    let policy: Policy = baseline
    for (let i = compiled.length - 1; i >= 0; i--) {
      if (compiled[i].pattern.test(name)) {
        policy = compiled[i]
        break
      }
    }
    cache.set(name, policy)
    return policy
  }

  // A class on no recognized component takes the top-level policy.
  const decide = (component: string | null, token: string): Verdict => {
    const key = `${component ?? ""}\u0000${token}`
    const known = verdicts.get(key)
    if (known) return known
    if (verdicts.size > 50_000) verdicts.clear()
    const verdict = decideUncached(component, token)
    verdicts.set(key, verdict)
    return verdict
  }

  const decideUncached = (component: string | null, token: string): Verdict => {
    const policy = component === null ? baseline : policyFor(component)
    const group = classifier.groupOf(token)
    // A marker (group/name, peer) is layout; a name the grammar cannot
    // classify is neither layout nor appearance.
    const category =
      group || isMarkerClass(token)
        ? (categoryOf(group) ?? "layout")
        : "unclassified"
    const words = (table: typeof policy.message) =>
      table ? (table[category] ?? table.default ?? null) : null
    const message = words(policy.message) ?? words(baseline.message)
    if (matches(policy.deny, token, classifier)) {
      return { kind: "denied", entries: policy.deny.source, category, message }
    }
    if (matches(policy.allow, token, classifier)) return { kind: "ok" }
    return {
      kind: "not-allowed",
      entries: policy.allow.source,
      category,
      message,
    }
  }

  // Components a contract lets this class onto, for a spacing message.
  // More than four names is a pattern, not a list, so it is dropped.
  const primitivesFor = (
    token: string,
    except: Iterable<string>,
    indexed: () => Iterable<string>
  ) => {
    const granting = compiled.filter((c) => matches(c.allow, token, classifier))
    if (!granting.length) return []
    const names = new Set<string>()
    for (const c of granting)
      for (const n of literalNames(c.pattern)) names.add(n)
    for (const n of indexed()) names.add(n)
    const covered = new Set(except)
    const out: string[] = []
    for (const name of names) {
      if (covered.has(name)) continue
      if (!granting.some((c) => c.pattern.test(name))) continue
      if (decide(name, token).kind !== "ok") continue
      out.push(name)
      if (out.length > 4) return []
    }
    return out
  }

  return { decide, primitivesFor }
}

// The names ^Row$ or ^(Row|Stack|Box)$ spell out; else none.
function literalNames(pattern: RegExp) {
  const inner = pattern.source
    .replace(/^\^/, "")
    .replace(/\$$/, "")
    .replace(/^\((?:\?:)?/, "")
    .replace(/\)$/, "")
  const parts = inner.split("|")
  return parts.every((part) => /^[A-Za-z_$][\w$]*$/.test(part)) ? parts : []
}
