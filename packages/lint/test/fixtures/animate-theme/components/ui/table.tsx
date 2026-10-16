export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={["border-b", className].join(" ")} {...props} />
}
