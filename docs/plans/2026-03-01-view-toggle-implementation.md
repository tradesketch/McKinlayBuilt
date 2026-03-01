# CAD / Floor Plan View Toggle — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a CAD/Floor Plan view toggle so the main drawing tools work, with the floor plan visible as a faint ghost underlay in CAD mode.

**Architecture:** Both canvases (`#canvas` and `#fp-main-2d`) are stacked inside a new `#canvas-area` wrapper (both `position:absolute; inset:0`). A `setAppView()` function swaps which canvas is interactive via z-index/pointer-events/opacity. The fp-tools toolbar hides in CAD mode. A segmented toggle in the header switches views.

**Tech Stack:** Vanilla JS, CSS, Electron 33. Single file `app/mck-sketch.html`. No server changes needed.

---

## Key File Locations

- HTML: `app/mck-sketch.html`
- Canvas-wrap HTML: line ~4553
- Canvas-wrap CSS: line ~236
- `#fp-main-2d` CSS: line ~255
- `init()`: line ~22467 (auto-init, where `openFloorPlan()` is called)
- `resize()`: line ~22651 (reads canvas-wrap dimensions to size `#canvas`)
- `openFloorPlan()`: line ~54814 (sets up fp canvas, has ResizeObserver)
- `fpResizeCanvas()`: line ~54917
- Header `<div class="header-right">`: line ~4133

---

## Task 1: HTML — add `#canvas-area` wrapper

**File:** `app/mck-sketch.html` ~line 4553

The current `#canvas-wrap` contains `#canvas`, then overlays (`#axis-indicator`, `#coords`, `#scale`, `#vcb`), then `#fp-tools-bar` and `#fp-main-2d`. We need to wrap all of these except `#fp-tools-bar` in a new `#canvas-area` div.

**Step 1: Read the current HTML**

Read lines 4553–4575 to confirm the exact structure.

**Step 2: Replace the canvas-wrap contents**

Find:
```html
  <main id="canvas-wrap">
    <canvas id="canvas"></canvas>
    <div id="axis-indicator">
```

Replace with:
```html
  <main id="canvas-wrap">
    <div id="fp-tools-bar"></div>
    <div id="canvas-area">
    <canvas id="canvas"></canvas>
    <div id="axis-indicator">
```

Then find the closing of `#fp-tools-bar` and `#fp-main-2d` at end of canvas-wrap:
```html
    <div id="fp-tools-bar"></div>
    <div id="fp-main-2d"></div>
  </main>
```

Replace with:
```html
    <div id="fp-main-2d"></div>
    </div><!-- #canvas-area -->
  </main>
```

Note: `#fp-tools-bar` is now the first child of `#canvas-wrap` (flex item), and `#canvas-area` is the second (flex:1). Everything else (`#canvas`, overlays, `#fp-main-2d`) is inside `#canvas-area`.

**Step 3: Verify**

Read lines 4553–4580 and confirm the structure is:
```
#canvas-wrap
  #fp-tools-bar
  #canvas-area
    #canvas
    #axis-indicator
    #coords
    #scale
    #vcb
    #fp-main-2d
```

---

## Task 2: CSS — canvas-area, canvas, fp-main-2d, view toggle buttons

**File:** `app/mck-sketch.html` ~line 236

**Step 1: Read current CSS block**

Read lines 236–270 to see the existing canvas-wrap, fp-tools-bar, fp-main-2d rules.

**Step 2: Add `#canvas-area` rule after `#canvas-wrap`**

Find:
```css
#canvas-wrap {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
```

Replace with:
```css
#canvas-wrap {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
#canvas-area {
  flex: 1;
  position: relative;
  overflow: hidden;
  min-height: 0;
}
#canvas-area canvas#canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
```

**Step 3: Update `#fp-main-2d` CSS**

Find:
```css
#fp-main-2d {
  flex: 1;
  position: relative;
  overflow: hidden;
  z-index: 2;
  background: #f4f4f0;
  min-height: 0;
}
```

Replace with:
```css
#fp-main-2d {
  position: absolute;
  inset: 0;
  overflow: hidden;
  z-index: 2;
  background: #f4f4f0;
}
```

**Step 4: Add view toggle button CSS**

After `.unit-toggle-btn.active { ... }`, add:
```css
.view-toggle-btn { padding:5px 12px; border:none; background:transparent; cursor:pointer; font-size:12px; font-weight:600; color:var(--text-secondary); }
.view-toggle-btn.active { background:var(--accent); color:#fff; }
```

---

## Task 3: HTML — add view toggle to header

**File:** `app/mck-sketch.html` ~line 4133

**Step 1: Read the header-right block**

Read lines 4130–4145 to confirm the exact content of `<div class="header-right">`.

**Step 2: Add the toggle before the Feedback button**

Find:
```html
    <div class="header-right">
```

Replace with:
```html
    <div class="header-right">
      <div style="display:flex;border:1px solid var(--border);border-radius:4px;overflow:hidden;margin-right:8px">
        <button class="view-toggle-btn active" data-view="floorplan" onclick="setAppView('floorplan')" title="Floor plan drawing mode">&#9633; Floor Plan</button>
        <button class="view-toggle-btn" data-view="cad" onclick="setAppView('cad')" title="CAD drawing mode">&#9998; CAD</button>
      </div>
```

