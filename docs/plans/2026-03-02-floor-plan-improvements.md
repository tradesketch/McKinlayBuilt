# Floor Plan Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 10 floor plan bugs and add 4 new features (eraser, dimensions, calculator, roof tool) to make TradeSketch production-ready.

**Architecture:** All changes are in `app/mck-sketch.html` (single ~56K line file). Floor plan state lives in `fpState` object and canvas state in `S` object (pan=`S.px`/`S.py`, zoom=`S.sc`). CAD is a separate Three.js canvas layered on top via CSS z-index.

**Tech Stack:** Vanilla JS, HTML5 Canvas, CSS — no build step needed.

---

## Phase 1: Quick Fixes

---

### Task 1: Remove the Radio Button

**Files:**
- Modify: `app/mck-sketch.html`

**Context:** There is a floating red "Radio" pill button visible at the bottom right of the screen. It calls `toggleRadioPlayer()`. We want to remove this button entirely from the UI (the radio panel itself can stay hidden, we just remove the floating toggle button).

**Step 1: Find the floating Radio button**

Search for `toggleRadioPlayer` in `mck-sketch.html`. There will be a button element calling it — something like:

```html
<button ... onclick="toggleRadioPlayer()">
  ... Radio
</button>
```

Or search for the text "Radio" near the bottom of the HTML body (around lines 16350–16450). The floating button is the red pill visible in the bottom-right corner.

**Step 2: Delete the floating button element**

Remove the entire HTML element for the floating radio toggle button. Do not remove the radio panel itself or the `toggleRadioPlayer` function — just the button that triggers it.

**Step 3: Verify**

Start the app with `npx electron .` — the red Radio button should be gone from the bottom right. The rest of the app should work normally.

**Step 4: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: remove radio floating button from UI"
```

---

### Task 2: Wall Thickness Preset Switches to Wall Tool

**Files:**
- Modify: `app/mck-sketch.html` lines ~19164–19168

**Context:** The thickness preset buttons (3×2, 4×2, 6×2, 6" blk, Ext) currently only call `fpSetThickness(mm)`. When clicked, they should also switch the active tool to 'wall'. The `fpSetTool('wall')` function handles this.

**Step 1: Find the preset buttons**

They are at lines ~19164–19168:
```html
<button class="fp-preset-btn" onclick="fpSetThickness(70)" title="3×2 CLS">3×2</button>
<button class="fp-preset-btn" onclick="fpSetThickness(95)" title="4×2 CLS">4×2</button>
<button class="fp-preset-btn" onclick="fpSetThickness(145)" title="6×2 CLS">6×2</button>
<button class="fp-preset-btn" onclick="fpSetThickness(150)" title="6 inch block">6" blk</button>
<button class="fp-preset-btn" onclick="fpSetThickness(300)" title="External timber">Ext</button>
```

**Step 2: Add fpSetTool('wall') to each button**

Change each button's onclick to call both functions:
```html
<button class="fp-preset-btn" onclick="fpSetThickness(70);fpSetTool('wall')" title="3×2 CLS (45×70mm dressed)">3×2</button>
<button class="fp-preset-btn" onclick="fpSetThickness(95);fpSetTool('wall')" title="4×2 CLS (45×95mm dressed)">4×2</button>
<button class="fp-preset-btn" onclick="fpSetThickness(145);fpSetTool('wall')" title="6×2 CLS (45×145mm dressed)">6×2</button>
<button class="fp-preset-btn" onclick="fpSetThickness(150);fpSetTool('wall')" title="6 inch block (150mm)">6&#34; blk</button>
<button class="fp-preset-btn" onclick="fpSetThickness(300);fpSetTool('wall')" title="External timber kit (300mm)">Ext</button>
```

**Step 3: Verify**

Start app, open floor plan, click the Window tool, then click 4×2. The Wall tool button should become active (highlighted).

**Step 4: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: wall thickness preset buttons switch to wall tool"
```

---

### Task 3: Auto-Switch to Wall Tool After Placing Door/Window

**Files:**
- Modify: `app/mck-sketch.html` line ~55820

**Context:** After a door or window is placed, the status message says "Click another wall or switch tool." We want to automatically switch back to the wall tool instead. The placement happens at line ~55820 where `fpState.openings.push(...)` is called.

**Step 1: Find the placement code**

Search for `fpState.openings.push` — it's around line 55819. The code looks like:

```javascript
fpState.openings.push({ wallIndex:wi, t:t, width:opW, height:opH, sillHeight:opS, type:type });
fpSetStatus((type==='door'?'Door':'Window') + ' placed (' + opW + '×' + opH + 'mm). Click another wall or switch tool.');
```

**Step 2: Add auto-switch to wall tool after placement**

