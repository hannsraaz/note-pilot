# NotePilot Deployment & Security Architecture Guide

This guide details how to securely configure, deploy, and maintain NotePilot across **Cloudflare Workers** (serverless backend) and **GitHub Pages** (static frontend).

---

## Architecture Overview

```
                      +---------------------------------------+
                      |       User Browser (Client)          |
                      |  Hosted on GitHub Pages (Static HTML) |
                      +-------------------+-------------------+
                                          |
                        HTTPS (REST API)  | Bearer ID Token / JSON
                        CORS Restricted   v
                      +---------------------------------------+
                      |      Cloudflare Worker Backend        |
                      |        (note-pilot-api)               |
                      |  - Validates Requests                 |
                      |  - Rate Limiting (15/min auth)        |
                      |  - Injects FIREBASE_API_KEY Secret    |
                      +-------+-----------------------+-------+
                              |                       |
          Server-to-Server    |                       | Server-to-Server
          Authenticated REST  v                       v Authenticated REST
            +--------------------+         +--------------------+
            | Firebase Auth API  |         |   Cloud Firestore  |
            | (Identity Toolkit) |         |      REST API      |
            +--------------------+         +--------------------+
```

### Key Security Guarantees:
- **Zero Frontend Secrets**: API keys, service tokens, and private credentials are never shipped in frontend JavaScript or HTML.
- **Git Security**: `.env`, `.dev.vars`, and `js/env.js` are gitignored.
- **CORS Protection**: The backend verifies the incoming `Origin` and restricts access to authorized domains.
- **Rate Limiting**: Protects against brute-force attacks and denial-of-wallet spikes.

---

