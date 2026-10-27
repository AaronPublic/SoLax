import "server-only";

// Fixed-window rate limiting per client IP, kept in memory. It's per server instance, so on a
// multi-instance host it's a soft limit, but it stops one client from draining the NREL quota
// (1,000 calls/hour per key) or flooding the database. Swap for a shared store (e.g. Redis) if
// the app ever runs at scale.

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();
const MAX_KEYS = 10_000;

export interface RateLimit {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
}

export const LIMITS = {
  calculate: { limit: 20, windowMs: 60_000 },
  buildings: { limit: 60, windowMs: 60_000 },
  savePlan: { limit: 10, windowMs: 60_000 },
} satisfies Record<string, RateLimit>;

function clientIp(request: Request): string {
  // Behind a proxy/CDN (Vercel, Cloudflare, nginx) the client is the first x-forwarded-for hop.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

/**
 * Returns a 429 response when the caller is over the limit for `name`, otherwise null.
 */
export function rateLimit(request: Request, name: keyof typeof LIMITS): Response | null {
  const { limit, windowMs } = LIMITS[name];
  const key = `${name}:${clientIp(request)}`;
  const now = Date.now();

  let w = buckets.get(key);
  if (!w || w.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
      if (buckets.size >= MAX_KEYS) buckets.clear();
    }
    w = { count: 0, resetAt: now + windowMs };
    buckets.set(key, w);
  }

  w.count++;
  if (w.count <= limit) return null;

  const retryAfter = Math.ceil((w.resetAt - now) / 1000);
  return Response.json(
    { error: `Too many requests. Please wait ${retryAfter} s and try again.` },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