After the `fpState.openings.push(...)` line, add:
```javascript
fpState.openings.push({ wallIndex:wi, t:t, width:opW, height:opH, sillHeight:opS, type:type });
fpSetTool('wall');
fpSetStatus((type==='door'?'Door':'Window') + ' placed. Now drawing walls.');
```

**Step 3: Verify**

Start app, floor plan mode. Select Window tool, click a wall to place a window. After placement, the active tool should automatically switch back to Wall.

**Step 4: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: auto-switch to wall tool after placing door or window"
```

---

### Task 4: Strong Cardinal Direction Snapping for Floor Plan Walls

**Files:**
- Modify: `app/mck-sketch.html` — floor plan wall drawing mouse move handler

**Context:** When drawing walls in the floor plan, the angle should snap strongly to 0°, 90°, 180°, 270° (N/E/S/W). Currently it only snaps to these when Shift is held. We want to make cardinal directions the default — walls within ~15° of a cardinal direction should snap to it, and only non-cardinal angles allowed when the angle is clearly diagonal.

**Step 1: Find the floor plan wall drawing mousemove handler**

Search for `fpState.drawing` and `fpState.tool === 'wall'` to find where the wall preview is drawn during mouse movement. Look for where the endpoint is calculated — it will use mouse coordinates to determine the second wall point.

The relevant section will have something like:
```javascript
if (fpState.tool === 'wall' && fpState.drawing) {
    // calculate endpoint from mouse position
    var pt = fpCanvasToWorld(e);
    fpState.currentEnd = pt;
    fpRender();
}
```

**Step 2: Add cardinal snapping function**

Find where wall endpoint is set during drawing. Add a snap function that locks to cardinal angles within a 15° threshold:

```javascript
function fpSnapCardinal(start, end) {
  var dx = end.x - start.x;
  var dy = end.y - start.y;
  var len = Math.sqrt(dx*dx + dy*dy);
  if (len < 1) return end;
  var angle = Math.atan2(dy, dx) * 180 / Math.PI;
  // Normalize to 0-360
  if (angle < 0) angle += 360;
  // Cardinal angles: 0, 90, 180, 270
  var cardinals = [0, 90, 180, 270, 360];
  var nearest = cardinals.reduce(function(prev, curr) {
    return Math.abs(curr - angle) < Math.abs(prev - angle) ? curr : prev;
  });
  var diff = Math.abs(nearest - angle);
  if (diff > 180) diff = 360 - diff;
  // Snap if within 15° of a cardinal
  if (diff <= 15) {
    var snapRad = (nearest % 360) * Math.PI / 180;
    return {
      x: start.x + len * Math.cos(snapRad),
      y: start.y + len * Math.sin(snapRad)
    };
  }
  return end;
}
```

**Step 3: Apply the snap**

In the wall drawing mousemove handler, after calculating the raw endpoint from mouse position, apply the snap:

```javascript
fpState.currentEnd = fpSnapCardinal(fpState.currentStart, rawEndpoint);
```

**Step 4: Verify**

Draw a wall at roughly 10° — it should snap to 0° (horizontal). Draw at roughly 85° — it should snap to 90° (vertical). Draw at 45° — it should stay at 45° (no snapping).

**Step 5: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: strong cardinal direction snapping for floor plan walls"
```

---

## Phase 2: Floor Plan Fixes

---

### Task 5: CAD Overlay Moves with Floor Plan Pan/Zoom

**Files:**
- Modify: `app/mck-sketch.html` — floor plan render function and pan/zoom handlers

**Context:** The floor plan canvas (`#fp-canvas`) uses `S.px`, `S.py`, `S.sc` for pan and zoom. The Three.js canvas (`#canvas`) is a separate element layered on top via CSS. When the floor plan pans, the Three.js canvas doesn't follow. The fix: apply a CSS transform to `#canvas` that mirrors the floor plan transform whenever pan/zoom changes.

The floor plan renders using:
```javascript
ctx.translate(S.px, S.py);
ctx.scale(S.sc, -S.sc);
```

We need to apply the equivalent CSS transform to the Three.js canvas so it moves in sync.

**Step 1: Find the floor plan render function**

Search for `ctx.translate(S.px` — this is inside the fp canvas render. Find the function that contains it (likely `fpRender()` or `render()`).

**Step 2: Find where S.px/S.py/S.sc are updated**

Search for `S.px =` and `S.py =` — these are updated in the pan handler. Also search for `S.sc =` for zoom. These are the places we need to also update the CSS transform.

**Step 3: Create a sync function**

Add this function near the floor plan pan/zoom code:

```javascript
function syncCadOverlayTransform() {
  var cadCanvas = document.getElementById('canvas');
  if (!cadCanvas) return;
  // The fp canvas applies: translate(S.px, S.py) then scale(S.sc, -S.sc)
  // Mirror this as a CSS transform on the CAD canvas
  // CSS transform origin is top-left, fp Y is flipped, so we need to account for canvas height
  var h = cadCanvas.height || cadCanvas.offsetHeight || 800;
  cadCanvas.style.transformOrigin = '0 0';
  cadCanvas.style.transform =
    'translate(' + S.px + 'px, ' + (S.py) + 'px) scale(' + S.sc + ', ' + S.sc + ')';
}
```

**Step 4: Call syncCadOverlayTransform after every pan/zoom update**

In every place where `S.px`, `S.py`, or `S.sc` are updated (pan handler, zoom handler), add a call to `syncCadOverlayTransform()` at the end.

Also call it in `setAppView()` when switching to floor plan mode.

**Step 5: Verify**

Draw something in CAD mode. Switch to floor plan mode. Pan the floor plan — the CAD ghost overlay should move with it. Zoom in — the CAD overlay should zoom with it.

**Step 6: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: CAD overlay syncs with floor plan pan and zoom"
```

---

### Task 6: Grid Toggle Syncs Both CAD and Floor Plan

**Files:**
- Modify: `app/mck-sketch.html` — `toggleGrid()` function (line ~25256) and floor plan grid toggle

**Context:** There are two grids — the CAD dot grid (`#dotGrid`) toggled by `toggleGrid()` at line 25256, and the floor plan grid controlled by `fpState`. The "Grid" checkbox in the view panel should toggle both together. Currently it only toggles the CAD grid.

**Step 1: Find the floor plan grid state**

Search for `fpState.grid` or `fpGrid` or `showGrid` in the floor plan code. Find where the floor plan grid is drawn in `fpRender()`.

**Step 2: Find toggleGrid() at line ~25256**

```javascript
function toggleGrid() {
  S.grid = !S.grid;
  document.getElementById('chkGrid').checked = S.grid;
  document.getElementById('dotGrid').classList.toggle('off', !S.grid);
  render();
}
```

**Step 3: Also toggle the floor plan grid**

Update `toggleGrid()` to also toggle the floor plan grid:

```javascript
function toggleGrid() {
  S.grid = !S.grid;
  document.getElementById('chkGrid').checked = S.grid;
  document.getElementById('dotGrid').classList.toggle('off', !S.grid);
  // Also sync floor plan grid
  if (fpState) fpState.showGrid = S.grid;
  render();
  fpRender && fpRender();
}
```

**Step 4: Use fpState.showGrid in floor plan render**

Find where the floor plan grid is drawn in `fpRender()`. Add a check:
```javascript
if (fpState.showGrid !== false) {
  // draw grid
}
```

**Step 5: Verify**

Turn off grid — both the CAD dot grid and floor plan grid should disappear. Turn it back on — both should reappear.

