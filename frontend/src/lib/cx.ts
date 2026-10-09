/** Join class names, skipping falsy parts. Server- and client-safe. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
