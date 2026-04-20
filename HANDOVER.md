# TradeSketch — Session Handover

## What is this app?

**TradeSketch** is a desktop CAD application for tradespeople (joiners, builders). It's an Electron 33 app with Three.js 0.182 for 3D rendering and an Express 4 server backend. The owner is Taylor McKinlay, a joiner/builder in Clydebank, Scotland. Taylor is not a developer — explain things in plain terms.

## File locations

| What | Path |
|------|------|
| **Electron main process** | `/Users/taylor/McKinlayBuilt/main.js` |
| **THE app file (all CSS + HTML + JS)** | `/Users/taylor/McKinlayBuilt/app/mck-sketch.html` (~58k lines) |
| **Preload** | `/Users/taylor/McKinlayBuilt/app/preload.js` — exposes `window.api` |
| **Config** | `/Users/taylor/McKinlayBuilt/app/config.json` — authToken, refreshToken, weather city |
| **Server entry** | `/Users/taylor/McKinlayBuilt/server/server.js` — Express, port 3141 |
| **Server routes** | `/Users/taylor/McKinlayBuilt/server/src/routes/` — auth, weather, sms, email, etc. |
| **Auth route** | `/Users/taylor/McKinlayBuilt/server/src/routes/auth.js` — login, register, refresh tokens |
| **Database** | `/Users/taylor/McKinlayBuilt/server/src/database.js` — better-sqlite3, WAL mode |
| **Schema** | `/Users/taylor/McKinlayBuilt/server/db/schema.sql` |
| **Build config** | `/Users/taylor/McKinlayBuilt/package.json` — electron-builder config for Mac/Win |
| **Plans** | `/Users/taylor/McKinlayBuilt/docs/superpowers/plans/` — implementation plans |

## Architecture

- **Single HTML file**: `app/mck-sketch.html` contains ALL CSS (lines ~20-4100), ALL HTML (lines ~4100-19800), and ALL JavaScript (lines ~19800-58000+). This is not a typo — everything is in one file.
- **Preload API**: Use `window.api` (NOT `window.electronAPI`) — methods: `getConfig()`, `saveConfig()`, `openExternal()`, `isPackaged` (boolean)
- **Server**: Must `cd server/` before starting — dotenv needs to find `.env` there. Runs on port 3141.
- **API_BASE auto-detect**: `window.api.isPackaged` determines the API URL — dev uses `http://localhost:3141`, packaged builds use `https://mckinlaybuilt-production.up.railway.app`. Never hardcode this.
- **Auth**: JWT with 30-day expiry + 90-day refresh tokens. Tokens stored in config.json. "Remember this device" checkbox controls whether refresh token is saved.
- **Admin**: userId === 1 (taylor@mckinlaybuilt.com)

## CSS Design System (`:root` variables, line ~20)

```
--bg-app: #1e1e24        (darkest background)
--bg-panel: #26262e      (panels, sidebars)
--bg-surface: #2e2e38    (cards, elevated elements)
--bg-hover: #3a3a46      (hover states)
--bg-input: #1a1a20      (input backgrounds)
--accent: #F5C518        (gold — brand colour)
--accent-dim: rgba(245, 197, 24, 0.15)
--success: #4ade80       --error: #f87171
--warning: #fbbf24       --primary: #F5C518
--canvas: #fafbfc        (2D drawing surface — intentionally light)
--status-success-bg/text  --status-info-bg/text
--status-warning-bg/text  --status-danger-bg/text
```

**CRITICAL**: Always use CSS variables, never hardcode colours. Previous sessions spent hours replacing 200+ hardcoded colours.

## CSS classes to reuse (floor plan sidebar)

- **`.fp-select`** — styled `<select>` dropdown with focus ring. Use on all sidebar selects.
- **`.fp-tool-grid`** — 3-column button grid for tool buttons.
- **`.fp-tool-row`** — flex row for Undo/Clear with `> * { flex: 1 }`.
- **`.fp-sidebar-title.collapsible`** — clickable section title with chevron, use `onclick="this.parentElement.classList.toggle('closed')"`. Wrap content in `.fp-sidebar-body`.
- **`.fp-sidebar .fp-tool-btn`** — scoped styling for sidebar tool buttons (better weight than header toolbar buttons).

## V2 Layout (floor plan as primary workspace)

The floor plan is NOT a full-screen overlay anymore. It's the main workspace:
- **2D canvas** is in `#fp-main-2d` (inside `#canvas-area` inside `<main id="canvas-wrap">`)
- **Sidebar** (`.fp-sidebar`) is moved via JS into `#fp-sidebar-in-panel` (inside `<aside id="panel">`, 260px wide)
- **Tool buttons** are in `#fp-tools-bar` (above the canvas)
- **3D overlay** (`#floorplan-overlay`) is only shown for 3D view (opened by `fpGenerate3D`)
- The move happens in `openFloorPlan()` (~line 56033) on first call only

