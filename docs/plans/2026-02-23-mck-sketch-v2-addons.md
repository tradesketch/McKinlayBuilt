# McK Sketch v2 Add-ons — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add all missing features required for a commercially launchable house design product — proper electrical symbols, remove Spotify, metric/imperial, material finishes, export formats, feedback system, auto-update, tutorials, and launch readiness.

**Architecture:** Single HTML file (`app/mck-sketch.html`, ~56,500 lines). Floor plan engine in the plain `<script>` block. Server on port 3141 (Express + better-sqlite3). Electron 33 main process in `main.js`. All new server routes go in `server/src/routes/`. CSS variables already defined in `:root` block at line ~19.

**Tech Stack:** Electron 33, Three.js 0.182, Express 4, better-sqlite3, electron-updater (to install), Resend API (email), Mailchimp API (newsletter), Sentry (error monitoring).

**Security:** All dynamic content uses `textContent` or safe DOM construction — never `innerHTML` with untrusted data. API keys stored in `server/.env`, never in the client HTML.

---

## APIs Required Before Starting

Before implementing Phase 5 (feedback) and Phase 9 (newsletter):

1. **Resend** — Sign up at resend.com, create API key, add to `server/.env` as `RESEND_API_KEY=re_...`  
2. **Mailchimp** — Sign up at mailchimp.com, get API key from Account → Extras → API Keys. Also note your audience/list ID. Add to `server/.env` as `MAILCHIMP_API_KEY=...` and `MAILCHIMP_LIST_ID=...`  
3. **Sentry** — Sign up at sentry.io, create an Electron project, copy the DSN. Add to `server/.env` as `SENTRY_DSN=https://...`  
4. **GitHub repo** — Auto-update publishes releases to GitHub. The repo must be public or use a GH token.

---

## Phase A — Fix Electrical Wiring Tool (Immediate Bug Fix)

The electrical tool targets `S.shapes` (old main canvas). The floor plan has its own canvas. Symbols use text letters instead of proper BS 7671 architectural symbols. Both need fixing.

---

### Task A.1: Integrate electrical tool into floor plan engine

**Files:**
- Modify: `app/mck-sketch.html` — floor plan JS section (~line 55336+)

**Context:**
The `elecPlacing` / `elecWiring` variables and the `click()` handler at line 23542 operate on `S.shapes` (the old canvas state). The floor plan needs its own electrical layer that stores in `fpStorey().electricals[]` and `fpStorey().wires[]`.

**Step 1: Add electricals arrays to storey data model**

In `fpNewState()`, update each storey object:

```javascript
{ id:0, label:'Ground', floorHeight:0, ceilingHeight:2400,
  walls:[], openings:[], items:[],
  electricals:[],  // { id, symbolId, x, y, rotation }
  wires:[]         // { id, x1, y1, x2, y2 }
}
```

Do this for all storeys in the array.

**Step 2: Add electrical tool button to left nav**

After the measure tool button, add:

```html
<div class="nav-sep"></div>
<button class="nav-btn fp-tool-btn" id="tool-electrical" onclick="fpSetTool('electrical')" title="Electrical Symbols">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 7v5l3 3"/>
  </svg>
</button>
<button class="nav-btn fp-tool-btn" id="tool-wire" onclick="fpSetTool('wire')" title="Draw Wire">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
    <path d="M3 12h4l3-6 4 12 3-6h4" stroke-dasharray="3 2"/>
  </svg>
</button>
```

**Step 3: Add electrical symbol palette to Properties panel**

In `#panel-properties`, add a section that shows when tool is 'electrical':

```html
<div id="fp-elec-palette" class="fp-sidebar-section" style="display:none">
  <div class="fp-sidebar-label">Electrical Symbols</div>
  <div id="fp-elec-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:4px;"></div>
</div>
```

Populate it with JS (safe DOM construction):

```javascript
var FP_ELEC_SYMBOLS = [
  { id:'socket-single',  name:'Single Socket',    bsRef:'BS 1363' },
  { id:'socket-double',  name:'Double Socket',    bsRef:'BS 1363' },
  { id:'switch-1way',    name:'1-Way Switch',     bsRef:'BS 3676' },
  { id:'switch-2way',    name:'2-Way Switch',     bsRef:'BS 3676' },
  { id:'switch-dimmer',  name:'Dimmer Switch',    bsRef:'BS 3676' },
  { id:'ceiling-rose',   name:'Ceiling Rose',     bsRef:'BS 67'   },
  { id:'downlight',      name:'Downlight',        bsRef:'BS 67'   },
  { id:'wall-light',     name:'Wall Light',       bsRef:'BS 67'   },
  { id:'consumer-unit',  name:'Consumer Unit',    bsRef:'BS 7671' },
  { id:'smoke-detector', name:'Smoke Detector',   bsRef:'BS 5839' },
  { id:'co-detector',    name:'CO Detector',      bsRef:'BS 50291'},
  { id:'extractor-fan',  name:'Extractor Fan',    bsRef:''        },
  { id:'fused-spur',     name:'Fused Spur',       bsRef:'BS 1363' },
  { id:'data-point',     name:'Data/Ethernet',    bsRef:''        },
  { id:'tv-point',       name:'TV Point',         bsRef:''        },
  { id:'doorbell',       name:'Doorbell',         bsRef:''        },
];
var fpActiveElecSymbol = null;

function fpBuildElecPalette() {
  var grid = document.getElementById('fp-elec-grid');
  if (!grid) return;
  while (grid.firstChild) grid.removeChild(grid.firstChild);
  FP_ELEC_SYMBOLS.forEach(function(sym) {
    var btn = document.createElement('button');
    btn.className = 'fp-elec-sym-btn';
    btn.title = sym.name + (sym.bsRef ? ' (' + sym.bsRef + ')' : '');
    // Draw symbol icon as small SVG canvas
    var canvas = document.createElement('canvas');
    canvas.width = 36; canvas.height = 36;
    fpDrawElecIcon(canvas.getContext('2d'), sym.id, 18, 18, 14);
    btn.appendChild(canvas);
    var label = document.createElement('div');
    label.textContent = sym.name;
    label.style.cssText = 'font-size:9px;margin-top:2px;color:var(--text-secondary);text-align:center;line-height:1.2';
    btn.appendChild(label);
    btn.onclick = function() {
      fpActiveElecSymbol = sym.id;
      document.querySelectorAll('.fp-elec-sym-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      fpSetTool('electrical');
      fpSetStatus('Click floor plan to place: ' + sym.name);
    };
    grid.appendChild(btn);
  });
}
window.fpBuildElecPalette = fpBuildElecPalette;
```

CSS for electrical palette:
```css
.fp-elec-sym-btn {
  padding: 4px; border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--bg-surface); cursor: pointer; display: flex;
  flex-direction: column; align-items: center; transition: border-color 0.15s;
}
.fp-elec-sym-btn:hover, .fp-elec-sym-btn.active { border-color: var(--accent); }
```

**Step 4: Show/hide electrical palette when tool changes**

In `fpSetTool()`, add:

```javascript
var elecPalette = document.getElementById('fp-elec-palette');
if (elecPalette) elecPalette.style.display = (tool === 'electrical' || tool === 'wire') ? '' : 'none';
if (tool === 'electrical' || tool === 'wire') fpBuildElecPalette();
```

**Step 5: Handle electrical placement in `fpMouseDown()`**

Add before the wall tool block:

```javascript
if (fpState.tool === 'electrical' && fpActiveElecSymbol) {
  fpPushUndo();
  fpStorey().electricals.push({
    id: Date.now(), symbolId: fpActiveElecSymbol,
    x: sn.x, y: sn.y, rotation: 0
  });
  fpSetStatus('Placed ' + fpActiveElecSymbol + '. Click to place another.');
  fpRequestRedraw(); return;
}
if (fpState.tool === 'wire') {
  if (!fpState.drawing) {
    fpState.drawing = true;
    fpState.startX = sn.x; fpState.startY = sn.y;
    fpSetStatus('Click end point for wire. Esc to cancel.');
  } else {
    fpPushUndo();
    fpStorey().wires.push({
      id: Date.now(),
      x1: fpState.startX, y1: fpState.startY,
      x2: sn.x, y2: sn.y
    });
    // Chain: start next wire from endpoint
    fpState.startX = sn.x; fpState.startY = sn.y;
    fpSetStatus('Wire placed. Click next point. Esc to stop.');
    fpRequestRedraw();
  }
  return;
}
```

**Step 6: Render electricals and wires in `fpRedraw()`**

After drawing wall segments, add:

```javascript
// Draw wires (dashed orange)
ctx.save();
ctx.strokeStyle = '#e67e22';
ctx.lineWidth = 1.5;
ctx.setLineDash([6, 4]);
fpStorey().wires.forEach(function(wire) {
  var a = fpW2S(wire.x1, wire.y1), b = fpW2S(wire.x2, wire.y2);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
});
ctx.setLineDash([]);
ctx.restore();

// Draw electrical symbols
fpStorey().electricals.forEach(function(el) {
  var sc = fpW2S(el.x, el.y);
  var r = Math.max(7, 12 * fpState.scale / 0.15);
  ctx.save(); ctx.translate(sc.x, sc.y);
  fpDrawElecIcon(ctx, el.symbolId, 0, 0, r);
  ctx.restore();
});
```

**Step 7: Commit**
```bash
git add app/mck-sketch.html
git commit -m "feat: integrate electrical tool into floor plan engine with proper data model"
```

---

### Task A.2: Replace text symbols with proper BS 7671 SVG icons

**Files:**
- Modify: `app/mck-sketch.html` — add `fpDrawElecIcon()` function

**Context:**
British Standard (BS 7671) defines standard symbols for electrical drawings used in planning applications. Each symbol is drawn programmatically on a canvas context — no external images needed.

**Step 1: Write test**

```javascript
// tests/test-elec-symbols.js
// Verify all symbols render without error
var canvas = { getContext: function() { return {
  beginPath:function(){}, arc:function(){}, stroke:function(){}, fill:function(){},
  moveTo:function(){}, lineTo:function(){}, rect:function(){}, fillText:function(){},
  save:function(){}, restore:function(){}, translate:function(){}, rotate:function(){},
  scale:function(){}, setLineDash:function(){},
  strokeStyle:'', fillStyle:'', lineWidth:1, font:'', textAlign:'', textBaseline:''
}; }};

var symbols = ['socket-single','socket-double','switch-1way','switch-2way','switch-dimmer',
  'ceiling-rose','downlight','wall-light','consumer-unit','smoke-detector',
  'co-detector','extractor-fan','fused-spur','data-point','tv-point','doorbell'];
var ctx = canvas.getContext('2d');
var errors = [];
symbols.forEach(function(id) {
  try { fpDrawElecIcon(ctx, id, 0, 0, 12); }
  catch(e) { errors.push(id + ': ' + e.message); }
});
console.assert(errors.length === 0, 'Symbol errors: ' + errors.join(', '));
console.log('PASS: all', symbols.length, 'electrical symbols render without error');
```

**Step 2: Implement `fpDrawElecIcon(ctx, symbolId, cx, cy, r)`**

This function draws proper architectural electrical symbols at any size:

```javascript
function fpDrawElecIcon(ctx, symbolId, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#c0392b';
  ctx.fillStyle = '#c0392b';
  ctx.lineWidth = Math.max(1, r / 10);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (symbolId) {
    case 'socket-single':
    case 'socket-double':
      // BS 7671: rectangle with two vertical lines (pins)
      ctx.strokeRect(-r*0.7, -r*0.5, r*1.4, r);
      ctx.beginPath();
      ctx.moveTo(-r*0.25, -r*0.15); ctx.lineTo(-r*0.25, r*0.15);
      ctx.moveTo( r*0.25, -r*0.15); ctx.lineTo( r*0.25, r*0.15);
      ctx.stroke();
      if (symbolId === 'socket-double') {
        // Double: add second socket outline above
        ctx.strokeRect(-r*0.7, -r*1.1, r*1.4, r*0.5);
      }
      break;

    case 'switch-1way':
      // BS 7671: circle with line and arc (break symbol)
      ctx.beginPath(); ctx.arc(0, 0, r*0.55, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r*0.55, 0); ctx.lineTo(r*0.55, -r*0.6);
      ctx.arc(r*0.55, -r*0.6, r*0.15, 0, Math.PI*2);
      ctx.stroke();
      break;

    case 'switch-2way':
      // Two-way: circle with two angled lines
      ctx.beginPath(); ctx.arc(0, 0, r*0.55, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r*0.55, 0);
      ctx.lineTo(r*0.9, -r*0.5);
      ctx.moveTo(r*0.55, 0);
      ctx.lineTo(r*0.9, r*0.5);
      ctx.stroke();
      break;

    case 'switch-dimmer':
      // Circle with arrow through it
      ctx.beginPath(); ctx.arc(0, 0, r*0.55, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r*0.8, r*0.8); ctx.lineTo(r*0.8, -r*0.8);
      ctx.moveTo(r*0.4, -r*0.8); ctx.lineTo(r*0.8, -r*0.8); ctx.lineTo(r*0.8, -r*0.4);
      ctx.stroke();
      break;

    case 'ceiling-rose':
      // BS 7671: circle with cross
      ctx.beginPath(); ctx.arc(0, 0, r*0.7, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r*0.7, 0); ctx.lineTo(r*0.7, 0);
      ctx.moveTo(0, -r*0.7); ctx.lineTo(0, r*0.7);
      ctx.stroke();
      break;

    case 'downlight':
      // Filled circle with inner circle
      ctx.beginPath(); ctx.arc(0, 0, r*0.7, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r*0.3, 0, Math.PI*2);
      ctx.fillStyle = '#c0392b'; ctx.fill();
      break;

    case 'wall-light':
      // Half circle flat side against wall
      ctx.beginPath();
      ctx.arc(0, 0, r*0.6, 0, Math.PI);
      ctx.lineTo(-r*0.6, 0); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r*0.6, 0); ctx.lineTo(r*0.6, 0); ctx.stroke();
      break;

    case 'consumer-unit':
      // Rectangle with lightning bolt
      ctx.strokeRect(-r*0.8, -r*0.6, r*1.6, r*1.2);
      ctx.beginPath();
      ctx.moveTo(r*0.1, -r*0.35); ctx.lineTo(-r*0.2, 0.05*r);
      ctx.lineTo(r*0.05, 0.05*r); ctx.lineTo(-r*0.1, r*0.35);
      ctx.stroke();
      break;

    case 'smoke-detector':
      // Circle with S and dashed ring
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.arc(0, 0, r*0.8, 0, Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(0, 0, r*0.45, 0, Math.PI*2); ctx.stroke();
      ctx.font = 'bold ' + Math.round(r*0.55) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('S', 0, 0);
      break;

    case 'co-detector':
      // Similar to smoke but with CO text
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.arc(0, 0, r*0.8, 0, Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(0, 0, r*0.45, 0, Math.PI*2); ctx.stroke();
      ctx.font = 'bold ' + Math.round(r*0.42) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('CO', 0, 0);
      break;

    case 'extractor-fan':
      // Circle with fan blade cross
      ctx.beginPath(); ctx.arc(0, 0, r*0.65, 0, Math.PI*2); ctx.stroke();
      for (var i = 0; i < 4; i++) {
        var a = (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(Math.cos(a)*r*0.3, Math.sin(a)*r*0.3, r*0.3, a + Math.PI, a + Math.PI*1.5);
        ctx.stroke();
      }
      break;

    case 'fused-spur':
      // Rectangle with F inside
      ctx.strokeRect(-r*0.6, -r*0.5, r*1.2, r);
      ctx.font = 'bold ' + Math.round(r*0.55) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('F', 0, 0);
      break;

    case 'data-point':
      // Rectangle with ethernet symbol (parallel lines)
      ctx.strokeRect(-r*0.7, -r*0.5, r*1.4, r);
      ctx.beginPath();
      ctx.moveTo(-r*0.35, -r*0.15); ctx.lineTo(-r*0.35, r*0.15);
      ctx.moveTo(0,       -r*0.25); ctx.lineTo(0,       r*0.25);
      ctx.moveTo( r*0.35, -r*0.15); ctx.lineTo( r*0.35, r*0.15);
      ctx.stroke();
      break;

    case 'tv-point':
      // Rectangle with TV aerial shape
      ctx.strokeRect(-r*0.6, -r*0.5, r*1.2, r);
      ctx.beginPath();
      ctx.moveTo(0, -r*0.5);
      ctx.lineTo(-r*0.3, -r*0.9); ctx.moveTo(0, -r*0.5); ctx.lineTo(r*0.3, -r*0.9);
      ctx.stroke();
      break;

    case 'doorbell':
      // Circle with bell outline
      ctx.beginPath(); ctx.arc(0, 0, r*0.65, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -r*0.1, r*0.3, Math.PI, 0);
      ctx.lineTo(r*0.3, r*0.25); ctx.lineTo(-r*0.3, r*0.25); ctx.closePath();
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, r*0.38, r*0.07, 0, Math.PI*2); ctx.fill();
      break;

    default:
      // Unknown: question mark in circle
      ctx.beginPath(); ctx.arc(0, 0, r*0.65, 0, Math.PI*2); ctx.stroke();
      ctx.font = 'bold ' + Math.round(r*0.7) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', 0, 0);
  }
  ctx.restore();
}
window.fpDrawElecIcon = fpDrawElecIcon;
```

**Step 3: Run test**

Copy `fpDrawElecIcon` to test file header, then:
```bash
node tests/test-elec-symbols.js
```
Expected: `PASS: all 16 electrical symbols render without error`

