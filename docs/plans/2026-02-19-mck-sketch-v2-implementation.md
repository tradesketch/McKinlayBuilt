# McK Sketch v2 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform McK Sketch from a 3D component designer with a floor plan overlay into a full commercial house design product — multi-storey, split 2D/3D workspace, warehouse catalogue, photorealistic renders, and building regs compliance export.

**Architecture:** The `#floorplan-overlay` is eliminated. The floor plan 2D canvas moves into the top half of `#canvas-wrap`, the 3D preview into the bottom half, separated by a draggable divider. The left nav becomes the tool palette. The right `<aside id="panel">` becomes warehouse/properties. The data model gains a `storeys[]` array; the 3D scene always renders all storeys stacked.

**Tech Stack:** Electron 33, Three.js 0.182, better-sqlite3, Express 4, plain script block for floor plan engine, `window.mck3D.THREE` for Three.js, `window.api` preload bridge.

**Key file:** `app/mck-sketch.html` (~56,500 lines). Floor plan CSS: ~4050–4155. Floor plan HTML: ~19305–19420. Floor plan JS: ~55336–56300.

**Security note:** All dynamic content inserted into the DOM must use `textContent` or safe DOM element construction — never `innerHTML` with untrusted data. Warehouse item names/URLs come from the server and should be treated as untrusted.

---

## Phase 1 — Layout Restructure

Remove the overlay. Make floor plan the primary workspace.

---

### Task 1.1: Split canvas-wrap into 2D + divider + 3D panels

**Files:**
- Modify: `app/mck-sketch.html` — CSS and HTML near `#canvas-wrap` (~line 4762)

**Step 1: Add CSS for split layout**

Find the `#canvas-wrap` CSS rule and add/replace with:

```css
#canvas-wrap {
  display: grid;
  grid-template-rows: 1fr 6px 1fr;
  overflow: hidden;
  position: relative;
  min-height: 0;
}
#fp-2d-panel {
  overflow: hidden; position: relative;
  background: #f5f5f0; min-height: 80px;
}
#fp-3d-panel {
  overflow: hidden; position: relative;
  background: #1a1a2e; min-height: 80px;
}
#fp-divider {
  background: var(--border-strong); cursor: row-resize;
  display: flex; align-items: center; justify-content: center;
  user-select: none; z-index: 10;
}
#fp-divider::after {
  content: ''; width: 32px; height: 3px;
  border-radius: 2px; background: rgba(255,255,255,0.25);
}
#fp-divider:hover { background: var(--accent-dim); }
```

**Step 2: Replace the `<main id="canvas-wrap">` HTML**

Find `<main id="canvas-wrap">` and replace its inner contents with:

```html
<main id="canvas-wrap">
  <div id="fp-2d-panel">
    <canvas id="fp-canvas" tabindex="0"></canvas>
  </div>
  <div id="fp-divider"></div>
  <div id="fp-3d-panel">
    <div id="fp-3d-container" style="width:100%;height:100%;"></div>
  </div>
</main>
```

Wrap the old `<canvas id="canvas">` in `<div id="legacy-canvas-wrap" style="display:none">` before `</body>` — do not delete it yet.

**Step 3: Add draggable divider JS (before closing plain script tag)**

```javascript
(function() {
  var divider = document.getElementById('fp-divider');
  var wrap = document.getElementById('canvas-wrap');
  if (!divider || !wrap) return;
  var dragging = false, startY = 0, startTop = 0;
  divider.addEventListener('mousedown', function(e) {
    dragging = true; startY = e.clientY;
    var top = document.getElementById('fp-2d-panel');
    startTop = top ? top.offsetHeight : wrap.offsetHeight / 2;
    document.body.style.cursor = 'row-resize';
    e.preventDefault();
  });
  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    var delta = e.clientY - startY;
    var total = wrap.offsetHeight - 6;
    var newTop = Math.max(80, Math.min(total - 80, startTop + delta));
    wrap.style.gridTemplateRows = newTop + 'px 6px ' + (total - newTop) + 'px';
  });
  document.addEventListener('mouseup', function() {
    dragging = false; document.body.style.cursor = '';
  });
})();
```

**Step 4: Verify manually**

Run: `npx electron /Users/taylor/McKinlayBuilt`
Expected: Two panels separated by a draggable bar. Dragging resizes them.

**Step 5: Commit**
```bash
git add app/mck-sketch.html
git commit -m "feat: split canvas-wrap into 2D/3D panels with draggable divider"
```

---

### Task 1.2: Move floor plan tools into left nav

**Files:**
- Modify: `app/mck-sketch.html` — left `<nav>` HTML and CSS, `fpSetTool()`

**Step 1: Add nav button CSS**

```css
.nav-btn {
  width: 44px; height: 44px; border: none; background: transparent;
  color: var(--text-secondary); border-radius: var(--radius);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; margin: 2px auto; transition: background 0.15s, color 0.15s;
}
.nav-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.nav-btn.active { background: var(--accent-dim); color: var(--accent); }
.nav-sep { width: 28px; height: 1px; background: var(--border); margin: 4px auto; }
```

**Step 2: Replace left nav inner HTML with floor plan tools**

```html
<nav id="sidebar">
  <div class="nav-sep"></div>
  <button class="nav-btn fp-tool-btn" id="tool-wall" onclick="fpSetTool('wall')" title="Wall (W)">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <rect x="2" y="8" width="20" height="8" rx="1"/>
    </svg>
  </button>
  <button class="nav-btn fp-tool-btn" id="tool-door" onclick="fpSetTool('door')" title="Door (D)">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M3 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/>
      <line x1="1" y1="21" x2="23" y2="21"/>
    </svg>
  </button>
  <button class="nav-btn fp-tool-btn" id="tool-window" onclick="fpSetTool('window')" title="Window (I)">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <rect x="2" y="6" width="20" height="12" rx="1"/>
      <line x1="12" y1="6" x2="12" y2="18"/><line x1="2" y1="12" x2="22" y2="12"/>
    </svg>
  </button>
  <button class="nav-btn fp-tool-btn" id="tool-select" onclick="fpSetTool('select')" title="Select (V)">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M4 4l7 18 3-7 7-3z"/>
    </svg>
  </button>
  <button class="nav-btn fp-tool-btn" id="tool-measure" onclick="fpSetTool('measure')" title="Measure (M)">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M2 12h20M2 12l4-4M2 12l4 4M22 12l-4-4M22 12l-4 4"/>
    </svg>
  </button>
  <div class="nav-sep"></div>
  <button class="nav-btn" onclick="fpUndo()" title="Undo (Cmd+Z)">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M3 10h10a6 6 0 0 1 0 12H9"/><polyline points="3,4 3,10 9,10"/>
    </svg>
  </button>
  <div class="nav-sep"></div>
  <button class="nav-btn" onclick="fpToggleRoof()" title="Roof">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <polygon points="12,2 22,10 2,10"/><rect x="4" y="10" width="16" height="12"/>
    </svg>
  </button>
  <button class="nav-btn" onclick="fpToggleWalkthrough()" title="Walkthrough">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <circle cx="12" cy="8" r="3"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
    </svg>
  </button>
</nav>
```

**Step 3: Update `fpSetTool()` to highlight active tool button**

At the top of `fpSetTool()` add:

```javascript
document.querySelectorAll('.fp-tool-btn').forEach(function(b) { b.classList.remove('active'); });
var nb = document.getElementById('tool-' + tool);
if (nb) nb.classList.add('active');
```

**Step 4: Verify** — tools appear in left nav, clicking highlights them.

**Step 5: Commit**
```bash
git add app/mck-sketch.html
git commit -m "feat: floor plan tools in left nav, active state on tool change"
```

---

### Task 1.3: Wire canvas and 3D into new panels, auto-init on load

**Files:**
- Modify: `app/mck-sketch.html` — `openFloorPlan()`, `fpResizeCanvas()`, DOMContentLoaded

**Step 1: Update `openFloorPlan()` — remove overlay class toggle**

Remove the line `document.getElementById('floorplan-overlay').classList.add('active')` from `openFloorPlan()`. The function just initialises state, canvas, and event handlers as before.

**Step 2: Update `fpResizeCanvas()` to read from `#fp-2d-panel`**

```javascript
function fpResizeCanvas() {
  var panel = document.getElementById('fp-2d-panel');
  if (!panel || !fpCanvas) return;
  fpCanvas.width = panel.clientWidth || 600;
  fpCanvas.height = panel.clientHeight || 500;
  fpRedraw();
}
```

**Step 3: Add ResizeObserver for both panels**

