# McK Sketch — What's Next (2026-02-25)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Get McK Sketch commercially launchable — complete the add-on features and V2 layout restructure.

**Key file:** `app/mck-sketch.html` (~55,958 lines). All CSS, HTML, and JS in one file.
**Server:** `server/server.js` + `server/src/routes/` — Express 4 + better-sqlite3 on port 3141.
**Electron main:** `main.js` in repo root.
**Preload:** `app/preload.js` — exposes `window.api` (NOT `window.electronAPI`).
**Security:** All dynamic DOM content must use `textContent` or `createElement/appendChild` — never `innerHTML` with untrusted data. API keys in `server/.env` only.

---

## Status: Already Done

| Phase | What | Status |
|---|---|---|
| A | Electrical tool in floor plan — 16 BS7671 symbols + wire tool | DONE |
| B | Remove Spotify/radio integration (~750 lines removed) | DONE |

---

## APIs Needed Before Some Phases

Add these to `server/.env` before the phases that use them:

- **Phase F (Feedback):** `RESEND_API_KEY=re_...` from resend.com
- **Phase L (Newsletter):** `MAILCHIMP_API_KEY=...` and `MAILCHIMP_LIST_ID=...` from mailchimp.com
- **Phase K (Auto-update):** GitHub repo must be public

---

## Suggested Execution Order

1. Phase C — Metric/imperial toggle (quick, pure client)
2. Phase D — Wall material finishes (moderate, pure client)
3. Phase E — SVG + OBJ export (moderate, pure client)
4. Phase G — Announcement banner (needs server DB + route)
5. Phase H — Guided tutorial (pure client)
6. Phase I — International building standards (pure client, data)
7. Phase F — Feedback form (needs RESEND_API_KEY)
8. Phase K — Auto-update (needs GitHub + npm install)
9. Phase L — Newsletter (needs Mailchimp keys)
10. Phase J — Launch readiness (cleanup)
11. Phase 1 V2 — Layout restructure (biggest change, do last)

---

## Quick Reference: Key Function Locations

| Function | Approx line |
|---|---|
| `fpNewState()` | 54578 |
| `openFloorPlan()` | 54605 |
| `fpResizeCanvas()` | 54675 |
| `fpSetTool()` | 54690 |
| `fpPushUndo()` | 54751 |
| `fpW2S()` / `fpS2W()` | 54999 |
| `fpMouseDown()` | 55050 |
| `fpRedraw()` | 55341 |
| `fpDraw2DWalls()` | 55432 |
| `fpParseLength()` | 55628 |
| `fpGenerate3D()` | 55726 |
| Floor plan CSS | ~4050-4155 |
| Floor plan HTML (`#floorplan-overlay`) | ~18923-19420 |
| Floor plan toolbar (`<div class="fp-tools">`) | ~18928 |
| Floor plan sidebar | ~18966-19012 |

---

## Phase C — Metric / Imperial Toggle

**Files:** `app/mck-sketch.html`

All internal values stay in millimetres. Only display labels and input parsing change.
`fpParseLength()` is at line ~55628. Wall labels drawn in `fpDraw2DWalls()` at ~55432.

### Step 1: Add unit helpers (after `fpClear`, before coordinate helpers)

```javascript
var fpUnitSystem = localStorage.getItem('fp-units') || 'metric';

function fpToDisplay(mm, system) {
  system = system || fpUnitSystem;
  if (system === 'imperial') {
    var totalInches = mm / 25.4;
    var feet = Math.floor(totalInches / 12);
    var inches = (totalInches % 12).toFixed(1);
    return feet + "'-" + inches + '"';
  }
  if (mm >= 1000) return (mm / 1000).toFixed(2).replace(/\.?0+$/, '') + 'm';
  return Math.round(mm) + 'mm';
}
window.fpToDisplay = fpToDisplay;

function fpFromInput(str, system) {
  str = (str || '').trim();
  system = system || fpUnitSystem;
  if (system === 'imperial') {
    var feetMatch = str.match(/^(\d+)'[-\s]?(\d+(?:\.\d+)?)"?$/);
    if (feetMatch) return (parseInt(feetMatch[1]) * 12 + parseFloat(feetMatch[2])) * 25.4;
    var feetOnly = str.match(/^(\d+(?:\.\d+)?)'$/);
    if (feetOnly) return parseFloat(feetOnly[1]) * 304.8;
    var inchOnly = str.match(/^(\d+(?:\.\d+)?)"$/);
    if (inchOnly) return parseFloat(inchOnly[1]) * 25.4;
  }
  if (str.toLowerCase().endsWith('m') && !str.toLowerCase().endsWith('mm'))
    return parseFloat(str) * 1000;
  return parseFloat(str) || 0;
}

function fpSetUnits(system) {
  fpUnitSystem = system;
  localStorage.setItem('fp-units', system);
  document.querySelectorAll('.unit-toggle-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.units === system);
  });
  fpRedraw();
  fpSetStatus('Units: ' + (system === 'metric' ? 'Metric (mm/m)' : 'Imperial (ft/in)'));
}
window.fpSetUnits = fpSetUnits;
```

### Step 2: Update `fpParseLength()` to delegate to `fpFromInput`

Replace the existing `fpParseLength` function body with:
```javascript
function fpParseLength(str) { return fpFromInput(str, fpUnitSystem); }
```