**Step 4: Verify visually**
- Open app, select electrical tool
- Symbol palette shows proper icons (not letters)
- Click floor plan → symbol appears with correct BS shape
- Draw wire → dashed orange line between two points
- Symbols appear on exported PDF

**Step 5: Commit**
```bash
git add app/mck-sketch.html tests/test-elec-symbols.js
git commit -m "feat: proper BS7671 architectural electrical symbols, integrated into floor plan"
```

---

## Phase B — Remove Spotify / Radio

**Files:**
- Modify: `app/mck-sketch.html` — delete ~179 Spotify references

**Context:**
Spotify spans lines ~45218–45562 and ~47091–47097, plus references scattered through the UI. Removing it saves ~400 lines and removes the failed OAuth flow.

**Step 1: Identify all Spotify UI entry points**

Search for buttons/links that open the Spotify panel. Search for `spotifyConnect`, `toggleSpotifyPlayer`, or `spotify` in onclick attributes in the HTML section.

**Step 2: Delete Spotify HTML panel**

Find the Spotify player HTML (search for `spotify-player` or `spotify-panel`) and delete the entire div.

**Step 3: Delete Spotify JS functions**

Delete lines 45218–45562 (all Spotify JS functions: `spotifyState`, `demoTracks`, `toggleSpotifyPlayer`, `spotifyConnect`, `initSpotifyWebPlayer`, etc.).

Delete line 47091–47097 (`spotifyDisconnect`).

**Step 4: Remove Spotify from settings panel**

Find and remove any Spotify settings inputs (search for `spotify` in the settings/config panel HTML).

**Step 5: Remove Spotify server routes**

In `server/src/routes/`, check for any Spotify OAuth routes. If found, delete them and remove the `require()` from `server/src/index.js`.

**Step 6: Verify**
```bash
npx electron /Users/taylor/McKinlayBuilt
```
Expected: No Spotify UI visible. No JS errors about missing Spotify functions.

**Step 7: Commit**
```bash
git add app/mck-sketch.html server/src/
git commit -m "feat: remove Spotify/radio integration"
```

---

## Phase C — Metric / Imperial Units Toggle

**Files:**
- Modify: `app/mck-sketch.html` — add unit system JS, update all display functions

**Context:**
All internal values stay in millimetres. The unit system only affects display labels and input parsing. `fpParseLength()` already handles 'm' suffix — extend to handle feet/inches.

**Step 1: Write unit conversion tests**

```javascript
// tests/test-units.js
function fpToDisplay(mm, system) {
  if (system === 'imperial') {
    var totalInches = mm / 25.4;
    var feet = Math.floor(totalInches / 12);
    var inches = (totalInches % 12).toFixed(1);
    return feet + "'-" + inches + '"';
  }
  if (mm >= 1000) return (mm / 1000).toFixed(2).replace(/\.?0+$/, '') + 'm';
  return Math.round(mm) + 'mm';
}

function fpFromInput(str, system) {
  str = str.trim();
  if (system === 'imperial') {
    // Handle: 10'6", 10'-6", 10.5', 6"
    var feetMatch = str.match(/^(\d+)'[-\s]?(\d+(?:\.\d+)?)"?$/);
    if (feetMatch) return (parseInt(feetMatch[1]) * 12 + parseFloat(feetMatch[2])) * 25.4;
    var feetOnly = str.match(/^(\d+(?:\.\d+)?)'$/);
    if (feetOnly) return parseFloat(feetOnly[1]) * 304.8;
    var inchOnly = str.match(/^(\d+(?:\.\d+)?)"$/);
    if (inchOnly) return parseFloat(inchOnly[1]) * 25.4;
  }
  if (str.toLowerCase().endsWith('m') && !str.toLowerCase().endsWith('mm')) {
    return parseFloat(str) * 1000;
  }
  return parseFloat(str) || 0;
}

// Tests
console.assert(fpToDisplay(3000, 'metric') === '3m', 'metric 3000mm = 3m');
console.assert(fpToDisplay(300, 'metric') === '300mm', 'metric 300mm = 300mm');
console.assert(Math.abs(fpFromInput("10'-6\"", 'imperial') - 3200.4) < 1, 'imperial 10\'-6" ≈ 3200mm');
console.assert(Math.abs(fpFromInput("6\"", 'imperial') - 152.4) < 0.1, 'imperial 6" ≈ 152mm');
console.assert(Math.abs(fpFromInput("10'", 'imperial') - 3048) < 0.1, 'imperial 10\' = 3048mm');
console.log('PASS: unit conversions');
```

**Step 2: Run test**
```bash
node tests/test-units.js
```
Expected: `PASS: unit conversions`

**Step 3: Add unit system state and toggle**

```javascript
var fpUnitSystem = localStorage.getItem('fp-units') || 'metric'; // 'metric' | 'imperial'

function fpSetUnits(system) {
  fpUnitSystem = system;
  localStorage.setItem('fp-units', system);
  // Update toggle button UI
  document.querySelectorAll('.unit-toggle-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.units === system);
  });
  fpRedraw();
  fpSetStatus('Units: ' + (system === 'metric' ? 'Metric (mm/m)' : 'Imperial (ft/in)'));
}
window.fpSetUnits = fpSetUnits;
```

**Step 4: Add unit toggle to header**

```html
<div style="display:flex;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin:0 8px;">
  <button class="unit-toggle-btn active" data-units="metric" onclick="fpSetUnits('metric')"
    style="padding:4px 10px;border:none;background:transparent;cursor:pointer;font-size:11px;color:var(--text-secondary)">
    mm
  </button>
  <button class="unit-toggle-btn" data-units="imperial" onclick="fpSetUnits('imperial')"
    style="padding:4px 10px;border:none;background:transparent;cursor:pointer;font-size:11px;color:var(--text-secondary)">
    ft
  </button>
</div>
```

**Step 5: Update `fpParseLength()` to use unit system**

```javascript
function fpParseLength(str) {
  if (!str) return 0;
  return fpFromInput(str.trim(), fpUnitSystem);
}
```

**Step 6: Update canvas dimension labels to use `fpToDisplay()`**

In `fpRedraw()`, wherever wall lengths are shown (e.g. the mid-wall label):

```javascript
// Before: ctx.fillText(currentLen + ' mm', ...)
// After:
ctx.fillText(fpToDisplay(currentLen, fpUnitSystem), ...);
```

Update the status bar messages similarly.

**Step 7: Commit**
```bash
git add app/mck-sketch.html tests/test-units.js
git commit -m "feat: metric/imperial toggle with proper ft/in parsing and display"
```

---

## Phase D — Wall Material Finishes

### Task D.1: External wall materials

**Files:**
- Modify: `app/mck-sketch.html` — wall data model, Properties panel, 3D material system

**Context:**
Each wall needs an `externalFinish` property. External materials: Roughcast, Smooth Render, Timber Cladding (horizontal/vertical), PVC Cladding, Stone, Brick, Block. The 3D renderer applies these as MeshStandardMaterial colour/roughness/texture configs.

**Step 1: Add material property to wall model**

When a wall is created in `fpMouseDown()`:

```javascript
fpState.walls.push({
  x1: fpState.startX, y1: fpState.startY, x2: endPt.x, y2: endPt.y,
  thickness: fpState.wallThickness, height: fpState.wallHeight,
  externalFinish: fpState.defaultExternalFinish || 'roughcast',
  internalFinish: fpState.defaultInternalFinish || 'plaster',
  paintColour: fpState.defaultPaintColour || '#F5F0EB',
});
```

**Step 2: Add external finish selector to Properties panel**

```html
<div class="fp-sidebar-section" id="fp-wall-finishes">
  <div class="fp-sidebar-label">External Finish</div>
  <select id="fp-ext-finish" onchange="fpSetDefaultExtFinish(this.value)">
    <option value="roughcast">Roughcast / Pebbledash</option>
    <option value="smooth-render">Smooth Render</option>
    <option value="timber-h">Timber Cladding (Horizontal)</option>
    <option value="timber-v">Timber Cladding (Vertical)</option>
    <option value="pvc-cladding">PVC Cladding</option>
    <option value="stone">Natural Stone</option>
    <option value="brick">Facing Brick</option>
    <option value="block-painted">Painted Block</option>
    <option value="metal-cladding">Metal Cladding</option>
  </select>
  <div class="fp-sidebar-label" style="margin-top:8px">Internal Finish</div>
  <select id="fp-int-finish" onchange="fpSetDefaultIntFinish(this.value)">
    <option value="plaster">Plaster (smooth)</option>
    <option value="plaster-textured">Plaster (textured)</option>
    <option value="timber-panel">Timber Panelling (solid wood)</option>
    <option value="mdf-panel">MDF Panelling (painted)</option>
    <option value="brick-internal">Exposed Brick</option>
    <option value="tile">Ceramic Tile</option>
    <option value="stone-internal">Stone</option>
  </select>
  <div class="fp-sidebar-label" style="margin-top:8px">Paint Colour</div>
  <div style="display:flex;gap:6px;align-items:center;">
    <input type="color" id="fp-paint-colour" value="#F5F0EB"
      onchange="fpSetDefaultPaintColour(this.value)"
      style="width:36px;height:28px;border:none;border-radius:4px;cursor:pointer;padding:0;">
    <select id="fp-paint-preset" onchange="fpApplyPaintPreset(this.value)"
      style="flex:1;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:4px;padding:4px;font-size:11px">
      <option value="">— Farrow & Ball presets —</option>
      <option value="#F5F0EB">Wimborne White</option>
      <option value="#E8E0D5">String</option>
      <option value="#D5C9B8">Elephant's Breath</option>
      <option value="#C5B9A8">Skimming Stone</option>
      <option value="#B8C4C2">Mizzle</option>
      <option value="#8FA39B">Mole's Breath</option>
      <option value="#4A5A5C">Hague Blue</option>
      <option value="#2C3E40">Inchyra Blue</option>
      <option value="#F0E8D5">Clunch</option>
      <option value="#E5DDD0">Parchment</option>
    </select>
  </div>
</div>
```

