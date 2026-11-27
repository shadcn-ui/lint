import { SaveButton } from "../components/save-button"
import { useProjectForm as useForm } from "../components/tanstack-form"

export function Page() {
  const form = useForm({ defaultValues: { name: "" } })
  return (
    <form.AppForm>
      <SaveButton className="text-red-600" />
      <form.Submit className="text-red-600" />
      <form.AppField name="name">
        {(field) => <field.TextField className="bg-red-600" />}
      </form.AppField>
    </form.AppForm>
  )
}
