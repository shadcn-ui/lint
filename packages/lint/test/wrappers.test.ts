import * as fs from "node:fs"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { parseSource } from "../src/project/parser"
import { clearWrapperCache, wrapperTargetOf } from "../src/project/wrappers"
import { noRestyle } from "../src/rules/no-restyle"
import { createTester, PAGE } from "./helpers"

const PROJECT = path.join(__dirname, "fixtures/project")
const WRAPPERS = path.join(PROJECT, "components/save-button.tsx")
const BUTTON = path.join(PROJECT, "components/ui/button.tsx")

const tester = createTester()
const rule = noRestyle as any
const wrappers = `import { SaveButton, Section, CancelButton, PrimaryAction } from "@/components/save-button"`

describe("wrapperTargetOf", () => {
  test("finds the forwarded design-system component", () => {
    expect(wrapperTargetOf(WRAPPERS, "SaveButton")).toEqual({
      component: "Button",
      file: BUTTON,
    })
    expect(wrapperTargetOf(WRAPPERS, "CancelButton")).toEqual({
      component: "Button",
      file: BUTTON,
    })
    expect(wrapperTargetOf(WRAPPERS, "PrimaryAction")).toEqual({
      component: "Button",
      file: BUTTON,
    })
  })

  test("a plain element is not a wrapper", () => {
    expect(wrapperTargetOf(WRAPPERS, "Section")).toBeNull()
    expect(wrapperTargetOf(WRAPPERS, "Missing")).toBeNull()
  })
})

describe("wrapper binding forms", () => {
  beforeEach(clearWrapperCache)
  afterEach(clearWrapperCache)

  const source = `
    import { Button } from "@/components/ui/button"
    import { Card } from "@/components/ui/card"
    export { Wrapped as Public, Named as "Quoted" }
    function Named({ className }) { return <Button className={className} /> }
    const Arrow = (props) => <Named {...props} />
    const NestedAlias = Alias
    const Alias = Named
    const Wrapped = memo(forwardRef(NestedAlias))
    function Chain(props) { return <Arrow {...props} /> }
    function Plain(props) { return <div {...props} /> }
    function Fixed({ className, ...rest }) { return <Button {...rest} /> }
    function Multiple(props) { return <><Button {...props} /><Card {...props} /></> }
    const Value = 42
    const Unknown = Missing
    let Uninitialized
    export default function Default(props) { return <Chain {...props} /> }
  `

  test("resolves declarations, aliases and same-file chains from the supplied AST", () => {
    const ast = parseSource(source, WRAPPERS)
    for (const name of [
      "Named",
      "Arrow",
      "NestedAlias",
      "Alias",
      "Wrapped",
      "Public",
      "Quoted",
      "Chain",
      "Multiple",
      "Default",
      "default",
    ]) {
      expect(wrapperTargetOf(WRAPPERS, name, [], ast), name).toEqual({
        component: "Button",
        file: BUTTON,
      })
    }
    for (const name of [
      "Plain",
      "Fixed",
      "Value",
      "Unknown",
      "Uninitialized",
    ]) {
      expect(wrapperTargetOf(WRAPPERS, name, [], ast), name).toBeNull()
    }
  })

  test.each([
    "export default function ({ className }) { return <Button className={className} /> }",
    "export default (props) => <Button {...props} />",
    "function Local(props) { return <Button {...props} /> }; export default Local",
    "function Local(props) { return <Button {...props} /> }; export default memo(Local)",
    "function Local(props) { return <Button {...props} /> }; export { Local as default }",
  ])("resolves the default export: %s", (declaration) => {
    const ast = parseSource(
      `import { Button } from "@/components/ui/button"; ${declaration}`,
      WRAPPERS
    )
    expect(wrapperTargetOf(WRAPPERS, "default", [], ast)).toEqual({
      component: "Button",
      file: BUTTON,
    })
  })

  test("keeps export alias resolution in source order", () => {
    const ast = parseSource(
      `import { Button } from "@/components/ui/button"
       export { Later as TooEarly }
       export { Local as Later }
       export { Later as Ready }
       function Local(props) { return <Button {...props} /> }`,
      WRAPPERS
    )
    expect(wrapperTargetOf(WRAPPERS, "TooEarly", [], ast)).toBeNull()
    expect(wrapperTargetOf(WRAPPERS, "Ready", [], ast)).toEqual({
      component: "Button",
      file: BUTTON,
    })
  })

  test.each([false, true])(
    "keeps candidate order through local cycles: %s",
    (reverse) => {
      const declarations = [
        "function Alpha(props) { return <><Beta {...props} /><Button {...props} /></> }",
        "function Beta(props) { return <><Alpha {...props} /><Card {...props} /></> }",
      ]
      const ast = parseSource(
        `import { Button } from "@/components/ui/button"
       import { Card } from "@/components/ui/card"
       ${(reverse ? declarations.reverse() : declarations).join("\n")}`,
        WRAPPERS
      )
      expect(wrapperTargetOf(WRAPPERS, "Alpha", [], ast)).toEqual({
        component: reverse ? "Button" : "Card",
        file: reverse ? BUTTON : path.join(PROJECT, "components/ui/card.tsx"),
      })
    }
  )

  test("resolves at most six alias hops", () => {
    const ast = parseSource(
      `import { Button } from "@/components/ui/button"
       function Base(props) { return <Button {...props} /> }
       const One = Base, Two = One, Three = Two, Four = Three,
         Five = Four, Six = Five, Seven = Six`,
      WRAPPERS
    )
    expect(wrapperTargetOf(WRAPPERS, "Six", [], ast)).toEqual({
      component: "Button",
      file: BUTTON,
    })
    expect(wrapperTargetOf(WRAPPERS, "Seven", [], ast)).toBeNull()
  })

  test("inherits the same contract through an aliased local wrapper", () => {
    tester.run("no-restyle", rule, {
      valid: [],
      invalid: [
        {
          filename: WRAPPERS,
          code: `${source}\nconst Usage = () => <Wrapped className="rounded-full" />`,
          errors: [
            {
              messageId: "appearanceClassViaWrapper",
              data: {
                className: "rounded-full",
                component: "Button",
                category: "shape",
                wrapper: "Wrapped",
                prop: "className",
                variants:
                  "default, outline, secondary, ghost, destructive, link",
                variantsSuffix:
                  ": default, outline, secondary, ghost, destructive, link",
                file: "test/fixtures/project/components/ui/button.tsx",
                where: "in test/fixtures/project/components/ui/button.tsx",
              },
            },
          ],
        },
      ],
    })
  })
})

