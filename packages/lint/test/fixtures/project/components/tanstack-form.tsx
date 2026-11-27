import { createFormHook as defineForm } from "@tanstack/react-form"

import { SaveButton as LocalButton } from "./save-button"
import { Field } from "./ui/field"

export const { useAppForm: useProjectForm } = defineForm({
  fieldComponents: { TextField: Field },
  formComponents: { Submit: LocalButton },
})