After `openFloorPlan()` initialises, add:

```javascript
if (window.ResizeObserver) {
  new ResizeObserver(function() { fpResizeCanvas(); }).observe(document.getElementById('fp-2d-panel'));
}
```

**Step 4: Auto-init on DOMContentLoaded**

Find the existing `DOMContentLoaded` handler (or add one) and call `openFloorPlan()` inside it.

**Step 5: Update `fp3DInit()` to target `#fp-3d-container`**

Find where `fp3DRenderer` is appended to a DOM element and change it to:
```javascript
document.getElementById('fp-3d-container').appendChild(fp3DRenderer.domElement);
```

**Step 6: Verify** — App opens showing 2D grid in top panel, 3D in bottom panel.

**Step 7: Commit**
```bash
git add app/mck-sketch.html
git commit -m "feat: auto-init floor plan on load, resize observers for split panels"
```

---

### Task 1.4: Remove overlay HTML and integrate properties into right panel

**Files:**
- Modify: `app/mck-sketch.html` — delete `#floorplan-overlay`, move sidebar content to `<aside id="panel">`

**Step 1: Add storey tabs to header**

Inside `<header id="header">`, after the logo:

```html
<div id="storey-tabs" style="display:flex;align-items:center;gap:2px;margin:0 12px;">
  <button class="storey-tab active" data-storey="0" onclick="fpSetStorey(0)">Ground</button>
  <button class="storey-tab" data-storey="1" onclick="fpSetStorey(1)">First</button>
  <button class="storey-tab" onclick="fpAddStorey()" title="Add storey"
    style="font-size:16px;padding:2px 8px;">+</button>
</div>
```

CSS:
```css
.storey-tab {
  padding: 4px 14px; border: none; background: transparent;
  color: var(--text-secondary); border-radius: var(--radius);
  cursor: pointer; font-size: 12px; font-weight: 500; transition: all 0.15s;
}
.storey-tab:hover { background: var(--bg-hover); color: var(--text-primary); }
.storey-tab.active { background: var(--accent-dim); color: var(--accent); }
```

**Step 2: Add panel tabs to right sidebar**

Replace `<aside id="panel">` content with:

```html
<aside id="panel">
  <div id="panel-tabs" style="display:flex;border-bottom:1px solid var(--border);padding:0 4px;">
    <button class="panel-tab active" onclick="panelSetTab('properties')">Properties</button>
    <button class="panel-tab" onclick="panelSetTab('warehouse')">Catalogue</button>
    <button class="panel-tab" onclick="panelSetTab('regs')">Regs</button>
  </div>
  <div id="panel-properties" class="panel-body">
    <!-- Wall thickness, opening options moved here from old overlay -->
  </div>
  <div id="panel-warehouse" class="panel-body" style="display:none">
    <input type="search" id="wh-search" placeholder="Search items…"
      oninput="whSearch(this.value)"
      style="width:100%;padding:6px 8px;background:var(--bg-input);border:1px solid var(--border);
      border-radius:var(--radius);color:var(--text-primary);font-size:12px;
      margin-bottom:8px;box-sizing:border-box;">
    <div id="wh-categories" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;"></div>
    <div id="wh-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;"></div>
  </div>
  <div id="panel-regs" class="panel-body" style="display:none">
    <!-- Regs reference panel content moved here -->
  </div>
</aside>
```

**Step 3: Move the old fp-sidebar content**

Copy the wall thickness inputs, opening options, and regs panel HTML from inside `#floorplan-overlay .fp-sidebar` into `#panel-properties` and `#panel-regs` respectively.

**Step 4: Delete `#floorplan-overlay`**

Delete the entire `<div id="floorplan-overlay">...</div>` block (from line ~19305 to its closing tag). Also delete the overlay CSS block (`#floorplan-overlay`, `.fp-header` fixed-position rules) from the CSS section (~4050–4155), keeping only the canvas, drawing tool, and wall-related CSS that is still used.

**Step 5: Add JS stubs for storey functions and panel switching**

```javascript
var fpCurrentStorey = 0;
function fpSetStorey(idx) {
  fpCurrentStorey = idx;
  document.querySelectorAll('.storey-tab[data-storey]').forEach(function(t) {
    t.classList.toggle('active', parseInt(t.dataset.storey) === idx);
  });
  fpRedraw();
}
window.fpSetStorey = fpSetStorey;

function fpAddStorey() { fpSetStatus('Multi-storey in Phase 2.'); }
window.fpAddStorey = fpAddStorey;

function fpToggleRoof() { fpSetStatus('Roof generator in Phase 5.'); }
window.fpToggleRoof = fpToggleRoof;

function fpToggleWalkthrough() { fpSetStatus('Walkthrough in Phase 12.'); }
window.fpToggleWalkthrough = fpToggleWalkthrough;

function panelSetTab(tab) {
  ['properties','warehouse','regs'].forEach(function(t) {
    var el = document.getElementById('panel-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('.panel-tab').forEach(function(b, i) {
    b.classList.toggle('active', ['properties','warehouse','regs'][i] === tab);
  });
}
window.panelSetTab = panelSetTab;
```

CSS:
```css
.panel-tab {
  flex: 1; padding: 8px 4px; border: none; background: transparent;
  color: var(--text-secondary); font-size: 11px; cursor: pointer;
  border-bottom: 2px solid transparent; transition: all 0.15s;
}
.panel-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.panel-body { padding: 8px; overflow-y: auto; height: calc(100% - 36px); }
```

**Step 6: Add render and export buttons to header (right side)**

```html
<div style="margin-left:auto;display:flex;gap:6px;align-items:center;">
  <button onclick="fpExportPDF()"
    style="padding:6px 12px;background:transparent;color:var(--text-secondary);
    border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:12px">
    Export PDF
  </button>
  <button id="btn-render" onclick="fpGenerateRender()"
    style="padding:6px 14px;background:var(--accent);color:#fff;border:none;
    border-radius:var(--radius);cursor:pointer;font-size:12px;font-weight:600">
    Generate Render
  </button>
</div>
```

**Step 7: Verify** — No overlay. Properties in right panel. Storey tabs in header. No JS errors.

**Step 8: Commit**
```bash
git add app/mck-sketch.html
git commit -m "feat: remove overlay, integrate all UI into main layout — Phase 1 complete"
```

---

## Phase 2 — Multi-Storey Data Model

### Task 2.1: Extend fpState to storeys array

**Files:**
- Modify: `app/mck-sketch.html` — `fpNewState()`, `fpPushUndo()`, `fpUndo()`
- Create: `tests/test-storey-model.js`

**Step 1: Write test**

```javascript
// tests/test-storey-model.js — run with: node tests/test-storey-model.js
function mkState() {
  return {
    storeys: [
      { id:0, label:'Ground', floorHeight:0, ceilingHeight:2400, walls:[], openings:[], items:[] },
      { id:1, label:'First',  floorHeight:2700, ceilingHeight:2400, walls:[], openings:[], items:[] }
    ]
  };
}
function fpStoreyOf(state, idx) { return state.storeys[idx] || state.storeys[0]; }

var s = mkState();
console.assert(s.storeys.length === 2, 'should have 2 storeys');
console.assert(s.storeys[0].label === 'Ground', 'first is Ground');
console.assert(Array.isArray(fpStoreyOf(s, 1).walls), 'First floor has walls array');
console.log('PASS: storey model');
```

**Step 2: Run test**
```bash
node tests/test-storey-model.js
```
Expected: `PASS: storey model`

**Step 3: Update `fpNewState()`**

```javascript
function fpNewState() {
  return {
    storeys: [
      { id:0, label:'Ground', floorHeight:0,    ceilingHeight:2400, walls:[], openings:[], items:[] },
      { id:1, label:'First',  floorHeight:2700,  ceilingHeight:2400, walls:[], openings:[], items:[] }
    ],
    tool:'wall', drawing:false, startX:0, startY:0,
    snapX:0, snapY:0, mouseX:0, mouseY:0,
    wallThickness:300, wallHeight:2400, gridSize:300,
    panX:0, panY:0, scale:0.15,
    panning:false, panSX:0, panSY:0, panPX:0, panPY:0,
    selectedWall:-1, alignGuides:[], undoStack:[],
    measuring:false, measureStart:null, measures:[],
    typedMeasure:'', typedLength:'', rightClickPos:null,
    projectName:'Untitled', roof:null,
  };
}
```

**Step 4: Add `fpStorey()` helper**