describe("no-restyle through wrappers", () => {
  test("the target's contract and variants apply", () => {
    tester.run("no-restyle", rule, {
      valid: [
        // Layout opened for Button reaches it through the wrapper.
        {
          filename: PAGE,
          options: [{ allow: ["layout"] }],
          code: `${wrappers}\nexport const A = () => <SaveButton className="mt-4 w-full">Go</SaveButton>`,
        },
        {
          filename: PAGE,
          code: `${wrappers}\nexport const A = () => <Section className="bg-muted rounded-xl">Hi</Section>`,
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: `${wrappers}\nexport const A = () => <SaveButton className="bg-red-500">Go</SaveButton>`,
          errors: [
            {
              messageId: "appearanceClassViaWrapper",
              data: {
                className: "bg-red-500",
                component: "Button",
                category: "color",
                wrapper: "SaveButton",
                prop: "className",
                variants:
                  "default, outline, secondary, ghost, destructive, link",
                variantsSuffix:
                  ": default, outline, secondary, ghost, destructive, link",
                file: "test/fixtures/project/components/ui/button.tsx",
                where: "in test/fixtures/project/components/ui/button.tsx",
              },
            },
          ],
        },
        {
          filename: PAGE,
          code: `${wrappers}\nexport const A = () => <PrimaryAction className="rounded-full" />`,
          errors: [{ messageId: "appearanceClassViaWrapper" }],
        },
        {
          filename: PAGE,
          code: `${wrappers}\nexport const A = () => <CancelButton className="text-xs" />`,
          errors: [{ messageId: "appearanceClassViaWrapper" }],
        },
      ],
    })
  })
})

describe("namespace-import wrappers", () => {
  test("<W.SaveButton> resolves through the namespace to its target", () => {
    tester.run("no-restyle", noRestyle as any, {
      valid: [
        {
          filename: PAGE,
          options: [{ allow: ["layout"] }],
          code: `import * as W from "@/components/save-button"\nexport const A = () => <W.SaveButton className="mt-4">Go</W.SaveButton>`,
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: `import * as W from "@/components/save-button"\nexport const A = () => <W.SaveButton className="bg-red-500">Go</W.SaveButton>`,
          errors: [
            {
              messageId: "appearanceClassViaWrapper",
              data: {
                className: "bg-red-500",
                component: "Button",
                category: "color",
                wrapper: "W.SaveButton",
                prop: "className",
                variants:
                  "default, outline, secondary, ghost, destructive, link",
                variantsSuffix:
                  ": default, outline, secondary, ghost, destructive, link",
                file: "test/fixtures/project/components/ui/button.tsx",
                where: "in test/fixtures/project/components/ui/button.tsx",
              },
            },
          ],
        },
      ],
    })
  })
})

describe("wrappers", () => {
  const file = path.join(PROJECT, "components/save-button.tsx")

  test("a rest spread after destructuring className is not forwarding", () => {
    expect(wrapperTargetOf(file, "FixedButton")).toBeNull()
    expect(wrapperTargetOf(file, "SaveButton")?.component).toBe("Button")
  })

  test("a same-file wrapper is a wrapper", () => {
    const local = path.join(PROJECT, "app/local-wrapper.tsx")
    tester.run("no-restyle", noRestyle as any, {
      valid: [],
      invalid: [
        {
          filename: local,
          code: fs.readFileSync(local, "utf-8"),
          errors: [{ messageId: "appearanceClassViaWrapper" }],
        },
      ],
    })
  })

  test("the wrapper message names the target's file", () => {
    tester.run("no-restyle", noRestyle as any, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          code: `import { SaveButton } from "@/components/save-button"\nexport const A = () => <SaveButton className="text-xs">Go</SaveButton>`,
          errors: [
            {
              message:
                /<SaveButton> forwards className to <Button>.*Add a new variant in test\/fixtures\/project\/components\/ui\/button\.tsx/,
            },
          ],
        },
      ],
    })
  })
})
