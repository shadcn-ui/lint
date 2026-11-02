import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import parser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { plugin } from "../src/index"
import { resetFsMemo } from "../src/project/fs"
import { parseSource } from "../src/project/parser"
import { clearWrapperCache, wrapperTargetOf } from "../src/project/wrappers"
import { createComponentTracker } from "../src/sites/collect"
import { PAGE, PROJECT } from "./helpers"

const FILE = path.join(PROJECT, "app/local-wrapper.tsx")
const BUTTON = path.join(PROJECT, "components/ui/button.tsx")
const PACKAGE = path.join(PROJECT, "node_modules/other-kit/index.js")
const directories = new Set<string>()

beforeEach(clearWrapperCache)
afterEach(() => {
  vi.useRealTimers()
  clearWrapperCache()
  resetFsMemo()
  for (const directory of directories)
    fs.rmSync(directory, { recursive: true, force: true })
  directories.clear()
})

function sourceFor(imports: string, tag: string) {
  return `${imports}\nexport function View(props) { return <${tag} {...props} /> }`
}

function identities(
  imports: string,
  tag: string,
  patterns: string[] = [],
  ignored: string[] = []
) {
  const ast = parseSource(sourceFor(imports, tag), FILE)
  const tracker = createComponentTracker(
    { physicalFilename: FILE, sourceCode: { ast } },
    { componentImports: patterns, ignoreImports: ignored }
  )
  for (const statement of ast.body) {
    if (statement.type === "ImportDeclaration") tracker.collectImport(statement)
  }
  const element =
    ast.body.at(-1).declaration.body.body[0].argument.openingElement
  return {
    tracked: tracker.resolve(element.name),
    wrapped: wrapperTargetOf(
      FILE,
      "View",
      patterns.map((pattern) => new RegExp(pattern)),
      ast
    ),
  }
}

function temporaryProject() {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "lint-import-identity-"))
  )
  directories.add(root)
  function write(name: string, source: string) {
    const file = path.join(root, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, source)
    return file
  }
  write("package.json", JSON.stringify({ private: true }))
  write(
    "components.json",
    JSON.stringify({ aliases: { ui: "@/components/ui" } })
  )
  const button = write(
    "components/ui/button.tsx",
    "export function Button(props) { return <button {...props} /> }"
  )
  const card = write(
    "components/ui/card.tsx",
    "export function Card(props) { return <div {...props} /> }"
  )
  return { write, button, card }
}

