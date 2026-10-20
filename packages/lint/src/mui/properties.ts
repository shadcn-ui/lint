const sides = (base: string) =>
  ["Top", "Right", "Bottom", "Left"].map((side) => `${base}${side}`)

const aliases: Record<string, string[]> = {
  p: sides("padding"),
  padding: sides("padding"),
  px: ["paddingLeft", "paddingRight"],
  py: ["paddingTop", "paddingBottom"],
  pt: ["paddingTop"],
  pr: ["paddingRight"],
  pb: ["paddingBottom"],
  pl: ["paddingLeft"],
  m: sides("margin"),
  margin: sides("margin"),
  mx: ["marginLeft", "marginRight"],
  my: ["marginTop", "marginBottom"],
  mt: ["marginTop"],
  mr: ["marginRight"],
  mb: ["marginBottom"],
  ml: ["marginLeft"],
  bgcolor: ["backgroundColor"],
  borderColor: sides("border").map((key) => `${key}Color`),
}

export function propertiesOf(property: string): string[] {
  if (property.startsWith("--")) return [property]
  const camel = property.replace(/-([a-z])/g, (_, letter: string) =>
    letter.toUpperCase()
  )
  return Object.hasOwn(aliases, camel) ? aliases[camel] : [camel]
}

export function normalizePolicy<
  T extends { allow?: string[]; deny?: string[]; contracts?: any[] },
>(options: T): T {
  const normalize = (entries: string[] | undefined) =>
    entries?.flatMap(propertiesOf)
  return {
    ...options,
    ...(options.allow !== undefined ? { allow: normalize(options.allow) } : {}),
    ...(options.deny !== undefined ? { deny: normalize(options.deny) } : {}),
    ...(options.contracts
      ? {
          contracts: options.contracts.map((contract) =>
            normalizePolicy(contract)
          ),
        }
      : {}),
  }
}

export const colorProperties = new Set([
  "color",
  "background",
  "backgroundColor",
  "backgroundImage",
  "border",
  ...sides("border"),
  ...["Block", "Inline"].flatMap((axis) =>
    ["", "Start", "End"].flatMap((edge) => [
      `border${axis}${edge}`,
      `border${axis}${edge}Color`,
    ])
  ),
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
  "outline",
  "boxShadow",
  "textShadow",
  "fill",
  "stroke",
])
