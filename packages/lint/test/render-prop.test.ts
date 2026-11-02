import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { describe, expect, test } from "vitest"

import { resetFsMemo } from "../src/project/fs"
import { addsNoClasses } from "../src/project/wrappers"
import { noRestyle } from "../src/rules/no-restyle"
import { button, createTester, PAGE, PROJECT } from "./helpers"

const tester = createTester()
const rule = noRestyle as any

const layout = [{ allow: ["layout"] }]
const dialog = `import { DialogTrigger } from "@/components/ui/dialog"`
const popover = `import { PopoverAnchor, PopoverClose, PopoverTrigger } from "@/components/ui/popover"`
const vendor = `import { VendorTrigger } from "@/components/ui/vendor-trigger"`

describe("render prop", () => {
  test("classes belong to the component the render prop renders", () => {
    tester.run("no-restyle", rule, {
      valid: [
        // Layout still crosses to the rendered component when allowed.
        {
          filename: PAGE,
          options: layout,
          code: `${dialog}\n${button}\nexport const A = () => <DialogTrigger render={<Button />} className="mt-4" />`,
        },
        // Layout allowed on Button is allowed on a plain element it renders.
        {
          filename: PAGE,
          options: layout,
          code: `${button}\nexport const A = () => <Button render={<a href="/" className="mt-4" />} className="w-full" />`,
        },
      ],
      invalid: [
        // The variants come from Button, which is what gets the classes.
        {
          filename: PAGE,
          options: layout,
          code: `${dialog}\n${button}\nexport const A = () => <DialogTrigger render={<Button />} className="bg-primary" />`,
          errors: [
            {
              message:
                /^"bg-primary" is not allowed on <DialogTrigger>: <DialogTrigger> forwards className to <Button>, which owns its color\. Use a variant: default, outline, secondary, ghost, destructive, link\. Add a new variant in .*button\.tsx /,
            },
          ],
        },
        // A function render prop hands over the same component.
        {
          filename: PAGE,
          options: layout,
          code: `${dialog}\n${button}\nexport const A = () => <DialogTrigger render={(props) => <Button {...props} />} className="bg-primary" />`,
          errors: [{ messageId: "appearanceClassViaWrapper" }],
        },
        // A rest of the props carries className the same way.
        {
          filename: PAGE,
          options: layout,
          code: `${dialog}\n${button}\nexport const A = () => <DialogTrigger render={({ id, ...rest }) => <Button {...rest} />} className="bg-primary" />`,
          errors: [{ messageId: "appearanceClassViaWrapper" }],
        },
        // A function that renders without spreading its props hands
        // nothing over, so the classes stay on the trigger.
        {
          filename: PAGE,
          options: layout,
          code: `${dialog}\n${button}\nexport const A = () => <DialogTrigger render={(item) => <Button />} className="bg-primary" />`,
          errors: [
            {
              message:
                /^"bg-primary" is not allowed on <DialogTrigger>: <DialogTrigger> owns its color\./,
            },
          ],
        },
        // A plain element in the component's place still wears the
        // component's own classes, so the component judges them.
        {
          filename: PAGE,
          options: layout,
          code: `${button}\nexport const A = () => <Button className="p-4" render={<a href="/">Go</a>} />`,
          errors: [
            {
              message:
                /^"p-4" is not allowed on <Button>: <Button> owns its spacing\. Use a size \(/,
            },
          ],
        },
        {
          filename: PAGE,
          options: layout,
          code: `${button}\nexport const A = () => <Button className="p-4" render={(props) => <a {...props} />} />`,
          errors: [{ messageId: "spacingClassWithSizes" }],
        },
        {
          filename: PAGE,
          options: layout,
          code: `${dialog}\nexport const A = () => <DialogTrigger render={<span />} className="bg-primary" />`,
          errors: [
            {
              message:
                /^"bg-primary" is not allowed on <DialogTrigger>: <DialogTrigger> owns its color\./,
            },
          ],
        },
        // Classes on the rendered element merge with the component's.
        {
          filename: PAGE,
          options: layout,
          code: `${button}\nexport const A = () => <Button render={<a href="/" className="p-4" />} />`,
          errors: [
            {
              message:
                /^"p-4" is not allowed on <Button>: <Button> owns its spacing\./,
            },
          ],
        },
        {
          filename: PAGE,
          options: layout,
          code: `${button}\nexport const A = () => <Button render={(props) => <a {...props} className="bg-primary" />} />`,
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        // A rendered component keeps its own contract.
        {
          filename: PAGE,
          options: layout,
          code: `${dialog}\n${button}\nexport const A = () => <DialogTrigger render={<Button className="bg-primary" />} />`,
          errors: [
            {
              message:
                /^"bg-primary" is not allowed on <Button>: <Button> owns its color\./,
            },
          ],
        },
        // A value the rule cannot read leaves the classes on the trigger.
        {
          filename: PAGE,
          options: layout,
          code: `${dialog}\nconst trigger = <span />\nexport const A = () => <DialogTrigger render={trigger} className="bg-primary" />`,
          errors: [
            {
              message:
                /^"bg-primary" is not allowed on <DialogTrigger>: <DialogTrigger> owns its color\./,
            },
          ],
        },
      ],
    })
  })

  test("a component that adds no classes leaves a plain element to itself", () => {
    tester.run("no-restyle", rule, {
      valid: [
        {
          filename: PAGE,
          options: layout,
          code: `${dialog}\nexport const A = () => <DialogTrigger render={<button className="rounded-full px-2 text-sm" />} />`,
        },
        {
          filename: PAGE,
          options: layout,
          code: `${popover}\nexport const A = () => <PopoverTrigger render={<button aria-label="Account" className="rounded-full" />} />`,
        },
        {
          filename: PAGE,
          options: layout,
          code: `${dialog}\nexport const A = () => <DialogTrigger render={(props) => <a {...props} className="bg-primary" />} />`,
        },
      ],
      invalid: [
        // The classes reach a styled component either way.
        {
          filename: PAGE,
          options: layout,
          code: `${dialog}\n${button}\nexport const A = () => <DialogTrigger render={<Button className="p-8" />} />`,
          errors: [{ messageId: "spacingClassWithSizes" }],
        },
        {
          filename: PAGE,
          options: layout,
          code: `${button}\nexport const A = () => <Button render={<a href="/docs" className="p-8" />} />`,
          errors: [{ messageId: "spacingClassWithSizes" }],
        },
        // A component the rule cannot resolve is not a plain element.
        {
          filename: PAGE,
          options: layout,
          code: `${dialog}\nexport const A = () => <DialogTrigger render={<Unknown className="rounded-full" />} />`,
          errors: [
            {
              message:
                /^"rounded-full" is not allowed on <DialogTrigger>: <DialogTrigger> owns its shape\./,
            },
          ],
        },
        // The classes are on Button, which renders the trigger.
        {
          filename: PAGE,
          options: layout,
          code: `${dialog}\n${button}\nexport const A = () => <Button className="rounded-none" render={<DialogTrigger render={<button />} />} />`,
          errors: [
            {
              message:
                /^"rounded-none" is not allowed on <Button>: <Button> forwards className to <DialogTrigger>/,
            },
          ],
        },
        // A trigger with classes of its own, one wrapped in a call, and
        // one from a package are not proven classless.
        {
          filename: PAGE,
          options: layout,
          code: `${popover}\nexport const A = () => <PopoverClose render={<button className="rounded-full" />} />`,
          errors: [
            {
              message:
                /^"rounded-full" is not allowed on <PopoverClose>: <PopoverClose> owns its shape\./,
            },
          ],
        },
        {
          filename: PAGE,
          options: layout,
          code: `${popover}\nexport const A = () => <PopoverAnchor render={<button className="rounded-full" />} />`,
          errors: [
            {
              message:
                /^"rounded-full" is not allowed on <PopoverAnchor>: <PopoverAnchor> owns its shape\./,
            },
          ],
        },
        {
          filename: PAGE,
          options: layout,
          code: `${vendor}\nexport const A = () => <VendorTrigger render={<button className="rounded-full" />} />`,
          errors: [
            {
              message:
                /^"rounded-full" is not allowed on <VendorTrigger>: <VendorTrigger> owns its shape\./,
            },
          ],
        },
      ],
    })
  })

  test("the proof follows the file and fails closed", () => {
    expect(
      addsNoClasses(
        path.join(PROJECT, "components/ui/popover.tsx"),
        "PopoverTrigger"
      )
    ).toBe(true)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "classless-"))
    const file = path.join(dir, "trigger.tsx")
    try {
      expect(addsNoClasses(file, "Trigger")).toBe(false)
      fs.writeFileSync(file, "export function Trigger(")
      resetFsMemo()
      expect(addsNoClasses(file, "Trigger")).toBe(false)
      fs.writeFileSync(
        file,
        `import { Popover } from "@base-ui/react"\nexport function Trigger({ ...props }) {\n  return <Popover.Trigger data-slot="trigger" {...props} />\n}\n`
      )
      fs.utimesSync(file, new Date(), new Date(Date.now() + 5000))
      resetFsMemo()
      expect(addsNoClasses(file, "Trigger")).toBe(true)
      fs.writeFileSync(
        file,
        `import { Popover } from "@base-ui/react"\nexport function Trigger({ ...props }) {\n  return <Popover.Trigger className="p-2" {...props} />\n}\n`
      )
      fs.utimesSync(file, new Date(), new Date(Date.now() + 10000))
      resetFsMemo()
      expect(addsNoClasses(file, "Trigger")).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
