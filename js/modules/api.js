/**
 * NotePilot Central API Client
 * Connects frontend to the secure Cloudflare Worker backend.
 */

import { config } from "./config.js";

const TOKEN_KEY = "notepilot_id_token";
const REFRESH_TOKEN_KEY = "notepilot_refresh_token";
const USER_KEY = "notepilot_user_data";

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || null;
}

export function getStoredRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY) || null;
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredSession(token, refreshToken, user) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }

  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } else if (refreshToken === null) {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else if (user === null) {
    localStorage.removeItem(USER_KEY);
  }
}

export function clearStoredSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getApiBaseUrl() {
  // 1. Explicit window APP_CONFIG override
  if (config.apiUrl) {
    return config.apiUrl.replace(/\/+$/, "");
  }

  // 2. Check meta tag <meta name="api-base-url" content="...">
  const metaTag = document.querySelector('meta[name="api-base-url"]');
  if (metaTag?.content) {
    return metaTag.content.replace(/\/+$/, "");
  }

  // 3. In local development environment
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return "http://localhost:8787";
  }

  // 4. Default production Cloudflare Worker fallback
  return "https://note-pilot-api.workers.dev";
}

let isRefreshing = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

async function tryRefreshToken() {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    clearStoredSession();
    return null;
  }

  const baseUrl = getApiBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });

    if (!res.ok) {
      clearStoredSession();
      return null;
    }

    const data = await res.json();
    setStoredSession(data.token, data.refreshToken || refreshToken, getStoredUser());
    return data.token;
  } catch {
    return null;
  }
}

export async function apiRequest(endpoint, { method = "GET", body, headers = {}, requiresAuth = false } = {}) {
  const baseUrl = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${cleanEndpoint}`;

  const requestHeaders = {
    "Content-Type": "application/json",
    ...headers
  };

  const token = getStoredToken();
  if (token) {
    requestHeaders["Authorization"] = `Bearer ${token}`;
  } else if (requiresAuth) {
    throw new Error("You must be logged in to perform this action.");
  }

  const options = {
    method,
    headers: requestHeaders
  };

  if (body !== undefined && method !== "GET" && method !== "HEAD") {
    options.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch (netError) {
    console.error("Network error accessing API:", netError);
    throw new Error(`Unable to connect to the backend server (${baseUrl}). Verify the backend is running.`);
  }

  // Auto-refresh token if 401 Unauthorized received
  if (response.status === 401 && getStoredRefreshToken()) {
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await tryRefreshToken();
      isRefreshing = false;

      if (newToken) {
        onRefreshed(newToken);
        requestHeaders["Authorization"] = `Bearer ${newToken}`;
        options.headers = requestHeaders;
        return (await fetch(url, options)).json();
      }
    } else {
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh(async (newToken) => {
          if (!newToken) {
            reject(new Error("Session expired. Please sign in again."));
            return;
          }
          requestHeaders["Authorization"] = `Bearer ${newToken}`;
          options.headers = requestHeaders;
          try {
            const retryRes = await fetch(url, options);
            resolve(await retryRes.json());
          } catch (e) {
            reject(e);
          }
        });
      });
    }
  }

  let data = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const message = (data && typeof data === "object" && data.error) ||
      (typeof data === "string" && data) ||
      `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}