```javascript
function fpStorey() {
  if (!fpState || !fpState.storeys) return { walls:[], openings:[], items:[] };
  return fpState.storeys[fpCurrentStorey] || fpState.storeys[0];
}
window.fpStorey = fpStorey;
```

**Step 5: Replace `fpState.walls` with `fpStorey().walls` throughout floor plan JS**

Do a targeted search-and-replace within the floor plan script block only (lines ~55336–56400):
- `fpState.walls` → `fpStorey().walls`
- `fpState.openings` → `fpStorey().openings`
- `fpState.items3D` → `fpStorey().items`

Expected ~25 replacements for walls, ~12 for openings.

**Step 6: Update `fpPushUndo()` and `fpUndo()`**

```javascript
function fpPushUndo() {
  if (!fpState) return;
  var s = fpStorey();
  fpState.undoStack.push({
    storeyIdx: fpCurrentStorey,
    walls: JSON.parse(JSON.stringify(s.walls)),
    openings: JSON.parse(JSON.stringify(s.openings)),
  });
  if (fpState.undoStack.length > 50) fpState.undoStack.shift();
}
function fpUndo() {
  if (!fpState || fpState.undoStack.length === 0) { fpSetStatus('Nothing to undo.'); return; }
  var prev = fpState.undoStack.pop();
  var s = fpState.storeys[prev.storeyIdx];
  if (s) { s.walls = prev.walls; s.openings = prev.openings; }
  fpState.selectedWall = -1; fpState.drawing = false; fpState.typedLength = '';
  fpSetStatus('Undone. ' + fpState.undoStack.length + ' step(s) remaining.');
  fpRedraw();
}
```

**Step 7: Verify** — Draw walls, undo works. Switch storey tab, walls are separate per floor.

**Step 8: Commit**
```bash
git add app/mck-sketch.html tests/test-storey-model.js
git commit -m "feat: multi-storey data model with fpStorey() accessor"
```

---

### Task 2.2: Ghost layer and 3D stacked storeys

**Files:**
- Modify: `app/mck-sketch.html` — `fpRedraw()`, `fp3DGenerateAndShow()`

**Step 1: Ghost layer in fpRedraw()**

Before drawing active storey walls, add:

```javascript
if (fpCurrentStorey > 0 && fpState.storeys[fpCurrentStorey - 1]) {
  ctx.save();
  ctx.globalAlpha = 0.2;
  fpState.storeys[fpCurrentStorey - 1].walls.forEach(function(w) {
    fpDrawWall(ctx, w, false);
  });
  ctx.restore();
}
```

**Step 2: 3D generates all storeys**

In the 3D wall generation loop, wrap existing wall loop in a storey loop:

```javascript
fpState.storeys.forEach(function(storey) {
  var yBase = storey.floorHeight / 1000;
  var yTop  = yBase + storey.ceilingHeight / 1000;
  storey.walls.forEach(function(w) {
    // call existing wall mesh builder, passing yBase and yTop
    fp3DBuildWall(w, yBase, yTop, storey.openings);
  });
});
```

Refactor the existing single-storey wall generation into a `fp3DBuildWall(w, yBase, yTop, openings)` function first.

**Step 3: Complete `fpSetStorey()` and `fpAddStorey()`**

```javascript
function fpSetStorey(idx) {
  fpCurrentStorey = idx;
  document.querySelectorAll('.storey-tab[data-storey]').forEach(function(t) {
    t.classList.toggle('active', parseInt(t.dataset.storey) === idx);
  });
  fpState.drawing = false; fpState.typedLength = '';
  fpRedraw();
  fp3DGenerateAndShow();
}

function fpAddStorey() {
  var last = fpState.storeys[fpState.storeys.length - 1];
  var newFloor = last.floorHeight + last.ceilingHeight + 200;
  var newIdx = fpState.storeys.length;
  var labels = ['Ground','First','Second','Third','Fourth'];
  fpState.storeys.push({
    id: newIdx, label: labels[newIdx] || ('Floor ' + newIdx),
    floorHeight: newFloor, ceilingHeight: 2400,
    walls: [], openings: [], items: []
  });
  // Add tab button
  var tabs = document.getElementById('storey-tabs');
  var addBtn = tabs.querySelector('[onclick="fpAddStorey()"]');
  var btn = document.createElement('button');
  btn.className = 'storey-tab';
  btn.dataset.storey = newIdx;
  btn.textContent = labels[newIdx] || ('Floor ' + newIdx);
  btn.onclick = function() { fpSetStorey(newIdx); };
  tabs.insertBefore(btn, addBtn);
  fpSetStorey(newIdx);
}
```

**Step 4: Verify** — Ground floor walls visible as ghost on First Floor. 3D shows both floors stacked.

**Step 5: Commit**
```bash
git add app/mck-sketch.html
git commit -m "feat: ghost layer, multi-storey 3D stacking, add storey button"
```

---

## Phase 3 — Warehouse Catalogue UI

### Task 3.1: Load warehouse items from API into catalogue panel

**Files:**
- Modify: `app/mck-sketch.html` — add warehouse JS functions
- Create: `tests/test-warehouse-api.js`

**Context:** Server at `http://localhost:3141`. Endpoints: `GET /api/warehouse/categories`, `GET /api/warehouse/items?category=X&search=Y&limit=50`, `GET /api/warehouse/thumbnail/:filename`, `GET /api/warehouse/model/:filename`.

**Step 1: Write API connectivity test**

```javascript
// tests/test-warehouse-api.js — run with server running: node tests/test-warehouse-api.js
const http = require('http');
function get(path) {
  return new Promise((res, rej) => {
    http.get('http://localhost:3141' + path, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch(e) { rej(e); } });
    }).on('error', rej);
  });
}
(async () => {
  const cats = await get('/api/warehouse/categories');
  console.assert(Array.isArray(cats), 'categories is array');
  const items = await get('/api/warehouse/items?limit=5');
  const arr = items.items || items;
  console.assert(Array.isArray(arr), 'items is array');
  console.assert(arr.length > 0, 'has items');
  console.log('PASS: warehouse API. Categories:', cats.length, 'Items sample:', arr.length);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
```

**Step 2: Run test (server must be running)**
```bash
cd /Users/taylor/McKinlayBuilt/server && node src/index.js &
sleep 2
node tests/test-warehouse-api.js
```
Expected: `PASS: warehouse API...`

**Step 3: Add warehouse JS — safe DOM construction (no innerHTML with data)**

```javascript
var whCurrentCat = null;
var whServerBase = 'http://localhost:3141';

function whInit() { whLoadCategories(); }

function whLoadCategories() {
  fetch(whServerBase + '/api/warehouse/categories')
    .then(function(r) { return r.json(); })
    .then(function(cats) {
      var el = document.getElementById('wh-categories');
      if (!el) return;
      // Clear safely
      while (el.firstChild) el.removeChild(el.firstChild);
      cats.filter(function(c) { return !c.parent_id; }).forEach(function(cat) {
        var btn = document.createElement('button');
        btn.textContent = cat.name; // textContent — safe
        btn.className = 'wh-cat-btn';
        btn.onclick = function() {
          whCurrentCat = cat.id;
          document.querySelectorAll('.wh-cat-btn').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          whLoadItems();
        };
        el.appendChild(btn);
      });
      whLoadItems();
    })
    .catch(function(e) { console.warn('Warehouse unavailable:', e.message); });
}

function whLoadItems(search) {
  var url = whServerBase + '/api/warehouse/items?limit=50';
  if (whCurrentCat) url += '&category=' + encodeURIComponent(whCurrentCat);
  if (search) url += '&search=' + encodeURIComponent(search);
  fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var items = data.items || data;
      var grid = document.getElementById('wh-grid');
      if (!grid) return;
      while (grid.firstChild) grid.removeChild(grid.firstChild);
      if (items.length === 0) {
        var msg = document.createElement('div');
        msg.textContent = 'No items found';
        msg.style.cssText = 'color:var(--text-muted);font-size:12px;padding:12px;text-align:center;grid-column:1/-1';
        grid.appendChild(msg);
        return;
      }
      items.forEach(function(item) {
        var card = document.createElement('div');
        card.className = 'wh-item';
        card.draggable = true;
        // Image
        if (item.thumbnail_filename) {
          var img = document.createElement('img');
          img.src = whServerBase + '/api/warehouse/thumbnail/' + encodeURIComponent(item.thumbnail_filename);
          img.alt = item.name; // item.name used as alt text, not rendered as HTML
          img.style.cssText = 'width:100%;aspect-ratio:1;object-fit:cover;display:block';
          img.onerror = function() { this.style.display = 'none'; };
          card.appendChild(img);
        }
        // Label — textContent only
        var label = document.createElement('div');
        label.className = 'wh-item-label';
        label.textContent = item.name;
        card.appendChild(label);
        // Events
        card.addEventListener('dragstart', function(e) {
          e.dataTransfer.setData('warehouseItemId', String(item.id));
        });
        card.addEventListener('click', function() { whPlaceItem(item); });
        grid.appendChild(card);
      });
    })
    .catch(function() {});
}

function whSearch(val) {
  clearTimeout(whSearch._t);
  whSearch._t = setTimeout(function() { whLoadItems(val); }, 300);
}
window.whSearch = whSearch;
```

