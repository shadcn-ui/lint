import parser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { expect, test } from "vitest"

import mui from "../src/mui/index"
import { collectSx } from "../src/mui/sites"

const componentImports = [
  {
    source: "@design/icon",
    imported: "default",
    component: "Icon",
    styleProps: { color: "color" },
  },
  {
    source: "@design/components",
    imported: "Icon",
    component: "Icon",
    styleProps: { color: "color" },
  },
]

function lint(source: string, configured = componentImports) {
  return new Linter().verify(source, {
    languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { mui },
    settings: { mui: { componentImports: configured } },
    rules: {
      "mui/no-restyle": ["error", { allow: ["*"] }],
      "mui/no-raw-colors": "error",
    },
  })
}

test.each([
  '(theme) => ({ color: "#a12345", p: 2 })',
  'function(theme) { return { color: "#a12345" } }',
  '(theme) => theme.enabled ? { color: "#a12345" } : { color: "primary.main" }',
  '[false, (theme) => ({ border: "1px solid #a12345" })]',
])("readable root callbacks are inspected without execution: %s", (sx) => {
  const result = lint(`import { Box } from "@mui/material"; <Box sx={${sx}} />`)
  expect(result).toHaveLength(1)
  expect(result[0].ruleId).toBe("mui/no-raw-colors")
})

test("known callback values keep token references unknown without hiding literal siblings", () => {
  expect(
    lint(
      'import { Box } from "@mui/material"; <Box sx={theme => ({ color: theme.palette.text.primary, bgcolor: "#a12345" })} />'
    )
  ).toHaveLength(1)
  expect(
    lint(
      'import { Box } from "@mui/material"; <Box sx={theme => ({ color: theme.palette.text.primary, bgcolor: "background.paper" })} />'
    )
  ).toEqual([])
  expect(
    lint(
      'import { Box } from "@mui/material"; const style = theme => ({ color: "red" }); <Box sx={style} />'
    )
  ).toHaveLength(1)
})

test("legacy property callbacks are read only as property values", () => {
  expect(
    lint(
      'import { Box } from "@mui/material"; <Box sx={{ color: theme => "red" }} />'
    )
  ).toHaveLength(1)
  expect(
    lint(
      'import { Box } from "@mui/material"; <Box sx={{ onClick: () => ({ color: "red" }) }} />'
    )
  ).toEqual([])
})

test.each([
  "color: `${prefix}red`",
  "borderColor: `#123${suffix}`",
  "color: `rgb(${theme.vars.palette.primary.mainChannel} / 0.5)`",
  "color: `var(--${prefix}-red)`",
  "color: `var(--brand-${variant}-blue)`",
  "color: `var(--${prefix}-red, blue)`",
  "background: `linear-gradient(${dynamic},red)`",
  "border: `1px solid #123456 ${dynamic}`",
  'backgroundImage: `url("/red/${image}.svg#fff")`',
])(
  "interpolation preserves neither complete paint nor CSS context: %s",
  (property) => {
    const source = `import { Box } from "@mui/material"; <Box sx={{ ${property} }} />`
    expect(lint(source)).toEqual([])
    expect(unknownOf(source)).toBeGreaterThan(0)
  }
)

