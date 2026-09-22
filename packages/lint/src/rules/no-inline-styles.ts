// no-inline-styles: the style attribute is the oldest escape hatch around
// class-based enforcement. CSS custom properties are the exception, and a
// hardcoded color in one is that exception being laundered, so it is
// followed one hop. See docs/rules/no-inline-styles.md.

import { parseColor } from "../grammar/colors"
import {
  forwardedValuesOf,
  isForwardedProp,
  objectEntries,
  resolveIdentifier,
  resolveMemberValue,
  resolveObject,
  resolveProperty,
} from "../sites/collect"
import {
  addVisitor,
  isContainer,
  isMarkupLiteral,
  readerFor,
  type Visitors,
} from "../sites/readers"
import {
  allowListOf,
  configErrorVisitors,
  ContractConfigError,
} from "./contracts"
import { reporter } from "./messages"
import { policySchema } from "./policy-schema"

const COLOR_FUNCTION =
  /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|oklch|oklab|lab|lch|color|color-mix|light-dark)\(/i

// URL payloads, quoted strings and comments are not color values.
function colorValueText(value: string) {
  let text = ""
  let quote = ""
  let urlDepth = 0
  for (let i = 0; i < value.length; i++) {
    const char = value[i]
    if (quote) {
      if (char === "\\") i++
      else if (char === quote) quote = ""
      continue
    }
    if (char === "/" && value[i + 1] === "*") {
      const end = value.indexOf("*/", i + 2)
      i = end === -1 ? value.length : end + 1
      text += " "
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      text += " "
      continue
    }
    if (char === "\\") {
      if (!urlDepth) text += value.slice(i, i + 2)
      i++
      continue
    }
    if (urlDepth) {
      if (char === "(") urlDepth++
      else if (char === ")") urlDepth--
      continue
    }
    if (
      value.slice(i, i + 4).toLowerCase() === "url(" &&
      (i === 0 || !/[\w-]/.test(value[i - 1]))
    ) {
      urlDepth = 1
      i += 3
      text += " "
      continue
    }
    text += char
  }
  return text
}

// The value, or any leaf of it outside var(), read as a color.
function hasRawColor(value: string) {
  const text = colorValueText(value)
  if (COLOR_FUNCTION.test(text) || parseColor(text) !== null) return true
  const leaves = text.replace(/var\([^)]*\)/gi, " ").split(/[\s,()/]+/)
  return leaves.some((leaf) => leaf && parseColor(leaf) !== null)
}

// Unwraps `as React.CSSProperties`, `satisfies`, and `!`.
function unwrap(node: any) {
  while (
    node &&
    (node.type === "TSAsExpression" ||
      node.type === "TSSatisfiesExpression" ||
      node.type === "TSNonNullExpression")
  ) {
    node = node.expression
  }
  return node
}

// Property names as CSS spells them, so backgroundColor and
// background-color are one name. A custom property is its own name.
function cssPropertyName(name: string) {
  if (name.startsWith("--")) return name
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).toLowerCase()
}

