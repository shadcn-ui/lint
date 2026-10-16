// Wrappers with more than one class prop: each one goes where the wrapper
// hands it, so headerClassName is CardHeader's and className is Card's.
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export function Panel({
  className,
  headerClassName,
}: {
  className?: string
  headerClassName?: string
}) {
  return (
    <Card className={className}>
      <CardHeader className={headerClassName} />
    </Card>
  )
}

export function Members(props: { className?: string; bodyClass?: string }) {
  return (
    <Card className={props.className}>
      <CardContent className={props.bodyClass} />
    </Card>
  )
}

export function Passed(props: React.ComponentProps<typeof Panel>) {
  return <Panel {...props} />
}

export function Renamed({ titleClassName }: { titleClassName?: string }) {
  return <Panel headerClassName={titleClassName} />
}

export function Header({ headerClassName }: { headerClassName?: string }) {
  return <CardHeader className={headerClassName} />
}

export function Dropped({
  className,
}: {
  className?: string
  headerClassName?: string
}) {
  return <Card className={className} />
}