**Step 3: Add JS helpers**

```javascript
function fpSetDefaultExtFinish(val) {
  if (fpState) fpState.defaultExternalFinish = val;
  // Apply to selected wall if any
  if (fpState && fpState.selectedWall >= 0) {
    fpStorey().walls[fpState.selectedWall].externalFinish = val;
    fp3DGenerateAndShow();
  }
}
window.fpSetDefaultExtFinish = fpSetDefaultExtFinish;

function fpSetDefaultIntFinish(val) {
  if (fpState) fpState.defaultInternalFinish = val;
  if (fpState && fpState.selectedWall >= 0) {
    fpStorey().walls[fpState.selectedWall].internalFinish = val;
    fp3DGenerateAndShow();
  }
}
window.fpSetDefaultIntFinish = fpSetDefaultIntFinish;

function fpSetDefaultPaintColour(val) {
  if (fpState) fpState.defaultPaintColour = val;
  if (fpState && fpState.selectedWall >= 0) {
    fpStorey().walls[fpState.selectedWall].paintColour = val;
    fp3DGenerateAndShow();
  }
}
window.fpSetDefaultPaintColour = fpSetDefaultPaintColour;

function fpApplyPaintPreset(val) {
  if (!val) return;
  var picker = document.getElementById('fp-paint-colour');
  if (picker) picker.value = val;
  fpSetDefaultPaintColour(val);
}
window.fpApplyPaintPreset = fpApplyPaintPreset;
```

**Step 4: Apply materials in 3D generation**

Extend `fp3DGetMat()` to cover external finishes:

```javascript
var fp3DExtMatConfig = {
  'roughcast':      { color:0xd4cfc8, roughness:0.95, metalness:0.0 },
  'smooth-render':  { color:0xe8e4dc, roughness:0.75, metalness:0.0 },
  'timber-h':       { color:0xc8924a, roughness:0.7,  metalness:0.0 },
  'timber-v':       { color:0xb8824a, roughness:0.7,  metalness:0.0 },
  'pvc-cladding':   { color:0xf0f0f0, roughness:0.4,  metalness:0.05 },
  'stone':          { color:0x9a9080, roughness:0.9,  metalness:0.0 },
  'brick':          { color:0xb05030, roughness:0.85, metalness:0.0 },
  'block-painted':  { color:0xe0ddd8, roughness:0.8,  metalness:0.0 },
  'metal-cladding': { color:0x9090a0, roughness:0.3,  metalness:0.7 },
};
var fp3DIntMatConfig = {
  'plaster':          { color:0xf4f0ec, roughness:0.85, metalness:0.0 },
  'plaster-textured': { color:0xeeeae4, roughness:0.92, metalness:0.0 },
  'timber-panel':     { color:0xd4a060, roughness:0.65, metalness:0.0 },
  'mdf-panel':        { color:0xf0ece4, roughness:0.7,  metalness:0.0 },
  'brick-internal':   { color:0xb05030, roughness:0.88, metalness:0.0 },
  'tile':             { color:0xf0f0f0, roughness:0.15, metalness:0.0 },
  'stone-internal':   { color:0xa09080, roughness:0.88, metalness:0.0 },
};
```

When building 3D wall meshes, use `wall.externalFinish` for the outer face material and `wall.internalFinish` / `wall.paintColour` for inner faces.

**Step 5: Fascia and soffit materials**

Add to the Properties panel (shows when roof is active):

```html
<div id="fp-roof-finishes" class="fp-sidebar-section" style="display:none">
  <div class="fp-sidebar-label">Fascia / Soffit</div>
  <select id="fp-fascia-mat">
    <option value="pvc-white">PVC White</option>
    <option value="pvc-anthracite">PVC Anthracite Grey</option>
    <option value="timber-painted">Painted Timber</option>
    <option value="aluminium">Aluminium</option>
  </select>
</div>
```

**Step 6: Commit**
```bash
git add app/mck-sketch.html
git commit -m "feat: external/internal wall finish selector, paint colour picker with Farrow and Ball presets"
```

---

## Phase E — Additional Export Formats

**Files:**
- Modify: `app/mck-sketch.html` — add SVG, OBJ, STL export functions

**Context:**
DXF and PDF already exist. Add SVG (vector, open in Inkscape/Illustrator), OBJ (3D mesh for other software), STL (3D printing). DWG is a proprietary Autodesk format — include it as a note but don't implement (requires $$$$ SDK). SketchUp import is similarly proprietary — exclude.

**Step 1: Write SVG export test**

```javascript
// tests/test-svg-export.js
function fpExportSVGString(walls, scale) {
  var lines = ['<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">'];
  walls.forEach(function(w) {
    lines.push('<line x1="' + (w.x1*scale) + '" y1="' + (w.y1*scale) + '"' +
      ' x2="' + (w.x2*scale) + '" y2="' + (w.y2*scale) + '"' +
      ' stroke="#333" stroke-width="' + (w.thickness*scale) + '" stroke-linecap="square"/>');
  });
  lines.push('</svg>');
  return lines.join('\n');
}
var walls = [{x1:0,y1:0,x2:3000,y2:0,thickness:300}];
var svg = fpExportSVGString(walls, 0.1);
console.assert(svg.includes('<svg'), 'has SVG root');
console.assert(svg.includes('<line'), 'has wall lines');
console.assert(svg.includes('stroke-linecap="square"'), 'walls have square ends');
console.log('PASS: SVG export generates valid structure');
```

**Step 2: Implement `fpExportSVG()`**

```javascript
function fpExportSVG() {
  if (!fpState) return;
  var allWalls = [];
  fpState.storeys.forEach(function(s) { allWalls = allWalls.concat(s.walls); });
  var scale = 0.1; // 1mm → 0.1px (1:100 scale)
  var margin = 20;
  var lines = [];

  // SVG header
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">');
  lines.push('<title>' + ((fpState.projectName||'Floor Plan').replace(/[<>&"]/g, '')) + '</title>');

  // Walls layer
  lines.push('<g id="walls" stroke="#2c3e50" fill="none">');
  allWalls.forEach(function(w) {
    var lw = w.thickness * scale;
    lines.push('<line x1="' + (w.x1*scale+margin).toFixed(1) + '"' +
      ' y1="' + (w.y1*scale+margin).toFixed(1) + '"' +
      ' x2="' + (w.x2*scale+margin).toFixed(1) + '"' +
      ' y2="' + (w.y2*scale+margin).toFixed(1) + '"' +
      ' stroke-width="' + lw.toFixed(1) + '"' +
      ' stroke-linecap="square"/>');
  });
  lines.push('</g>');

  // Electrical symbols layer
  var storey = fpStorey();
  lines.push('<g id="electrical" stroke="#c0392b" fill="none" stroke-width="1">');
  (storey.electricals || []).forEach(function(el) {
    var cx = (el.x*scale+margin).toFixed(1);
    var cy = (el.y*scale+margin).toFixed(1);
    // Simple circle placeholder — full symbol paths in extended version
    lines.push('<circle cx="' + cx + '" cy="' + cy + '" r="6"/>');
  });
  lines.push('</g>');

  // Scale bar
  lines.push('<g id="scalebar"><line x1="' + margin + '" y1="880" x2="' + (margin+200) + '" y2="880" stroke="#333" stroke-width="2"/>');
  lines.push('<text x="' + margin + '" y="875" font-family="sans-serif" font-size="10" fill="#333">0</text>');
  lines.push('<text x="' + (margin+200) + '" y="875" font-family="sans-serif" font-size="10" fill="#333">2000mm</text></g>');
  lines.push('</svg>');

  var blob = new Blob([lines.join('\n')], {type:'image/svg+xml'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url;
  a.download = ((fpState.projectName||'floor-plan').replace(/\s+/g,'-')) + '.svg';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  fpSetStatus('SVG exported.');
}
window.fpExportSVG = fpExportSVG;
```