Add warehouse item CSS:
```css
.wh-cat-btn {
  padding: 3px 8px; border: 1px solid var(--border); border-radius: 12px;
  background: transparent; color: var(--text-secondary); font-size: 11px;
  cursor: pointer; transition: all 0.15s;
}
.wh-cat-btn.active { background: var(--accent-dim); color: var(--accent); border-color: var(--accent); }
.wh-item {
  background: var(--bg-surface); border-radius: var(--radius);
  border: 1px solid var(--border); cursor: grab; overflow: hidden; transition: border-color 0.15s;
}
.wh-item:hover { border-color: var(--accent); }
.wh-item-label { font-size: 10px; color: var(--text-secondary); padding: 4px 6px; text-align: center; }
```

Call `whInit()` inside `openFloorPlan()` (or DOMContentLoaded).

**Step 4: Verify** — Catalogue tab shows categories and item thumbnails. Search filters items.

**Step 5: Commit**
```bash
git add app/mck-sketch.html tests/test-warehouse-api.js
git commit -m "feat: warehouse catalogue panel loads from API with safe DOM construction"
```

---

### Task 3.2: Place items from catalogue onto plan and 3D

**Files:**
- Modify: `app/mck-sketch.html` — `whPlaceItem()`, `fpRedraw()`, `fp3DGenerateAndShow()`

**Step 1: Add `whPlaceItem()`**

```javascript
function whPlaceItem(item) {
  if (!fpState || !fpCanvas) return;
  var cx = fpS2W(fpCanvas.width / 2, fpCanvas.height / 2);
  var storey = fpStorey();
  fpPushUndo();
  storey.items.push({
    id: Date.now(),
    warehouseId: item.id,
    name: item.name,
    modelFilename: item.model_filename || null,
    thumbnailFilename: item.thumbnail_filename || null,
    x: cx.x, y: cx.y, rotation: 0,
    width: item.width_mm || 900,
    depth: item.depth_mm || 600,
  });
  fpRedraw();
  fp3DGenerateAndShow();
}
window.whPlaceItem = whPlaceItem;
```

**Step 2: Draw item footprints on 2D canvas**

In `fpRedraw()` after drawing walls:

```javascript
fpStorey().items.forEach(function(item) {
  var sc = fpW2S(item.x, item.y);
  var w = item.width * fpState.scale;
  var d = item.depth * fpState.scale;
  ctx.save();
  ctx.translate(sc.x, sc.y);
  ctx.rotate(item.rotation || 0);
  ctx.fillStyle = 'rgba(74,158,255,0.15)';
  ctx.strokeStyle = '#4a9eff';
  ctx.lineWidth = 1.5;
  ctx.fillRect(-w/2, -d/2, w, d);
  ctx.strokeRect(-w/2, -d/2, w, d);
  ctx.fillStyle = '#4a9eff';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(item.name.substring(0, 16), 0, 0);
  ctx.restore();
});
```

**Step 3: Load items as 3D models (with fallback box)**

In `fp3DGenerateAndShow()`, after generating walls:

```javascript
fpState.storeys.forEach(function(storey) {
  var yBase = storey.floorHeight / 1000;
  storey.items.forEach(function(item) {
    if (item.modelFilename) {
      var loader = new window.mck3D.GLTFLoader();
      var url = whServerBase + '/api/warehouse/model/' + encodeURIComponent(item.modelFilename);
      loader.load(url, function(gltf) {
        var model = gltf.scene;
        model.position.set(item.x/1000, yBase, -item.y/1000);
        model.rotation.y = -(item.rotation || 0);
        model.userData.fpItemId = item.id;
        fp3DScene.add(model);
        fp3DRequestRender();
      }, undefined, function() {
        fp3DAddItemBox(item, yBase);
      });
    } else {
      fp3DAddItemBox(item, yBase);
    }
  });
});

function fp3DAddItemBox(item, yBase) {
  var T = window.mck3D.THREE;
  var geo = new T.BoxGeometry(item.width/1000, 0.8, item.depth/1000);
  var mat = new T.MeshStandardMaterial({ color: 0x4a9eff, transparent: true, opacity: 0.4 });
  var mesh = new T.Mesh(geo, mat);
  mesh.position.set(item.x/1000, yBase + 0.4, -item.y/1000);
  mesh.userData.fpItemId = item.id;
  fp3DScene.add(mesh);
  fp3DRequestRender();
}
```

**Step 4: Verify** — Click catalogue item → appears on 2D plan as blue box, appears in 3D scene.

**Step 5: Commit**
```bash
git add app/mck-sketch.html
git commit -m "feat: place catalogue items onto 2D plan and 3D scene"
```

---

## Phase 4 — Smart 3D Bidirectional Editing

### Task 4.1: Raycasting selection + drag to move furniture in 3D

**Files:**
- Modify: `app/mck-sketch.html` — add to `fp3DInit()` after controls setup

**Step 1: Add 3D selection and drag handler**

```javascript
function fp3DSetupBidirectional() {
  var container = document.getElementById('fp-3d-panel');
  if (!container || !fp3DCamera || !fp3DScene) return;
  var T = window.mck3D.THREE;
  var raycaster = new T.Raycaster();
  var mouse = new T.Vector2();
  var dragPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  var selected3D = null, dragging = false, dragObj = null, dragItemId = null;
  var selectionBox = null;

  function getMouseNDC(e) {
    var r = container.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  function findFpObject(hitObj) {
    var node = hitObj;
    while (node && !node.userData.fpItemId) node = node.parent;
    return node || null;
  }

  container.addEventListener('pointerdown', function(e) {
    if (e.button !== 0) return;
    getMouseNDC(e);
    raycaster.setFromCamera(mouse, fp3DCamera);
    var meshes = [];
    fp3DScene.traverse(function(o) { if (o.isMesh && o.name !== '__sel_box__') meshes.push(o); });
    var hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      var fpNode = findFpObject(hits[0].object);
      if (fpNode) {
        selected3D = fpNode.userData.fpItemId;
        dragObj = fpNode; dragging = true;
        fp3DControls.enabled = false;
        // Show selection outline
        if (selectionBox) fp3DScene.remove(selectionBox);
        selectionBox = new T.BoxHelper(fpNode, 0x4a9eff);
        selectionBox.name = '__sel_box__';
        fp3DScene.add(selectionBox);
        fp3DRequestRender();
        e.preventDefault();
        return;
      }
    }
    // Click on empty — deselect
    selected3D = null; dragObj = null;
    if (selectionBox) { fp3DScene.remove(selectionBox); selectionBox = null; }
    fp3DRequestRender();
  });

  container.addEventListener('pointermove', function(e) {
    if (!dragging || !dragObj) return;
    getMouseNDC(e);
    raycaster.setFromCamera(mouse, fp3DCamera);
    var pt = new T.Vector3();
    if (raycaster.ray.intersectPlane(dragPlane, pt)) {
      dragObj.position.x = pt.x;
      dragObj.position.z = pt.z;
      if (selectionBox) selectionBox.update();
      fp3DRequestRender();
    }
  });

  container.addEventListener('pointerup', function() {
    if (!dragging || !dragObj || !selected3D) return;
    dragging = false;
    fp3DControls.enabled = true;
    // Sync back to data model
    var storey = fpStorey();
    var item = storey.items.find(function(it) { return it.id === selected3D; });
    if (item) {
      item.x = dragObj.position.x * 1000;
      item.y = -dragObj.position.z * 1000;
    }
    dragObj = null;
    fpRedraw(); // update 2D plan
  });
}
```

Call `fp3DSetupBidirectional()` at the end of `fp3DInit()`.

**Step 2: Verify** — Select a 3D furniture item → blue outline. Drag it → moves. Release → 2D plan updates.

**Step 3: Commit**
```bash
git add app/mck-sketch.html
git commit -m "feat: 3D furniture selection and drag syncs back to 2D floor plan"
```

---

## Phase 5 — Roof Generator