## Table of Contents
1. [Local Development Setup](#1-local-development-setup)
2. [Deploying Backend to Cloudflare Workers](#2-deploying-backend-to-cloudflare-workers)
3. [Configuring Backend Secrets](#3-configuring-backend-secrets)
4. [Deploying Frontend to GitHub Pages](#4-deploying-frontend-to-github-pages)
5. [Connecting Frontend to Backend](#5-connecting-frontend-to-backend)
6. [Updating API Keys Without Frontend Changes](#6-updating-api-keys-without-frontend-changes)
7. [Troubleshooting Common Issues](#7-troubleshooting-common-issues)
8. [Critical Security Notice: Key Rotation](#8-critical-security-notice-key-rotation)

---

## 1. Local Development Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- Free [Cloudflare](https://dash.cloudflare.com/) account
- Firebase project credentials

### Step 1.1: Install Backend Dependencies
Open your terminal in the repository:
```bash
cd backend
npm install
```

### Step 1.2: Configure Local Backend Variables
Copy the example environment file:
```bash
cp .dev.vars.example .dev.vars
```
Open `backend/.dev.vars` and set your actual Firebase credentials:
```ini
FIREBASE_API_KEY=AIzaSy_YOUR_ACTUAL_FIREBASE_API_KEY
FIREBASE_PROJECT_ID=notepilot-8ebf4
ALLOWED_ORIGIN=http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://localhost:8787
GOOGLE_DRIVE_CLIENT_ID=YOUR_GOOGLE_DRIVE_CLIENT_ID.apps.googleusercontent.com
APP_NAME=NotePilot
SUPPORT_EMAIL=support@example.com
DEFAULT_THEME=dark
```

### Step 1.3: Start Local Cloudflare Worker
Inside the `backend/` directory, run:
```bash
npx wrangler dev
```
The Worker backend will start listening at `http://localhost:8787`.

### Step 1.4: Run the Frontend
Serve the project root with any local HTTP server (such as VS Code Live Server, `npx serve`, or Python):
```bash
# In the repository root:
npx serve -l 5500 .
# OR
python -m http.server 5500
```
Open `http://localhost:5500` in your browser. NotePilot automatically connects to `http://localhost:8787` when running on localhost.

---

## 2. Deploying Backend to Cloudflare Workers

### Step 2.1: Log in to Cloudflare CLI
```bash
cd backend
npx wrangler login
```
A browser window will open asking you to authorize Wrangler.

### Step 2.2: Review `backend/wrangler.toml`
Ensure `FIREBASE_PROJECT_ID` and `ALLOWED_ORIGIN` in `wrangler.toml` include your GitHub Pages origin:
```toml
name = "note-pilot-api"
main = "src/index.js"
compatibility_date = "2024-01-01"

[vars]
ALLOWED_ORIGIN = "https://hannsraaz.github.io,http://localhost:5500,http://127.0.0.1:5500"
FIREBASE_PROJECT_ID = "notepilot-8ebf4"
APP_NAME = "NotePilot"
SUPPORT_EMAIL = "support@example.com"
DEFAULT_THEME = "dark"
```

### Step 2.3: Deploy the Worker
```bash
npx wrangler deploy
```
Wrangler will output your live backend URL, for example:
```
https://note-pilot-api.<your-cloudflare-subdomain>.workers.dev
```
Save this URL for the frontend configuration step.

---

## 3. Configuring Backend Secrets

Cloudflare Workers isolates secret credentials in encrypted storage. Secrets are never exposed in code or config files.

Set your Firebase API Key:
```bash
npx wrangler secret put FIREBASE_API_KEY
```
When prompted, paste your secret Firebase API Key and press Enter.

Set your Google Client Secret:
```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
```
When prompted, paste your secret `GOCSPX-...` client secret and press Enter.

You can verify that secrets are active by running:
```bash
npx wrangler secret list
```

---

## 4. Deploying Frontend to GitHub Pages

GitHub Pages serves NotePilot's static assets (`.html`, `.css`, `.js`).

### Option A: GitHub Actions (Recommended)
This repository contains `.github/workflows/deploy.yml`:
1. Push your repository to GitHub:
   ```bash
   git push origin main
   ```
2. Go to your repository on GitHub:
   - Navigate to **Settings** > **Pages**.
   - Under **Build and deployment** > **Source**, select **GitHub Actions**.
3. Every commit pushed to `main` will automatically build and publish the frontend to `https://<username>.github.io/<repo>/`.

### Option B: Deploy from Branch
1. On GitHub, navigate to **Settings** > **Pages**.
2. Under **Build and deployment** > **Source**, choose **Deploy from a branch**.
3. Select `main` branch and `/ (root)` folder.
4. Click **Save**.

---

## 5. Connecting Frontend to Backend

To link your GitHub Pages site to your Cloudflare Worker backend:

### Method 1: HTML Meta Tag (Recommended for GitHub Pages)
Open `index.html`, `dashboard.html`, `login.html`, `note.html`, and `upload.html` and update the `<meta name="api-base-url">` tag:
```html
<meta name="api-base-url" content="https://note-pilot-api.YOUR-SUBDOMAIN.workers.dev">
```

### Method 2: Local `js/env.js` (Kept gitignored)
Create `js/env.js` (from `js/env.example.js`):
```javascript
window.APP_CONFIG = {
  apiUrl: "https://note-pilot-api.YOUR-SUBDOMAIN.workers.dev",
  app: {
    name: "NotePilot",
    supportEmail: "support@example.com",
    defaultTheme: "dark"
  }
};
```
Because `js/env.js` is in `.gitignore`, this configuration will never be committed to GitHub.

---

## 6. Updating API Keys Without Frontend Changes

If you ever rotate or change your Firebase API key:

1. Update the secret in Cloudflare Workers:
   ```bash
   cd backend
   npx wrangler secret put FIREBASE_API_KEY
   ```
2. The change takes effect **instantaneously across all Cloudflare edge data centers worldwide**.
3. **No frontend redeployment, Git commit, or browser cache invalidation is required**.

---

## 7. Troubleshooting Common Issues

### 1. `CORS origin denied` / Failed to fetch
- **Cause**: The domain hosting your frontend is not in the `ALLOWED_ORIGIN` variable.
- **Fix**: Open `backend/wrangler.toml`, add your domain (e.g. `https://<username>.github.io`) to `ALLOWED_ORIGIN`, and redeploy with `npx wrangler deploy`.

### 2. `Backend is missing FIREBASE_API_KEY secret` (HTTP 500)
- **Cause**: `FIREBASE_API_KEY` was not uploaded to Cloudflare Workers secrets.
- **Fix**: Run `npx wrangler secret put FIREBASE_API_KEY` in the `backend/` directory.

### 3. `Too many requests` (HTTP 429)
- **Cause**: Rate limiter triggered due to excessive requests within 60 seconds (15 req/min on auth, 120 req/min on general endpoints).
- **Fix**: Wait 60 seconds before retrying.

### 4. Google Drive Upload: `No access token returned from Google`
- **Cause**: Google Identity Services needs the current domain added to Authorized JavaScript Origins.
- **Fix**:
  1. Open [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
  2. Select your OAuth 2.0 Web Client ID.
  3. Under **Authorized JavaScript origins**, add your GitHub Pages URL:
     `https://<username>.github.io`
     and your local dev URLs:
     `http://localhost:5500` and `http://127.0.0.1:5500`.
  4. Click **Save**.

---

## 8. Critical Security Notice: Key Rotation

> [!WARNING]
> During the security audit, it was discovered that the Firebase Web API key (`AIzaSyA1taIGEIbHIH80Ovkxrl2Yo1Hr5OcFklA`) was previously committed in Git history and pushed to the public GitHub repository in earlier commits (`3461e5d` and `5697861`).

Removing the key from the latest commit **does not revoke access** because it remains in the Git revision history accessible to anyone who clones or inspects the repository.

### Required Immediate Actions:
1. **Rotate the Firebase API Key in Google Cloud Console**:
   - Go to [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials).
   - Find the API Key `AIzaSyA1taIGEIbHIH80Ovkxrl2Yo1Hr5OcFklA`.
   - Click **Edit API Key**.
   - Under **API restrictions**, restrict it to:
     - *Identity Toolkit API*
     - *Cloud Firestore API*
     - *Token Service API*
   - Generate a **new API key** and delete the old exposed key.
2. **Set the New Key in Cloudflare Workers**:
   ```bash
   cd backend
   npx wrangler secret put FIREBASE_API_KEY
   ```
3. **Optional Git History Scrubbing**:
   If the GitHub repository is public, consider using [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) or `git-filter-repo` to scrub historical commits:
   ```bash
   git filter-repo --replace-text <(echo "AIzaSyA1taIGEIbHIH80Ovkxrl2Yo1Hr5OcFklA==>REDACTED")
   ```