**Step 3: Implement OBJ export (3D geometry)**

```javascript
function fpExportOBJ() {
  if (!fpState || !fp3DScene) { fpSetStatus('Generate 3D view first.'); return; }
  var lines = ['# McK Sketch OBJ Export', '# ' + new Date().toISOString(), ''];
  var vOffset = 1;
  fp3DScene.traverse(function(obj) {
    if (!obj.isMesh || obj.name.startsWith('__')) return;
    var geo = obj.geometry;
    if (!geo || !geo.attributes.position) return;
    var pos = geo.attributes.position;
    lines.push('o obj_' + (obj.id));
    for (var i = 0; i < pos.count; i++) {
      lines.push('v ' + pos.getX(i).toFixed(4) + ' ' + pos.getY(i).toFixed(4) + ' ' + pos.getZ(i).toFixed(4));
    }
    if (geo.index) {
      for (var f = 0; f < geo.index.count; f += 3) {
        lines.push('f ' + (geo.index.getX(f)+vOffset) + ' ' + (geo.index.getX(f+1)+vOffset) + ' ' + (geo.index.getX(f+2)+vOffset));
      }
    } else {
      for (var f = 0; f < pos.count; f += 3) {
        lines.push('f ' + (f+vOffset) + ' ' + (f+1+vOffset) + ' ' + (f+2+vOffset));
      }
    }
    vOffset += pos.count;
    lines.push('');
  });
  var blob = new Blob([lines.join('\n')], {type:'text/plain'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url;
  a.download = ((fpState.projectName||'model').replace(/\s+/g,'-')) + '.obj';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  fpSetStatus('OBJ exported.');
}
window.fpExportOBJ = fpExportOBJ;
```

**Step 4: Add export buttons to the Export PDF button area**

Extend the export dropdown or add buttons:

```html
<div style="position:relative;display:inline-block;">
  <button onclick="document.getElementById('export-menu').style.display = document.getElementById('export-menu').style.display === 'none' ? '' : 'none'"
    style="padding:6px 12px;background:transparent;color:var(--text-secondary);
    border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:12px">
    Export ▾
  </button>
  <div id="export-menu" style="display:none;position:absolute;top:100%;right:0;
    background:var(--bg-panel);border:1px solid var(--border);border-radius:var(--radius);
    min-width:160px;z-index:100;box-shadow:var(--shadow);">
    <button onclick="fpExportPDF();document.getElementById('export-menu').style.display='none'"
      style="display:block;width:100%;padding:8px 12px;text-align:left;border:none;background:transparent;color:var(--text-primary);cursor:pointer;font-size:12px">
      PDF — Floor Plan
    </button>
    <button onclick="fpExportSVG();document.getElementById('export-menu').style.display='none'"
      style="display:block;width:100%;padding:8px 12px;text-align:left;border:none;background:transparent;color:var(--text-primary);cursor:pointer;font-size:12px">
      SVG — Vector Drawing
    </button>
    <button onclick="fpExportOBJ();document.getElementById('export-menu').style.display='none'"
      style="display:block;width:100%;padding:8px 12px;text-align:left;border:none;background:transparent;color:var(--text-primary);cursor:pointer;font-size:12px">
      OBJ — 3D Model
    </button>
    <div style="padding:6px 12px;font-size:10px;color:var(--text-muted);border-top:1px solid var(--border)">
      DWG export: coming soon (Pro)
    </div>
  </div>
</div>
```

**Step 5: Run SVG test**
```bash
node tests/test-svg-export.js
```

**Step 6: Commit**
```bash
git add app/mck-sketch.html tests/test-svg-export.js
git commit -m "feat: SVG vector and OBJ 3D export, export dropdown menu"
```

---

## Phase F — In-App Feedback System

**Files:**
- Modify: `app/mck-sketch.html` — feedback modal
- Modify: `server/src/routes/` — feedback route
- Modify: `server/.env` — add RESEND_API_KEY

**Prerequisite:** Sign up at resend.com, get API key, add to `server/.env`:
```
RESEND_API_KEY=re_your_key_here
FEEDBACK_EMAIL=taylor@mckinlaybuilt.com
```

**Step 1: Create `server/src/routes/feedback.js`**

```javascript
const express = require('express');
const router = express.Router();

module.exports = (db) => {
  router.post('/', async (req, res) => {
    const { type, message, email } = req.body;
    if (!message || message.trim().length < 10)
      return res.status(400).json({ error: 'Message too short' });

    // Sanitise inputs — these go into email body, not rendered as HTML
    const safeType = String(type || 'feedback').replace(/[^\w\s-]/g, '').substring(0, 50);
    const safeMsg = String(message).substring(0, 2000);
    const safeEmail = String(email || 'anonymous').substring(0, 200);

    // Log to DB regardless of email success
    db.prepare(
      'CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, message TEXT, user_email TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)'
    ).run();
    db.prepare('INSERT INTO feedback (type, message, user_email) VALUES (?,?,?)')
      .run(safeType, safeMsg, safeEmail);

    // Send email via Resend
    const apiKey = process.env.RESEND_API_KEY;
    const toEmail = process.env.FEEDBACK_EMAIL || 'taylor@mckinlaybuilt.com';
    if (apiKey) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'McK Sketch Feedback <feedback@mckinlaybuilt.com>',
            to: [toEmail],
            subject: '[McK Sketch] ' + safeType + ' — ' + new Date().toLocaleDateString('en-GB'),
            text: 'Type: ' + safeType + '\nFrom: ' + safeEmail + '\n\n' + safeMsg,
          })
        });
        if (!response.ok) console.error('Resend error:', await response.text());
      } catch (e) {
        console.error('Email send failed:', e.message);
      }
    }
    res.json({ ok: true });
  });
  return router;
};
```

**Step 2: Register route in `server/src/index.js`**

```javascript
const feedbackRouter = require('./routes/feedback')(db);
app.use('/api/feedback', feedbackRouter);
```

**Step 3: Add feedback modal to app**

```html
<div id="feedback-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);
  z-index:1000;display:none;align-items:center;justify-content:center;">
  <div style="background:var(--bg-panel);border-radius:10px;padding:24px;width:420px;
    border:1px solid var(--border);box-shadow:var(--shadow);">
    <h3 style="margin:0 0 16px;color:var(--text-primary);font-size:16px">Send Feedback</h3>
    <select id="feedback-type" style="width:100%;margin-bottom:10px;background:var(--bg-input);
      color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius);padding:8px">
      <option value="bug">Bug Report</option>
      <option value="feature">Feature Request</option>
      <option value="general">General Feedback</option>
    </select>
    <textarea id="feedback-msg" placeholder="Describe the issue or suggestion…"
      style="width:100%;height:120px;background:var(--bg-input);color:var(--text-primary);
      border:1px solid var(--border);border-radius:var(--radius);padding:8px;
      resize:vertical;font-family:inherit;font-size:13px;box-sizing:border-box;margin-bottom:10px"></textarea>
    <input type="email" id="feedback-email" placeholder="Your email (optional, for follow-up)"
      style="width:100%;background:var(--bg-input);color:var(--text-primary);
      border:1px solid var(--border);border-radius:var(--radius);padding:8px;
      margin-bottom:14px;box-sizing:border-box">
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button onclick="closeFeedback()"
        style="padding:8px 16px;background:transparent;color:var(--text-secondary);
        border:1px solid var(--border);border-radius:var(--radius);cursor:pointer">
        Cancel
      </button>
      <button onclick="submitFeedback()"
        style="padding:8px 16px;background:var(--accent);color:#fff;border:none;
        border-radius:var(--radius);cursor:pointer;font-weight:600">
        Send
      </button>
    </div>
    <div id="feedback-status" style="margin-top:8px;font-size:12px;color:var(--success);text-align:center"></div>
  </div>
</div>
```

**Step 4: Add feedback JS**

```javascript
function openFeedback() {
  var m = document.getElementById('feedback-modal');
  if (m) { m.style.display = 'flex'; document.getElementById('feedback-msg').focus(); }
}
window.openFeedback = openFeedback;

function closeFeedback() {
  var m = document.getElementById('feedback-modal');
  if (m) m.style.display = 'none';
}
window.closeFeedback = closeFeedback;

function submitFeedback() {
  var type = document.getElementById('feedback-type').value;
  var msg = document.getElementById('feedback-msg').value.trim();
  var email = document.getElementById('feedback-email').value.trim();
  var status = document.getElementById('feedback-status');
  if (!msg || msg.length < 10) { status.textContent = 'Please write at least 10 characters.'; return; }
  status.textContent = 'Sending…';
  fetch('http://localhost:3141/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: type, message: msg, email: email })
  })
  .then(function(r) { return r.json(); })
  .then(function() {
    status.textContent = 'Thank you! Your feedback has been sent.';
    document.getElementById('feedback-msg').value = '';
    setTimeout(closeFeedback, 2000);
  })
  .catch(function() { status.textContent = 'Could not send — please try again.'; });
}
window.submitFeedback = submitFeedback;
```