### Task 5.1: Parametric roof panel and geometry

**Files:**
- Modify: `app/mck-sketch.html` — roof panel HTML in `#fp-3d-panel`, `fpRoofUpdate()`, `fp3DGenerateRoof()`

**Step 1: Add roof controls panel (absolute positioned inside 3D panel)**

Add this HTML inside `<div id="fp-3d-panel">`:

```html
<div id="fp-roof-panel" style="display:none;position:absolute;top:8px;right:8px;
  background:rgba(26,26,46,0.92);border-radius:8px;padding:12px;width:210px;
  color:var(--text-primary);font-size:12px;z-index:10;
  border:1px solid rgba(255,255,255,0.1);">
  <div style="font-weight:600;margin-bottom:8px">Roof</div>
  <label>Style</label><br>
  <select id="roof-type" onchange="fpRoofUpdate()"
    style="width:100%;margin-bottom:8px;background:var(--bg-input);color:var(--text-primary);
    border:1px solid var(--border);border-radius:4px;padding:4px">
    <option value="gable">Gable</option>
    <option value="hip">Hip</option>
    <option value="lean-to">Lean-to</option>
    <option value="flat">Flat</option>
  </select>
  <label>Pitch: <span id="roof-pitch-val">35</span>°</label><br>
  <input type="range" id="roof-pitch" min="5" max="60" value="35"
    style="width:100%;margin-bottom:8px" oninput="fpRoofUpdate()"><br>
  <label>Overhang (mm)</label><br>
  <input type="number" id="roof-overhang" value="300" min="0" max="600" step="50"
    style="width:100%;background:var(--bg-input);color:var(--text-primary);
    border:1px solid var(--border);border-radius:4px;padding:4px;margin-bottom:8px"
    oninput="fpRoofUpdate()"><br>
  <label>Material</label><br>
  <select id="roof-material" onchange="fpRoofUpdate()"
    style="width:100%;background:var(--bg-input);color:var(--text-primary);
    border:1px solid var(--border);border-radius:4px;padding:4px;margin-bottom:10px">
    <option value="slate">Natural Slate</option>
    <option value="concrete-tile">Concrete Interlocking Tile</option>
    <option value="clay-tile">Clay Plain Tile</option>
    <option value="standing-seam">Metal Standing Seam</option>
    <option value="epdm">EPDM Flat</option>
  </select>
  <button onclick="fpRoofRemove()"
    style="width:100%;padding:5px;background:rgba(248,113,113,0.12);
    color:#f87171;border:1px solid #f87171;border-radius:4px;cursor:pointer">
    Remove Roof
  </button>
</div>
```

**Step 2: Add roof JS**

```javascript
function fpToggleRoof() {
  var panel = document.getElementById('fp-roof-panel');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? '' : 'none';
  if (panel.style.display !== 'none') fpRoofUpdate();
}
window.fpToggleRoof = fpToggleRoof;

function fpRoofRemove() {
  if (fpState) fpState.roof = null;
  var old = fp3DScene ? fp3DScene.getObjectByName('__roof__') : null;
  if (old) fp3DScene.remove(old);
  fp3DRequestRender();
  var p = document.getElementById('fp-roof-panel');
  if (p) p.style.display = 'none';
}
window.fpRoofRemove = fpRoofRemove;

function fpRoofUpdate() {
  var pv = document.getElementById('roof-pitch-val');
  var pi = document.getElementById('roof-pitch');
  if (pv && pi) pv.textContent = pi.value;
  if (!fpState) return;
  fpState.roof = {
    type: (document.getElementById('roof-type') || {}).value || 'gable',
    pitch: parseFloat((document.getElementById('roof-pitch') || {}).value || 35),
    overhang: parseFloat((document.getElementById('roof-overhang') || {}).value || 300),
    material: (document.getElementById('roof-material') || {}).value || 'slate',
  };
  fp3DGenerateRoof();
}
window.fpRoofUpdate = fpRoofUpdate;

function fp3DGenerateRoof() {
  if (!fp3DScene || !fpState || !fpState.roof) return;
  var T = window.mck3D.THREE;
  // Remove existing roof
  var old = fp3DScene.getObjectByName('__roof__');
  if (old) fp3DScene.remove(old);

  var roof = fpState.roof;
  var allWalls = [];
  fpState.storeys.forEach(function(s) { allWalls = allWalls.concat(s.walls); });
  if (!allWalls.length) return;

  // Bounding box of all walls
  var minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  allWalls.forEach(function(w) {
    minX=Math.min(minX,w.x1/1000,w.x2/1000); maxX=Math.max(maxX,w.x1/1000,w.x2/1000);
    minY=Math.min(minY,w.y1/1000,w.y2/1000); maxY=Math.max(maxY,w.y1/1000,w.y2/1000);
  });

  var top = fpState.storeys[fpState.storeys.length - 1];
  var wallTop = (top.floorHeight + top.ceilingHeight) / 1000;
  var ov = roof.overhang / 1000;
  var pitch = roof.pitch * Math.PI / 180;
  var x0 = minX - ov, x1 = maxX + ov;
  var z0 = -(minY - ov), z1 = -(maxY + ov); // Three.js Z is inverted Y
  var width = Math.abs(z1 - z0);
  var ridgeH = wallTop + (width / 2) * Math.tan(pitch);
  var ridgeZ = (z0 + z1) / 2;

  var colors = { slate:0x666070, 'concrete-tile':0x8a7a6a, 'clay-tile':0xb06040,
    'standing-seam':0x708090, epdm:0x404040 };
  var mat = new T.MeshStandardMaterial({ color: colors[roof.material] || 0x666070,
    roughness: 0.88, metalness: 0.05, flatShading: true, side: T.DoubleSide });

  var group = new T.Group(); group.name = '__roof__';

  function addFace(verts) {
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(verts), 3));
    var n = verts.length / 9;
    var idx = [];
    for (var i = 0; i < n; i++) idx.push(i*3, i*3+1, i*3+2);
    geo.setIndex(idx); geo.computeVertexNormals();
    group.add(new T.Mesh(geo, mat));
  }

  if (roof.type === 'gable' || roof.type === 'hip') {
    // Front slope
    addFace([x0,wallTop,z0, x1,wallTop,z0, x1,ridgeH,ridgeZ, x0,wallTop,z0, x1,ridgeH,ridgeZ, x0,ridgeH,ridgeZ]);
    // Back slope
    addFace([x1,wallTop,z1, x0,wallTop,z1, x0,ridgeH,ridgeZ, x1,wallTop,z1, x0,ridgeH,ridgeZ, x1,ridgeH,ridgeZ]);
    if (roof.type === 'gable') {
      addFace([x0,wallTop,z0, x0,wallTop,z1, x0,ridgeH,ridgeZ]); // left gable
      addFace([x1,wallTop,z1, x1,wallTop,z0, x1,ridgeH,ridgeZ]); // right gable
    } else {
      // Hip: add triangular ends
      addFace([x0,wallTop,z0, x0,wallTop,z1, x0-(width/2)*Math.cos(pitch)*0.5, ridgeH, ridgeZ]);
    }
  } else if (roof.type === 'lean-to') {
    // Single slope front to back
    addFace([x0,wallTop,z0, x1,wallTop,z0, x1,wallTop+width*Math.tan(pitch),z1,
             x0,wallTop,z0, x1,wallTop+width*Math.tan(pitch),z1, x0,wallTop+width*Math.tan(pitch),z1]);
  } else if (roof.type === 'flat') {
    addFace([x0,wallTop+0.15,z0, x1,wallTop+0.15,z0, x1,wallTop+0.15,z1,
             x0,wallTop+0.15,z0, x1,wallTop+0.15,z1, x0,wallTop+0.15,z1]);
  }

  fp3DScene.add(group);
  fp3DRequestRender();
}
window.fp3DGenerateRoof = fp3DGenerateRoof;
```

**Step 3: Verify** — Draw a rectangular room, open roof panel, pitch slider updates roof in real time.

**Step 4: Commit**
```bash
git add app/mck-sketch.html
git commit -m "feat: parametric gable/hip/lean-to/flat roof generator"
```

---

## Phase 6 — PBR Materials & Lighting

### Task 6.1: Material picker and time-of-day sun

**Files:**
- Modify: `app/mck-sketch.html` — add material controls to Properties panel, sun slider in 3D panel

**Step 1: Add material picker to `#panel-properties`**

