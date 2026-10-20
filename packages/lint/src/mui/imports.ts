import { ContractConfigError } from "../rules/policy"

export type ComponentImport = {
  source: string
  imported: string
  component: string
  styleProps?: Record<string, string>
}

const configured = new WeakMap<object, ComponentImport[]>()

export function componentImportsOf(context: any): ComponentImport[] {
  const cached = configured.get(context)
  if (cached) return cached
  const raw = context.settings?.mui?.componentImports
  const input = raw === undefined ? [] : raw
  const fail = () => {
    throw new ContractConfigError(
      "settings.mui.componentImports must contain unique source/imported bindings, canonical component names and optional CSS styleProps mappings."
    )
  }
  if (!Array.isArray(input)) fail()
  const seen = new Set<string>()
  for (const entry of input) {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      Object.keys(entry).some(
        (key) =>
          !["source", "imported", "component", "styleProps"].includes(key)
      )
    )
      fail()
    if (
      ![entry.source, entry.imported, entry.component].every(
        (value) => typeof value === "string" && value.trim().length > 0
      )
    )
      fail()
    const identity = JSON.stringify([entry.source, entry.imported])
    if (seen.has(identity)) fail()
    seen.add(identity)
    if (
      entry.styleProps !== undefined &&
      (!entry.styleProps ||
        typeof entry.styleProps !== "object" ||
        Array.isArray(entry.styleProps) ||
        !Object.entries(entry.styleProps).every(
          ([prop, css]) =>
            /^[a-zA-Z][\w-]*$/.test(prop) &&
            typeof css === "string" &&
            /^[a-zA-Z][a-zA-Z-]*$/.test(css)
        ))
    )
      fail()
  }
  configured.set(context, input)
  return input
}

// Explicit public components with an sx channel; providers and hooks are not style owners.
const families: Record<string, Set<string>> = {
  "@mui/material": new Set([
    "Box",
    "Modal",
    "InputLabel",
    "TablePagination",
    "Autocomplete",
    "DialogContentText",
    "Popover",
    "ListSubheader",
    "Drawer",
    "SvgIcon",
    "Stack",
    "Grid",
    "Container",
    "Button",
    "ButtonBase",
    "IconButton",
    "Typography",
    "Paper",
    "Card",
    "CardContent",
    "CardActions",
    "CardHeader",
    "TextField",
    "Input",
    "InputBase",
    "OutlinedInput",
    "FilledInput",
    "Checkbox",
    "Radio",
    "Switch",
    "FormControl",
    "FormControlLabel",
    "FormHelperText",
    "Alert",
    "Chip",
    "Avatar",
    "Badge",
    "Divider",
    "Link",
    "List",
    "ListItem",
    "ListItemButton",
    "ListItemText",
    "Dialog",
    "DialogTitle",
    "DialogContent",
    "DialogActions",
    "Tabs",
    "Tab",
    "Table",
    "TableContainer",
    "TableHead",
    "TableBody",
    "TableRow",
    "TableCell",
    "Select",
    "MenuItem",
    "Accordion",
    "AccordionSummary",
    "AccordionDetails",
    "Toolbar",
    "AppBar",
    "CircularProgress",
    "LinearProgress",
    "Slider",
    "Skeleton",
  ]),
  "@mui/system": new Set(["Box", "Stack", "Grid", "Container"]),
  "@mui/x-data-grid": new Set(["DataGrid"]),
  "@mui/x-date-pickers": new Set(["DatePicker", "TimePicker"]),
  "@mui/x-charts": new Set(["BarChart", "LineChart"]),
  "@mui/x-tree-view": new Set(["RichTreeView", "SimpleTreeView", "TreeItem"]),
}

export function variableOf(context: any, node: any, name: string) {
  for (
    let scope = context.sourceCode.getScope(node);
    scope;
    scope = scope.upper
  ) {
    const variable = scope.set.get(name)
    if (variable) return variable
  }
  return null
}

export function componentOf(
  context: any,
  name: any
): {
  component: string
  source: string
  styleProps?: Record<string, string>
} | null {
  const member = name?.type === "JSXMemberExpression"
  const root = member ? name.object : name
  if (root?.type !== "JSXIdentifier") return null
  const variable = variableOf(context, name, root.name)
  const def = variable?.defs?.[0]
  if (def?.type !== "ImportBinding") return null
  const declaration = def.parent
  const specifier = def.node
  if (declaration.importKind === "type" || specifier.importKind === "type")
    return null
  const source = declaration.source.value
  const imported =
    specifier.type === "ImportNamespaceSpecifier"
      ? member && name.property.type === "JSXIdentifier"
        ? name.property.name
        : null
      : !member
        ? specifier.type === "ImportDefaultSpecifier"
          ? "default"
          : (specifier.imported.name ?? specifier.imported.value)
        : null
  const custom = componentImportsOf(context).find(
    (entry) => entry.source === source && entry.imported === imported
  )
  if (custom)
    return {
      component: custom.component,
      source,
      styleProps: custom.styleProps,
    }
  const pkg = Object.keys(families).find(
    (key) => source === key || source.startsWith(`${key}/`)
  )
  if (!pkg) return null
  const deep = source === pkg ? null : source.slice(pkg.length + 1)
  if (deep && !families[pkg].has(deep)) return null
  let component: string | null = null
  if (specifier.type === "ImportNamespaceSpecifier") {
    if (!member || name.property.type !== "JSXIdentifier") return null
    component = name.property.name
  } else {
    if (member) return null
    component =
      specifier.type === "ImportDefaultSpecifier"
        ? deep
        : (specifier.imported.name ?? specifier.imported.value)
  }
  if (
    !component ||
    !families[pkg].has(component) ||
    (deep && component !== deep)
  )
    return null
  return { component, source }
}

export const supportedComponents = Object.fromEntries(
  Object.entries(families).map(([pkg, names]) => [pkg, [...names]])
)