---

## Task 4: JS — `appView` variable and `setAppView()` function

**File:** `app/mck-sketch.html`

Add near the other `fp` variables (after `var fpUnitSystem = ...`).

**Step 1: Find the fpUnitSystem declaration**

Grep for `var fpUnitSystem` to get the line number.

**Step 2: Add appView variable and setAppView function after fpUnitSystem block**

After `window.fpSetUnits = fpSetUnits;`, add:

```javascript
var appView = localStorage.getItem('app-view') || 'floorplan';

function setAppView(view) {
  appView = view;
  localStorage.setItem('app-view', view);
  var isCad = (view === 'cad');

  // Toggle buttons
  document.querySelectorAll('.view-toggle-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.view === view);
  });

  // fp-tools-bar
  var toolsBar = document.getElementById('fp-tools-bar');
  if (toolsBar) toolsBar.style.display = isCad ? 'none' : '';

  // fp-main-2d — ghost underlay in CAD, full interactive in FP
  var fp = document.getElementById('fp-main-2d');
  if (fp) {
    fp.style.zIndex = isCad ? '1' : '2';
    fp.style.pointerEvents = isCad ? 'none' : 'all';
    fp.style.opacity = isCad ? '0.15' : '1';
  }

  // main canvas — active in CAD, hidden in FP
  var cv = document.getElementById('canvas');
  if (cv) {
    cv.style.zIndex = isCad ? '2' : '0';
    cv.style.pointerEvents = isCad ? 'all' : 'none';
    cv.style.display = isCad ? '' : 'none';
  }

  // CAD-only overlays
  ['axis-indicator', 'coords', 'scale', 'vcb'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = isCad ? '' : 'none';
  });

  // fp-sidebar in right panel
  var fpSidebar = document.getElementById('fp-sidebar-in-panel');
  if (fpSidebar) fpSidebar.style.display = isCad ? 'none' : '';

  // Resize the now-active canvas
  if (isCad) { if (typeof resize === 'function') resize(); }
  else fpResizeCanvas();
}
window.setAppView = setAppView;
```

---

## Task 5: JS — update `resize()` to read `#canvas-area`

**File:** `app/mck-sketch.html` ~line 22651

**Step 1: Read resize()**

Read lines 22651–22665.

**Step 2: Update wrap reference**

Find:
```javascript
function resize() {
  const wrap = document.getElementById('canvas-wrap');
```

Replace with:
```javascript
function resize() {
  const wrap = document.getElementById('canvas-area') || document.getElementById('canvas-wrap');
```

This ensures the main CAD canvas is sized to the inner `#canvas-area` (excluding the fp-tools-bar height) rather than the full canvas-wrap.

---

## Task 6: JS — update ResizeObserver and call setAppView in init()

**File:** `app/mck-sketch.html`

### Part A: ResizeObserver in openFloorPlan()

The current ResizeObserver watches `#fp-main-2d`. Since that's now `position:absolute` it has the same size as `#canvas-area`, so this still works. But update it to also resize the CAD canvas if in CAD mode.

**Step 1: Read openFloorPlan() ResizeObserver block**

Grep for `_fpResizeObserver` and read that block.

**Step 2: Replace the ResizeObserver**

Find:
```javascript
  var main2dEl = document.getElementById('fp-main-2d');
  if (main2dEl && !main2dEl._fpResizeObserver) {
    main2dEl._fpResizeObserver = new ResizeObserver(function() { fpResizeCanvas(); });
    main2dEl._fpResizeObserver.observe(main2dEl);
  }
```

Replace with:
```javascript
  var canvasAreaEl = document.getElementById('canvas-area');
  if (canvasAreaEl && !canvasAreaEl._resizeObserver) {
    canvasAreaEl._resizeObserver = new ResizeObserver(function() {
      if (appView === 'cad') { if (typeof resize === 'function') resize(); }
      else fpResizeCanvas();
    });
    canvasAreaEl._resizeObserver.observe(canvasAreaEl);
  }
```

### Part B: Call setAppView after openFloorPlan() in init()

**Step 1: Read the end of init()**

Grep for `openFloorPlan()` inside init to find the line.

**Step 2: Add setAppView call after openFloorPlan()**

Find:
```javascript
  // V2: Auto-init floor plan as primary workspace
  openFloorPlan();
}
```

Replace with:
```javascript
  // V2: Auto-init floor plan as primary workspace
  openFloorPlan();
  setAppView(localStorage.getItem('app-view') || 'floorplan');
}
```

---

## Task 7: Commit

```bash
git add app/mck-sketch.html
git commit -m "feat: CAD/floor-plan view toggle with floor plan ghost underlay"
```

---

## Quick Smoke Test

After implementation, launch the app (`npm start`) and verify:

1. App opens with Floor Plan mode active — floor plan canvas visible, CAD overlays (axis, coords) hidden
2. Click "CAD" toggle — main canvas appears, floor plan fades to ghost (15% opacity), CAD tools work
3. Draw a wall in Floor Plan mode, switch to CAD — faint wall outline visible as background
4. Resize the window in both modes — canvases resize correctly
5. Reload — last used view is restored from localStorage