**Step 6: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: grid toggle syncs across CAD and floor plan views"
```

---

### Task 7: Eraser Tool in Floor Plan

**Files:**
- Modify: `app/mck-sketch.html` — fpSetTool, floor plan toolbar HTML, floor plan click handler

**Context:** The CAD canvas has an eraser tool. The floor plan needs its own eraser that removes walls, doors, and windows by clicking on them.

**Step 1: Add eraser button to floor plan toolbar**

Find the floor plan toolbar buttons (around line 19060 — the fp-tools-bar). Add an Eraser button after the existing tools:

```html
<button class="fp-tool-btn" id="fp-btn-eraser" onclick="fpSetTool('eraser')">Eraser</button>
```

**Step 2: Update fpSetTool to handle eraser**

In `fpSetTool()` at line ~55053, the forEach that updates button active states needs to include 'eraser':

```javascript
['wall','door','window','select','measure','electrical','wire','eraser'].forEach(function(t) {
  var btn = document.getElementById('fp-btn-' + t);
  if (btn) btn.classList.toggle('active', t === tool);
});
```

Also add the status message for eraser tool. Inside `fpSetTool`, after the switch on tool name, add:
```javascript
if (tool === 'eraser') fpSetStatus('Click a wall, door, or window to delete it.');
```

**Step 3: Handle eraser clicks in the floor plan click handler**

Find the floor plan canvas click handler (search for `fpState.tool === 'select'` or `fpCanvasClick`). Add a case for eraser:

```javascript
if (fpState.tool === 'eraser') {
  var pt = fpCanvasToWorld(e);
  // Try to delete a wall near the click
  var deletedWall = false;
  for (var wi = fpState.walls.length - 1; wi >= 0; wi--) {
    var w = fpState.walls[wi];
    if (fpPointNearSegment(pt, w.x1, w.y1, w.x2, w.y2, 20 / S.sc)) {
      fpPushUndo();
      // Remove any openings on this wall
      fpState.openings = fpState.openings.filter(function(o) { return o.wallIndex !== wi; });
      // Remap opening wall indices for walls after deleted one
      fpState.openings.forEach(function(o) { if (o.wallIndex > wi) o.wallIndex--; });
      fpState.walls.splice(wi, 1);
      fpRender();
      fpSetStatus('Wall deleted. Click to delete more.');
      deletedWall = true;
      break;
    }
  }
  if (!deletedWall) {
    // Try to delete an opening (door/window)
    for (var oi = fpState.openings.length - 1; oi >= 0; oi--) {
      var op = fpState.openings[oi];
      var ww = fpState.walls[op.wallIndex];
      if (!ww) continue;
      // Calculate opening midpoint on wall
      var wlen = Math.sqrt(Math.pow(ww.x2-ww.x1,2)+Math.pow(ww.y2-ww.y1,2));
      var dx = (ww.x2-ww.x1)/wlen, dy = (ww.y2-ww.y1)/wlen;
      var mx = ww.x1 + dx*(op.t*wlen + op.width/2);
      var my = ww.y1 + dy*(op.t*wlen + op.width/2);
      if (Math.sqrt(Math.pow(pt.x-mx,2)+Math.pow(pt.y-my,2)) < op.width/2 + 100/S.sc) {
        fpPushUndo();
        fpState.openings.splice(oi, 1);
        fpRender();
        fpSetStatus((op.type==='door'?'Door':'Window') + ' deleted.');
        break;
      }
    }
  }
  return;
}
```

Note: `fpPointNearSegment` may already exist — search for it. If not, add:
```javascript
function fpPointNearSegment(pt, x1, y1, x2, y2, threshold) {
  var dx = x2-x1, dy = y2-y1, len2 = dx*dx+dy*dy;
  if (len2 === 0) return Math.sqrt(Math.pow(pt.x-x1,2)+Math.pow(pt.y-y1,2)) < threshold;
  var t = Math.max(0, Math.min(1, ((pt.x-x1)*dx+(pt.y-y1)*dy)/len2));
  var cx = x1+t*dx, cy = y1+t*dy;
  return Math.sqrt(Math.pow(pt.x-cx,2)+Math.pow(pt.y-cy,2)) < threshold;
}
```

**Step 4: Verify**

Draw some walls and place a door. Select eraser, click on a wall — it should disappear. Click on the door — it should disappear. Undo (Ctrl+Z) should restore deleted elements.

**Step 5: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: eraser tool in floor plan removes walls doors and windows"
```

---

## Phase 3: New Features

---

### Task 8: Dimensions Toggle on Floor Plan

**Files:**
- Modify: `app/mck-sketch.html` — floor plan toolbar, fpRender function

**Context:** Add a toggle button to show/hide wall length dimensions on the floor plan. When enabled, each wall shows its length in mm (or converted to feet if ft mode is active) at the midpoint of the wall, perpendicular to the wall direction.

**Step 1: Add dimensions toggle button to floor plan toolbar**

In the fp-tools-bar (around line 19060), add after the existing buttons:

```html
<button class="fp-tool-btn" id="fp-btn-dims" onclick="fpToggleDims()" title="Toggle dimensions">Dims</button>
```

**Step 2: Add fpState.showDims flag and toggle function**

Find where `fpState` is initialized (search for `fpNewState` or `fpState = {`). Add `showDims: false` to the state object.

Add the toggle function near other fp utility functions:

```javascript
function fpToggleDims() {
  if (!fpState) return;
  fpState.showDims = !fpState.showDims;
  var btn = document.getElementById('fp-btn-dims');
  if (btn) btn.classList.toggle('active', fpState.showDims);
  fpRender();
}
window.fpToggleDims = fpToggleDims;
```

**Step 3: Draw dimensions in fpRender**

Find the `fpRender()` function. At the end of it (after walls and openings are drawn), add dimension rendering:

```javascript
// Draw wall dimensions if enabled
if (fpState.showDims) {
  ctx.save();
  ctx.font = 'bold ' + Math.max(10, 180/S.sc) + 'px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fpState.walls.forEach(function(w) {
    var dx = w.x2 - w.x1, dy = w.y2 - w.y1;
    var len = Math.sqrt(dx*dx + dy*dy);
    if (len < 50) return; // skip tiny walls
    var mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
    var angle = Math.atan2(dy, dx);
    // Offset perpendicular to wall
    var offset = (w.thickness || 100) / 2 + 200 / S.sc;
    var px = mx - Math.sin(angle) * offset;
    var py = my + Math.cos(angle) * offset;
    // Format length
    var useFt = document.getElementById('btn-ft') && document.getElementById('btn-ft').classList.contains('active');
    var label = useFt
      ? (len / 304.8).toFixed(2) + "'"
      : Math.round(len) + 'mm';
    // Draw background pill
    var tw = ctx.measureText(label).width + 160/S.sc;
    var th = 220/S.sc;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.roundRect(px - tw/2, py - th/2, tw, th, th/2);
    ctx.fill();
    // Draw text
    ctx.fillStyle = '#1e1e24';
    ctx.fillText(label, px, py);
    // Draw dimension line
    ctx.strokeStyle = '#F5C518';
    ctx.lineWidth = 1.5 / S.sc;
    ctx.setLineDash([8/S.sc, 4/S.sc]);
    ctx.beginPath();
    ctx.moveTo(w.x1, w.y1);
    ctx.lineTo(w.x2, w.y2);
    ctx.stroke();
    ctx.setLineDash([]);
  });
  ctx.restore();
}
```

