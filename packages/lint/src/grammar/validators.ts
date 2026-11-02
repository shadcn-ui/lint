// Ported verbatim from shadcn-ui/cn (packages/cn/src/validators.ts, MIT),
// itself matching tailwind-merge 3.6.0's src/lib/validators.ts (MIT, Dany
// Castillo — see README.md). cn ships these only in marker form
// ({ $v: "isNumber" }), so the predicates are reproduced here and looked
// up by name.

const arbitraryValueRegex = /^\[(?:(\w[\w-]*):)?(.+)\]$/i
const arbitraryVariableRegex = /^\((?:(\w[\w-]*):)?(.+)\)$/i
const fractionRegex = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/
const tshirtUnitRegex = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/
// tailwind-merge's \d+ before the unit and .+ inside the function retry
// from every digit and every function name, which is quadratic on a
// long value. One digit gives the same answers, and only the first
// function can close: a later one's ")" closes the first one too.
const lengthUnitRegex =
  /\d(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|^0$/
const lengthFunctionRegex = /\b(calc|min|max|clamp)\(/
const colorFunctionRegex = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/
// (\d*\.)?\d+ for tailwind-merge's (\d+)?\.?(\d+): the same numbers,
// without trying every split of a run of digits.
const shadowRegex = /^(inset_)?-?((\d*\.)?\d+[a-z]+|0)_-?((\d*\.)?\d+[a-z]+|0)/
const imageRegex =
  /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/

export const isFraction = (v: string) => fractionRegex.test(v)
export const isNumber = (v: string) => !!v && !Number.isNaN(Number(v))
export const isInteger = (v: string) => !!v && Number.isInteger(Number(v))
export const isPercent = (v: string) =>
  v.endsWith("%") && isNumber(v.slice(0, -1))
export const isTshirtSize = (v: string) => tshirtUnitRegex.test(v)
export const isAny = () => true

const isLengthFunction = (v: string) => {
  const match = lengthFunctionRegex.exec(v)
  return !!match && v.includes(")", match.index + match[0].length + 1)
}
const isLengthOnly = (v: string) =>
  (lengthUnitRegex.test(v) || isLengthFunction(v)) &&
  !colorFunctionRegex.test(v)
const isNever = () => false
const isShadow = (v: string) => shadowRegex.test(v)
const isImage = (v: string) => imageRegex.test(v)

export const isAnyNonArbitrary = (v: string) =>
  !isArbitraryValue(v) && !isArbitraryVariable(v)

export const isNamedContainerQuery = (v: string) =>
  v.startsWith("@container") &&
  ((v[10] === "/" && v[11] !== undefined) ||
    (v[11] === "s" && v[16] !== undefined && v.startsWith("-size/", 10)) ||
    (v[11] === "n" && v[18] !== undefined && v.startsWith("-normal/", 10)))

type LabelTest = (label: string) => boolean
type ValueTest = (value: string) => boolean

const getIsArbitraryValue = (
  value: string,
  testLabel: LabelTest,
  testValue: ValueTest
) => {
  const result = arbitraryValueRegex.exec(value)
  if (result) {
    if (result[1]) return testLabel(result[1])
    return testValue(result[2]!)
  }
  return false
}

const getIsArbitraryVariable = (
  value: string,
  testLabel: LabelTest,
  shouldMatchNoLabel = false
) => {
  const result = arbitraryVariableRegex.exec(value)
  if (result) {
    if (result[1]) return testLabel(result[1])
    return shouldMatchNoLabel
  }
  return false
}

const isLabelPosition = (l: string) => l === "position" || l === "percentage"
const isLabelImage = (l: string) => l === "image" || l === "url"
const isLabelSize = (l: string) =>
  l === "length" || l === "size" || l === "bg-size"
const isLabelLength = (l: string) => l === "length"
const isLabelNumber = (l: string) => l === "number"
const isLabelFamilyName = (l: string) => l === "family-name"
const isLabelWeight = (l: string) => l === "number" || l === "weight"
const isLabelShadow = (l: string) => l === "shadow"

export const isArbitrarySize = (v: string) =>
  getIsArbitraryValue(v, isLabelSize, isNever)
export const isArbitraryValue = (v: string) => arbitraryValueRegex.test(v)
export const isArbitraryLength = (v: string) =>
  getIsArbitraryValue(v, isLabelLength, isLengthOnly)
export const isArbitraryNumber = (v: string) =>
  getIsArbitraryValue(v, isLabelNumber, isNumber)
export const isArbitraryWeight = (v: string) =>
  getIsArbitraryValue(v, isLabelWeight, isAny)
export const isArbitraryFamilyName = (v: string) =>
  getIsArbitraryValue(v, isLabelFamilyName, isNever)
export const isArbitraryPosition = (v: string) =>
  getIsArbitraryValue(v, isLabelPosition, isNever)
export const isArbitraryImage = (v: string) =>
  getIsArbitraryValue(v, isLabelImage, isImage)
export const isArbitraryShadow = (v: string) =>
  getIsArbitraryValue(v, isLabelShadow, isShadow)
export const isArbitraryVariable = (v: string) => arbitraryVariableRegex.test(v)
export const isArbitraryVariableLength = (v: string) =>
  getIsArbitraryVariable(v, isLabelLength)
export const isArbitraryVariableFamilyName = (v: string) =>
  getIsArbitraryVariable(v, isLabelFamilyName)
export const isArbitraryVariablePosition = (v: string) =>
  getIsArbitraryVariable(v, isLabelPosition)
export const isArbitraryVariableSize = (v: string) =>
  getIsArbitraryVariable(v, isLabelSize)
export const isArbitraryVariableImage = (v: string) =>
  getIsArbitraryVariable(v, isLabelImage)
export const isArbitraryVariableShadow = (v: string) =>
  getIsArbitraryVariable(v, isLabelShadow, true)
export const isArbitraryVariableWeight = (v: string) =>
  getIsArbitraryVariable(v, isLabelWeight, true)