**Step 5: Add feedback button to header (right side)**

```html
<button onclick="openFeedback()"
  style="padding:6px 10px;background:transparent;color:var(--text-secondary);
  border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:12px"
  title="Send feedback or report a bug">
  Feedback
</button>
```

**Step 6: Commit**
```bash
git add app/mck-sketch.html server/src/routes/feedback.js server/src/index.js
git commit -m "feat: in-app feedback form sends to Taylor via Resend email API"
```

---

## Phase G — In-App Update Notifications

**Context:**
When you publish a new version, a POST to your server's `/api/announcements` API creates an announcement. The app polls every hour and shows a banner when there's a new announcement. Separate from auto-update (Phase K) — this is for patch notes, feature announcements, tips.

**Files:**
- Create: `server/src/routes/announcements.js`
- Modify: `server/src/index.js`, `app/mck-sketch.html`

**Step 1: Create announcements table and route**

```javascript
// server/src/routes/announcements.js
const express = require('express');
const router = express.Router();

module.exports = (db) => {
  db.prepare(`CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    version TEXT,
    published INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();

  // Public: get latest active announcement
  router.get('/latest', (req, res) => {
    const ann = db.prepare(
      'SELECT id, title, body, type, version, created_at FROM announcements WHERE published=1 ORDER BY id DESC LIMIT 1'
    ).get();
    res.json(ann || null);
  });

  // Admin only: create announcement
  const { authenticateToken } = require('../middleware/auth');
  router.post('/', authenticateToken, (req, res) => {
    if (req.user.userId !== 1) return res.status(403).json({ error: 'Admin only' });
    const { title, body, type, version } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'title and body required' });
    const r = db.prepare(
      'INSERT INTO announcements (title, body, type, version) VALUES (?,?,?,?)'
    ).run(title, body, type || 'info', version || null);
    res.json({ id: r.lastInsertRowid });
  });

  return router;
};
```

Register in `server/src/index.js`:
```javascript
const announcementsRouter = require('./routes/announcements')(db);
app.use('/api/announcements', announcementsRouter);
```

**Step 2: Add in-app notification banner to app HTML**

Above the `<header id="header">`:

```html
<div id="ann-banner" style="display:none;background:#1a3a5c;color:#a8d4f5;
  padding:8px 16px;font-size:12px;text-align:center;
  border-bottom:1px solid rgba(74,158,255,0.3);position:relative;">
  <span id="ann-text"></span>
  <button onclick="annDismiss()" style="position:absolute;right:10px;top:50%;
    transform:translateY(-50%);background:none;border:none;color:inherit;cursor:pointer;font-size:14px">×</button>
</div>
```

**Step 3: Add announcement polling JS**

```javascript
var annLastSeenId = parseInt(localStorage.getItem('ann-last-seen') || '0');

function annCheck() {
  fetch('http://localhost:3141/api/announcements/latest')
    .then(function(r) { return r.json(); })
    .then(function(ann) {
      if (!ann || ann.id <= annLastSeenId) return;
      var banner = document.getElementById('ann-banner');
      var text = document.getElementById('ann-text');
      if (!banner || !text) return;
      text.textContent = ann.title + ' — ' + ann.body; // textContent only — safe
      banner.style.display = '';
    })
    .catch(function() {}); // silently fail if server unavailable
}

function annDismiss() {
  var banner = document.getElementById('ann-banner');
  if (banner) banner.style.display = 'none';
  // Mark as seen
  fetch('http://localhost:3141/api/announcements/latest')
    .then(function(r) { return r.json(); })
    .then(function(ann) {
      if (ann) { annLastSeenId = ann.id; localStorage.setItem('ann-last-seen', ann.id); }
    }).catch(function() {});
}
window.annDismiss = annDismiss;

// Check on load and every hour
annCheck();
setInterval(annCheck, 60 * 60 * 1000);
```

**Step 4: Commit**
```bash
git add server/src/routes/announcements.js server/src/index.js app/mck-sketch.html
git commit -m "feat: in-app announcement banner polls server for update notifications"
```

---

## Phase H — In-App Tutorials

**Files:**
- Modify: `app/mck-sketch.html` — tutorial overlay system

**Context:**
A guided tour for new users. Highlights elements with a spotlight, shows tip cards. Triggered on first launch (localStorage flag) or from Help menu. 8 steps covering: draw wall → place door → place window → add furniture → switch to 3D → roof → measure → export.

**Step 1: Add tutorial overlay HTML**

```html
<div id="tutorial-overlay" style="display:none;position:fixed;inset:0;z-index:900;pointer-events:none;">
  <div id="tutorial-spotlight" style="position:absolute;border-radius:8px;
    box-shadow:0 0 0 9999px rgba(0,0,0,0.65);transition:all 0.3s ease;pointer-events:none;"></div>
  <div id="tutorial-card" style="position:absolute;background:var(--bg-panel);
    border:1px solid var(--border);border-radius:10px;padding:20px;width:300px;
    box-shadow:var(--shadow);pointer-events:all;z-index:901;">
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;" id="tutorial-step-label"></div>
    <h4 style="margin:0 0 8px;color:var(--text-primary);font-size:15px" id="tutorial-title"></h4>
    <p style="margin:0 0 16px;color:var(--text-secondary);font-size:13px;line-height:1.5" id="tutorial-body"></p>
    <div style="display:flex;gap:8px;justify-content:space-between;align-items:center;">
      <button onclick="tutorialSkip()"
        style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:12px;padding:0">
        Skip tutorial
      </button>
      <div style="display:flex;gap:8px;">
        <button id="tutorial-prev-btn" onclick="tutorialPrev()"
          style="padding:6px 14px;background:transparent;color:var(--text-secondary);
          border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:12px">
          Back
        </button>
        <button id="tutorial-next-btn" onclick="tutorialNext()"
          style="padding:6px 14px;background:var(--accent);color:#fff;border:none;
          border-radius:var(--radius);cursor:pointer;font-size:12px;font-weight:600">
          Next
        </button>
      </div>
    </div>
  </div>
</div>
```

**Step 2: Add tutorial JS**

```javascript
var TUTORIAL_STEPS = [
  { title: 'Welcome to McK Sketch!',
    body: 'McK Sketch lets you design houses from scratch — floor plans, 3D views, and planning drawings. This quick tour will show you the basics.',
    target: null, cardPos: 'center' },
  { title: 'Draw Your First Wall',
    body: 'Click the Wall tool in the left toolbar, then click on the canvas to set the start point. Click again to set the end point.',
    target: '#tool-wall', cardPos: 'right' },
  { title: 'Type an Exact Length',
    body: 'While drawing a wall, type a number (e.g. "4200" for 4.2m, or "4.2m") then press Enter to place it at exactly that length.',
    target: '#fp-2d-panel', cardPos: 'right' },
  { title: 'Add Doors and Windows',
    body: 'Select the Door or Window tool, then click on any wall to place an opening. Adjust size in the Properties panel on the right.',
    target: '#tool-door', cardPos: 'right' },
  { title: 'Switch Between Floors',
    body: 'Use the storey tabs at the top to switch between Ground Floor and First Floor. The floor below shows faintly as a guide.',
    target: '#storey-tabs', cardPos: 'below' },
  { title: 'Explore the 3D View',
    body: 'The bottom panel shows your design in 3D — drag to orbit, scroll to zoom. Changes in the 2D plan update the 3D view automatically.',
    target: '#fp-3d-panel', cardPos: 'above' },
  { title: 'Add Furniture from the Catalogue',
    body: 'Click the Catalogue tab on the right to browse furniture and fittings. Click any item to place it on the floor plan.',
    target: '#panel-tabs', cardPos: 'left' },
  { title: 'Export Your Drawing',
    body: 'When you\'re ready, use the Export button to save as PDF, SVG, or 3D OBJ. PDF exports include a title block for planning applications.',
    target: '#export-menu', cardPos: 'below' },
];

var tutorialStep = 0;

function tutorialStart() {
  tutorialStep = 0;
  document.getElementById('tutorial-overlay').style.display = '';
  tutorialShow();
}
window.tutorialStart = tutorialStart;

function tutorialSkip() {
  document.getElementById('tutorial-overlay').style.display = 'none';
  localStorage.setItem('tutorial-done', '1');
}
window.tutorialSkip = tutorialSkip;

function tutorialNext() {
  tutorialStep++;
  if (tutorialStep >= TUTORIAL_STEPS.length) { tutorialSkip(); return; }
  tutorialShow();
}
window.tutorialNext = tutorialNext;

