/**
 * NotePilot Authentication Module
 * Communicates with the Cloudflare Worker backend.
 * Never stores or exposes Firebase API keys in the browser.
 */

import { apiRequest, clearStoredSession, getStoredToken, getStoredUser, setStoredSession } from "./api.js";
import { config, loadRemoteConfig } from "./config.js";

let currentUser = getStoredUser();
const authListeners = new Set();
let authInitialized = false;

function notifyAuthListeners(user) {
  currentUser = user;
  authListeners.forEach((callback) => {
    try {
      callback(user);
    } catch (e) {
      console.error("Auth listener error:", e);
    }
  });
}

function loadGsiScript() {
  return new Promise((resolve, reject) => {
    if (typeof google !== "undefined" && google.accounts) {
      resolve();
      return;
    }

    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Identity Services.")));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services."));
    document.head.appendChild(script);
  });
}

export function observeAuthState(callback) {
  authListeners.add(callback);

  // Initial verification on startup
  (async () => {
    await loadRemoteConfig();

    const storedToken = getStoredToken();
    if (!storedToken) {
      currentUser = null;
      callback(null);
      return;
    }

    try {
      const data = await apiRequest("/api/auth/me");
      currentUser = data.user || null;
      if (!currentUser) {
        clearStoredSession();
      }
      callback(currentUser);
    } catch {
      // If server verification fails, session is expired/invalid
      clearStoredSession();
      currentUser = null;
      callback(null);
    }
  })();

  return () => {
    authListeners.delete(callback);
  };
}

export async function signInWithGoogle() {
  await loadRemoteConfig();
  const clientId = config.googleDrive.clientId;

  if (!clientId) {
    throw new Error("Google Client ID is not configured. Add it in js/env.js or backend secrets.");
  }

  await loadGsiScript();

  return new Promise((resolve, reject) => {
    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "email profile openid https://www.googleapis.com/auth/drive.file",
        callback: async (response) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }

          try {
            const authResult = await apiRequest("/api/auth/google", {
              method: "POST",
              body: { idToken: response.access_token }
            });

            setStoredSession(authResult.token, authResult.refreshToken, authResult.user);
            notifyAuthListeners(authResult.user);

            // Store Google Drive access token for drive uploads
            sessionStorage.setItem("google_drive_access_token", response.access_token);

            resolve(authResult.user);
          } catch (apiError) {
            reject(apiError);
          }
        }
      });

      client.requestAccessToken({ prompt: "consent" });
    } catch (err) {
      reject(err);
    }
  });
}

export async function signUpWithEmail({ name, email, password }) {
  await loadRemoteConfig();

  const authResult = await apiRequest("/api/auth/register", {
    method: "POST",
    body: { name, email, password }
  });

  setStoredSession(authResult.token, authResult.refreshToken, authResult.user);
  notifyAuthListeners(authResult.user);
  return authResult.user;
}

export async function signInWithEmail({ email, password }) {
  await loadRemoteConfig();

  const authResult = await apiRequest("/api/auth/login", {
    method: "POST",
    body: { email, password }
  });

  setStoredSession(authResult.token, authResult.refreshToken, authResult.user);
  notifyAuthListeners(authResult.user);
  return authResult.user;
}

export async function logoutUser() {
  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
  } catch {
    // Ignore logout request failure, clear local state regardless
  } finally {
    clearStoredSession();
    sessionStorage.removeItem("google_drive_access_token");
    notifyAuthListeners(null);
  }
}

export function getCurrentUser() {
  return currentUser;
}

export async function getUserProfile(userId) {
  if (!userId) return null;
  return await apiRequest(`/api/users/${userId}`);
}
