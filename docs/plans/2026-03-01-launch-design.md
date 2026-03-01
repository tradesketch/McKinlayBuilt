# TradeSketch Launch Design

**Goal:** Get TradeSketch live — trial system, hosted server, Mac/Windows builds, and download website.

**Architecture:**
- Electron desktop app (Mac + Windows) calls a hosted Express API instead of localhost
- Trial tracking is server-side so it cannot be tampered with
- GitHub Releases serves installers; electron-updater handles auto-updates
- Static landing page on GitHub Pages links to latest release downloads

**Tech Stack:** Electron 33, Express 4, better-sqlite3, Railway (server host), GitHub Actions (CI builds), GitHub Pages (website)

---

## Section 1: Trial System

**Server changes:**
- Add `trial_start` column to `users` table (set on registration)
- `TRIAL_DAYS` env var (default 30) controls length
- `/auth/me` response includes `{ trialDaysRemaining, trialExpired }`

**App changes:**
- On load: call `/auth/me`, store trial status
- Show dismissable banner: "X days left in your trial"
- On expiry: overlay screen with "Your trial has ended — subscribe to continue" and a link to the website
- Trial banner and expiry screen skip if not logged in (guest mode keeps working)

---

## Section 2: Server on Railway

- Deploy `server/` to Railway via GitHub integration (auto-deploys on push)
- Set all env vars in Railway dashboard: `JWT_SECRET`, `TRIAL_DAYS`, `RESEND_API_KEY`, `MAILCHIMP_API_KEY`, `MAILCHIMP_LIST_ID`
- App reads server URL from `app/config.json` key `"serverUrl"`
- In dev: `serverUrl = "http://localhost:3141"`, in prod: `"https://tradesketch-api.railway.app"`
- All `fetch('http://localhost:3141/...')` calls in `mck-sketch.html` replaced with a `SERVER_URL` constant read from `window.api.getConfig()`
- `main.js` passes `serverUrl` from config.json to renderer via existing `get-config` IPC handler

---

## Section 3: Mac + Windows Builds via GitHub Actions

- GitHub Actions workflow triggers on `git tag v*`
- Builds Mac `.dmg` (Apple Silicon + Intel universal) and Windows `.exe` (NSIS)
- Creates GitHub Release and uploads both files as assets
- `package.json` publish config already points at `mckinlaybuilt/McKinlayBuilt`
- Auto-updater in app already wired up — users get prompted to update automatically

---

## Section 4: Download Website (GitHub Pages)

Single HTML page at `docs/website/index.html` (served via GitHub Pages from `/docs`).

**Design:** Dark background matching app theme (`#1e1e24`), TradeSketch gold accent (`#F5C518`), logo at top, tagline, 3 feature bullets, two download buttons (Mac + Windows) linking to latest GitHub Release.

**Content:**
- Logo + "TRADESKETCH" wordmark
- Tagline: "The CAD & floor plan tool built for the trades"
- Features: Floor plan drawing, CAD overlay, 3D view, Built for tradespeople
- Download for Mac (DMG) button
- Download for Windows (EXE) button
- Small print: free 30-day trial, no credit card required