function tutorialPrev() {
  if (tutorialStep > 0) { tutorialStep--; tutorialShow(); }
}
window.tutorialPrev = tutorialPrev;

function tutorialShow() {
  var step = TUTORIAL_STEPS[tutorialStep];
  var total = TUTORIAL_STEPS.length;
  document.getElementById('tutorial-step-label').textContent = 'Step ' + (tutorialStep+1) + ' of ' + total;
  document.getElementById('tutorial-title').textContent = step.title;
  document.getElementById('tutorial-body').textContent = step.body;
  document.getElementById('tutorial-prev-btn').style.display = tutorialStep === 0 ? 'none' : '';
  document.getElementById('tutorial-next-btn').textContent = tutorialStep === total-1 ? 'Finish' : 'Next';

  var spotlight = document.getElementById('tutorial-spotlight');
  var card = document.getElementById('tutorial-card');
  if (step.target) {
    var el = document.querySelector(step.target);
    if (el) {
      var r = el.getBoundingClientRect();
      spotlight.style.cssText = 'position:absolute;border-radius:8px;' +
        'box-shadow:0 0 0 9999px rgba(0,0,0,0.65);transition:all 0.3s ease;' +
        'left:' + (r.left-8) + 'px;top:' + (r.top-8) + 'px;' +
        'width:' + (r.width+16) + 'px;height:' + (r.height+16) + 'px;';
      // Position card based on cardPos
      var cp = step.cardPos;
      if (cp === 'right') { card.style.left = (r.right+16)+'px'; card.style.top = Math.max(16, r.top-20)+'px'; }
      else if (cp === 'left') { card.style.left = (r.left-316)+'px'; card.style.top = Math.max(16, r.top-20)+'px'; }
      else if (cp === 'below') { card.style.left = Math.max(16,r.left)+'px'; card.style.top = (r.bottom+16)+'px'; }
      else if (cp === 'above') { card.style.left = Math.max(16,r.left)+'px'; card.style.top = (r.top-180)+'px'; }
    }
  } else {
    // Centre card
    spotlight.style.cssText = 'display:none';
    card.style.left = 'calc(50% - 150px)'; card.style.top = 'calc(50% - 120px)';
  }
}

// Auto-start for new users
document.addEventListener('DOMContentLoaded', function() {
  if (!localStorage.getItem('tutorial-done')) {
    setTimeout(tutorialStart, 1500); // slight delay so app loads first
  }
});
```

**Step 3: Add Help menu button**

In the header:
```html
<button onclick="tutorialStart()" title="Start tutorial"
  style="padding:6px 10px;background:transparent;color:var(--text-secondary);
  border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:12px">
  ? Help
</button>
```

**Step 4: Commit**
```bash
git add app/mck-sketch.html
git commit -m "feat: in-app guided tutorial with spotlight steps for new users"
```

---

## Phase I — International Building Standards

**Files:**
- Modify: `app/mck-sketch.html` — compliance engine, regs panel

**Context:**
The compliance engine currently only checks Scottish BSD standards. Extend to support US (IRC), UK England/Wales (Building Regs), Canadian (NBC), and Australian (NCC) as selectable regions.

**Step 1: Write region test**

```javascript
// tests/test-intl-regs.js
var REGS = {
  scotland:  { minCeiling:2100, minSingleBed:6.5, minDoorWidth:775,  maxStairPitch:42, windowRatio:0.1 },
  england:   { minCeiling:2100, minSingleBed:6.51,minDoorWidth:750,  maxStairPitch:42, windowRatio:0.1 },
  usa:       { minCeiling:2134, minSingleBed:6.97, minDoorWidth:813,  maxStairPitch:40, windowRatio:0.08 },
  canada:    { minCeiling:2100, minSingleBed:6.5,  minDoorWidth:800,  maxStairPitch:40, windowRatio:0.1 },
  australia: { minCeiling:2400, minSingleBed:7.5,  minDoorWidth:820,  maxStairPitch:38, windowRatio:0.1 },
};
function checkCeiling(height, region) {
  return height >= REGS[region].minCeiling;
}
console.assert(!checkCeiling(2000, 'scotland'), 'scotland: 2000mm fails');
console.assert(!checkCeiling(2100, 'australia'), 'australia: 2100mm fails (needs 2400)');
console.assert(checkCeiling(2400, 'australia'), 'australia: 2400mm passes');
console.assert(!checkCeiling(2100, 'usa'), 'usa: 2100mm fails (needs 2134)');
console.log('PASS: international regs');
```

**Step 2: Add region selector to header**

```html
<select id="regs-region" onchange="fpSetRegsRegion(this.value)"
  style="background:var(--bg-input);color:var(--text-secondary);border:1px solid var(--border);
  border-radius:var(--radius);padding:4px 8px;font-size:11px;cursor:pointer">
  <option value="scotland">🏴 Scotland</option>
  <option value="england">🏴󠁧󠁢󠁥󠁮󠁧󠁿 England & Wales</option>
  <option value="usa">🇺🇸 USA (IRC)</option>
  <option value="canada">🇨🇦 Canada (NBC)</option>
  <option value="australia">🇦🇺 Australia (NCC)</option>
  <option value="europe">🇪🇺 Europe</option>
</select>
```

**Step 3: Add standards data object and update `fpCheckCompliance()`**

```javascript
var FP_REGS = {
  scotland:  { minCeiling:2100, minSingleBed:6.5e6, minDoorWidth:775, maxStairPitch:42, windowRatio:0.1,
    refs:{ ceiling:'BSD Section 3.10', door:'BSD Section 4.1', window:'BSD Section 3.14' } },
  england:   { minCeiling:2100, minSingleBed:6.51e6,minDoorWidth:750, maxStairPitch:42, windowRatio:0.1,
    refs:{ ceiling:'Approved Doc A', door:'Part M', window:'Approved Doc F' } },
  usa:       { minCeiling:2134, minSingleBed:6.97e6, minDoorWidth:813, maxStairPitch:40, windowRatio:0.08,
    refs:{ ceiling:'IRC R305.1', door:'IRC R311.2', window:'IRC R303.1' } },
  canada:    { minCeiling:2100, minSingleBed:6.5e6,  minDoorWidth:800, maxStairPitch:40, windowRatio:0.1,
    refs:{ ceiling:'NBC 9.5.4', door:'NBC 3.8', window:'NBC 9.7' } },
  australia: { minCeiling:2400, minSingleBed:7.5e6,  minDoorWidth:820, maxStairPitch:38, windowRatio:0.1,
    refs:{ ceiling:'NCC 3.8.2', door:'NCC 3.8.4', window:'NCC 3.8.1' } },
  europe:    { minCeiling:2100, minSingleBed:6.5e6,  minDoorWidth:775, maxStairPitch:42, windowRatio:0.1,
    refs:{ ceiling:'EN standard', door:'EN standard', window:'EN standard' } },
};

var fpRegsRegion = localStorage.getItem('fp-regs-region') || 'scotland';

function fpSetRegsRegion(region) {
  fpRegsRegion = region;
  localStorage.setItem('fp-regs-region', region);
  fpRedraw(); // re-run compliance checks
  fpSetStatus('Building regulations: ' + region);
}
window.fpSetRegsRegion = fpSetRegsRegion;
```

Update `fpCheckCompliance(storey)` to use `FP_REGS[fpRegsRegion]` instead of hardcoded values.

**Step 4: Commit**
```bash
git add app/mck-sketch.html tests/test-intl-regs.js
git commit -m "feat: international building standards (Scotland, England, USA, Canada, Australia)"
```

---

## Phase J — Launch Readiness

### Task J.1: Remove Spotify OAuth and clean up copyright

**Step 1: Audit third-party libraries**

Check `package.json` and any CDN scripts in the HTML head. For each:
- **Three.js** — MIT licence. ✅ No issues.
- **electron-reload** — MIT. ✅
- **electron-builder** — MIT. ✅
- **jsPDF** (CDN) — MIT. ✅ Keep CDN attribution comment.
- **Spotify Web Playback SDK** — Removed in Phase B. ✅

Run:
```bash
cat /Users/taylor/McKinlayBuilt/package.json
grep -n 'cdnjs\|unpkg\|jsdelivr\|spotify\|google\|font' /Users/taylor/McKinlayBuilt/app/mck-sketch.html | head -30
```

Verify no unlicensed fonts or assets remain.

**Step 2: Add About / Licences modal to app**

```html
<div id="about-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);
  z-index:1000;align-items:center;justify-content:center;">
  <div style="background:var(--bg-panel);border-radius:10px;padding:24px;width:480px;
    border:1px solid var(--border);max-height:80vh;overflow-y:auto;">
    <h3 style="margin:0 0 8px;color:var(--text-primary)">McK Sketch</h3>
    <p style="color:var(--text-secondary);font-size:13px;margin:0 0 16px">
      Professional house design software. Built in Scotland.
    </p>
    <div style="border-top:1px solid var(--border);padding-top:12px;font-size:12px;color:var(--text-muted)">
      <strong style="color:var(--text-secondary)">Open Source Licences</strong><br><br>
      Three.js — MIT Licence<br>
      Electron — MIT Licence<br>
      jsPDF — MIT Licence<br>
      better-sqlite3 — MIT Licence<br>
      Express — MIT Licence<br>
    </div>
    <button onclick="document.getElementById('about-modal').style.display='none'"
      style="margin-top:16px;padding:8px 16px;background:var(--accent);color:#fff;
      border:none;border-radius:var(--radius);cursor:pointer">Close</button>
  </div>
