# SailPoint ISC — CIEM Source Configurator

A single-page web app that lets you configure **SailPoint Identity Security Cloud (ISC) CIEM sources** through a clean UI wizard, replacing manual `curl` commands.

---

## Features

| Step | Description |
|------|-------------|
| 1 | Authenticate with your ISC tenant using Client Credentials OAuth |
| 2 | Select a connector type (CIEM AWS, CIEM Azure, or CIEM GCP) |
| 3 | Fill in source details, search for an owner identity, and enter cloud-specific settings |
| 4 | See the result: source ID, connection test status, and raw API response |

---

## Prerequisites

- **Node.js 18+** (the proxy uses the built-in `fetch` API)
- **npm 9+**
- A SailPoint ISC tenant with API credentials (see below)

---

## Installation

```bash
cd /path/to/CIEM
npm install
```

---

## Running the app

### Option A — Both servers at once (recommended)

```bash
npm start
```

This starts:
- **Proxy server** on `http://localhost:3001` (handles CORS)
- **Vite dev server** on `http://localhost:5173` (the React app)

Open **http://localhost:5173** in your browser.

### Option B — Run them separately

**Terminal 1 — proxy:**
```bash
npm run server
```

**Terminal 2 — Vite:**
```bash
npm run dev
```

### Option C — Vite only (no proxy)

```bash
npm run dev
```

> **Warning:** Without the proxy, all API calls will be blocked by the browser's CORS policy.
> You will see `NetworkError` or `CORS` errors in the console. Use Option A or B in practice.

---

## Why a proxy?

SailPoint ISC does **not** include `Access-Control-Allow-Origin` headers on its API endpoints for browser-direct requests.
The included `server.js` (Express) acts as a local proxy:

```
Browser → http://localhost:5173/api/*
           ↓ (Vite proxies to port 3001)
Proxy  → http://localhost:3001/api/*
           ↓ (adds correct headers, forwards)
ISC API → https://{tenant}.api.identitynow.com/*
```

The React app passes the tenant subdomain in the `X-Tenant` header on every request; the proxy uses it to build the target URL.

---

## How to get an ISC Client ID & Client Secret

1. Log in to your SailPoint ISC tenant at
   `https://<your-tenant>.identitynow.com`

2. Navigate to **Admin → Security Settings → API Management**
   *(or search "API Management" in the admin search bar)*

3. Click **Create New Client**.

4. Give it a name (e.g., `CIEM Configurator`) and select
   **Client Credentials** as the grant type.

5. Under **Enabled OAuth Flows**, enable **CLIENT_CREDENTIALS**.

6. Assign the following API scopes (at minimum):
   - `sp:scopes:all` — or more granularly:
   - `idn:sources:manage` (create/manage sources)
   - `idn:identities:read` (identity search for owner field)

7. Click **Create**. Copy the **Client ID** and **Client Secret**
   (the secret is shown only once — store it safely).

---

## Field reference (Step 3)

| Field | Required | Description |
|-------|----------|-------------|
| Source Name | Yes | Display name for the source in ISC |
| Description | No | Free-text description |
| Source Owner | Yes | Identity who owns this source; search by name |
| Role ARN | Yes | IAM role SailPoint assumes: `arn:aws:iam::<account>:role/<name>` |
| CloudTrail ARN | No | ARN of the CloudTrail trail for activity logging |
| CloudTrail Bucket Account ID | No | AWS account that owns the S3 log bucket (if different) |
| External ID | — | Auto-managed by SailPoint; leave blank |

### Required AWS IAM trust policy for the Role ARN

The IAM role must trust SailPoint's principal. Add a trust relationship like:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::<sailpoint-account>:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "<external-id-from-sailpoint>"
        }
      }
    }
  ]
}
```

> The exact SailPoint account ID and External ID are available in the ISC Admin documentation or from your SailPoint account team.

---

## Project structure

```
CIEM/
├── src/
│   ├── App.jsx                       # Root component, step state machine
│   ├── main.jsx                      # React entry point
│   ├── index.css                     # Tailwind CSS
│   └── components/
│       ├── StepIndicator.jsx         # Top progress bar
│       ├── Step1Login.jsx            # OAuth login form
│       ├── Step2SelectConnector.jsx  # Connector type picker
│       ├── Step3ConfigureSource.jsx  # Source form + identity search
│       └── Step4Result.jsx          # Success/failure + raw JSON
├── index.html
├── server.js                         # Express CORS proxy (Node 18+)
├── vite.config.js                    # Vite + proxy config
├── tailwind.config.js
├── postcss.config.js
└── package.json
```

---

## Available scripts

| Script | Description |
|--------|-------------|
| `npm start` | Run proxy + Vite dev server concurrently |
| `npm run dev` | Vite dev server only (port 5173) |
| `npm run server` | Proxy server only (port 3001) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |

---

## Security notes

- The OAuth token is stored **in React state only** (never in `localStorage` or cookies).
  It is lost when the page is refreshed — this is intentional for security.
- The proxy is intended for **local development only**. Do not expose port 3001 publicly.
- Client credentials should not be committed to source control.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `CORS error` in console | Proxy not running | Run `npm start` or `npm run server` |
| `401 Unauthorized` | Wrong credentials or insufficient scopes | Re-check Client ID/Secret; verify API scopes |
| `404 Not Found` on sources endpoint | Wrong tenant name | Double-check the subdomain (no `.api.identitynow.com`) |
| Identity search returns nothing | Token lacks `idn:identities:read` scope | Re-create the API client with proper scopes |
| `502 Bad Gateway` | Proxy can't reach ISC (network/firewall) | Check internet connectivity and tenant name |