describe("imported component identity", () => {
  test.each([
    {
      name: "named",
      imports: 'import { Button } from "@/components/ui/button"',
      tag: "Button",
      component: "Button",
    },
    {
      name: "renamed barrel",
      imports: 'import { Action } from "@/components/barrel"',
      tag: "Action",
      component: "Button",
    },
    {
      name: "namespace",
      imports: 'import * as UI from "@/components/ui/button"',
      tag: "UI.Button",
      component: "Button",
    },
    {
      name: "compound member without an indexed joined name",
      imports: 'import { Button as B } from "@/components/ui/button"',
      tag: "B.Icon",
      component: "ButtonIcon",
    },
  ])(
    "$name agrees between the collector and wrapper analysis",
    ({ imports, tag, component }) => {
      expect(identities(imports, tag)).toEqual({
        tracked: { component, file: BUTTON, wrapper: null },
        wrapped: { component, file: BUTTON },
      })
    }
  )

  test.each([
    {
      imports: 'import Save from "@/components/default-wrapper"',
      tag: "Save",
      wrapper: "Save",
    },
    {
      imports: 'import * as W from "@/components/save-button"',
      tag: "W.SaveButton",
      wrapper: "W.SaveButton",
    },
  ])("retains the wrapper label for $tag", ({ imports, tag, wrapper }) => {
    expect(identities(imports, tag)).toEqual({
      tracked: { component: "Button", file: BUTTON, wrapper },
      wrapped: { component: "Button", file: BUTTON },
    })
  })

  test("owned bindings take priority over import patterns", () => {
    expect(
      identities('import { Action } from "@/components/barrel"', "Action", [
        "^@/",
      ])
    ).toEqual({
      tracked: { component: "Button", file: BUTTON, wrapper: null },
      wrapped: { component: "Button", file: BUTTON },
    })
  })

  test("patterns recognize packages before package exclusion", () => {
    const imports = 'import { Button } from "other-kit"'
    expect(identities(imports, "Button")).toEqual({
      tracked: null,
      wrapped: null,
    })
    clearWrapperCache()
    expect(identities(imports, "Button", ["^other-kit$"])).toEqual({
      tracked: { component: "Button", file: PACKAGE, wrapper: null },
      wrapped: { component: "Button", file: PACKAGE },
    })
  })

  test("collector ignore patterns precede owned and pattern recognition", () => {
    expect(
      identities(
        'import { Button } from "@/components/ui/button"',
        "Button",
        ["^@/"],
        ["ui/button"]
      )
    ).toEqual({
      tracked: null,
      wrapped: { component: "Button", file: BUTTON },
    })
  })

  test("unresolved compound imports retain the collector's original-name fallback", () => {
    expect(
      identities('import { Button as B } from "./missing"', "B.Icon")
    ).toEqual({
      tracked: { component: "ButtonIcon", file: BUTTON, wrapper: null },
      wrapped: null,
    })
  })

  test("bare namespaces keep their different displayed names", () => {
    expect(
      identities('import * as UI from "missing-kit"', "UI", ["missing-kit"])
    ).toEqual({
      tracked: { component: "UI", file: null, wrapper: null },
      wrapped: { component: "", file: null },
    })
  })

  test("non-imported compound names retain their different rejection order", () => {
    expect(identities("", "Card.Header")).toEqual({
      tracked: {
        component: "CardHeader",
        file: path.join(PROJECT, "components/ui/card.tsx"),
        wrapper: null,
      },
      wrapped: null,
    })
  })

  test("owned imports do not advance a wrapper's stateful pattern", () => {
    const pattern = /ui/g
    const ast = parseSource(
      sourceFor('import { Button } from "@/components/ui/button"', "Button"),
      FILE
    )
    expect(wrapperTargetOf(FILE, "View", [pattern], ast)).toEqual({
      component: "Button",
      file: BUTTON,
    })
    expect(pattern.lastIndex).toBe(0)
  })

  test("pattern-recognized missing imports still produce a complete cached result", () => {
    const pattern = /missing-kit/g
    const ast = parseSource(
      sourceFor('import { Action } from "missing-kit"', "Action"),
      FILE
    )
    const target = { component: "Action", file: null }
    expect(wrapperTargetOf(FILE, "View", [pattern], ast)).toEqual(target)
    expect(pattern.lastIndex).toBe("missing-kit".length)
    expect(wrapperTargetOf(FILE, "View", [pattern], ast)).toEqual(target)
    expect(pattern.lastIndex).toBe("missing-kit".length)
  })

  test("renamed component diagnostics retain identity, text and location", () => {
    const code =
      'import { Action } from "@/components/barrel"\n<Action className="rounded-full" />'
    const messages = new Linter({ cwd: PROJECT }).verify(
      code,
      {
        files: ["**/*.tsx"],
        languageOptions: {
          parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        plugins: { shadcn: plugin },
        rules: {
          "shadcn/no-restyle": ["error", { componentImports: ["^@/"] }],
        },
      } as any,
      { filename: PAGE }
    )
    expect(
      messages.map(
        ({ ruleId, messageId, message, line, column, endLine, endColumn }) => ({
          ruleId,
          messageId,
          message,
          line,
          column,
          endLine,
          endColumn,
        })
      )
    ).toEqual([
      {
        ruleId: "shadcn/no-restyle",
        messageId: "appearanceClassWithVariants",
        message:
          '"rounded-full" is not allowed on <Button>: <Button> owns its shape. Use a variant: default, outline, secondary, ghost, destructive, link. Add a new variant in components/ui/button.tsx only if the design explicitly calls for a treatment none of these provides.',
        line: 2,
        column: 19,
        endLine: 2,
        endColumn: 33,
      },
    ])
  })

  test("unresolved name fallback is retried when its import appears", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const { write, button, card } = temporaryProject()
    const outer = write(
      "components/outer.tsx",
      'import { Button } from "./inner"\nexport function Outer(props) { return <Button {...props} /> }'
    )
    expect(wrapperTargetOf(outer, "Outer")).toEqual({
      component: "Button",
      file: button,
    })
    write("components/inner.tsx", 'export { Card as Button } from "./ui/card"')
    vi.setSystemTime(Date.now() + 1500)
    expect(wrapperTargetOf(outer, "Outer")).toEqual({
      component: "Card",
      file: card,
    })
  })

  test("cross-file cycles keep incomplete results out of the cache", () => {
    const { write, button, card } = temporaryProject()
    const alpha = write(
      "components/alpha.tsx",
      'import { Beta } from "./beta"\nimport { Button } from "./ui/button"\nexport function Alpha(props) { return <><Beta {...props} /><Button {...props} /></> }'
    )
    const beta = write(
      "components/beta.tsx",
      'import { Alpha } from "./alpha"\nimport { Card } from "./ui/card"\nexport function Beta(props) { return <><Alpha {...props} /><Card {...props} /></> }'
    )
    expect(wrapperTargetOf(alpha, "Alpha")).toEqual({
      component: "Card",
      file: card,
    })
    expect(wrapperTargetOf(beta, "Beta")).toEqual({
      component: "Button",
      file: button,
    })
  })
})

