import { Scroller as ScrollerPrimitive, useScroller } from "minified-kit"
import { cn } from "@/lib/utils"

function ScrollerButton({ className }: { className?: string }) {
  return <ScrollerPrimitive.Button className={cn("bg-background", className)} />
}

export { ScrollerButton, useScroller }
