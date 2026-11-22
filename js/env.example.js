/**
 * NotePilot Frontend Configuration Template
 * Copy this file to js/env.js to customize your frontend endpoints.
 * Never commit real API keys or secrets here.
 */
window.APP_CONFIG = {
  // Your deployed Cloudflare Worker URL
  apiUrl: "https://note-pilot-api.YOUR-SUBDOMAIN.workers.dev",

  // Optional: Google Drive OAuth Web Client ID for PDF uploads
  googleDrive: {
    clientId: "YOUR_GOOGLE_DRIVE_CLIENT_ID.apps.googleusercontent.com"
  },

  app: {
    name: "NotePilot",
    supportEmail: "support@example.com",
    defaultTheme: "dark"
  }
};
