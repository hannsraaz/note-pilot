const rawConfig = window.APP_CONFIG || {};

const normalizeSection = (section = {}) => ({ ...section });

export const config = {
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

const isFilled = (value) => {
  if (typeof value !== "string") {
    return Boolean(value);
  }

  const trimmed = value.trim();
  return trimmed !== "" && !trimmed.startsWith("YOUR_");
};

export const firebaseConfigured = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId"
].every((key) => isFilled(config.firebase[key]));

export function getConfigWarnings() {
  const warnings = [];

  if (!firebaseConfigured) {
    warnings.push("Firebase configuration is incomplete. Update js/env.js before testing auth, Firestore, and Storage.");
  }

  return warnings;
}

export function requireFirebaseConfig() {
  if (!firebaseConfigured) {
    throw new Error("Firebase is not configured. Update js/env.js with your project credentials.");
  }
}