Note: `ctx.roundRect` is available in modern Chrome/Electron. If it fails, use a regular rect.

**Step 4: Verify**

Draw walls. Click Dims button — each wall should show its length in a white pill label. Click Dims again — labels disappear.

**Step 5: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: dimensions toggle shows wall lengths on floor plan"
```

---

### Task 9: Architectural Drawing Style Toggle

**Files:**
- Modify: `app/mck-sketch.html` — floor plan toolbar, fpRender CSS/drawing style

**Context:** Add a toggle between "Standard" (current dark theme) and "Architectural" (clean black lines on white/cream background, professional drawing style) for the floor plan view. When Architectural mode is active, the canvas background becomes white/cream, walls render as solid black with white fill, and the overall look matches a technical drawing.

**Step 1: Add style toggle button to floor plan toolbar**

```html
<button class="fp-tool-btn" id="fp-btn-archmode" onclick="fpToggleArchMode()" title="Architectural drawing style">Arch</button>
```

**Step 2: Add fpState.archMode and toggle function**

Add `archMode: false` to fpState initialization.

Add toggle function:
```javascript
function fpToggleArchMode() {
  if (!fpState) return;
  fpState.archMode = !fpState.archMode;
  var btn = document.getElementById('fp-btn-archmode');
  if (btn) btn.classList.toggle('active', fpState.archMode);
  var fpCvsEl = document.getElementById('fp-main-2d');
  if (fpCvsEl) fpCvsEl.classList.toggle('arch-mode', fpState.archMode);
  fpRender();
}
window.fpToggleArchMode = fpToggleArchMode;
```

**Step 3: Add arch-mode CSS**

In the `<style>` block, add:
```css
#fp-main-2d.arch-mode {
  background: #f8f4ec; /* cream/architectural paper colour */
}
```

**Step 4: Update fpRender to use architectural colours when enabled**

In `fpRender()`, find where the canvas background is cleared and where walls are drawn. Add conditional styling:

```javascript
// Background
if (fpState.archMode) {
  ctx.fillStyle = '#f8f4ec';
} else {
  ctx.fillStyle = '#1e1e24'; // or transparent
}
ctx.fillRect(/* canvas bounds */);

// Wall drawing — find where wall fill and stroke are set
// Change to use archMode colours:
var wallFill = fpState.archMode ? '#ffffff' : '#2a2a34';
var wallStroke = fpState.archMode ? '#111111' : '#e0e0e0';
var wallLineWidth = fpState.archMode ? 2 / S.sc : 1.5 / S.sc;
```

Read the existing wall drawing code carefully to find exactly where fill/stroke colours are set, and add the conditional.

**Step 5: Verify**

Draw walls. Click Arch — background goes cream, walls go black on white. Click again — back to dark theme.

**Step 6: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: architectural drawing style toggle for floor plan"
```

---

### Task 10: Calculator Tool

**Files:**
- Modify: `app/mck-sketch.html` — add floating calculator HTML, CSS, and JS

**Context:** A small floating calculator that can be opened while drawing. It sits in the corner of the screen (draggable), has number buttons 0–9, basic operations (+, −, ×, ÷), equals, clear, and a display. Accessible from the Tools menu or a keyboard shortcut (C key when not drawing).

**Step 1: Add calculator HTML**

Just before the closing `</body>` tag, add:

```html
<div id="calc-widget" style="display:none">
  <div id="calc-header">
    <span>Calculator</span>
    <button onclick="document.getElementById('calc-widget').style.display='none'">&#x2715;</button>
  </div>
  <div id="calc-display"><span id="calc-expr"></span><span id="calc-result">0</span></div>
  <div id="calc-keys">
    <button onclick="calcKey('C')" class="calc-clear">C</button>
    <button onclick="calcKey('back')" class="calc-op">&#x232B;</button>
    <button onclick="calcKey('%')" class="calc-op">%</button>
    <button onclick="calcKey('/')" class="calc-op">÷</button>
    <button onclick="calcKey('7')">7</button>
    <button onclick="calcKey('8')">8</button>
    <button onclick="calcKey('9')">9</button>
    <button onclick="calcKey('*')" class="calc-op">×</button>
    <button onclick="calcKey('4')">4</button>
    <button onclick="calcKey('5')">5</button>
    <button onclick="calcKey('6')">6</button>
    <button onclick="calcKey('-')" class="calc-op">−</button>
    <button onclick="calcKey('1')">1</button>
    <button onclick="calcKey('2')">2</button>
    <button onclick="calcKey('3')">3</button>
    <button onclick="calcKey('+')" class="calc-op">+</button>
    <button onclick="calcKey('0')" class="calc-zero">0</button>
    <button onclick="calcKey('.')">.</button>
    <button onclick="calcKey('=')" class="calc-eq">=</button>
  </div>
</div>
```