```html
<div class="fp-sidebar-section">
  <div class="fp-sidebar-label">Wall Finish</div>
  <select id="fp-wall-mat" onchange="fpApplyMaterials()">
    <option value="plaster">White Plaster</option>
    <option value="brick">Exposed Brick</option>
    <option value="timber">Timber Cladding</option>
    <option value="stone">Stone</option>
    <option value="render">Sand Render</option>
  </select>
  <div class="fp-sidebar-label" style="margin-top:8px">Floor Finish</div>
  <select id="fp-floor-mat" onchange="fpApplyMaterials()">
    <option value="timber-floor">Timber Boards</option>
    <option value="carpet">Carpet</option>
    <option value="tile">Ceramic Tile</option>
    <option value="concrete">Polished Concrete</option>
    <option value="stone-floor">Natural Stone</option>
  </select>
</div>
```

**Step 2: Add PBR material config**

```javascript
var fp3DMatConfig = {
  'plaster':      { color:0xf2f0ec, roughness:0.85, metalness:0.0 },
  'brick':        { color:0xb05030, roughness:0.9,  metalness:0.0 },
  'timber':       { color:0xc8924a, roughness:0.75, metalness:0.0 },
  'stone':        { color:0x9a9080, roughness:0.95, metalness:0.0 },
  'render':       { color:0xe8e4dc, roughness:0.8,  metalness:0.0 },
  'timber-floor': { color:0xd4a060, roughness:0.6,  metalness:0.0 },
  'carpet':       { color:0x8080a0, roughness:0.95, metalness:0.0 },
  'tile':         { color:0xf0f0f0, roughness:0.2,  metalness:0.05 },
  'concrete':     { color:0xc0c0b8, roughness:0.45, metalness:0.0 },
  'stone-floor':  { color:0xa09080, roughness:0.7,  metalness:0.0 },
};

function fp3DGetMat(type) {
  var T = window.mck3D.THREE;
  var cfg = fp3DMatConfig[type] || fp3DMatConfig['plaster'];
  return new T.MeshStandardMaterial({ color:cfg.color, roughness:cfg.roughness,
    metalness:cfg.metalness, flatShading:false });
}

function fpApplyMaterials() {
  if (!fp3DScene) return;
  var wallType = (document.getElementById('fp-wall-mat')||{}).value || 'plaster';
  var mat = fp3DGetMat(wallType);
  fp3DScene.traverse(function(obj) {
    if (obj.isMesh && obj.userData.isWall) { obj.material = mat; }
  });
  fp3DRequestRender();
}
window.fpApplyMaterials = fpApplyMaterials;
```

Mark wall meshes with `mesh.userData.isWall = true` when creating them.

**Step 3: Add sun slider in 3D panel**

```html
<div style="position:absolute;bottom:10px;left:10px;display:flex;align-items:center;gap:8px;
  background:rgba(26,26,46,0.8);border-radius:6px;padding:6px 10px;z-index:5;">
  <span style="font-size:12px">☀</span>
  <input type="range" id="sun-time" min="6" max="22" value="10" step="0.5"
    style="width:80px" oninput="fpSunUpdate(this.value)">
  <span id="sun-label" style="font-size:10px;color:var(--text-secondary);min-width:28px">10am</span>
</div>
```

```javascript
function fpSunUpdate(val) {
  var h = parseFloat(val);
  var lbl = h < 12 ? Math.round(h)+'am' : h===12 ? 'noon' : Math.round(h-12)+'pm';
  var el = document.getElementById('sun-label');
  if (el) el.textContent = lbl;
  if (!fp3DScene) return;
  var angle = ((h - 6) / 16) * Math.PI;
  var elevation = Math.max(0, Math.sin(angle));
  var azimuth = (h / 24) * Math.PI * 2 - Math.PI / 2;
  fp3DScene.traverse(function(obj) {
    if (obj.isDirectionalLight && obj.userData.isSun) {
      obj.position.set(Math.cos(azimuth)*20, elevation*20+1, Math.sin(azimuth)*20);
      var warmth = 1 - Math.abs(h-12)/8;
      obj.color.setRGB(1, 0.85 + warmth*0.15, 0.6 + warmth*0.4);
      obj.intensity = 0.2 + elevation * 1.2;
    }
  });
  fp3DRequestRender();
}
window.fpSunUpdate = fpSunUpdate;
```

Tag the key directional light in `fp3DInit()` with `light.userData.isSun = true`.

**Step 4: Verify** — Sun slider changes light direction and warmth in real time. Material picker changes wall appearance.

**Step 5: Commit**
```bash
git add app/mck-sketch.html
git commit -m "feat: PBR material picker, time-of-day sun control"
```

---

## Phase 7 — On-Demand Render

### Task 7.1: High-res PNG render capture

**Files:**
- Modify: `app/mck-sketch.html` — `fpGenerateRender()`

**Step 1: Implement `fpGenerateRender()`**

```javascript
function fpGenerateRender() {
  if (!fp3DRenderer || !fp3DScene || !fp3DCamera) {
    fpSetStatus('3D view not initialised.'); return;
  }
  var btn = document.getElementById('btn-render');
  if (btn) { btn.textContent = 'Rendering…'; btn.disabled = true; }

  // Save current size, boost to 2× for render
  var origW = fp3DRenderer.domElement.width;
  var origH = fp3DRenderer.domElement.height;
  var scale = 2;
  fp3DRenderer.setSize(origW * scale, origH * scale, false);
  fp3DCamera.aspect = origW / origH;
  fp3DCamera.updateProjectionMatrix();

  fp3DRenderer.render(fp3DScene, fp3DCamera);
  var dataUrl = fp3DRenderer.domElement.toDataURL('image/png');

  // Restore
  fp3DRenderer.setSize(origW, origH, false);
  fp3DCamera.aspect = origW / origH;
  fp3DCamera.updateProjectionMatrix();
  fp3DRequestRender();

  if (btn) { btn.textContent = 'Generate Render'; btn.disabled = false; }

  // Download
  var a = document.createElement('a');
  a.href = dataUrl;
  a.download = ((fpState && fpState.projectName) || 'mck-render') + '-' + Date.now() + '.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  fpSetStatus('Render saved.');
}
window.fpGenerateRender = fpGenerateRender;
```

**Step 2: Verify** — Click Generate Render → PNG downloads at 2× resolution.

**Step 3: Commit**
```bash
git add app/mck-sketch.html
git commit -m "feat: generate render button downloads 2x PNG from 3D scene"
```

---

## Phase 8 — Building Regs Compliance Engine

### Task 8.1: Compliance checker and live warnings

**Files:**
- Modify: `app/mck-sketch.html` — add compliance JS, update `fpRedraw()`
- Create: `tests/test-compliance.js`

**Step 1: Write test**

```javascript
// tests/test-compliance.js — run with: node tests/test-compliance.js
function fpCheckCompliance(storey, region) {
  var warnings = [];
  if (storey.ceilingHeight < 2100)
    warnings.push({ type:'ceiling', severity:'error', x:0, y:0,
      message:'Ceiling ' + storey.ceilingHeight + 'mm below 2100mm minimum',
      ref: region==='scotland' ? 'BSD Section 3.10' : 'Approved Doc B' });
  (storey.openings||[]).forEach(function(op) {
    if (op.type==='door' && op.width < 775)
      warnings.push({ type:'door-width', severity:'warning',
        message:'Door ' + op.width + 'mm below 775mm accessible minimum',
        ref: region==='scotland' ? 'BSD Section 4.1' : 'Part M' });
  });
  return warnings;
}

var storey = { ceilingHeight: 2000, openings: [{ type:'door', width:700 }] };
var w = fpCheckCompliance(storey, 'scotland');
console.assert(w.some(function(x){return x.type==='ceiling';}), 'flags low ceiling');
console.assert(w.some(function(x){return x.type==='door-width';}), 'flags narrow door');
console.assert(w.length === 2, 'exactly 2 warnings');
var okStorey = { ceilingHeight: 2400, openings: [{ type:'door', width:900 }] };
var ok = fpCheckCompliance(okStorey, 'scotland');
console.assert(ok.length === 0, 'no warnings for compliant storey');
console.log('PASS: compliance engine,', w.length, 'warnings correctly detected');
```

**Step 2: Run test**
```bash
node tests/test-compliance.js
```
Expected: `PASS: compliance engine, 2 warnings correctly detected`

**Step 3: Add full `fpCheckCompliance()` to app**

Paste the function into the floor plan JS block. Extend it with:
- Window area check (openings of type 'window', total area >= floor area / 10)
- Stair pitch (if stairs storey item present, pitch > 42° is an error)
- Habitable room without window

**Step 4: Run compliance after every redraw**

