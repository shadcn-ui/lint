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
})
