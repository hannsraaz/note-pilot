/**
 * CORS handling and headers
 */

export function parseAllowedOrigins(allowedOriginSetting) {
  if (!allowedOriginSetting) {
    return ["*"];
  }
  return allowedOriginSetting.split(",").map((s) => s.trim()).filter(Boolean);
}

export function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) return true; // Direct/server-to-server or same-origin
  if (allowedOrigins.includes("*")) return true;
  if (allowedOrigins.includes(origin)) return true;

  // Support GitHub Pages domains automatically if listed or matching repo
  try {
    const url = new URL(origin);
    if (url.hostname.endsWith(".github.io")) {
      return true;
    }
    // Allow localhost during development
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function getCorsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGIN);
  const allowOrigin = isOriginAllowed(origin, allowed) ? origin : (allowed[0] || "*");

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

export function handleOptions(request, env) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, env)
  });
}

export function jsonResponse(data, status = 200, request, env, extraHeaders = {}) {
  const corsHeaders = getCorsHeaders(request, env);
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...extraHeaders
    }
  });
}
