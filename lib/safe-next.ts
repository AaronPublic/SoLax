/**
 * Validates a post-login redirect target: only same-site paths, so `?next=` can't be used to
 * bounce users to another website.
 */
export function safeNext(next: string | null | undefined, fallback = "/plans"): string {
  if (!next || !next.startsWith("/")) return fallback;
  // URL parsers drop tabs/newlines and treat "\" like "/", so "/\t/evil.com" or "/\evil.com"
  // would become the protocol-relative "//evil.com". Reject control characters and backslashes,
  // then confirm the resolved URL stays on our origin.
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  try {
    const base = "http://same-origin.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