**Step 2: Add calculator CSS**

In the `<style>` block:
```css
#calc-widget {
  position: fixed;
  bottom: 80px;
  right: 20px;
  width: 220px;
  background: #2a2a34;
  border: 1px solid #444;
  border-radius: 10px;
  z-index: 9000;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  user-select: none;
}
#calc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #1e1e24;
  border-radius: 10px 10px 0 0;
  font-size: 12px;
  color: #888;
  cursor: move;
}
#calc-header button {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 14px;
}
#calc-display {
  padding: 10px 12px;
  text-align: right;
  background: #1a1a22;
}
#calc-expr { font-size: 11px; color: #666; display: block; min-height: 14px; }
#calc-result { font-size: 24px; color: #e0e0e0; display: block; }
#calc-keys {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: #333;
  border-radius: 0 0 10px 10px;
  overflow: hidden;
}
#calc-keys button {
  padding: 14px 0;
  border: none;
  background: #2a2a34;
  color: #e0e0e0;
  font-size: 15px;
  cursor: pointer;
  transition: background 0.1s;
}
#calc-keys button:hover { background: #363646; }
#calc-keys .calc-op { color: #F5C518; }
#calc-keys .calc-eq { background: #F5C518; color: #111; font-weight: 700; }
#calc-keys .calc-eq:hover { background: #ffd740; }
#calc-keys .calc-clear { color: #e06868; }
#calc-keys .calc-zero { grid-column: span 2; }
```

**Step 3: Add calculator JS**

Add the JS logic near other utility functions:

```javascript
var calcExpr = '';
var calcLastResult = '0';

function calcKey(k) {
  if (k === 'C') { calcExpr = ''; calcLastResult = '0'; }
  else if (k === 'back') { calcExpr = calcExpr.slice(0, -1); }
  else if (k === '=') {
    try {
      var result = Function('"use strict"; return (' + calcExpr.replace(/%/g, '/100') + ')')();
      calcLastResult = parseFloat(result.toFixed(6)).toString();
      calcExpr = calcLastResult;
    } catch(e) { calcLastResult = 'Error'; }
  } else {
    calcExpr += k;
    try {
      var r = Function('"use strict"; return (' + calcExpr.replace(/%/g, '/100') + ')')();
      if (isFinite(r)) calcLastResult = parseFloat(r.toFixed(6)).toString();
    } catch(e) {}
  }
  document.getElementById('calc-expr').textContent = calcExpr;
  document.getElementById('calc-result').textContent = calcLastResult;
}

function toggleCalculator() {
  var w = document.getElementById('calc-widget');
  if (w) w.style.display = w.style.display === 'none' ? 'block' : 'none';
}
window.toggleCalculator = toggleCalculator;
window.calcKey = calcKey;
```

**Step 4: Add dragging to calculator header**

Add after the calcKey function:
```javascript
(function() {
  var header = document.getElementById('calc-header');
  var widget = document.getElementById('calc-widget');
  if (!header || !widget) return;
  var dragging = false, ox = 0, oy = 0;
  header.addEventListener('mousedown', function(e) {
    dragging = true;
    ox = e.clientX - widget.offsetLeft;
    oy = e.clientY - widget.offsetTop;
  });
  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    widget.style.left = (e.clientX - ox) + 'px';
    widget.style.top = (e.clientY - oy) + 'px';
    widget.style.bottom = 'auto';
    widget.style.right = 'auto';
  });
  document.addEventListener('mouseup', function() { dragging = false; });
})();
```

Note: This IIFE runs at page load. It needs to run after the DOM is ready. Wrap in a `DOMContentLoaded` or place it at end of file before `</script>`.

**Step 5: Add calculator to Tools menu**

Find the Tools menu in the menu bar (search for `<div class="menu-opt"` near "Tools"). Add:
```html
<div class="menu-opt" onclick="toggleCalculator()">Calculator</div>
```

**Step 6: Verify**

Open Tools menu → click Calculator. A small calculator appears in the bottom right. Test: 123 + 456 = should show 579. Drag it by the header — it should move. Click × to close.

