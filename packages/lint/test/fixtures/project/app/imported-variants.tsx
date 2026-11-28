import Link from "next/link"

import { Button, buttonVariants as appearance } from "@/components/ui/button"
import { DialogTrigger } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export const Applied = <Link className={cn(appearance({ variant: "ghost" }), "text-red-600")} />
export const Rendered = <DialogTrigger render={<Link className={appearance({ variant: "outline" })} />} />
export const WithOverride = <a className={appearance({ className: "bg-red-600" })} />
export const Direct = <Button className="text-red-600" />
