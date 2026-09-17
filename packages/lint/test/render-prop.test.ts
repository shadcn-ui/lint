import { describe, test } from "vitest"

import { noRestyle } from "../src/rules/no-restyle"
import { button, createTester, PAGE } from "./helpers"

const tester = createTester()
const rule = noRestyle as any

const layout = [{ allow: ["layout"] }]
const dialog = `import { DialogTrigger } from "@/components/ui/dialog"`

describe("render prop", () => {
  test("classes belong to the component the render prop renders", () => {
    tester.run("no-restyle", rule, {
      valid: [
        // The classes land on a plain element, not on the trigger.
        {
          filename: PAGE,
          code: `${dialog}\nexport const A = () => <DialogTrigger render={<span />} className="bg-primary px-6" />`,
        },
        // Layout still crosses to the rendered component when allowed.
        {
          filename: PAGE,
          options: layout,
          code: `${dialog}\n${button}\nexport const A = () => <DialogTrigger render={<Button />} className="mt-4" />`,
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
})