**Step 7: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: floating calculator tool accessible from Tools menu"
```

---

### Task 11: Roof Drawing Tool (Gable + Hip, 2D)

**Files:**
- Modify: `app/mck-sketch.html` — floor plan toolbar, fpState, fpRender, event handlers

**Context:** Add a roof drawing tool to the floor plan. User draws a rectangular footprint by clicking two corners, then chooses Gable or Hip style from a panel. The roof is stored in `fpState.roofs` and rendered on the floor plan as a 2D plan view (outline with ridge lines).

**Gable roof plan view:** Rectangle outline + a single ridge line down the centre (parallel to longest dimension).

**Hip roof plan view:** Rectangle outline + ridge line (shorter, centred) + four diagonal hip lines from ridge ends to corners.

**Step 1: Add roof tool button to toolbar**

In the fp-tools-bar, add:
```html
<button class="fp-tool-btn" id="fp-btn-roof" onclick="fpSetTool('roof')">Roof</button>
```

**Step 2: Add roof options panel HTML**

Near the fp-opening-opts panel (around line 19190), add:
```html
<div id="fp-roof-opts" style="display:none">
  <div class="fp-prop-row">
    <span class="fp-prop-label">Style</span>
    <div class="fp-btn-group">
      <button class="fp-preset-btn active" id="fp-roof-gable" onclick="fpSetRoofStyle('gable')">Gable</button>
      <button class="fp-preset-btn" id="fp-roof-hip" onclick="fpSetRoofStyle('hip')">Hip</button>
    </div>
  </div>
  <div class="fp-prop-row">
    <span class="fp-prop-label">Pitch</span>
    <input type="number" id="fp-roof-pitch" value="35" min="10" max="60" style="width:60px"> °
  </div>
</div>
```

**Step 3: Update fpSetTool to handle roof tool**

In `fpSetTool()`:
1. Add 'roof' to the forEach list of tool buttons
2. Show/hide `#fp-roof-opts` panel (similar to how `#fp-opening-opts` is shown for door/window)
3. Add status: `'Click and drag to draw a roof outline.'`

```javascript
var roofOpts = document.getElementById('fp-roof-opts');
if (roofOpts) roofOpts.style.display = (tool === 'roof') ? '' : 'none';
```

**Step 4: Add roof state to fpState**

In `fpNewState()` (search for this function), add:
```javascript
roofs: [],
roofStyle: 'gable',
roofDrawing: false,
roofStart: null,
roofEnd: null
```

Add helper function:
```javascript
function fpSetRoofStyle(style) {
  if (fpState) fpState.roofStyle = style;
  document.getElementById('fp-roof-gable').classList.toggle('active', style === 'gable');
  document.getElementById('fp-roof-hip').classList.toggle('active', style === 'hip');
}
window.fpSetRoofStyle = fpSetRoofStyle;
```

**Step 5: Handle roof drawing in mouse events**

In the floor plan mousedown handler, add:
```javascript
if (fpState.tool === 'roof') {
  fpState.roofDrawing = true;
  fpState.roofStart = fpCanvasToWorld(e);
  fpState.roofEnd = fpState.roofStart;
  return;
}
```

In the floor plan mousemove handler, add:
```javascript
if (fpState.tool === 'roof' && fpState.roofDrawing) {
  fpState.roofEnd = fpCanvasToWorld(e);
  fpRender();
  return;
}
```

In the floor plan mouseup handler, add:
```javascript
if (fpState.tool === 'roof' && fpState.roofDrawing) {
  fpState.roofDrawing = false;
  var s = fpState.roofStart, en = fpState.roofEnd;
  if (Math.abs(en.x - s.x) > 100 && Math.abs(en.y - s.y) > 100) {
    fpPushUndo();
    fpState.roofs.push({
      x1: Math.min(s.x, en.x),
      y1: Math.min(s.y, en.y),
      x2: Math.max(s.x, en.x),
      y2: Math.max(s.y, en.y),
      style: fpState.roofStyle,
      pitch: parseInt(document.getElementById('fp-roof-pitch').value) || 35
    });
  }
  fpState.roofStart = null;
  fpState.roofEnd = null;
  fpRender();
  return;
}
```

**Step 6: Draw roofs in fpRender**

In `fpRender()`, after walls are drawn, add roof rendering:

```javascript
// Draw roofs
(fpState.roofs || []).forEach(function(roof) {
  drawFpRoof(ctx, roof, false);
});
// Draw preview while dragging
if (fpState.roofDrawing && fpState.roofStart && fpState.roofEnd) {
  var s = fpState.roofStart, en = fpState.roofEnd;
  drawFpRoof(ctx, {
    x1: Math.min(s.x, en.x), y1: Math.min(s.y, en.y),
    x2: Math.max(s.x, en.x), y2: Math.max(s.y, en.y),
    style: fpState.roofStyle, pitch: 35
  }, true);
}
```

