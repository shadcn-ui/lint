import type { ComponentProps } from "react"

import { Button } from "."

export function SaveButton(props: ComponentProps<typeof Button>) {
  return <Button variant="primary" {...props} />
}