### Step 3: Update wall labels in `fpDraw2DWalls` (~line 55432)

Find: `ctx.fillText(len+' mm', mid.x, mid.y - 5);`
Replace with: `ctx.fillText(fpToDisplay(len), mid.x, mid.y - 5);`

### Step 4: Add unit toggle to floor plan toolbar (in `<div class="fp-tools">` ~line 18928)

```html
<div style="display:flex;border:1px solid var(--border);border-radius:4px;overflow:hidden;margin-left:8px">
  <button class="unit-toggle-btn active" data-units="metric" onclick="fpSetUnits('metric')"
    style="padding:5px 10px;border:none;background:transparent;cursor:pointer;font-size:11px;color:var(--text-secondary)">mm</button>
  <button class="unit-toggle-btn" data-units="imperial" onclick="fpSetUnits('imperial')"
    style="padding:5px 10px;border:none;background:transparent;cursor:pointer;font-size:11px;color:var(--text-secondary)">ft</button>
</div>
```

### Step 5: Add CSS (after `.fp-tool-btn.active`)

```css
.unit-toggle-btn.active { background: var(--accent); color: #fff; }
```

### Step 6: Commit

```
git add app/mck-sketch.html
git commit -m "feat: metric/imperial toggle with ft/in display and input parsing"
```

---

## Phase D — Wall Material Finishes

**Files:** `app/mck-sketch.html`

### Step 1: Add finish defaults to `fpNewState()` (~line 54578)

In the returned object add:
```javascript
defaultExternalFinish: 'roughcast',
defaultInternalFinish: 'plaster',
defaultPaintColour: '#F5F0EB',
```

### Step 2: Stamp properties when wall is created (in `fpMouseDown`, the `walls.push(...)` call)

```javascript
fpState.walls.push({
  x1: fpState.startX, y1: fpState.startY, x2: endPt.x, y2: endPt.y,
  thickness: fpState.wallThickness, height: fpState.wallHeight,
  externalFinish: fpState.defaultExternalFinish,
  internalFinish: fpState.defaultInternalFinish,
  paintColour: fpState.defaultPaintColour,
});
```

### Step 3: Add finishes section to sidebar HTML (in `#fp-sidebar`, before the View section)

```html
<div class="fp-sidebar-section" id="fp-wall-finishes">
  <div class="fp-sidebar-title">External Finish</div>
  <select id="fp-ext-finish" onchange="fpSetDefaultExtFinish(this.value)"
    style="width:100%;margin-bottom:8px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:4px;padding:4px;font-size:11px">
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
  <div class="fp-sidebar-title">Internal Finish</div>
  <select id="fp-int-finish" onchange="fpSetDefaultIntFinish(this.value)"
    style="width:100%;margin-bottom:8px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:4px;padding:4px;font-size:11px">
    <option value="plaster">Plaster (smooth)</option>
    <option value="plaster-textured">Plaster (textured)</option>
    <option value="timber-panel">Timber Panelling</option>
    <option value="mdf-panel">MDF Panelling (painted)</option>
    <option value="brick-internal">Exposed Brick</option>
    <option value="tile">Ceramic Tile</option>
    <option value="stone-internal">Stone</option>
  </select>
  <div class="fp-sidebar-title">Paint Colour</div>
  <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
    <input type="color" id="fp-paint-colour" value="#F5F0EB"
      onchange="fpSetDefaultPaintColour(this.value)"
      style="width:36px;height:28px;border:none;border-radius:4px;cursor:pointer;padding:0">
    <select id="fp-paint-preset" onchange="fpApplyPaintPreset(this.value)"
      style="flex:1;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:4px;padding:4px;font-size:10px">
      <option value="">— Farrow &amp; Ball presets —</option>
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
  <div class="fp-sidebar-title" style="margin-top:8px">Fascia / Soffit</div>
  <select id="fp-fascia-mat"
    style="width:100%;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:4px;padding:4px;font-size:11px">
    <option value="pvc-white">PVC White</option>
    <option value="pvc-anthracite">PVC Anthracite Grey</option>
    <option value="timber-painted">Painted Timber</option>
    <option value="aluminium">Aluminium</option>
  </select>
</div>
```

### Step 4: Add JS helpers and material config (after `fpBuildElecPalette`)

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

function fpSetDefaultExtFinish(val) {
  if (fpState) fpState.defaultExternalFinish = val;
  if (fpState && fpState.selectedWall >= 0 && fpState.walls[fpState.selectedWall])
    fpState.walls[fpState.selectedWall].externalFinish = val;
  fpRedraw();
}
window.fpSetDefaultExtFinish = fpSetDefaultExtFinish;

function fpSetDefaultIntFinish(val) {
  if (fpState) fpState.defaultInternalFinish = val;
  if (fpState && fpState.selectedWall >= 0 && fpState.walls[fpState.selectedWall])
    fpState.walls[fpState.selectedWall].internalFinish = val;
  fpRedraw();
}
window.fpSetDefaultIntFinish = fpSetDefaultIntFinish;

function fpSetDefaultPaintColour(val) {
  if (fpState) fpState.defaultPaintColour = val;
  if (fpState && fpState.selectedWall >= 0 && fpState.walls[fpState.selectedWall])
    fpState.walls[fpState.selectedWall].paintColour = val;
  fpRedraw();
}
window.fpSetDefaultPaintColour = fpSetDefaultPaintColour;