Add the `drawFpRoof` function:
```javascript
function drawFpRoof(ctx, roof, isPreview) {
  var archMode = fpState && fpState.archMode;
  var strokeColour = archMode ? '#111' : '#e0e0e0';
  var fillColour = archMode ? 'rgba(240,235,220,0.7)' : 'rgba(60,60,80,0.5)';
  var ridgeColour = archMode ? '#555' : '#aaa';
  var lw = (isPreview ? 1.5 : 2) / S.sc;

  var x1=roof.x1, y1=roof.y1, x2=roof.x2, y2=roof.y2;
  var w = x2-x1, h = y2-y1;

  // Outer boundary
  ctx.save();
  ctx.strokeStyle = isPreview ? 'rgba(245,197,24,0.8)' : strokeColour;
  ctx.fillStyle = fillColour;
  ctx.lineWidth = lw;
  if (isPreview) ctx.setLineDash([8/S.sc, 4/S.sc]);
  ctx.beginPath();
  ctx.rect(x1, y1, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);

  // Ridge and hip lines
  ctx.strokeStyle = ridgeColour;
  ctx.lineWidth = (isPreview ? 1 : 1.5) / S.sc;
  ctx.setLineDash([12/S.sc, 6/S.sc]);

  if (roof.style === 'gable') {
    // Ridge runs along centre of longest dimension
    if (w >= h) {
      // Horizontal ridge
      var my = (y1+y2)/2;
      ctx.beginPath(); ctx.moveTo(x1, my); ctx.lineTo(x2, my); ctx.stroke();
    } else {
      // Vertical ridge
      var mx = (x1+x2)/2;
      ctx.beginPath(); ctx.moveTo(mx, y1); ctx.lineTo(mx, y2); ctx.stroke();
    }
  } else if (roof.style === 'hip') {
    // Hip: ridge is centred, shorter than longest dimension
    var overhang = Math.min(w,h) / 2;
    if (w >= h) {
      var my2 = (y1+y2)/2;
      var rx1 = x1+overhang, rx2 = x2-overhang;
      ctx.beginPath(); ctx.moveTo(rx1, my2); ctx.lineTo(rx2, my2); ctx.stroke();
      // Hip lines to corners
      ctx.beginPath();
      ctx.moveTo(rx1, my2); ctx.lineTo(x1, y1);
      ctx.moveTo(rx1, my2); ctx.lineTo(x1, y2);
      ctx.moveTo(rx2, my2); ctx.lineTo(x2, y1);
      ctx.moveTo(rx2, my2); ctx.lineTo(x2, y2);
      ctx.stroke();
    } else {
      var mx2 = (x1+x2)/2;
      var ry1 = y1+overhang, ry2 = y2-overhang;
      ctx.beginPath(); ctx.moveTo(mx2, ry1); ctx.lineTo(mx2, ry2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx2, ry1); ctx.lineTo(x1, y1);
      ctx.moveTo(mx2, ry1); ctx.lineTo(x2, y1);
      ctx.moveTo(mx2, ry2); ctx.lineTo(x1, y2);
      ctx.moveTo(mx2, ry2); ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  ctx.restore();
}
window.drawFpRoof = drawFpRoof;
```

**Step 7: Allow eraser to delete roofs**

In the eraser click handler (Task 7), after checking walls and openings, add:
```javascript
// Delete roof
for (var ri = fpState.roofs.length - 1; ri >= 0; ri--) {
  var r = fpState.roofs[ri];
  if (pt.x >= r.x1 && pt.x <= r.x2 && pt.y >= r.y1 && pt.y <= r.y2) {
    fpPushUndo();
    fpState.roofs.splice(ri, 1);
    fpRender();
    fpSetStatus('Roof deleted.');
    break;
  }
}
```

**Step 8: Verify**

Select Roof tool. Draw a rectangle on the canvas — a gable roof outline with ridge line appears. Switch to Hip — draw another rectangle, four hip lines appear. Eraser should delete roofs. Arch mode should render roofs in architectural style.

**Step 9: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: 2D roof drawing tool with gable and hip styles"
```

---

## Execution Order

Recommended order (each task is independent except where noted):

1. Task 1 (radio) — 5 mins
2. Task 2 (thickness preset) — 5 mins
3. Task 3 (auto-switch after door/window) — 5 mins
4. Task 4 (cardinal snapping) — 20 mins
5. Task 5 (CAD overlay sync) — 30 mins
6. Task 6 (grid sync) — 15 mins
7. Task 7 (eraser) — 30 mins
8. Task 8 (dimensions) — 30 mins
9. Task 9 (arch mode) — 30 mins
10. Task 10 (calculator) — 30 mins
11. Task 11 (roof) — 60 mins

**Note:** Task 11 (roof) should implement Task 7's eraser extension as part of step 7.
