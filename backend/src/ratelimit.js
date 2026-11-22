/**
 * In-memory sliding-window rate limiter per client IP
 */

const rateLimitMap = new Map();

// Periodic cleanup of stale entries (older than 2 minutes)
const CLEANUP_INTERVAL_MS = 60 * 1000;
let lastCleanup = Date.now();

function cleanupStaleEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, record] of rateLimitMap.entries()) {
    if (now - record.resetTime > 120000) {
      rateLimitMap.delete(key);
    }
  }
}

export function checkRateLimit(request, limit = 60, windowMs = 60000) {
  cleanupStaleEntries();

  const clientIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "127.0.0.1";

  const path = new URL(request.url).pathname;
  const key = `${clientIp}:${path.startsWith("/api/auth") ? "auth" : "api"}`;

  const now = Date.now();
  let record = rateLimitMap.get(key);

  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + windowMs };
    rateLimitMap.set(key, record);
    return { allowed: true, remaining: limit - 1, resetInSeconds: Math.ceil(windowMs / 1000) };
  }

  record.count += 1;

  if (record.count > limit) {
    const resetInSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds
    };
  }

  return {
    allowed: true,
    remaining: limit - record.count,
    resetInSeconds: Math.ceil((record.resetTime - now) / 1000)
  };
}
