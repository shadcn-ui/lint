export function cn(...inputs: unknown[]) {
  return inputs.filter(Boolean).join(" ")
}