test("a forbidden authored property is checked even when its template value is unresolved", () => {
  const messages = new Linter().verify(
    'import { Card } from "@mui/material"; <Card sx={{ bgcolor: `${prefix}red` }} />',
    {
      languageOptions: {
        parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: { mui },
      rules: { "mui/no-restyle": ["error", { deny: ["backgroundColor"] }] },
    }
  )
  expect(messages).toHaveLength(1)
  expect(messages[0].ruleId).toBe("mui/no-restyle")
})

test("returned functions and responsive callback leaves are not invoked as styles", () => {
  expect(
    lint(
      'import { Box } from "@mui/material"; <Box sx={theme => () => ({ color: "red" })} />'
    )
  ).toEqual([])
  expect(
    lint(
      'import { Box } from "@mui/material"; <Box sx={{ color: { xs: theme => "red" } }} />'
    )
  ).toEqual([])
})

test.each([
  'theme => { throw new Error("must not run") }',
  'theme => { mutate(); return { color: "red" } }',
  'async theme => ({ color: "red" })',
  'function* () { return { color: "red" } }',
])("unsupported callbacks remain unresolved and never run: %s", (sx) => {
  const source = `import { Box } from "@mui/material"; <Box sx={${sx}} />`
  expect(lint(source)).toEqual([])
  expect(unknownOf(source)).toBeGreaterThan(0)
})

test.each([
  ['import Glyph from "@design/icon";', "Glyph"],
  ['import { Icon as Glyph } from "@design/components";', "Glyph"],
  ['import * as Design from "@design/components";', "Design.Icon"],
])(
  "declared wrapper bindings retain canonical identity: %s",
  (declaration, name) => {
    const result = lint(
      `${declaration}<${name} color="red" sx={{ bgcolor: "#a12345" }} />`
    )
    expect(result).toHaveLength(2)
    expect(result[0].message).toContain("<Icon> color prop")
    expect(result[1].message).toContain("<Icon> sx")
  }
)

test.each([
  'import Glyph from "@other/icon"; <Glyph color="red" sx={{ color: "red" }} />',
  'import type { Icon } from "@design/components"; <Icon color="red" />',
  'import Icon from "@design/icon"; function Example(Icon: any) { return <Icon color="red" sx={{ color: "red" }} /> }',
  'import Icon from "@design/icon"; <Icon color="red" {...external} />',
  'import Icon from "@design/icon"; <Icon color="red" color="primary.main" />',
  'import { Button } from "@mui/material"; <Button color="red" />',
])(
  "unproven or replaced props cannot establish literal consumption: %s",
  (source) => {
    expect(lint(source)).toEqual([])
  }
)

test("explicit prop after a spread is readable and wrapper sx is opt-in", () => {
  expect(
    lint('import Icon from "@design/icon"; <Icon {...external} color="red" />')
  ).toHaveLength(1)
  expect(
    lint('import Icon from "@design/icon"; <Icon sx={{ color: "red" }} />', [])
  ).toEqual([])
})

test("configured props and sx are independently authored declarations", () => {
  const result = lint(
    'import Icon from "@design/icon"; <Icon color="red" sx={{ color: "primary.main" }} />'
  )
  expect(result).toHaveLength(1)
  expect(result[0].message).toContain("color prop")
})

test.each([
  { configured: [{ source: "@design/icon", imported: "default" }] },
  {
    configured: [
      {
        source: "@design/icon",
        imported: "default",
        component: "Icon",
        styleProps: { color: 42 },
      },
    ],
  },
  { configured: [...componentImports, componentImports[0]] },
  { configured: null },
])("invalid wrapper configuration fails closed: %j", ({ configured }) => {
  const result = lint(
    'import Icon from "@design/icon"; <Icon color="red" />',
    configured as any
  )
  expect(result.length).toBeGreaterThan(0)
  expect(result[0].message).toContain("componentImports")
})

function unknownOf(source: string) {
  let unknown = 0
  new Linter().verify(source, {
    languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: {
      probe: {
        rules: {
          inspect: {
            create(context: any) {
              return {
                JSXOpeningElement(node: any) {
                  unknown += collectSx(context, node).unknown.length
                },
              }
            },
          },
        },
      },
    },
    rules: { "probe/inspect": "error" },
  })
  return unknown
}

test.each([
  "Modal",
  "InputLabel",
  "TablePagination",
  "Autocomplete",
  "DialogContentText",
  "Popover",
  "ListSubheader",
  "Drawer",
  "SvgIcon",
])("reviewed public root keeps its imported identity: %s", (component) => {
  const result = lint(
    `import Root from "@mui/material/${component}"; <Root sx={{ color: "red" }} slotProps={{ paper: { sx: { color: "red" } } }} />`
  )
  expect(result).toHaveLength(1)
  expect(result[0].message).toContain(`<${component}> sx`)
  expect(
    lint(
      `import { ${component} as Root } from "@mui/material"; <Root sx={{ color: "red" }} />`
    )
  ).toHaveLength(1)
})
