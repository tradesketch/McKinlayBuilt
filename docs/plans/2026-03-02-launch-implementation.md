# TradeSketch Launch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Get TradeSketch production-ready — configurable server URL, server-side trial system, trial UI in app, GitHub Actions CI builds, and a GitHub Pages download website.

**Architecture:** Electron desktop app talks to a hosted Express API. `API_BASE` is read from `app/config.json` at startup (dev overrides to localhost; production build uses Railway URL baked in as default). Trial state is server-side only (tamper-proof). GitHub Actions builds Mac + Windows installers on every `v*` tag.

**Tech Stack:** Electron 33, Express 4, better-sqlite3, Railway (server), GitHub Actions, GitHub Pages

---

## Task 1: Configurable API_BASE

**Files:**
- Modify: `app/mck-sketch.html` — line 46180 (const API_BASE declaration) and lines 54253–54712 (14 hardcoded localhost refs)
- Modify: `app/config.json` — add `serverUrl` key

**Context:** The app currently has `const API_BASE = 'http://localhost:3141'` at line 46180 and 14 additional hardcoded `http://localhost:3141` URLs scattered through the warehouse/announcements/feedback sections. All need to use `API_BASE`. In production, `config.json` is excluded from the build (`!app/config.json` in package.json), so the app will use whatever default is baked into the script.

**Step 1: Add serverUrl to config.json**

Edit `app/config.json` to add `"serverUrl": "http://localhost:3141"`:

```json
{
  "weather": {
    "city": "Clydebank"
  },
  "authToken": "...(keep existing token)...",
  "serverUrl": "http://localhost:3141"
}
```

**Step 2: Find where config is loaded in mck-sketch.html**

Search for `get-config` or `window.api.invoke` to find where config is loaded at startup. It will look something like:

```javascript
const config = await window.api.invoke('get-config');
```

The `serverUrl` from config needs to be used to set `API_BASE` before any fetch calls run.

**Step 3: Replace the API_BASE declaration (line ~46180)**

Change:
```javascript
const API_BASE = 'http://localhost:3141';
```

To:
```javascript
var API_BASE = 'https://tradesketch-api.railway.app';
```

Note: Use `var` (not `const`) so it can be overridden by config at startup. The default is the production Railway URL — this is what packaged builds will use since `config.json` is excluded.

**Step 4: Set API_BASE from config at startup**

Find the `initApp` function or equivalent startup function where `get-config` IPC is called. Add this line after config is loaded:

```javascript
if (config.serverUrl) API_BASE = config.serverUrl;
```

**Step 5: Replace all remaining hardcoded localhost:3141 URLs**

There are 14 remaining hardcoded occurrences in warehouse/announcements/feedback sections (lines ~54253–54712). Replace each `'http://localhost:3141` with `API_BASE +` (removing the closing quote after the base URL and adjusting string concatenation).

Examples:
```javascript
// Before:
const res = await fetch('http://localhost:3141/api/warehouse/categories', {
// After:
const res = await fetch(API_BASE + '/api/warehouse/categories', {

// Before:
img.src = 'http://localhost:3141/api/warehouse/item/' + item.id + '/thumbnail';
// After:
img.src = API_BASE + '/api/warehouse/item/' + item.id + '/thumbnail';
```

**Step 6: Verify in dev**

Start the server and app. Open DevTools (Cmd+Option+I), check Network tab — all requests should go to `http://localhost:3141`. No 404s or CORS errors.

**Step 7: Commit**

```
git add app/mck-sketch.html app/config.json
git commit -m "feat: configurable API_BASE from config.json with Railway production default"
```

---

## Task 2: Trial System — Server Side

**Files:**
- Modify: `server/db/schema.sql` — add `trial_start` column to users table
- Modify: `server/src/database.js` — add migration for existing databases
- Modify: `server/src/routes/auth.js` — stamp trial_start on register; return trial status from /auth/me

**Context:** The users table currently has: `id, email, password_hash, display_name, created_at, last_login`. We need `trial_start`. The `TRIAL_DAYS` env var (default 30) controls trial length. `/auth/me` must return `trialDaysRemaining` and `trialExpired` so the app can show the banner/overlay.

**Step 1: Update schema.sql**

Add `trial_start` column to the users table definition:

```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    trial_start DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Step 2: Add migration in database.js**

Find the database initialization in `server/src/database.js`. After the schema is applied, add a migration that safely adds the column to existing databases (SQLite throws if column already exists, so wrap in try/catch):

```javascript
// Migrate existing databases
try {
  db.exec('ALTER TABLE users ADD COLUMN trial_start DATETIME DEFAULT CURRENT_TIMESTAMP');
} catch (e) {
  // Column already exists — safe to ignore
}
```

**Step 3: Stamp trial_start on register**

In `server/src/routes/auth.js`, the register route inserts: `INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)`.

Change to explicitly set `trial_start`:

```javascript
const result = db.prepare(
  'INSERT INTO users (email, password_hash, display_name, trial_start) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
).run(email.toLowerCase(), hash, displayName);
```

**Step 4: Return trial status from /auth/me**

Replace the current `/auth/me` handler:

```javascript
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, email, display_name, trial_start FROM users WHERE id = ?').get(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const trialDays = parseInt(process.env.TRIAL_DAYS || '30', 10);
  const trialStart = user.trial_start ? new Date(user.trial_start) : new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSinceStart = Math.floor((Date.now() - trialStart.getTime()) / msPerDay);
  const trialDaysRemaining = Math.max(0, trialDays - daysSinceStart);
  const trialExpired = trialDaysRemaining === 0;

  res.json({
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    trialDaysRemaining,
    trialExpired
  });
});
```

**Step 5: Test manually**

Start the server (`cd server && node src/index.js`). Register a new user, then call `/auth/me` with the token. Response should include `trialDaysRemaining: 30` and `trialExpired: false`.

To test expiry, temporarily set `TRIAL_DAYS=0` in `.env` and verify `trialExpired: true` comes back.

**Step 6: Commit**

```
cd /Users/taylor/McKinlayBuilt
git add server/db/schema.sql server/src/database.js server/src/routes/auth.js
git commit -m "feat: server-side trial system with trialDaysRemaining in /auth/me"
```

---

## Task 3: Trial Banner and Expiry Overlay in App

**Files:**
- Modify: `app/mck-sketch.html` — HTML for banner + overlay, CSS for both, JS to call /auth/me and show them

**Context:** The banner shows "X days left in your trial" at the top of the app and is dismissable. The overlay blocks the whole app when the trial expires with a message and link to the website. Both are skipped if the user is not logged in (guest mode). The `/auth/me` call already happens at app startup — we just need to use the new fields it returns.

**Step 1: Find the existing /auth/me call**

Search for `/auth/me` in `mck-sketch.html`. It's around line 46309:

```javascript
const res = await fetch(API_BASE + '/auth/me', {
```

This is called during `initAuth()` or similar. The response currently only uses `id`, `email`, `displayName`. We now also use `trialDaysRemaining` and `trialExpired`.

**Step 2: Add trial banner HTML**

Find the top of the app body (near `<div id="app">` or the main layout div). Add the banner just inside it:

```html
<div id="trial-banner" style="display:none">
  <span id="trial-banner-text"></span>
  <button onclick="document.getElementById('trial-banner').style.display='none'" title="Dismiss">✕</button>
</div>
```

**Step 3: Add trial expiry overlay HTML**

Add this just before the closing `</body>` tag:

```html
<div id="trial-expired-overlay" style="display:none">
  <div id="trial-expired-box">
    <div id="trial-expired-logo">TRADE<span>SKETCH</span></div>
    <h2>Your free trial has ended</h2>
    <p>Subscribe to keep using TradeSketch.</p>
    <a href="https://mckinlaybuilt.github.io/McKinlayBuilt" onclick="window.api.invoke('open-external', 'https://mckinlaybuilt.github.io/McKinlayBuilt'); return false;">Visit TradeSketch.app</a>
    <p class="trial-expired-sub">Or <a href="#" onclick="logoutUser(); return false;">sign out</a> to continue as guest</p>
  </div>
</div>
```

**Step 4: Add CSS for banner and overlay**

Find the CSS section. Add:

```css
#trial-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #2a2a1a;
  border-bottom: 1px solid #5a4a00;
  color: #F5C518;
  font-size: 12px;
  padding: 5px 14px;
  gap: 8px;
  z-index: 1000;
}
#trial-banner button {
  background: none;
  border: none;
  color: #F5C518;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.7;
  padding: 0;
}
#trial-banner button:hover { opacity: 1; }

