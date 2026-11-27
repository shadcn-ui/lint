import * as fs from "node:fs"
import * as path from "node:path"
import { test } from "vitest"

import { noRestyle } from "../src/rules/no-restyle"
import { createTester, PROJECT } from "./helpers"

const filename = path.join(PROJECT, "app/tanstack-form.tsx")
const code = fs.readFileSync(filename, "utf-8")
const options = [
  {
    contracts: [
      { pattern: "^Button$", allow: ["layout"] },
      { pattern: "^Field$", allow: ["layout"] },
    ],
  },
]

test("TanStack registrations use the registered component’s contract", () => {
  createTester().run(
    "no-restyle for registered TanStack Form components",
    noRestyle as any,
    {
      valid: [
        {
          filename,
          options,
          code: code.replace(/text-red-600|bg-red-600/g, "w-full"),
        },
        {
          filename,
          options,
          code: `
      import { useProjectForm } from "../components/tanstack-form"
      const form = useProjectForm({})
      function Other(form) {
        return <form.Submit className="text-red-600" />
      }
      const unknown = <form.AppField>{() => {
        const field = someOtherField()
        return <field.TextField className="bg-red-600" />
      }}</form.AppField>
    `,
        },
        {
          filename,
          options,
          code: `
      import { createFormHook } from "other-package"
      import { SaveButton } from "../components/save-button"
      const { useAppForm } = createFormHook({ formComponents: { Submit: SaveButton } })
      const form = useAppForm({})
      const view = <form.Submit className="text-red-600" />
    `,
        },
      ],
      invalid: [
        {
          filename,
          options,
          code,
          errors: [
            { messageId: "appearanceClassViaWrapper", line: 8 },
            { messageId: "appearanceClassViaWrapper", line: 9 },
            { messageId: "appearanceClassViaWrapper", line: 11 },
          ],
        },
        {
          filename,
          options,
          code: `
        import { createFormHook } from "@tanstack/react-form"
        import { SaveButton } from "../components/save-button"
        const { useAppForm } = createFormHook({ formComponents: { Submit: SaveButton } })
        const form = useAppForm({})
        const view = <form.Submit className="text-red-600" />
      `,
          errors: [{ messageId: "appearanceClassViaWrapper" }],
        },
      ],
    }
  )
})