</div>
```

**Step 3: Add Sentry error monitoring**

Install in server:
```bash
cd /Users/taylor/McKinlayBuilt/server && npm install @sentry/node
```

In `server/src/index.js`, at the very top:
```javascript
const Sentry = require('@sentry/node');
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
}
```

For the Electron renderer (in HTML head):
```html
<script src="https://browser.sentry-cdn.com/7.x.x/bundle.min.js"></script>
<script>
if (window.Sentry && window.__sentryDSN) {
  Sentry.init({ dsn: window.__sentryDSN, release: 'mck-sketch@1.0.0' });
}
</script>
```

The DSN is injected via the preload bridge (so it's not hardcoded in the HTML — it reads from config).

**Step 4: Rate limiting for 1000+ users**

Server already has `express-rate-limit`. Verify it's configured:
```bash
grep -n 'rateLimit\|rate-limit' /Users/taylor/McKinlayBuilt/server/src/index.js
```

If missing, add:
```javascript
const rateLimit = require('express-rate-limit');
app.use('/api/feedback', rateLimit({ windowMs: 60000, max: 5, message: 'Too many requests' }));
app.use('/api/', rateLimit({ windowMs: 900000, max: 200 }));
```

**Step 5: Add `Content-Security-Policy` header**

In `server/src/index.js`:
```javascript
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});
```

**Step 6: Commit**
```bash
git add server/src/index.js app/mck-sketch.html package.json
git commit -m "feat: launch readiness — licence audit, Sentry monitoring, security headers"
```

---

## Phase K — Auto-Update (Electron)

**Files:**
- Modify: `main.js`, `package.json`, `server/.env`

**Context:**
`electron-updater` checks a GitHub Releases URL for a new version. When found, it downloads and installs silently. The user sees a notification: "Update available — restart to apply."

**Prerequisite:** Push your code to a public GitHub repo. In GitHub Releases, each release needs a `latest.yml` file (electron-builder generates this automatically with `--publish`).

**Step 1: Install electron-updater**
```bash
npm install electron-updater
```

**Step 2: Add publish config to `package.json`**

In the `"build"` section:
```json
"publish": {
  "provider": "github",
  "owner": "your-github-username",
  "repo": "mck-sketch"
}
```

**Step 3: Update `main.js` to use auto-updater**

```javascript
const { autoUpdater } = require('electron-updater');
const { ipcMain } = require('electron');

// Only run in production (not dev)
if (!process.env.ELECTRON_DEV) {
  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', (info) => {
    // Tell renderer there's an update coming
    if (mainWindow) mainWindow.webContents.send('update-available', info.version);
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-downloaded', info.version);
  });
}

ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});
```

**Step 4: Add update notification in preload.js**

In `app/preload.js`, add to the `window.api` object:
```javascript
onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, v) => cb(v)),
onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_, v) => cb(v)),
installUpdate: () => ipcRenderer.send('install-update'),
```

**Step 5: Handle update events in app HTML**

```javascript
if (window.api && window.api.onUpdateAvailable) {
  window.api.onUpdateAvailable(function(version) {
    fpSetStatus('Update v' + version + ' downloading in background…');
  });
  window.api.onUpdateDownloaded(function(version) {
    var banner = document.getElementById('ann-banner');
    var text = document.getElementById('ann-text');
    if (banner && text) {
      text.textContent = 'McK Sketch v' + version + ' is ready — click to restart and update';
      banner.style.background = '#1a4a2c';
      banner.style.color = '#86efac';
      banner.style.cursor = 'pointer';
      banner.onclick = function() { window.api.installUpdate(); };
      banner.style.display = '';
    }
  });
}
```

**Step 6: To publish a new version**
```bash
# Bump version in package.json, then:
npm run build:mac  # or build:win or build:all
# electron-builder will create a GitHub release draft with latest.yml
# Publish the draft on GitHub — users get the update within an hour
```

**Step 7: Commit**
```bash
git add main.js package.json app/preload.js app/mck-sketch.html
git commit -m "feat: electron auto-update via electron-updater and GitHub Releases"
```

---

## Phase L — Newsletter Integration

**Files:**
- Create: `server/src/routes/newsletter.js`
- Modify: `server/src/index.js`, `app/mck-sketch.html`

**Prerequisite:** Mailchimp account. Get API key from Account → Extras → API Keys. Get List ID from Audience → Settings → Audience name and defaults → Audience ID. Add to `server/.env`:
```
MAILCHIMP_API_KEY=your-key-here-us21
MAILCHIMP_LIST_ID=abc123def
MAILCHIMP_SERVER_PREFIX=us21
```

**Step 1: Create newsletter subscription route**

```javascript
// server/src/routes/newsletter.js
const express = require('express');
const router = express.Router();

module.exports = () => {
  router.post('/subscribe', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@'))
      return res.status(400).json({ error: 'Valid email required' });

    const apiKey = process.env.MAILCHIMP_API_KEY;
    const listId = process.env.MAILCHIMP_LIST_ID;
    const server = process.env.MAILCHIMP_SERVER_PREFIX || 'us1';
    if (!apiKey || !listId) return res.status(500).json({ error: 'Newsletter not configured' });

    try {
      const response = await fetch(
        'https://' + server + '.api.mailchimp.com/3.0/lists/' + listId + '/members',
        {
          method: 'POST',
          headers: {
            'Authorization': 'apikey ' + apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email_address: email, status: 'subscribed' }),
        }
      );
      const data = await response.json();
      if (data.status === 'subscribed' || data.id) return res.json({ ok: true });
      if (data.title === 'Member Exists') return res.json({ ok: true, existing: true });
      return res.status(400).json({ error: data.detail || 'Subscription failed' });
    } catch (e) {
      res.status(500).json({ error: 'Could not subscribe' });
    }
  });
  return router;
};
```

Register:
```javascript
const newsletterRouter = require('./routes/newsletter')();
app.use('/api/newsletter', newsletterRouter);
```

**Step 2: Add newsletter subscribe field to about/settings area**

In the feedback modal or a separate settings area, add:
```html
<div style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px;">
  <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">
    Get notified about updates and new features
  </div>
  <div style="display:flex;gap:6px;">
    <input type="email" id="newsletter-email" placeholder="your@email.com"
      style="flex:1;background:var(--bg-input);color:var(--text-primary);
      border:1px solid var(--border);border-radius:var(--radius);padding:7px 10px;font-size:12px">
    <button onclick="newsletterSubscribe()"
      style="padding:7px 12px;background:var(--accent);color:#fff;border:none;
      border-radius:var(--radius);cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap">
      Subscribe
    </button>
  </div>
  <div id="newsletter-status" style="font-size:11px;margin-top:4px;color:var(--success)"></div>
</div>
```

```javascript
function newsletterSubscribe() {
  var email = (document.getElementById('newsletter-email') || {}).value || '';
  var status = document.getElementById('newsletter-status');
  if (!email || !email.includes('@')) { if (status) status.textContent = 'Please enter a valid email.'; return; }
  fetch('http://localhost:3141/api/newsletter/subscribe', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ email: email })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (status) status.textContent = d.ok ? 'Subscribed! You\'ll hear about updates.' : (d.error || 'Could not subscribe.');
  })
  .catch(function() { if (status) status.textContent = 'Could not connect.'; });
}
window.newsletterSubscribe = newsletterSubscribe;
```

**Step 3: Commit**
```bash
git add server/src/routes/newsletter.js server/src/index.js app/mck-sketch.html
git commit -m "feat: newsletter subscription via Mailchimp API"
```

---

## Execution Order

Do these in strict order — each phase builds on the previous:

1. **Phase A** — Fix electrical tool (users need this now)
2. **Phase B** — Remove Spotify (clean up before building on)
3. **Phase C** — Metric/imperial (affects all displays)
4. **Phase D** — Wall materials (visual quality, feeds into 3D)
5. **Phase E** — Export formats (SVG, OBJ)
6. **Phase F** — Feedback system (needs Resend API key first)
7. **Phase G** — In-app notifications
8. **Phase H** — Tutorials
9. **Phase I** — International standards
10. **Phase J** — Launch readiness (security, monitoring)
11. **Phase K** — Auto-update (needs GitHub repo set up)
12. **Phase L** — Newsletter (needs Mailchimp key)
