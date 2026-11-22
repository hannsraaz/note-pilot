const rawConfig = window.APP_CONFIG || {};

const normalizeSection = (section = {}) => ({ ...section });

export const config = {
  apiUrl: rawConfig.apiUrl || "",
  googleAuth: {
    clientId: rawConfig.googleAuth?.clientId || ""
  },
  firebase: normalizeSection(rawConfig.firebase),
  googleDrive: {
    clientId: rawConfig.googleDrive?.clientId || ""
  },
  app: {
    name: rawConfig.app?.name || "NotePilot",
    supportEmail: rawConfig.app?.supportEmail || "support@example.com",
    defaultTheme: rawConfig.app?.defaultTheme || "dark"
  }
};

let remoteConfigLoaded = false;

export async function loadRemoteConfig() {
  if (remoteConfigLoaded) return config;

  try {
    const { getApiBaseUrl } = await import("./api.js");
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/config`);
    if (res.ok) {
      const data = await res.json();
      if (data.googleAuthClientId && !config.googleAuth.clientId) {
        config.googleAuth.clientId = data.googleAuthClientId;
      }
      if (data.googleDriveClientId && !config.googleDrive.clientId) {
        config.googleDrive.clientId = data.googleDriveClientId;
      }
      if (data.appName) config.app.name = data.appName;
      if (data.supportEmail) config.app.supportEmail = data.supportEmail;
      remoteConfigLoaded = true;
    }
  } catch (err) {
    // If backend is not currently reachable, local defaults apply
    console.debug("Backend /api/config not reachable yet:", err);
  }

  return config;
}

export function getConfigWarnings() {
  const warnings = [];
  const host = window.location.hostname;
  let isExamplePlaceholderHost = false;

  if (config.apiUrl) {
    try {
      const apiHost = new URL(config.apiUrl).hostname;
      isExamplePlaceholderHost =
        apiHost === "example.com" || apiHost.endsWith(".example.com");
    } catch (_) {
      isExamplePlaceholderHost = false;
    }
  }

  // On GitHub Pages or production, if apiUrl is still the dummy placeholder
  if (
    host !== "localhost" &&
    host !== "127.0.0.1" &&
    (!config.apiUrl || config.apiUrl.includes("YOUR-SUBDOMAIN") || isExamplePlaceholderHost)
  ) {
    warnings.push("Cloudflare Worker API URL is not configured. Update js/env.js with your deployed Worker endpoint.");
  }

  return warnings;
}

export function requireFirebaseConfig() {
  // Maintained for backward compatibility
  return true;
}