// Names or globs (border-*, --chart-*). The mistake this option invites
// is a class, caught by shape: no standard property carries a digit.
function propertyMatcher(entries: string[] | undefined) {
  const patterns = (entries ?? []).map((entry) => {
    const custom = /^--[\w*-]+$/.test(entry)
    if (!custom && !/^[a-zA-Z*][a-zA-Z*-]*$/.test(entry)) {
      throw new ContractConfigError(
        `shadcn/no-inline-styles: entry "${entry}" is not a CSS property name (backgroundColor, background-color, border-*, --chart-1), so it would match nothing.`
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
function compilePropertyPolicy(options: {
  allow?: string[]
  deny?: string[]
  message?: string
  contracts?: {
    pattern: string
    allow?: string[]
    deny?: string[]
    message?: string
  }[]
}) {
  const topAllow = allowListOf(options)
  const topDeny = options.deny ?? []
  const compile = (
    policy: { allow?: string[]; deny?: string[]; message?: string },
    inherited?: { allow: string[]; deny: string[] }
  ) => ({
    allow: propertyMatcher(allowListOf(policy, inherited?.allow)),
    deny: propertyMatcher(policy.deny ?? inherited?.deny),
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

// A hardcoded color, in the expression or one hop away in a same-file
// variable or lookup table: glowColorMap[tone] judges glowColorMap.
function carriesRawColor(
  node: any,
  context: any,
  seen = new Set<any>()
): boolean {
  node = unwrap(node)
  if (!node) return false
  switch (node.type) {
    case "Literal":
      return typeof node.value === "string" && hasRawColor(node.value)
    case "TemplateLiteral":
      // Never join fragments into a color name not in the source.
      return hasRawColor(
        node.quasis.map((q: any) => q.value?.cooked ?? "").join("\uFFFC")
      )
    case "ConditionalExpression":
      return (
        carriesRawColor(node.consequent, context, seen) ||
        carriesRawColor(node.alternate, context, seen)
      )
    case "LogicalExpression":
      return (
        carriesRawColor(node.left, context, seen) ||
        carriesRawColor(node.right, context, seen)
      )
    case "ObjectExpression":
      return node.properties.some(
        (p: any) =>
          p.type === "Property" && carriesRawColor(p.value, context, seen)
      )
    case "ArrayExpression":
      return node.elements.some((el: any) => carriesRawColor(el, context, seen))
    case "Identifier": {
      const init = resolveIdentifier(node, context, seen)?.init
      return init ? carriesRawColor(init, context, seen) : false
    }
    case "MemberExpression": {
      if (node.object?.type === "Identifier") {
        const init = resolveIdentifier(node.object, context, seen)?.init
        return init ? carriesRawColor(init, context, seen) : false
      }
      return carriesRawColor(node.object, context, seen)
    }
    default:
      return false
  }
}

// Declarations of a style attribute. A `;` inside quotes or parentheses
// (`--label: 'a; b'`, `url(data:...;base64,...)`) is part of the value.
function splitDeclarations(css: string) {
  const out: string[] = []
  let start = 0
  let depth = 0
  let quote = ""
  for (let i = 0; i < css.length; i++) {
    const char = css[i]
    if (quote) {
      if (char === "\\") i++
      else if (char === quote) quote = ""
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === "(") {
      depth++
    } else if (char === ")") {
      depth = Math.max(0, depth - 1)
    } else if (char === ";" && depth === 0) {
      out.push(css.slice(start, i))
      start = i + 1
    }
  }
  out.push(css.slice(start))
  return out
}

// A style written as CSS text: a string, or a template whose holes are
// kept as holes so no color is read across one.
function cssTextOf(node: any) {
  if (
    (node?.type === "Literal" || isMarkupLiteral(node)) &&
    typeof node.value === "string"
  ) {
    return node.value as string
  }
  if (node?.type === "TemplateLiteral") {
    return node.quasis
      .map((q: any) => q.value?.cooked ?? "")
      .join("\uFFFC") as string
  }
  return null
}

const MESSAGES = {
  inlineStyle:
    "Inline style sets {{property}}. Style through classes; use CSS custom properties for dynamic values.",
  dynamicStyle:
    "Dynamic style object cannot be checked. Build it from CSS custom properties only.",
  customPropColor:
    "Custom property {{property}} hardcodes a color. Define it as a theme token instead of injecting a raw value.",
  styleElement:
    "A <style> element injects CSS outside the design system. Use classes, or declare the rule in your theme CSS.",
}

export const noInlineStyles = {
  meta: {
    type: "problem" as const,
    docs: {
      description:
        "Disallow inline style attributes, except CSS custom properties.",
      url: "https://github.com/shadcn-ui/lint/blob/main/docs/rules/no-inline-styles.md",
    },
    schema: [
      {
        type: "object",
        properties: policySchema,
        additionalProperties: false,
      },
    ],
    messages: MESSAGES,
  },
  create(context: any) {
    const options = context.options?.[0] ?? {}
    const emit = reporter(context, MESSAGES, {
      rule: "shadcn/no-inline-styles",
      message: options.message,
    })
    let policy: ReturnType<typeof compilePropertyPolicy>
    try {
      policy = compilePropertyPolicy(options)
    } catch (error) {
      return configErrorVisitors(context, error)
    }
    // The tag as written (Text, motion.div, UI.Button). A lowercase
    // identifier is intrinsic and takes the top-level policy.
    const reader = readerFor(context)
    const elementName = (attribute: any) => {
      const name = reader.nameOf(reader.elementOf(attribute))
      return name?.component ? name.text : ""
    }
    // One property against the policy. `text` is the value when it was
    // written as CSS rather than as an expression.
    const judge = (
      key: string,
      value: any,
      component: string,
      text?: string
    ) => {
      const verdict = policy.decide(component, key)
      if (verdict.exempt) return
      const messageId = !key.startsWith("--")
        ? "inlineStyle"
        : (
              text === undefined
                ? carriesRawColor(value, context)
                : hasRawColor(text)
            )
          ? "customPropColor"
          : null
      if (!messageId) return
      emit(
        { node: value, messageId, data: { property: key, component } },
        verdict.message
      )
    }
    // `style="color: red; --tone: #fff"`, the way markup writes a style.
    const judgeDeclarations = (
      css: string,
      reportAt: any,
      component: string
    ) => {
      for (const declaration of splitDeclarations(css)) {
        const colon = declaration.indexOf(":")
        if (colon === -1) continue
        const property = declaration.slice(0, colon).trim()
        if (!property) continue
        judge(property, reportAt, component, declaration.slice(colon + 1))
      }
    }
    // `reportAt` is the node diagnostics attach to.
    const check = (
      expr: any,
      reportAt: any,
      seen = new Set<any>(),
      component = ""
    ): void => {
      expr = unwrap(expr)
      if (!expr) return
      const forwarded = forwardedValuesOf(expr, context, "style", seen)
      if (forwarded && !seen.has(forwarded.variable)) {
        seen.add(forwarded.variable)
        for (const alternative of forwarded.alternatives) {
          if ("unresolved" in alternative) {
            emit(
              {
                node: reportAt,
                messageId: "dynamicStyle",
                data: { component },
              },
              policy.wordsFor(component)
            )
          } else {
            check(alternative.value, reportAt, seen, component)
          }
        }
        seen.delete(forwarded.variable)
        return
      }
      if (
        (expr.type === "Identifier" && expr.name === "undefined") ||
        (expr.type === "Literal" && expr.value === null)
      ) {
        return
      }
      if (reader.staticStyles) {
        const css = cssTextOf(expr)
        if (css !== null) return judgeDeclarations(css, reportAt, component)
      }
      // Each branch is a style value of its own. The left of && is the
      // condition, not a value; both sides of || and ?? are values.
      if (expr.type === "ConditionalExpression") {
        check(expr.consequent, expr.consequent, seen, component)
        check(expr.alternate, expr.alternate, seen, component)
        return
      }
      if (expr.type === "LogicalExpression") {
        if (expr.operator !== "&&") check(expr.left, expr.left, seen, component)
        check(expr.right, expr.right, seen, component)
        return
      }
      if (expr.type === "Identifier") {
        const init = resolveIdentifier(expr, context, seen)?.init
        if (init) return check(init, reportAt, seen, component)
        emit(
          { node: reportAt, messageId: "dynamicStyle", data: { component } },
          policy.wordsFor(component)
        )
        return
      }
      if (expr.type === "MemberExpression") {
        const found = resolveMemberValue(expr, context, seen)
        if (!("unresolved" in found) && found.value) {
          return check(found.value, reportAt, seen, component)
        }
      }
      if (expr.type !== "ObjectExpression") {
        emit(
          { node: reportAt, messageId: "dynamicStyle", data: { component } },
          policy.wordsFor(component)
        )
        return
      }
      const properties = new Map<string, any>()
      for (const entry of objectEntries(expr, context, seen)) {
        if ("unknown" in entry) {
          const prop = entry.unknown
          if (
            prop.type === "SpreadElement" &&
            isForwardedProp(unwrap(prop.argument), context, "style")
          ) {
            check(prop.argument, prop, seen, component)
            continue
          }
          emit(
            { node: prop, messageId: "dynamicStyle", data: { component } },
            policy.wordsFor(component)
          )
          continue
        }
        properties.set(entry.key, entry.value)
      }
      for (const [key, value] of properties) judge(key, value, component)
    }

    const visitors: Visitors = {
      JSXOpeningElement(node: any) {
        if (node.name?.type === "JSXIdentifier" && node.name.name === "style") {
          emit({ node, messageId: "styleElement" })
        }
      },
    }
    for (const type of reader.attributes) {
      addVisitor(visitors, type, (node: any) => {
        if (reader.attributeName(node) !== "style") return
        const value = reader.attributeValue(node)
        if (isContainer(value)) {
          check(
            value.expression,
            value.expression,
            new Set(),
            elementName(node)
          )
        } else if (reader.staticStyles && value) {
          check(value, value, new Set(), elementName(node))
        }
      })
    }
    for (const [type, read] of Object.entries(reader.styleProperties ?? {})) {
      visitors[type] = (node: any) => {
        const style = read(node)
        if (!style) return
        const value = isContainer(style.value)
          ? style.value.expression
          : style.value
        const text = cssTextOf(value)
        judge(
          style.property,
          text === null ? value : node,
          elementName(node),
          text ?? undefined
        )
      }
    }
    // {...{ style }} and {...props}: the style property is judged like
    // the attribute.
    for (const type of reader.spreads) {
      addVisitor(visitors, type, (node: any) => {
        const object = resolveObject(
          reader.spreadArgument(node),
          context,
          new Set()
        )
        if (!object) return
        const { value, uncertain } = resolveProperty(
          object,
          "style",
          context,
          new Set()
        )
        if (!value) return
        const component = elementName(node)
        if (uncertain) {
          emit(
            { node, messageId: "dynamicStyle", data: { component } },
            policy.wordsFor(component)
          )
        } else {
          check(value, value, new Set(), component)
        }
      })
    }
    return visitors
  },
}