At the bottom of `fpRedraw()`:
```javascript
fpState._warnings = [];
fpState.storeys.forEach(function(s) {
  var ws = fpCheckCompliance(s, 'scotland');
  fpState._warnings = fpState._warnings.concat(ws);
});
```

**Step 5: Draw warning flags on 2D canvas**

In `fpRedraw()`, after drawing walls and items:
```javascript
(fpState._warnings || []).forEach(function(w) {
  if (w.x == null) return;
  var s = fpW2S(w.x, w.y);
  ctx.save();
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = w.severity === 'error' ? '#f87171' : '#fbbf24';
  ctx.fillText('⚠', s.x, s.y - 4);
  ctx.restore();
});
```

**Step 6: Show warnings in Properties panel**

Add a warnings section to `#panel-properties` that lists active warnings. Update it after each redraw.

**Step 7: Verify** — Set ceiling height to 2000mm, warning flag appears on canvas.

**Step 8: Commit**
```bash
git add app/mck-sketch.html tests/test-compliance.js
git commit -m "feat: building regs compliance engine with live warnings on 2D canvas"
```

---

## Phase 9 — PDF Export

### Task 9.1: Export dimensioned floor plan to PDF

**Files:**
- Modify: `app/mck-sketch.html` — add jsPDF CDN, `fpExportPDF()`

**Step 1: Add jsPDF CDN in `<head>`**

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
```

**Step 2: Implement `fpExportPDF()`**

```javascript
function fpExportPDF() {
  if (typeof window.jspdf === 'undefined') {
    fpSetStatus('PDF library not loaded.'); return;
  }
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a3' });
  var W = doc.internal.pageSize.getWidth();
  var H = doc.internal.pageSize.getHeight();
  var margin = 18;

  // Title block bar
  doc.setFillColor(30, 30, 36);
  doc.rect(0, 0, W, 13, 'F');
  doc.setTextColor(240, 240, 242);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('McK Sketch', margin, 8.5);
  doc.setFont('helvetica', 'normal');
  var pName = (fpState && fpState.projectName) ? fpState.projectName : 'Untitled';
  doc.text(pName + ' — Ground Floor Plan  |  Scale 1:100', W/2, 8.5, {align:'center'});
  doc.text(new Date().toLocaleDateString('en-GB'), W - margin, 8.5, {align:'right'});

  // Render the current 2D canvas to an offscreen canvas at print DPI
  var printCanvas = document.createElement('canvas');
  printCanvas.width  = Math.round((W - margin*2) * 3.78); // 1mm = 3.78px at 96dpi
  printCanvas.height = Math.round((H - 26) * 3.78);
  var pCtx = printCanvas.getContext('2d');
  pCtx.fillStyle = '#fafbfc';
  pCtx.fillRect(0, 0, printCanvas.width, printCanvas.height);

  // Temporarily redirect drawing to print canvas
  var savedCanvas = fpCanvas, savedCtx = fpCtx;
  var savedPan = {x:fpState.panX, y:fpState.panY, s:fpState.scale};
  fpCanvas = printCanvas; fpCtx = pCtx;
  fpFitAll();
  fpRedraw();
  fpCanvas = savedCanvas; fpCtx = savedCtx;
  fpState.panX = savedPan.x; fpState.panY = savedPan.y; fpState.scale = savedPan.s;

  doc.addImage(printCanvas.toDataURL('image/png'), 'PNG', margin, 15, W-margin*2, H-26);

  // Scale bar (bottom left)
  doc.setDrawColor(50, 50, 60); doc.setLineWidth(0.4);
  doc.line(margin, H-5, margin+20, H-5);
  doc.line(margin, H-7, margin, H-3);
  doc.line(margin+20, H-7, margin+20, H-3);
  doc.setTextColor(50, 50, 60); doc.setFontSize(6);
  doc.text('0          2m', margin, H-7.5);

  // Compliance warnings list (bottom right)
  var warns = fpState._warnings || [];
  if (warns.length > 0) {
    doc.setFontSize(6); doc.setTextColor(251, 191, 36);
    doc.text('Compliance warnings: ' + warns.length, W-margin, H-7.5, {align:'right'});
  }

  doc.save(pName.replace(/[^a-zA-Z0-9]/g,'-') + '-floor-plan.pdf');
  fpSetStatus('PDF exported.');
}
window.fpExportPDF = fpExportPDF;
```

**Step 3: Verify** — Click Export PDF → A3 landscape PDF downloads with floor plan, title block, scale bar.

**Step 4: Commit**
```bash
git add app/mck-sketch.html
git commit -m "feat: export dimensioned A3 floor plan PDF with title block and scale bar"
```

---

## Phase 10 — Project Save/Load

### Task 10.1: Projects API and auto-save

**Files:**
- Create: `server/src/routes/projects.js`
- Modify: `server/src/index.js`
- Modify: `app/mck-sketch.html` — auto-save JS

**Step 1: Create projects table migration**

In the server database init (find `CREATE TABLE IF NOT EXISTS users`), add:

```sql
CREATE TABLE IF NOT EXISTS projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL DEFAULT 'Untitled',
  data       TEXT    NOT NULL,
  share_token TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Step 2: Create `server/src/routes/projects.js`**

```javascript
const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const { authenticateToken } = require('../middleware/auth');

module.exports = (db) => {
  router.get('/', authenticateToken, (req, res) => {
    const rows = db.prepare(
      'SELECT id, name, created_at, updated_at FROM projects WHERE user_id=? ORDER BY updated_at DESC'
    ).all(req.user.userId);
    res.json(rows);
  });

  router.get('/:id', authenticateToken, (req, res) => {
    const p = db.prepare('SELECT * FROM projects WHERE id=? AND user_id=?')
      .get(req.params.id, req.user.userId);
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json({ ...p, data: JSON.parse(p.data) });
  });

  router.post('/', authenticateToken, (req, res) => {
    const { name, data } = req.body;
    if (!data) return res.status(400).json({ error: 'data required' });
    const r = db.prepare('INSERT INTO projects (user_id, name, data) VALUES (?,?,?)')
      .run(req.user.userId, name || 'Untitled', JSON.stringify(data));
    res.json({ id: r.lastInsertRowid });
  });

  router.put('/:id', authenticateToken, (req, res) => {
    const { name, data } = req.body;
    db.prepare('UPDATE projects SET name=?, data=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?')
      .run(name, JSON.stringify(data), req.params.id, req.user.userId);
    res.json({ ok: true });
  });

  router.post('/:id/share', authenticateToken, (req, res) => {
    const token = crypto.randomBytes(20).toString('hex');
    db.prepare('UPDATE projects SET share_token=? WHERE id=? AND user_id=?')
      .run(token, req.params.id, req.user.userId);
    res.json({ token, url: '/share/' + token });
  });

  router.get('/share/:token', (req, res) => {
    const p = db.prepare('SELECT data FROM projects WHERE share_token=?').get(req.params.token);
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json({ data: JSON.parse(p.data) });
  });

  return router;
};
```

**Step 3: Register route in `server/src/index.js`**

```javascript
const projectsRouter = require('./routes/projects')(db);
app.use('/api/projects', projectsRouter);
```

**Step 4: Add auto-save in app**

```javascript
var fpProjectId = null;
var fpAutoSaveTimer = null;

function fpGetSavePayload() {
  return {
    name: (fpState && fpState.projectName) || 'Untitled',
    data: {
      storeys: fpState.storeys,
      roof: fpState.roof || null,
      wallThickness: fpState.wallThickness,
      wallHeight: fpState.wallHeight,
      projectName: fpState.projectName || 'Untitled',
    }
  };
}

function fpSaveProject(silent) {
  if (!fpState) return;
  var token = localStorage.getItem('mck_token');
  if (!token) return; // not logged in
  var payload = fpGetSavePayload();
  var url = 'http://localhost:3141/api/projects' + (fpProjectId ? '/' + fpProjectId : '');
  var method = fpProjectId ? 'PUT' : 'POST';
  fetch(url, { method: method,
    headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + token },
    body: JSON.stringify(payload) })
  .then(function(r) { return r.json(); })
  .then(function(d) { if (d.id) fpProjectId = d.id; if (!silent) fpSetStatus('Saved.'); })
  .catch(function() { if (!silent) fpSetStatus('Save failed.'); });
}
window.fpSaveProject = fpSaveProject;

function fpScheduleAutoSave() {
  clearTimeout(fpAutoSaveTimer);
  fpAutoSaveTimer = setTimeout(function() { fpSaveProject(true); }, 30000);
}
```