test("nested namespace members resolve through grouped barrels", () => {
  const DIALOG = path.join(PROJECT, "components/ui/dialog.tsx")
  const kit = 'import * as UI from "@/components/kit"'
  // `export * as Button from "./ui/button"`.
  clearWrapperCache()
  expect(identities(kit, "UI.Button.Button")).toEqual({
    tracked: { component: "Button", file: BUTTON, wrapper: null },
    wrapped: { component: "Button", file: BUTTON },
  })
  // `import * as Dialog from "./ui/dialog"; export { Dialog }`.
  clearWrapperCache()
  expect(identities(kit, "UI.Dialog.DialogTrigger")).toEqual({
    tracked: { component: "DialogTrigger", file: DIALOG, wrapper: null },
    wrapped: { component: "DialogTrigger", file: DIALOG },
  })
  // A namespace is not a component.
  clearWrapperCache()
  expect(identities(kit, "UI.Button")).toEqual({ tracked: null, wrapped: null })
  // A named import joins the path the way a one-level member does.
  clearWrapperCache()
  expect(
    identities(
      'import { Button as B } from "@/components/ui/button"',
      "B.Group.Item"
    )
  ).toEqual({
    tracked: { component: "ButtonGroupItem", file: BUTTON, wrapper: null },
    wrapped: { component: "ButtonGroupItem", file: BUTTON },
  })
  // Unresolvable under componentImports: the joined name, as for <UI.Button>.
  clearWrapperCache()
  expect(
    identities('import * as UI from "missing-kit"', "UI.Button.Root", [
      "missing-kit",
    ])
  ).toEqual({
    tracked: { component: "ButtonRoot", file: null, wrapper: null },
    wrapped: { component: "ButtonRoot", file: null },
  })
})

test("named namespace members resolve before their names are joined", () => {
  const primitives = "@/components/ui/primitives"
  // `export * as Controls from "./button"`.
  clearWrapperCache()
  expect(
    identities(`import { Controls } from "${primitives}"`, "Controls.Button")
  ).toEqual({
    tracked: { component: "Button", file: BUTTON, wrapper: null },
    wrapped: { component: "Button", file: BUTTON },
  })
  // A package part is not the ui component its joined name matches,
  // imported directly or through the ui file's re-export.
  clearWrapperCache()
  expect(
    identities('import { Field } from "parts-kit/field"', "Field.Label")
  ).toEqual({ tracked: null, wrapped: null })
  clearWrapperCache()
  expect(
    identities(
      `import { FieldPrimitive } from "${primitives}"`,
      "FieldPrimitive.Label"
    )
  ).toEqual({ tracked: null, wrapped: null })
})
