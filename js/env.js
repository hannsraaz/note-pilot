/**
 * NotePilot Frontend Configuration
 * SECURE ARCHITECTURE:
 * Never put secret keys (client_secret, Firebase private keys, passwords) in this file.
 * All secrets belong strictly in the Cloudflare Worker backend environment (wrangler secret put).
 */
window.APP_CONFIG = {
  // Cloudflare Worker backend API URL
  // Example: "https://note-pilot-api.YOUR-SUBDOMAIN.workers.dev"
  // When running locally, defaults automatically to "http://localhost:8787" if left empty.
  apiUrl: "https://note-pilot-api.hannsraaz.workers.dev",

  // Firebase Google sign-in Web Client ID
  googleAuth: {
    clientId: "857579149979-i5gbc6fnhfdj0lebh56umtllr3nc8goa.apps.googleusercontent.com"
  },

  // Google Drive OAuth Client ID (Public Web Client ID)
  googleDrive: {
    clientId: "186193829621-2ludp1od1tn7vbikenpgomhfd8kl33kc.apps.googleusercontent.com"
  },

  app: {
    name: "NotePilot",
    supportEmail: "support@example.com",
    defaultTheme: "dark"
  }
};