Call `fpScheduleAutoSave()` at the end of `fpPushUndo()`.

**Step 5: Commit**
```bash
git add server/src/routes/projects.js server/src/index.js app/mck-sketch.html
git commit -m "feat: project save/load API, auto-save every 30s, share token endpoint"
```

---

## Phase 11 — Cost Estimator

### Task 11.1: Scottish build cost estimate

**Files:**
- Modify: `app/mck-sketch.html` — cost estimator JS and UI
- Create: `tests/test-cost-estimator.js`

**Step 1: Write test**

```javascript
// tests/test-cost-estimator.js
function fpEstimateFloorArea(storeys) {
  return storeys.reduce(function(sum, s) {
    var walls = s.walls;
    if (!walls.length) return sum;
    var minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    walls.forEach(function(w) {
      minX=Math.min(minX,w.x1,w.x2); maxX=Math.max(maxX,w.x1,w.x2);
      minY=Math.min(minY,w.y1,w.y2); maxY=Math.max(maxY,w.y1,w.y2);
    });
    return sum + (maxX-minX)*(maxY-minY)/1e6;
  }, 0);
}
function fpEstimateCost(storeys, spec) {
  var rates = { standard:1650, mid:2100, high:2800 };
  var rate = rates[spec] || rates.standard;
  var area = fpEstimateFloorArea(storeys);
  return { area:Math.round(area*10)/10, low:Math.round(area*rate*0.9), high:Math.round(area*rate*1.15) };
}

var walls = [{x1:0,y1:0,x2:10000,y2:0},{x1:10000,y1:0,x2:10000,y2:8000},
             {x1:10000,y1:8000,x2:0,y2:8000},{x1:0,y1:8000,x2:0,y2:0}];
var est = fpEstimateCost([{walls:walls}], 'standard');
console.assert(Math.abs(est.area-80) < 1, 'area ~80m², got ' + est.area);
console.assert(est.low > 100000, 'cost over £100k');
console.log('PASS: cost estimator — area:', est.area + 'm²  range: £'+est.low+' – £'+est.high);
```

**Step 2: Run test**
```bash
node tests/test-cost-estimator.js
```
Expected: `PASS: cost estimator...`

**Step 3: Add cost estimator to Properties panel**

```html
<div class="fp-sidebar-section" style="margin-top:12px">
  <div class="fp-sidebar-label">Cost Estimate (Scotland 2026)</div>
  <select id="fp-spec" onchange="fpUpdateCost()">
    <option value="standard">Standard (£1,650/m²)</option>
    <option value="mid">Mid-spec (£2,100/m²)</option>
    <option value="high">High-spec (£2,800/m²)</option>
  </select>
  <div id="fp-cost-result" style="margin-top:8px;font-size:13px;line-height:1.6"></div>
</div>
```

```javascript
function fpEstimateFloorArea(storeys) { /* paste from test */ }
function fpEstimateCost(storeys, spec) { /* paste from test */ }

function fpUpdateCost() {
  if (!fpState) return;
  var spec = (document.getElementById('fp-spec')||{}).value || 'standard';
  var est = fpEstimateCost(fpState.storeys, spec);
  var el = document.getElementById('fp-cost-result');
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild); // clear safely
  if (est.area === 0) { el.textContent = 'Draw walls to estimate'; return; }
  var area = document.createElement('div');
  area.textContent = est.area + 'm² floor area';
  area.style.fontWeight = '600';
  var range = document.createElement('div');
  range.textContent = '£' + est.low.toLocaleString() + ' – £' + est.high.toLocaleString();
  var note = document.createElement('div');
  note.textContent = 'Rough estimate only. Get a proper quote.';
  note.style.cssText = 'color:var(--text-muted);font-size:10px;margin-top:2px';
  el.appendChild(area); el.appendChild(range); el.appendChild(note);
}
window.fpUpdateCost = fpUpdateCost;
```

Call `fpUpdateCost()` at the end of `fpRedraw()`.

**Step 4: Commit**
```bash
git add app/mck-sketch.html tests/test-cost-estimator.js
git commit -m "feat: Scottish build cost estimator with spec level selector"
```

---

## Phase 12 — Virtual Walkthrough

### Task 12.1: First-person WASD walkthrough

**Files:**
- Modify: `app/mck-sketch.html` — `fpToggleWalkthrough()`, walk loop

**Step 1: Implement walkthrough mode**

```javascript
var fpWalkMode = false, fpWalkKeys = {}, fpWalkRaf = null, fpWalkYaw = 0;

function fpToggleWalkthrough() {
  fpWalkMode = !fpWalkMode;
  var wrap = document.getElementById('canvas-wrap');
  var btn = document.getElementById('btn-walk');
  if (fpWalkMode) {
    if (wrap) wrap.style.gridTemplateRows = '0px 6px 1fr'; // expand 3D full height
    if (btn) { btn.textContent = '✕ Exit'; btn.style.color = 'var(--accent)'; }
    if (fp3DControls) fp3DControls.enabled = false;
    document.getElementById('fp-3d-panel').requestPointerLock();
    fp3DCamera.fov = 75; fp3DCamera.updateProjectionMatrix();
    // Start at centre of ground floor
    var s = fpState.storeys[0];
    var cx = 0, cy = 0;
    if (s.walls.length > 0) {
      s.walls.forEach(function(w) { cx += (w.x1+w.x2)/2; cy += (w.y1+w.y2)/2; });
      cx /= s.walls.length; cy /= s.walls.length;
    }
    fp3DCamera.position.set(cx/1000, 1.6, -cy/1000);
    fpWalkYaw = 0;
    fpWalkRaf = requestAnimationFrame(fpWalkLoop);
  } else {
    if (wrap) wrap.style.gridTemplateRows = '';
    if (btn) { btn.textContent = '👁 Walk'; btn.style.color = ''; }
    if (fp3DControls) fp3DControls.enabled = true;
    document.exitPointerLock();
    fp3DCamera.fov = 35; fp3DCamera.updateProjectionMatrix();
    cancelAnimationFrame(fpWalkRaf); fpWalkRaf = null;
    fp3DRequestRender();
  }
}
window.fpToggleWalkthrough = fpToggleWalkthrough;

document.addEventListener('keydown', function(e) { if (fpWalkMode) fpWalkKeys[e.code] = true; });
document.addEventListener('keyup',   function(e) { if (fpWalkMode) fpWalkKeys[e.code] = false; });
document.addEventListener('mousemove', function(e) {
  if (!fpWalkMode || !document.pointerLockElement) return;
  fpWalkYaw -= e.movementX * 0.002;
});

function fpWalkLoop() {
  if (!fpWalkMode) return;
  var T = window.mck3D.THREE;
  var speed = 0.05;
  var move = new T.Vector3();
  if (fpWalkKeys['KeyW'] || fpWalkKeys['ArrowUp'])    move.z -= 1;
  if (fpWalkKeys['KeyS'] || fpWalkKeys['ArrowDown'])  move.z += 1;
  if (fpWalkKeys['KeyA'] || fpWalkKeys['ArrowLeft'])  move.x -= 1;
  if (fpWalkKeys['KeyD'] || fpWalkKeys['ArrowRight']) move.x += 1;
  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(speed);
    move.applyEuler(new T.Euler(0, fpWalkYaw, 0));
    fp3DCamera.position.add(move);
    fp3DCamera.position.y = 1.6;
  }
  fp3DCamera.rotation.set(0, fpWalkYaw, 0, 'YXZ');
  if (fp3DRenderer) fp3DRenderer.render(fp3DScene, fp3DCamera);
  fpWalkRaf = requestAnimationFrame(fpWalkLoop);
}
```

Add walkthrough button to the right side of the header:
```html
<button id="btn-walk" onclick="fpToggleWalkthrough()"
  style="padding:6px 12px;background:transparent;color:var(--text-secondary);
  border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:12px">
  👁 Walk
</button>
```

**Step 2: Verify** — Click Walk → 3D expands full height. WASD moves through space. Mouse look rotates. Click ✕ → returns to split view.

**Step 3: Commit**
```bash
git add app/mck-sketch.html
git commit -m "feat: first-person WASD virtual walkthrough with pointer lock"
```

---

## All Phases Complete

Plan saved to `docs/plans/2026-02-19-mck-sketch-v2-implementation.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** — Dispatch a fresh subagent per task, review between tasks, fast iteration in this window.

**2. Parallel Session (separate)** — Open a new Claude Code session in this directory, tell it to use the `superpowers:executing-plans` skill and point it at this plan file.

**Which approach?**