**`#panel` is locked to 260px** (width/min-width/max-width). Don't remove this or the sidebar expands to fill the screen.

## 3D System (in mck-sketch.html)

- **7 Designers**: Door, Window, Cabinet, Kitchen, Staircase, Panelling, Ceiling — all in modal overlays
- **`createScene()`**: Factory shared by all designers — ACES filmic tone mapping, GTAO, bloom, product photography lighting
- **`getMaterial(type, color)`**: Centralized material library with caching — wood, metal, stone, tile, glass
- **`addRoomContext(scene, opts)`**: Creates walls, floor, ceiling, skirting for 3D scenes
- Scene variables: `dd3DScene`, `wd3DScene`, `cab3DScene`, `ke3DScene`, `sd3DScene`, `wp3DScene`, `cc3DScene`

## Login system

- **Show/hide password**: Eye icon toggle on all password fields. `togglePasswordVis(btn)` function.
- **Remember this device**: Checkbox on login form (`#loginRemember`), checked by default. When unchecked, refresh token is not saved — session expires with JWT (30 days).
- **Password fields** are wrapped in `.login-password-wrap` (relative positioned container for the eye icon overlay).

## What was done this session

### Sidebar polish (from plan: `docs/superpowers/plans/2026-04-16-sidebar-polish.md`)
1. **Tool button typography** — removed inline styles, added scoped `.fp-sidebar .fp-tool-btn` with better font weight/padding/borders
2. **`.fp-select` class** — extracted duplicate inline styles from 4 sidebar selects into reusable class with focus rings
3. **Collapsible sections** — Finishes and View sections are now collapsible (chevron + animation). Consolidated 4 separate finish titles into sub-labels under one "Finishes" header. Tools, Wall, Rooms stay always-visible.
4. **Tighter spacing** — section padding reduced (12px→8px), title margins reduced, property row margins reduced
5. **Hardcoded colours fixed** — `.fp-2d-panel` background, `.fp-dim-label` colour/background now use CSS variables
6. **Inline style cleanup** — tool grid/row layout moved to `.fp-tool-grid` and `.fp-tool-row` CSS classes
7. **Properties section** — tighter rows, tabular-nums for number alignment
8. **Clear button** — hardcoded `#f87171` replaced with `var(--error)`

### Login features
9. **Show password toggle** — eye icon on login + register password fields
10. **Remember this device checkbox** — controls refresh token persistence

### Infrastructure
11. **API_BASE auto-detect** — `window.api.isPackaged` exposed via preload IPC. Dev mode uses localhost:3141, packaged builds use Railway production URL.
12. **Right panel width fix** — `#panel` locked to 260px to prevent sidebar expanding to full screen

### Known issue — needs investigation
- **Right panel sidebar may still appear too wide on first load** — the `#panel` width was locked to 260px but the root cause of why the grid column wasn't constraining it was not fully diagnosed. If the sidebar appears full-width again, check: (1) whether `openFloorPlan()` JS is executing without errors, (2) whether `.fp-sidebar` is actually being moved into `#fp-sidebar-in-panel`, (3) whether `#app` grid `48px 1fr 260px` is being applied. Remote debugging: `npx electron --remote-debugging-port=9222 /Users/taylor/McKinlayBuilt` then inspect at `http://localhost:9222`.

## Distribution (electron-builder)

Already configured in `package.json`:
- **Mac**: `npm run build:mac` → produces `dist/TradeSketch.dmg`
- **Windows**: `npm run build:win` → produces `dist/TradeSketch-Setup.exe`
- **Both**: `npm run build:all`
- **Auto-updates**: wired to GitHub Releases via `electron-updater` (provider: github, owner: tradesketch, repo: McKinlayBuilt)
- Packaged builds use the Railway production URL automatically

## Key gotchas

- **ES modules**: Functions in the HTML file aren't globally accessible unless set via `window.fnName = fnName`
- **electron-reload**: Auto-refreshes on file changes in dev mode (ignore config.json, node_modules, .git, db/)
- **Three.js ExtrudeGeometry**: NOT centered — use `geo.center()` if needed
- **Remote debugging**: `npx electron --remote-debugging-port=9222 /Users/taylor/McKinlayBuilt`
- **File is ~58k lines**: When editing, always use line numbers and read before editing. Small mistakes cascade.
- **`#panel` width**: Locked to 260px with min/max-width. Do not remove or sidebar fills the screen.

## Running the app

```bash
# Terminal 1 — server
cd /Users/taylor/McKinlayBuilt/server
node server.js

# Terminal 2 — electron app
cd /Users/taylor/McKinlayBuilt
npx electron .
```

Server is probably already running on port 3141. If EADDRINUSE, it's already up.