#trial-expired-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.85);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
}
#trial-expired-box {
  background: #1e1e24;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 48px 56px;
  text-align: center;
  max-width: 420px;
}
#trial-expired-logo {
  font-family: 'Impact', 'Arial Black', sans-serif;
  font-size: 28px;
  font-weight: 900;
  color: #fff;
  letter-spacing: 1px;
  margin-bottom: 20px;
}
#trial-expired-logo span { color: #F5C518; }
#trial-expired-box h2 { color: #fff; margin: 0 0 10px; font-size: 20px; }
#trial-expired-box p { color: #aaa; font-size: 14px; margin: 0 0 20px; }
#trial-expired-box a {
  display: inline-block;
  background: #F5C518;
  color: #111;
  font-weight: 700;
  padding: 11px 28px;
  border-radius: 6px;
  text-decoration: none;
  font-size: 14px;
}
#trial-expired-box a:hover { background: #ffd740; }
.trial-expired-sub { margin-top: 16px !important; font-size: 12px !important; }
.trial-expired-sub a { background: none !important; color: #888 !important; padding: 0 !important; display: inline !important; font-weight: normal !important; }
.trial-expired-sub a:hover { color: #ccc !important; }
```

**Step 5: Update the /auth/me handler in JS to show trial UI**

Find the code that processes the `/auth/me` response. After setting user info (displayName, etc.), add:

```javascript
// Trial UI
if (data.trialExpired) {
  document.getElementById('trial-expired-overlay').style.display = 'flex';
} else if (data.trialDaysRemaining !== undefined && data.trialDaysRemaining <= 14) {
  var banner = document.getElementById('trial-banner');
  var txt = document.getElementById('trial-banner-text');
  if (banner && txt) {
    txt.textContent = data.trialDaysRemaining === 1
      ? '1 day left in your free trial'
      : data.trialDaysRemaining + ' days left in your free trial';
    banner.style.display = 'flex';
  }
}
```

(Banner only shows when ≤14 days remain to avoid nagging users early in the trial.)

**Step 6: Verify**

Start app in dev. Log in. The trial banner should not show (>14 days remaining). Test by temporarily returning `trialDaysRemaining: 5` from the server and verifying the banner appears. Test `trialExpired: true` to see the overlay.

**Step 7: Commit**

```
git add app/mck-sketch.html
git commit -m "feat: trial banner and expiry overlay in app"
```

---

## Task 4: GitHub Actions CI — Mac + Windows Builds

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `package.json` — add `artifactName` to mac and win build config for stable filenames

**Context:** `electron-builder` is already set up in `package.json` with `publish.provider = "github"`, `owner = "mckinlaybuilt"`, `repo = "McKinlayBuilt"`. The workflow needs a `GH_TOKEN` secret in the repo settings. Mac builds need a macOS runner; Windows builds need a Windows runner. We build both in parallel.

**Step 1: Add artifactName to package.json**

In the `"build"` section of `package.json`, add `artifactName` to mac and win so the download URL is stable across versions:

```json
"mac": {
  "target": "dmg",
  "category": "public.app-category.graphics-design",
  "icon": "build/icon.png",
  "artifactName": "TradeSketch.${ext}"
},
"win": {
  "target": "nsis",
  "icon": "build/icon.png",
  "artifactName": "TradeSketch-Setup.${ext}"
},
```

(This makes the files `TradeSketch.dmg` and `TradeSketch-Setup.exe` regardless of version number.)

**Step 2: Create .github/workflows/release.yml**

Create the directory first: `mkdir -p .github/workflows`

Then create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build-mac:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build:mac
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build:win
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
```

**Step 3: Add GH_TOKEN secret to GitHub repo**

This is a manual step:
1. Go to `https://github.com/mckinlaybuilt/McKinlayBuilt/settings/secrets/actions`
2. Click "New repository secret"
3. Name: `GH_TOKEN`, Value: a GitHub personal access token with `repo` scope
4. Save

**Step 4: Test the workflow**

Commit everything, then create a test tag:

```
git tag v0.1.0-test
git push origin v0.1.0-test
```

Watch the Actions tab on GitHub. Both jobs should run. Once complete, a GitHub Release should appear with `TradeSketch.dmg` and `TradeSketch-Setup.exe` as assets.

If builds fail, check the Actions logs. Common issues: missing icon file at `build/icon.png`, or `npm ci` failing because `package-lock.json` is out of date (run `npm install` locally first).

**Step 5: Commit**

```
git add .github/workflows/release.yml package.json
git commit -m "feat: GitHub Actions CI for Mac and Windows release builds"
```

---

## Task 5: Download Website (GitHub Pages)

**Files:**
- Create: `docs/website/index.html`

**Context:** Design spec: dark background `#1e1e24`, gold accent `#F5C518`, logo SVG inline at top, tagline, 3 feature bullets, two download buttons. The logo SVG is at `app/tradesketch-logo.svg` — it uses dark text (`#FFFFFF` for TRADE, `#F5C518` for SKETCH) so it works on dark backgrounds. Download buttons link to the GitHub Release assets using the stable filenames set in Task 4.

**Step 1: Create docs/website/ directory**

```
mkdir -p docs/website
```

**Step 2: Create docs/website/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TradeSketch — CAD & Floor Plan Tool for the Trades</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #1e1e24;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
    }
    .logo-wrap { margin-bottom: 28px; }
    .logo-wrap img { height: 80px; width: auto; }
    .tagline {
      font-size: 20px;
      color: #ccc;
      text-align: center;
      margin-bottom: 40px;
      max-width: 520px;
      line-height: 1.5;
    }
    .features {
      list-style: none;
      margin-bottom: 48px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 400px;
      width: 100%;
    }
    .features li {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 15px;
      color: #bbb;
    }
    .features li::before {
      content: '';
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #F5C518;
      flex-shrink: 0;
    }
    .buttons {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      justify-content: center;
      margin-bottom: 24px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 14px 28px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 700;
      text-decoration: none;
      transition: background 0.15s;
      min-width: 200px;
      justify-content: center;
    }
    .btn-mac { background: #F5C518; color: #111; }
    .btn-mac:hover { background: #ffd740; }
    .btn-win { background: #2a2a34; color: #e0e0e0; border: 1px solid #444; }
    .btn-win:hover { background: #333340; }
    .btn svg { width: 20px; height: 20px; flex-shrink: 0; }
    .small-print {
      font-size: 12px;
      color: #666;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="logo-wrap">
    <img src="https://raw.githubusercontent.com/mckinlaybuilt/McKinlayBuilt/main/app/tradesketch-logo.svg" alt="TradeSketch" height="80">
  </div>

  <p class="tagline">The CAD &amp; floor plan tool built for the trades</p>

  <ul class="features">
    <li>Draw professional floor plans fast</li>
    <li>Overlay CAD drawings on your floor plans</li>
    <li>View your designs in 3D</li>
    <li>Built for tradespeople, not architects</li>
  </ul>

  <div class="buttons">
    <a class="btn btn-mac"
       href="https://github.com/mckinlaybuilt/McKinlayBuilt/releases/latest/download/TradeSketch.dmg">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
      </svg>
      Download for Mac
    </a>
    <a class="btn btn-win"
       href="https://github.com/mckinlaybuilt/McKinlayBuilt/releases/latest/download/TradeSketch-Setup.exe">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 12V6.75l6-1.32v6.57H3zm17 0v-7l-8 1.4V12h8zM3 13h6v6.43l-6-1.33V13zm17 0h-8v7l8-1.4V13z"/>
      </svg>
      Download for Windows
    </a>
  </div>

  <p class="small-print">Free 30-day trial &mdash; no credit card required</p>
</body>
</html>
```

**Step 3: Configure GitHub Pages**

This is a manual step in the GitHub repo settings:
1. Go to `https://github.com/mckinlaybuilt/McKinlayBuilt/settings/pages`
2. Source: "Deploy from a branch"
3. Branch: `main`, Folder: `/docs`
4. Save

The site will be available at `https://mckinlaybuilt.github.io/McKinlayBuilt`

**Step 4: Verify**

Push to main. After a minute, visit the GitHub Pages URL. Check that:
- Logo loads (raw GitHub URL to SVG)
- Both download buttons appear
- Page looks correct on mobile (responsive)

**Step 5: Commit**

```
git add docs/website/index.html
git commit -m "feat: TradeSketch download website for GitHub Pages"
```

---

## Manual Steps After All Tasks

These require action outside the codebase:

1. **Railway deployment** — push `server/` to Railway via GitHub integration. Set env vars in Railway dashboard: `JWT_SECRET`, `TRIAL_DAYS=30`, `RESEND_API_KEY`, `MAILCHIMP_API_KEY`, `MAILCHIMP_LIST_ID`. Note the production URL (e.g. `https://tradesketch-api.railway.app`).

2. **Update API_BASE default** — once you have the Railway URL, update the default in `mck-sketch.html` (Task 1, Step 3): change `'https://tradesketch-api.railway.app'` to the real URL.

3. **Add GH_TOKEN secret** — as described in Task 4, Step 3.

4. **Enable GitHub Pages** — as described in Task 5, Step 3.

5. **Create first release** — after testing, tag and push: `git tag v1.0.0 && git push origin v1.0.0`
