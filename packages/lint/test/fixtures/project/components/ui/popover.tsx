import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

// Adds nothing: the element it renders owns its look.
function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

// Paints itself, so it judges what it renders.
function PopoverClose({ ...props }: PopoverPrimitive.Close.Props) {
  return (
    <PopoverPrimitive.Close
      data-slot="popover-close"
      className="rounded-md"
      {...props}
    />
  )
}

function decorate<T>(component: T) {
  return component
}

// A call around it may add classes, so it is not proven.
const PopoverAnchor = decorate(({ ...props }: PopoverPrimitive.Trigger.Props) => (
  <PopoverPrimitive.Trigger data-slot="popover-anchor" {...props} />
))

export { PopoverAnchor, PopoverClose, PopoverTrigger }