function fpApplyPaintPreset(val) {
  if (!val) return;
  var picker = document.getElementById('fp-paint-colour');
  if (picker) picker.value = val;
  fpSetDefaultPaintColour(val);
  var sel = document.getElementById('fp-paint-preset');
  if (sel) sel.value = '';
}
window.fpApplyPaintPreset = fpApplyPaintPreset;
```

### Step 5: Tint wall fill colour based on external finish in `fpDraw2DWalls`

In `fpDraw2DWalls`, replace the static `ctx.fillStyle = '#c8c8bc'` line with:
```javascript
var cfg = fp3DExtMatConfig[w.externalFinish] || fp3DExtMatConfig['roughcast'];
var r = (cfg.color >> 16) & 0xff, g = (cfg.color >> 8) & 0xff, b = cfg.color & 0xff;
ctx.fillStyle = i === fpState.selectedWall ? '#b8d4ff' : ('rgb('+r+','+g+','+b+')');
```

### Step 6: Commit

```
git add app/mck-sketch.html
git commit -m "feat: wall finish selector — external/internal materials, Farrow and Ball paint presets"
```

---

## Phase E — SVG and OBJ Export

**Files:** `app/mck-sketch.html`

### Task E.1: SVG Export

Add after `fpClear`:

```javascript
function fpExportSVG() {
  if (!fpState || fpState.walls.length === 0) {
    fpSetStatus('Draw some walls first.'); return;
  }
  var xs = [], ys = [];
  fpState.walls.forEach(function(w){ xs.push(w.x1,w.x2); ys.push(w.y1,w.y2); });
  var minX=Math.min.apply(null,xs), maxX=Math.max.apply(null,xs);
  var minY=Math.min.apply(null,ys), maxY=Math.max.apply(null,ys);
  var pad=500, W=maxX-minX+pad*2, H=maxY-minY+pad*2;
  var sc=800/Math.max(W,H);
  var svgW=Math.round(W*sc), svgH=Math.round(H*sc);
  function wx(x){ return Math.round((x-minX+pad)*sc); }
  function wy(y){ return Math.round((maxY-y+pad)*sc); }

  var lines=['<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="'+svgW+'" height="'+svgH+'">',
    '<rect width="'+svgW+'" height="'+svgH+'" fill="#f4f4f0"/>'];

  fpState.walls.forEach(function(w) {
    var dx=w.x2-w.x1, dy=w.y2-w.y1, len=Math.hypot(dx,dy); if(len<1) return;
    var t=w.thickness*sc/2, nx=-dy/len*t, ny=dx/len*t;
    var pts=[[wx(w.x1+nx),wy(w.y1+ny)],[wx(w.x2+nx),wy(w.y2+ny)],
              [wx(w.x2-nx),wy(w.y2-ny)],[wx(w.x1-nx),wy(w.y1-ny)]];
    lines.push('<polygon points="'+pts.map(function(p){return p[0]+','+p[1];}).join(' ')+
      '" fill="#c8c8bc" stroke="#444" stroke-width="0.5"/>');
  });

  fpState.openings.forEach(function(o) {
    var w=fpState.walls[o.wallIndex]; if(!w) return;
    var dx=w.x2-w.x1, dy=w.y2-w.y1, len=Math.hypot(dx,dy); if(len<1) return;
    var ux=dx/len, uy=dy/len, cx=w.x1+o.t*dx, cy=w.y1+o.t*dy;
    var p1=[wx(cx-ux*(o.width/2)),wy(cy-uy*(o.width/2))];
    var p2=[wx(cx+ux*(o.width/2)),wy(cy+uy*(o.width/2))];
    var col=o.type==='door'?'#2a6ebb':'#3a9a3a';
    lines.push('<line x1="'+p1[0]+'" y1="'+p1[1]+'" x2="'+p2[0]+'" y2="'+p2[1]+
      '" stroke="'+col+'" stroke-width="2"/>');
  });

  var barPx=Math.round(1000*sc);
  lines.push('<line x1="20" y1="'+(svgH-20)+'" x2="'+(20+barPx)+'" y2="'+(svgH-20)+
    '" stroke="#333" stroke-width="2"/>');
  lines.push('<text x="20" y="'+(svgH-25)+'" font-size="10" fill="#333">1m</text>');
  lines.push('</svg>');

  var blob=new Blob([lines.join('\n')],{type:'image/svg+xml'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a'); a.href=url; a.download='floor-plan.svg';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  fpSetStatus('Floor plan exported as SVG.');
}
window.fpExportSVG = fpExportSVG;
```

Add SVG button to toolbar:
```html
<button class="fp-tool-btn" onclick="fpExportSVG()" title="Export as SVG vector">&#8659; SVG</button>
```

### Task E.2: OBJ Export

Add after `fpExportSVG`:

```javascript
function fpExportOBJ() {
  if (!fpState || fpState.walls.length === 0) {
    fpSetStatus('Draw some walls first.'); return;
  }
  var verts=[], faces=[], vi=1;
  fpState.walls.forEach(function(w) {
    var dx=w.x2-w.x1, dy=w.y2-w.y1, len=Math.hypot(dx,dy); if(len<1) return;
    var ux=dx/len, uy=dy/len, h=w.thickness/2, H=w.height, m=0.001;
    var nx=-uy*h, ny=ux*h;
    var c=[[w.x1+nx,0,w.y1+ny],[w.x2+nx,0,w.y2+ny],
            [w.x2-nx,0,w.y2-ny],[w.x1-nx,0,w.y1-ny],
            [w.x1+nx,H,w.y1+ny],[w.x2+nx,H,w.y2+ny],
            [w.x2-nx,H,w.y2-ny],[w.x1-nx,H,w.y1-ny]];
    c.forEach(function(p){ verts.push('v '+(p[0]*m).toFixed(4)+' '+(p[1]*m).toFixed(4)+' '+(p[2]*m).toFixed(4)); });
    var b=vi;
    faces.push('f '+b+' '+(b+1)+' '+(b+2)+' '+(b+3));
    faces.push('f '+(b+4)+' '+(b+7)+' '+(b+6)+' '+(b+5));
    faces.push('f '+b+' '+(b+4)+' '+(b+5)+' '+(b+1));
    faces.push('f '+(b+1)+' '+(b+5)+' '+(b+6)+' '+(b+2));
    faces.push('f '+(b+2)+' '+(b+6)+' '+(b+7)+' '+(b+3));
    faces.push('f '+(b+3)+' '+(b+7)+' '+(b+4)+' '+b);
    vi+=8;
  });
  var obj=['# McK Sketch OBJ export','# Units: metres',''].concat(verts).concat(['']).concat(faces).join('\n');
  var blob=new Blob([obj],{type:'text/plain'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a'); a.href=url; a.download='floor-plan.obj';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  fpSetStatus('3D model exported as OBJ (opens in Blender / SketchUp).');
}
window.fpExportOBJ = fpExportOBJ;
```

Add OBJ button to toolbar:
```html
<button class="fp-tool-btn" onclick="fpExportOBJ()" title="Export 3D as OBJ">&#8659; OBJ</button>
```

### Commit

```
git add app/mck-sketch.html
git commit -m "feat: SVG floor plan export and OBJ 3D mesh export"
```

---

## Phase F — In-App Feedback Form (needs RESEND_API_KEY in server/.env)

### Task F.1: Create `server/src/routes/feedback.js`

```javascript
const express = require('express');
const router = express.Router();

router.post('/', async (req, res) => {
  const { message, email } = req.body;
  if (!message || typeof message !== 'string' || message.trim().length < 5)
    return res.status(400).json({ error: 'Message too short' });
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Feedback not configured' });

  const safeMsg = message.trim().slice(0, 2000);
  const safeEmail = (typeof email === 'string' ? email : 'anonymous').slice(0, 200).replace(/[<>]/g, '');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'feedback@mckinlaybuilt.com',
        to: ['taylor@mckinlaybuilt.com'],
        subject: 'McK Sketch Feedback from ' + safeEmail,
        text: 'From: ' + safeEmail + '\n\n' + safeMsg,
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    res.json({ success: true });
  } catch (e) {
    console.error('Feedback error:', e.message);
    res.status(500).json({ error: 'Failed to send' });
  }
});

module.exports = router;
```

### Task F.2: Register in `server/server.js`

```javascript
const feedbackRoutes = require('./src/routes/feedback');
const feedbackLimiter = rateLimit({ windowMs: 60*60*1000, max: 10 });
app.use('/api/feedback', feedbackLimiter, feedbackRoutes);
```

### Task F.3: Client panel in `app/mck-sketch.html`

CSS (near other panel CSS):
```css
#feedback-panel {
  position: fixed; top: 0; right: -360px; width: 340px; height: 100vh;
  background: var(--bg-panel); border-left: 1px solid var(--border);
  box-shadow: -4px 0 20px rgba(0,0,0,0.15); z-index: 1200;
  transition: right 0.25s ease; display: flex; flex-direction: column; padding: 20px;
}
#feedback-panel.open { right: 0; }
#feedback-message {
  width: 100%; min-height: 140px; resize: vertical;
  background: var(--bg-input); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: var(--radius);
  padding: 8px; font-size: 13px; margin-bottom: 12px; box-sizing: border-box;
}
```

HTML panel (near other fixed panels):
```html
<div id="feedback-panel">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <div style="font-size:15px;font-weight:600">Send Feedback</div>
    <button onclick="closeFeedback()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-secondary)">&times;</button>
  </div>
  <label style="font-size:12px;font-weight:600;margin-bottom:6px;display:block">Email (optional)</label>
  <input type="email" id="feedback-email" placeholder="you@example.com"
    style="width:100%;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius);padding:6px 8px;font-size:13px;margin-bottom:12px;box-sizing:border-box">
  <label style="font-size:12px;font-weight:600;margin-bottom:6px;display:block">Message</label>
  <textarea id="feedback-message" placeholder="Bug report, feature request, anything..."></textarea>
  <button onclick="submitFeedback()"
    style="background:var(--accent);color:#fff;border:none;border-radius:var(--radius);padding:10px;font-size:13px;cursor:pointer;font-weight:600;width:100%">
    Send Feedback
  </button>
  <div id="feedback-status" style="margin-top:10px;font-size:12px;color:var(--text-secondary);text-align:center"></div>
</div>
```

JS:
```javascript
function openFeedback() { document.getElementById('feedback-panel').classList.add('open'); }
function closeFeedback() { document.getElementById('feedback-panel').classList.remove('open'); }
window.openFeedback = openFeedback;
window.closeFeedback = closeFeedback;

async function submitFeedback() {
  var msg = document.getElementById('feedback-message').value.trim();
  var email = document.getElementById('feedback-email').value.trim();
  var statusEl = document.getElementById('feedback-status');
  if (msg.length < 5) { statusEl.textContent = 'Please write a bit more.'; return; }
  statusEl.textContent = 'Sending...';
  try {
    var r = await fetch('http://localhost:3141/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, email: email })
    });
    if (r.ok) {
      statusEl.textContent = 'Sent! Thank you.';
      document.getElementById('feedback-message').value = '';
      setTimeout(closeFeedback, 1500);
    } else {
      statusEl.textContent = 'Failed to send — try again.';
    }
  } catch(e) {
    statusEl.textContent = 'Network error — is server running?';
  }
}
window.submitFeedback = submitFeedback;
```

Add a Feedback button somewhere visible in the main header:
```html
<button onclick="openFeedback()" style="...your header button style...">&#9993; Feedback</button>
```

### Commit

```
git add app/mck-sketch.html server/src/routes/feedback.js server/server.js
git commit -m "feat: in-app feedback form via Resend API"
```

---

## Phase G — In-App Announcement Banner

### Task G.1: Add DB table in `server/src/database.js`

In the `initDb()` function, add:
```javascript
db.exec(`
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    link_text TEXT,
    link_url TEXT,
    published INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);
```

### Task G.2: Create `server/src/routes/announcements.js`

```javascript
const express = require('express');
const { getDb } = require('../database');
const router = express.Router();

router.get('/latest', (req, res) => {
  const db = getDb();
  const ann = db.prepare(
    'SELECT id, message, link_text, link_url FROM announcements WHERE published=1 ORDER BY id DESC LIMIT 1'
  ).get();
  res.json(ann || null);
});

module.exports = router;
```

Register in `server/server.js`:
```javascript
const announcementRoutes = require('./src/routes/announcements');
app.use('/api/announcements', announcementRoutes);
```

### Task G.3: Client banner in `app/mck-sketch.html`

CSS:
```css
#announcement-banner {
  display: none; position: fixed; top: 0; left: 0; right: 0; z-index: 2000;
  background: var(--accent); color: #fff; padding: 10px 44px 10px 16px;
  font-size: 13px; text-align: center;
}
#announcement-banner a { color: #fff; font-weight: 700; margin-left: 8px; }
#ann-dismiss {
  position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
  background: none; border: none; color: #fff; font-size: 18px; cursor: pointer;
}
```

HTML (near top of body):
```html
<div id="announcement-banner">
  <span id="ann-text"></span>
  <a id="ann-link" href="#" target="_blank" style="display:none"></a>
  <button id="ann-dismiss" onclick="dismissAnnouncement()">&times;</button>
</div>
```

JS (in DOMContentLoaded or near app init):
```javascript
(function pollAnnouncements() {
  var seen = localStorage.getItem('mck-ann-seen') || '0';
  fetch('http://localhost:3141/api/announcements/latest')
    .then(function(r){ return r.json(); })
    .then(function(ann) {
      if (!ann || String(ann.id) === seen) return;
      var banner = document.getElementById('announcement-banner');
      document.getElementById('ann-text').textContent = ann.message;
      var link = document.getElementById('ann-link');
      if (ann.link_url && ann.link_text) {
        link.textContent = ann.link_text;
        link.href = ann.link_url;
        link.style.display = '';
      }
      banner.dataset.annId = ann.id;
      banner.style.display = 'block';
    })
    .catch(function(){});
  setTimeout(pollAnnouncements, 60*60*1000);
})();

function dismissAnnouncement() {
  var banner = document.getElementById('announcement-banner');
  if (banner.dataset.annId) localStorage.setItem('mck-ann-seen', banner.dataset.annId);
  banner.style.display = 'none';
}
window.dismissAnnouncement = dismissAnnouncement;
```

### Commit

```
git add app/mck-sketch.html server/src/routes/announcements.js server/src/database.js server/server.js
git commit -m "feat: in-app announcement banner, dismisses once per announcement"
```

---

## Phase H — Guided First-Run Tutorial

**Files:** `app/mck-sketch.html`

CSS:
```css
#tutorial-backdrop {
  display: none; position: fixed; inset: 0; z-index: 3000; pointer-events: none;
}
#tutorial-backdrop.active { display: block; pointer-events: all; }
.tutorial-highlight {
  position: absolute; border-radius: 6px;
  box-shadow: 0 0 0 9999px rgba(0,0,0,0.55);
  transition: all 0.3s ease; pointer-events: none;
}
#tutorial-tooltip {
  position: absolute; background: var(--bg-panel); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: 8px; padding: 16px;
  max-width: 280px; z-index: 3001; pointer-events: all;
  box-shadow: 0 8px 32px rgba(0,0,0,0.25);
}
#tutorial-tooltip h3 { margin: 0 0 8px; font-size: 14px; }
#tutorial-tooltip p  { margin: 0 0 12px; font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
.tutorial-btn-row  { display: flex; gap: 8px; justify-content: flex-end; }
.tutorial-next { background: var(--accent); color: #fff; border: none; border-radius: 4px; padding: 6px 14px; font-size: 12px; cursor: pointer; font-weight: 600; }
.tutorial-skip { background: none; border: 1px solid var(--border); color: var(--text-secondary); border-radius: 4px; padding: 6px 10px; font-size: 12px; cursor: pointer; }
```

HTML (before closing body tag):
```html
<div id="tutorial-backdrop">
  <div class="tutorial-highlight" id="tutorial-hl"></div>
  <div id="tutorial-tooltip">
    <h3 id="tutorial-title"></h3>
    <p id="tutorial-desc"></p>
    <div class="tutorial-btn-row">
      <button class="tutorial-skip" onclick="tutorialEnd()">Skip tour</button>
      <button class="tutorial-next" onclick="tutorialNext()" id="tutorial-next-btn">Next</button>
    </div>
    <div id="tutorial-prog" style="text-align:center;font-size:10px;color:var(--text-muted);margin-top:8px"></div>
  </div>
</div>
```

JS:
```javascript
var tutorialStep = 0;
var tutorialSteps = [
  { id:'fp-btn-wall',       title:'Draw Walls',           desc:'Click Wall, then click two points to draw. Type a number for exact length. Snap to grid for accuracy.' },
  { id:'fp-btn-door',       title:'Add Doors & Windows',  desc:'Click Door or Window, then click on any wall to place it. Set dimensions in the sidebar.' },
  { id:'fp-btn-electrical', title:'Electrical Symbols',   desc:'Select a BS7671 symbol from the panel, then click the floor plan to place it. Use Wire to join them.' },
  { id:'fp-btn-undo',       title:'Undo',                 desc:'Made a mistake? Click Undo or press Cmd+Z (Mac) / Ctrl+Z (Windows).' },
  { id:null,                title:"You're Ready!",        desc:'Draw your house, then click View 3D to see it. Good luck with your build!' },
];

function tutorialStart() {
  if (localStorage.getItem('mck-tutorial-done')) return;
  tutorialStep = 0;
  document.getElementById('tutorial-backdrop').classList.add('active');
  tutorialShow();
}
window.tutorialStart = tutorialStart;

function tutorialShow() {
  var step = tutorialSteps[tutorialStep];
  document.getElementById('tutorial-title').textContent = step.title;
  document.getElementById('tutorial-desc').textContent = step.desc;
  document.getElementById('tutorial-prog').textContent = (tutorialStep+1)+' / '+tutorialSteps.length;
  document.getElementById('tutorial-next-btn').textContent = tutorialStep === tutorialSteps.length-1 ? 'Done' : 'Next';

  var hl = document.getElementById('tutorial-hl');
  var tip = document.getElementById('tutorial-tooltip');
  if (step.id) {
    var el = document.getElementById(step.id);
    if (el) {
      var rect = el.getBoundingClientRect(), pad = 6;
      hl.style.left   = (rect.left-pad)+'px';   hl.style.top    = (rect.top-pad)+'px';
      hl.style.width  = (rect.width+pad*2)+'px'; hl.style.height = (rect.height+pad*2)+'px';
      var tipTop = rect.bottom + 12;
      if (tipTop + 180 > window.innerHeight) tipTop = rect.top - 190;
      tip.style.top  = tipTop+'px';
      tip.style.left = Math.max(8, Math.min(rect.left, window.innerWidth-290))+'px';
      tip.style.transform = '';
    }
  } else {
    hl.style.cssText = 'width:0;height:0;box-shadow:none';
    tip.style.top = '50%'; tip.style.left = '50%'; tip.style.transform = 'translate(-50%,-50%)';
  }
}

function tutorialNext() {
  tutorialStep++;
  if (tutorialStep >= tutorialSteps.length) { tutorialEnd(); return; }
  tutorialShow();
}
window.tutorialNext = tutorialNext;

function tutorialEnd() {
  localStorage.setItem('mck-tutorial-done', '1');
  document.getElementById('tutorial-backdrop').classList.remove('active');
}
window.tutorialEnd = tutorialEnd;
```

Trigger on first run — add to `openFloorPlan()` after canvas setup:
```javascript
setTimeout(tutorialStart, 600);
```

Add restart button somewhere in settings:
```html
<button onclick="localStorage.removeItem('mck-tutorial-done');tutorialStart()">Restart Tour</button>
```

### Commit

```
git add app/mck-sketch.html
git commit -m "feat: guided first-run tutorial with element spotlight"
```

---

## Phase I — International Building Standards

**Files:** `app/mck-sketch.html`

### Step 1: Add data object and country selector (near existing `fpSetRegsRegion`)

```javascript
var FP_REGS_DATA = {
  scotland:  { label:'Scotland (BSD Warrant)',    minBed1:6.5,  minBed2:10.0, minCeil:2.1,  winRatio:0.1,  minDoor:0.775, maxStair:42, minHead:2.0 },
  england:   { label:'England & Wales (Part A+)', minBed1:6.5,  minBed2:10.0, minCeil:2.0,  winRatio:0.1,  minDoor:0.775, maxStair:42, minHead:2.0 },
  usa:       { label:'USA (IRC 2021)',             minBed1:6.97, minBed2:9.29, minCeil:2.13, winRatio:0.125,minDoor:0.813, maxStair:44, minHead:1.98 },
  canada:    { label:'Canada (NBC 2020)',          minBed1:7.0,  minBed2:9.8,  minCeil:2.1,  winRatio:0.1,  minDoor:0.810, maxStair:43, minHead:1.95 },
  australia: { label:'Australia (NCC 2022)',       minBed1:7.0,  minBed2:10.0, minCeil:2.4,  winRatio:0.1,  minDoor:0.820, maxStair:45, minHead:2.0  },
};
var fpRegsCountry = localStorage.getItem('fp-regs-country') || 'scotland';

function fpSetRegsCountry(country) {
  fpRegsCountry = country;
  localStorage.setItem('fp-regs-country', country);
  fpRenderRegsContent();
}
window.fpSetRegsCountry = fpSetRegsCountry;
```

### Step 2: Add country dropdown to regs panel header (find `<div class="fp-regs-tabs">`)

```html
<select id="fp-regs-country-sel" onchange="fpSetRegsCountry(this.value)"
  style="background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:11px;margin-right:8px">
  <option value="scotland">Scotland</option>
  <option value="england">England &amp; Wales</option>
  <option value="usa">USA (IRC)</option>
  <option value="canada">Canada (NBC)</option>
  <option value="australia">Australia (NCC)</option>
</select>
```

### Step 3: Add `fpRenderRegsContent()` that builds the regs table from `FP_REGS_DATA[fpRegsCountry]`

Find where regs content renders (near `fp-regs-scotland-content`). Replace static HTML tables with dynamic JS that reads from `FP_REGS_DATA` and uses `textContent` to populate table cells.

### Commit

```
git add app/mck-sketch.html
git commit -m "feat: international building standards — Scotland, England, USA, Canada, Australia"
```

---

## Phase J — Launch Readiness

**Files:** `app/mck-sketch.html`, `server/server.js`, `main.js`

### Step 1: Copyright meta tag in `<head>`

```html
<meta name="copyright" content="2026 McKinlay Built Ltd. All rights reserved.">
```

### Step 2: About text in app (settings panel or footer)

```
McK Sketch © 2026 McKinlay Built Ltd
Built with Three.js (MIT), better-sqlite3 (MIT)
```

### Step 3: Sentry — install and init in `main.js`

```
npm install @sentry/electron
```

In `main.js`:
```javascript
if (app.isPackaged) {
  try {
    const Sentry = require('@sentry/electron');
    Sentry.init({ dsn: process.env.SENTRY_DSN });
  } catch(e) {}
}
```

### Step 4: Confirm rate limits are on feedback route (already handled in Phase F)

### Commit

```
git add main.js app/mck-sketch.html package.json
git commit -m "chore: launch readiness — copyright, Sentry error monitoring"
```

---

## Phase K — Auto-Update via electron-updater

**Files:** `main.js`, `app/preload.js`, `package.json`

### Step 1: Install

```
npm install electron-updater
```

### Step 2: In `main.js`

```javascript
const { autoUpdater } = require('electron-updater');

// After mainWindow.loadFile():
mainWindow.webContents.on('did-finish-load', function() {
  if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify();
});

autoUpdater.on('update-downloaded', function(info) {
  mainWindow.webContents.send('update-downloaded', info.version);
});

const { ipcMain } = require('electron');
ipcMain.on('restart-and-update', function() { autoUpdater.quitAndInstall(); });
```

### Step 3: In `app/preload.js`

Add to the `contextBridge.exposeInMainWorld('api', {...})` object:
```javascript
onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (e, v) => cb(v)),
restartAndUpdate: () => ipcRenderer.send('restart-and-update'),
```

### Step 4: In `app/mck-sketch.html`, listen for update IPC

In DOMContentLoaded:
```javascript
if (window.api && window.api.onUpdateDownloaded) {
  window.api.onUpdateDownloaded(function(version) {
    var bar = document.createElement('div');
    bar.style.cssText='position:fixed;bottom:0;left:0;right:0;background:var(--accent);color:#fff;padding:12px 16px;z-index:9999;display:flex;align-items:center;justify-content:space-between;font-size:13px';
    var msg = document.createElement('span');
    msg.textContent = 'McK Sketch ' + version + ' downloaded — restart to install.';
    var btn = document.createElement('button');
    btn.textContent = 'Restart & Update';
    btn.style.cssText='background:#fff;color:var(--accent);border:none;border-radius:4px;padding:6px 14px;cursor:pointer;font-weight:600;margin-left:16px';
    btn.onclick = function() { window.api.restartAndUpdate(); };
    bar.appendChild(msg); bar.appendChild(btn);
    document.body.appendChild(bar);
  });
}
```

### Step 5: Add to `package.json` build config

```json
"build": {
  "publish": {
    "provider": "github",
    "owner": "YOUR_GITHUB_USERNAME",
    "repo": "McKinlayBuilt"
  }
}
```

### Commit

```
git add main.js app/preload.js app/mck-sketch.html package.json
git commit -m "feat: auto-update via electron-updater and GitHub Releases"
```

---

## Phase L — Newsletter Subscription (needs Mailchimp API keys in server/.env)

### Task L.1: Create `server/src/routes/newsletter.js`

```javascript
const express = require('express');
const router = express.Router();

router.post('/subscribe', async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string' || !email.includes('@'))
    return res.status(400).json({ error: 'Invalid email' });

  const apiKey = process.env.MAILCHIMP_API_KEY;
  const listId = process.env.MAILCHIMP_LIST_ID;
  if (!apiKey || !listId) return res.status(503).json({ error: 'Newsletter not configured' });

  const dc = apiKey.split('-').pop();
  const url = 'https://' + dc + '.api.mailchimp.com/3.0/lists/' + listId + '/members';

  try {
    const creds = Buffer.from('anystring:' + apiKey).toString('base64');
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + creds, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_address: email.toLowerCase().slice(0,200), status: 'subscribed' }),
    });
    const data = await r.json();
    if (r.ok || data.title === 'Member Exists') return res.json({ success: true });
    res.status(400).json({ error: data.detail || 'Subscribe failed' });
  } catch(e) {
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

module.exports = router;
```

Register in `server/server.js`:
```javascript
const newsletterRoutes = require('./src/routes/newsletter');
app.use('/api/newsletter', newsletterRoutes);
```

### Task L.2: Client subscribe widget in `app/mck-sketch.html`

Add somewhere visible (settings panel, or below the feedback button):
```html
<div style="padding:16px;border-top:1px solid var(--border)">
  <div style="font-size:13px;font-weight:600;margin-bottom:8px">Stay updated</div>
  <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px">Get notified about new features.</div>
  <div style="display:flex;gap:6px">
    <input type="email" id="nl-email" placeholder="your@email.com"
      style="flex:1;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:4px;padding:6px 8px;font-size:12px">
    <button onclick="subscribeNewsletter()"
      style="background:var(--accent);color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;cursor:pointer">Subscribe</button>
  </div>
  <div id="nl-status" style="font-size:11px;margin-top:6px;color:var(--text-muted)"></div>
</div>
```

JS:
```javascript
async function subscribeNewsletter() {
  var email = document.getElementById('nl-email').value.trim();
  var statusEl = document.getElementById('nl-status');
  if (!email || !email.includes('@')) { statusEl.textContent = 'Enter a valid email.'; return; }
  statusEl.textContent = 'Subscribing...';
  try {
    var r = await fetch('http://localhost:3141/api/newsletter/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email })
    });
    statusEl.textContent = r.ok ? 'Subscribed! Thanks.' : 'Error — try again.';
  } catch(e) {
    statusEl.textContent = 'Network error.';
  }
}
window.subscribeNewsletter = subscribeNewsletter;
```

### Commit

```
git add app/mck-sketch.html server/src/routes/newsletter.js server/server.js
git commit -m "feat: newsletter subscription via Mailchimp API"
```

---

## Phase 1 (V2) — Floor Plan as Primary Workspace

**Files:** `app/mck-sketch.html`

This is the biggest structural change. The floor plan lives in `#floorplan-overlay` (a fixed full-screen overlay, ~line 18923). For V2, the floor plan IS the app — always visible, no overlay.

Key current lines:
- `#canvas-wrap` HTML: ~line 4455
- `#floorplan-overlay` HTML: ~line 18923
- `openFloorPlan()`: ~line 54605
- `fpResizeCanvas()`: ~line 54675
- `closeFloorPlan()`: search for it

### Step 1: Add a persistent 2D panel inside `#canvas-wrap`

Find `<main id="canvas-wrap">` (~line 4455). Inside it, BEFORE the existing 3D canvas, add:
```html
<div id="fp-main-2d" style="position:absolute;inset:0;z-index:2;background:#f4f4f0">
  <canvas id="fp-canvas" tabindex="0" style="display:block;width:100%;height:100%"></canvas>
  <div class="fp-status" id="fp-status" style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);pointer-events:none">Click to place walls.</div>
</div>
```

Note: `fp-canvas` was previously inside `#floorplan-overlay` — move it here and remove it from the overlay.

### Step 2: Remove overlay from `openFloorPlan()`

Delete the line `document.getElementById('floorplan-overlay').classList.add('active');` from `openFloorPlan()`.

### Step 3: Update `fpResizeCanvas()` to read from `#fp-main-2d`

```javascript
function fpResizeCanvas() {
  var panel = document.getElementById('fp-main-2d');
  if (!panel || !fpCanvas) return;
  fpCanvas.width = panel.clientWidth || 800;
  fpCanvas.height = panel.clientHeight || 600;
  fpRedraw();
}
```

### Step 4: Auto-init floor plan on load

In DOMContentLoaded, add:
```javascript
openFloorPlan();
```

### Step 5: Add ResizeObserver to keep canvas sized

```javascript
var fp2DResizeObs = new ResizeObserver(fpResizeCanvas);
fp2DResizeObs.observe(document.getElementById('fp-main-2d'));
```

### Step 6: Move floor plan toolbar to always-visible position

Move the `<div class="fp-tools">` block from inside `#floorplan-overlay` header to the main app header bar so it's always visible.

### Step 7: Move floor plan sidebar

Move the `<div class="fp-sidebar">` from inside `#floorplan-overlay` to the main `<aside id="panel">`, replacing or merging with the existing right panel content.

### Step 8: Commit

```
git add app/mck-sketch.html
git commit -m "feat(v2): promote floor plan to primary workspace — always on, no overlay"
```
