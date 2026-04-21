# 3D Realism — Doors & Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Door Designer and Window Designer 3D previews look photo-realistic instead of blown-out/cheap — through exposure fix, HDRI lighting, PBR materials, a Product/Interior/Exterior mode toggle, and a heritage paint colour library (~1,300 branded colours from 10 high-end paint brands).

**Architecture:** Extend the existing `createScene()`, `getMaterial()`, and `addRoomContext()` helpers with per-mode variants and a loader path for real PBR texture sets and `.hdr` environment maps. Bundle CC0 assets under `app/assets/textures/` and `app/assets/hdri/`. Add a single `PAINT_COLOURS` expansion (inline — not JSON — for consistency with the single-file architecture). Add a Mode toggle (Product / Interior / Exterior) and rebuild the paint picker in both designers. The other 5 designers (Cabinet, Kitchen, Staircase, Panelling, Ceiling) are out of scope and keep using the current `getMaterial()`; they will be migrated in a follow-up plan.

**Tech Stack:** Electron 33, Three.js 0.182 (`RGBELoader`, `TextureLoader`, `PMREMGenerator`, `MeshStandardMaterial`/`MeshPhysicalMaterial`), ACES Filmic tone mapping. No new npm deps — `RGBELoader` ships with Three.js.

**Spec:** `docs/superpowers/specs/2026-04-20-3d-realism-doors-windows-design.md`

---

## Conventions

- **File:** everything lives in `app/mck-sketch.html` unless a task says otherwise. Line numbers refer to the file **before** any edits in this plan. After each completed task those numbers drift; re-anchor with Grep when needed.
- **Verification:** there is no automated test harness. Verification = start Electron with `npx electron --remote-debugging-port=9222 /Users/taylor/McKinlayBuilt`, open the relevant Designer, visually check the render, and (where numerical) evaluate a JS expression via `python3 /tmp/cdp-eval.py '<js>'`.
- **Reference images:** `/tmp/refs/shot1-4.png` (door 3D blown-out, door 2D good, window 2D good, window 3D blown-out) and `https://www.stormdoorsglasgow.com/ourdoors` for Glasgow sandstone door context.
- **Commit cadence:** commit at the end of every task (each task lists the exact `git commit` line). Small commits make it easy to revert a single step if something looks worse.
- **Asset licensing:** only download CC0 assets (Poly Haven, ambientCG). Each asset folder gets a `SOURCE.txt` noting the actual source slug used.
- **DOM manipulation:** always use `replaceChildren()`, `append()`, `textContent`, and explicit element creation — never assign to `innerHTML`.
- **Do not touch** the 2D rendering code path, the other 5 designers, or the floor-plan view.

---

## File structure

New / modified files after the plan completes:

```
app/
  mck-sketch.html                 — MODIFIED: see phases below
  assets/                         — NEW top-level folder
    SOURCE.txt                    — NEW: per-folder licence + source URLs
    hdri/
      studio-soft-1k.hdr          — NEW (Phase 2)
      victorian-hallway-1k.hdr    — NEW (Phase 2)
      overcast-exterior-1k.hdr    — NEW (Phase 2)
    textures/
      sapele/                     — NEW (Phase 3) — colour, normal, roughness, ao
      oak/                        — NEW (Phase 3)
      accoya/                     — NEW (Phase 3)
      paint-base/                 — NEW (Phase 3) — tintable white base
      brass/                      — NEW (Phase 3)
      satin-nickel/               — NEW (Phase 3)
      sandstone/                  — NEW (Phase 4)
      oak-parquet/                — NEW (Phase 4)
      plaster/                    — NEW (Phase 4)
```

---

# Phase 1 — Lighting calibration (exposure + shadow budget)

**Goal of phase:** stop the render from washing out to white. This is a one-function edit plus an integration check; after Phase 1 alone the doors should already look identifiably brown/wood rather than a silhouette on white.

**Outcome you should see:** reopen the Door Designer and the previously invisible door is now clearly rendered with visible stile/rail/panel shading. Material still looks procedural (that is Phase 3) but is no longer blown out.

---

### Task 1.1: Diagnose current exposure with a CDP probe (no code change)

**Files:** none — evidence gathering only.

- [ ] **Step 1: Start Electron with remote debugging.**

```bash
cd /Users/taylor/McKinlayBuilt
npx electron --remote-debugging-port=9222 . &
```

- [ ] **Step 2: Open the Door Designer manually** (click the Door Designer tile, wait for the 3D preview to render).

- [ ] **Step 3: Read current renderer state via CDP.**

```bash
python3 /tmp/cdp-eval.py '(() => {
  if (!dd3DScene) return "dd3DScene null — open the designer first";
  const r = dd3DScene.renderer;
  return {
    toneMapping: r.toneMapping,
    toneMappingExposure: r.toneMappingExposure,
    outputColorSpace: r.outputColorSpace,
    shadowType: r.shadowMap.type,
    pixelRatio: r.getPixelRatio()
  };
})()'
```

Expected: `toneMappingExposure: 1.05`, `toneMapping: 4` (ACESFilmic=4). Record the values into the commit message of Task 1.2 so we can compare.

- [ ] **Step 4: Save a reference screenshot before changes.**

```bash
python3 /tmp/cdp-eval.py 'dd3DScene.screenshot()' > /tmp/before-phase1.json
```

(This stores the `data:image/png;base64,...` URL — opening it in a browser is fine; the point is to have a before/after.)

- [ ] **Step 5: No commit** — this was a read-only probe.

---

### Task 1.2: Lower baseline exposure and balance light intensities

**Files:**
- Modify: `app/mck-sketch.html:21209` (exposure)
- Modify: `app/mck-sketch.html:21251-21287` (the six light declarations inside `createScene()`)

**What we are doing:** the scene currently totals ~2.85 units of combined directional + hemisphere light on top of a 1.05 exposure. With ACES mapping that clips mid-greys to near-white. Drop exposure, rebalance so the key light dominates and fills are subtle.

- [ ] **Step 1: Apply the exposure + lighting edit.**

Replace `app/mck-sketch.html:21209` from:

```js
  renderer.toneMappingExposure = 1.05;
```

to:

```js
  renderer.toneMappingExposure = 0.85;
```

Replace `app/mck-sketch.html:21251-21287` — the block starting `// ===== LIGHTING (product photography studio — balanced) =====` through the `scene.add(hemiLight);` line — with:

```js
  // ===== LIGHTING (product photography studio — calibrated) =====
  // Ambient kept low so shadow contrast reads; PBR materials will get most of their
  // fill from the PMREM environment map.
  const ambient = new THREE.AmbientLight(0xffffff, 0.10);
  scene.add(ambient);

  // Key light (warm, top-right) — main illumination, the only light that casts shadows.
  const keyLight = new THREE.DirectionalLight(0xfff2e0, 1.05);
  keyLight.position.set(3000, 5000, 2500);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 4096;
  keyLight.shadow.mapSize.height = 4096;
  keyLight.shadow.camera.near = 100;
  keyLight.shadow.camera.far = 14000;
  keyLight.shadow.camera.left = -5000;
  keyLight.shadow.camera.right = 5000;
  keyLight.shadow.camera.top = 5000;
  keyLight.shadow.camera.bottom = -1500;
  keyLight.shadow.bias = -0.0008;
  keyLight.shadow.normalBias = 0.5;
  keyLight.shadow.radius = 4;
  scene.add(keyLight);

  // Fill light (cool, left) — lifts shadows, no shadow cast.
  const fillLight = new THREE.DirectionalLight(0xdde8ff, 0.35);
  fillLight.position.set(-2500, 2000, 1200);
  scene.add(fillLight);

  // Rim light (behind) — edge separation.
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.15);
  rimLight.position.set(0, 1500, -3000);
  scene.add(rimLight);

  // Back fill (opposite key) — softens shadow side a little.
  const backFill = new THREE.DirectionalLight(0xf0f0ff, 0.10);
  backFill.position.set(-3000, 3000, -1500);
  scene.add(backFill);

  // Hemisphere (sky/ground bounce) — very subtle.
  const hemiLight = new THREE.HemisphereLight(0xdce8ff, 0xb8a890, 0.12);
  scene.add(hemiLight);
```

Total light budget drops from ~2.85 → ~1.77; with exposure 0.85 the scene lands roughly in the "product photo" middle range.

- [ ] **Step 2: Let electron-reload pick up the change.** The window reloads automatically. If it does not, `Cmd+R` in the Electron window.

- [ ] **Step 3: Verify via CDP that the new values are live.**

```bash
python3 /tmp/cdp-eval.py '({ exposure: dd3DScene.renderer.toneMappingExposure, keyCount: dd3DScene.scene.children.filter(o=>o.isDirectionalLight).length })'
```

Expected: `{ "exposure": 0.85, "keyCount": 4 }` (key + fill + rim + backFill).

- [ ] **Step 4: Visual check — open Door Designer, compare against `/tmp/refs/shot1.png`.** The door should now be visible with clear shading. If the door instead looks too dark, note the CDP `exposure` value and raise it in 0.05 increments (retry Task 1.2 Step 1 with 0.90, 0.95); do not exceed 1.0. Re-save screenshot to `/tmp/after-phase1.json`.

- [ ] **Step 5: Check the Window Designer too.** Open it, confirm the same exposure fix is live there (`wd3DScene.renderer.toneMappingExposure` === 0.85). Because both designers share `createScene()`, one change fixes both — verify that assumption.

- [ ] **Step 6: Commit.**

```bash
git add app/mck-sketch.html
git commit -m "fix: calibrate 3D scene exposure and lighting budget

Exposure 1.05->0.85, combined light intensity 2.85->1.77.
Fixes the blown-out white renders in Door and Window Designers
(see /tmp/refs/shot1.png and shot4.png for the before state)."
```

---

### Task 1.3: Tighten GTAO + bloom to stop highlight smear

**Files:** Modify `app/mck-sketch.html:21294-21301` (GTAO and bloom passes).

**Why:** with the old exposure, bloom at 0.08 + GTAO radius 1.5 was papering over exposure clipping. After Task 1.2 those effects now dominate unnecessarily.

- [ ] **Step 1: Edit the GTAO and bloom parameters.** Replace the block at `L21294-L21301` from:

```js
  const gtaoPass = new GTAOPass(scene, camera, w, h);
  gtaoPass.output = GTAOPass.OUTPUT.Default;
  gtaoPass.updateGtaoMaterial({ radius: 1.5, distanceExponent: 2, thickness: 10, scale: 1.2 });
  gtaoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, samples: 16 });
  composer.addPass(gtaoPass);
  // Bloom (specular highlights on glass and metallic hardware)
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.08, 0.35, 0.82);
  composer.addPass(bloomPass);
```

to:

```js
  const gtaoPass = new GTAOPass(scene, camera, w, h);
  gtaoPass.output = GTAOPass.OUTPUT.Default;
  // Tighter AO: smaller radius finds joints/edges without darkening flat surfaces.
  gtaoPass.updateGtaoMaterial({ radius: 0.6, distanceExponent: 2, thickness: 8, scale: 1.0 });
  gtaoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, samples: 16 });
  composer.addPass(gtaoPass);
  // Bloom — high threshold so only real specular highlights (glass, brass) bloom.
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.05, 0.4, 0.92);
  composer.addPass(bloomPass);
```

- [ ] **Step 2: Reload and visually verify** the door preview. Expected: joints around panels and rails are subtly darker than flat surfaces (good AO), glass still has a gentle highlight, the body of the door is NOT hazed over by bloom.

- [ ] **Step 3: Commit.**

```bash
git add app/mck-sketch.html
git commit -m "fix: tighten GTAO radius and raise bloom threshold

Smaller AO radius reveals joints without darkening flat surfaces;
higher bloom threshold keeps bloom to real specular highlights only."
```

---

### Task 1.4: Phase 1 acceptance check

- [ ] **Step 1: Open Door Designer.** Confirm: door is clearly visible (not white), hardware has readable highlights (not blown out), shadow under the door is soft and present (not crushed black).

- [ ] **Step 2: Open Window Designer.** Same check — sash frame clearly legible, glass still transmits.

- [ ] **Step 3: Update HANDOVER.md** — add a one-line entry under "What was done this session" noting Phase 1 of 3D realism is complete. No commit yet if you plan to do Phase 2 immediately; otherwise commit it.

**End of Phase 1. Taylor should visibly see improvement here before moving on.**

---

# Phase 2 — HDRI environments + Product / Interior / Exterior mode toggle

**Goal of phase:** replace the painted gradient background with real photographic HDRI environments, and add a UI toggle so the user can flip between three presentation modes. The room geometry is placeholder in this phase (just a ground plane) — rich geometry comes in Phase 4.

**Outcome you should see:** reflections on brass handles and glass suddenly look real (they are sampling a real scene, not a synthetic roomEnvironment). Three buttons (Product / Interior / Exterior) appear in both designer sidebars; clicking between them swaps the backdrop.

---

### Task 2.1: Source and bundle three CC0 HDRI environment maps

**Files:** Create
- `app/assets/SOURCE.txt`
- `app/assets/hdri/studio-soft-1k.hdr`
- `app/assets/hdri/victorian-hallway-1k.hdr`
- `app/assets/hdri/overcast-exterior-1k.hdr`

- [ ] **Step 1: Create the assets folder.**

```bash
mkdir -p /Users/taylor/McKinlayBuilt/app/assets/hdri
```

- [ ] **Step 2: Download the three HDRIs from Poly Haven (CC0).** Use the **1K** `.hdr` variants (~1 MB each):

| Target filename | Poly Haven slug | Direct URL |
|---|---|---|
| `studio-soft-1k.hdr` | `studio_small_08` | `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_08_1k.hdr` |
| `victorian-hallway-1k.hdr` | `hall_of_mammals` | `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/hall_of_mammals_1k.hdr` |
| `overcast-exterior-1k.hdr` | `kloofendal_overcast_puresky` | `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_overcast_puresky_1k.hdr` |

Fallback slugs if any of the above 404: `photo_studio_01`, `artist_workshop`, `cloudy_morning`.

Download with:

```bash
cd /Users/taylor/McKinlayBuilt/app/assets/hdri
curl -L -o studio-soft-1k.hdr https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_08_1k.hdr
curl -L -o victorian-hallway-1k.hdr https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/hall_of_mammals_1k.hdr
curl -L -o overcast-exterior-1k.hdr https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_overcast_puresky_1k.hdr
```

- [ ] **Step 3: Verify file sizes are sane (0.8–1.8 MB each).**

```bash
ls -lh /Users/taylor/McKinlayBuilt/app/assets/hdri/
```

Expected: three files, each ~1 MB. If any is under 100 KB it is likely an HTML error page from a failed download — re-fetch.

- [ ] **Step 4: Write `app/assets/SOURCE.txt` with provenance info.**

```
HDRIs — CC0 licence, source: Poly Haven (https://polyhaven.com)

studio-soft-1k.hdr           studio_small_08        https://polyhaven.com/a/studio_small_08
victorian-hallway-1k.hdr     hall_of_mammals       https://polyhaven.com/a/hall_of_mammals
overcast-exterior-1k.hdr     kloofendal_overcast_puresky   https://polyhaven.com/a/kloofendal_overcast_puresky

CC0 licence means: free for any use, no attribution required. Attribution
kept here voluntarily as provenance record.
```

- [ ] **Step 5: Commit.**

```bash
git add app/assets/hdri/ app/assets/SOURCE.txt
git commit -m "feat: bundle CC0 HDRI environments for 3D designers

Three 1K HDRIs (~3 MB total): studio, victorian hallway, overcast exterior.
Source: Poly Haven (CC0)."
```

---

### Task 2.2: Add `RGBELoader` import and `SCENE_MODES` table

**Files:** Modify `app/mck-sketch.html` — the import map near the top of the first `<script type="module">` block.

- [ ] **Step 1: Find the Three.js import block.** Grep for `OrbitControls` import line. Note the line number.

- [ ] **Step 2: Add the `RGBELoader` import** on a new line directly below the existing `OrbitControls` import:

```js
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
```

- [ ] **Step 3: Add the `SCENE_MODES` constant** directly above the `createScene(` function declaration at `L21196`:

```js
// ===== SCENE MODES =====
// Used by the Product/Interior/Exterior mode toggle in Door and Window designers.
// Each mode binds an HDRI environment, a tone-mapping exposure, and later (Phase 4)
// a room-context preset.
const SCENE_MODES = {
  product: {
    label: 'Product',
    hdr: 'app/assets/hdri/studio-soft-1k.hdr',
    exposure: 0.85,
    background: 'gradient', // keep the grey studio gradient as backplate
    context: null
  },
  interior: {
    label: 'Interior',
    hdr: 'app/assets/hdri/victorian-hallway-1k.hdr',
    exposure: 0.95,
    background: 'hdr',
    context: 'victorian-hallway'   // implemented in Phase 4
  },
  exterior: {
    label: 'Exterior',
    hdr: 'app/assets/hdri/overcast-exterior-1k.hdr',
    exposure: 1.00,
    background: 'hdr',
    context: 'sandstone-exterior'  // implemented in Phase 4
  }
};
// Currently active mode for each designer scene. Keyed by scene object reference.
const _sceneModeState = new WeakMap();
```

- [ ] **Step 4: Commit.**

```bash
git add app/mck-sketch.html
git commit -m "feat: add RGBELoader import and SCENE_MODES table

Prep for Product/Interior/Exterior mode toggle."
```

---

### Task 2.3: Implement `applySceneMode(sceneObj, mode)`

**Files:** Modify `app/mck-sketch.html` — add a new function directly below the `SCENE_MODES` constant added in Task 2.2.

- [ ] **Step 1: Add the `applySceneMode` function.**

```js
// Apply a scene mode to an existing scene object produced by createScene().
// Loads the HDRI asynchronously, swaps the environment map, and (if background
// is 'hdr') uses the HDRI as the visible background too.
function applySceneMode(sceneObj, modeKey) {
  const mode = SCENE_MODES[modeKey];
  if (!mode) { console.warn('Unknown scene mode:', modeKey); return; }
  const { scene, renderer } = sceneObj;

  _sceneModeState.set(sceneObj, modeKey);
  renderer.toneMappingExposure = mode.exposure;

  const pmrem = new THREE.PMREMGenerator(renderer);
  new RGBELoader().load(mode.hdr, (hdrTex) => {
    const envMap = pmrem.fromEquirectangular(hdrTex).texture;
    scene.environment = envMap;
    if (mode.background === 'hdr') {
      scene.background = envMap;
    }
    hdrTex.dispose();
    pmrem.dispose();
    if (sceneObj.composer) sceneObj.composer.render();
  }, undefined, (err) => {
    console.error('HDRI load failed for mode', modeKey, err);
  });

  // Phase 4 will handle mode.context (add/remove room geometry).
}

// Get the currently active mode for a scene, defaulting to 'product'.
function getSceneMode(sceneObj) {
  return _sceneModeState.get(sceneObj) || 'product';
}
```

- [ ] **Step 2: Expose the helpers on `window.mck3D`.** Grep for the existing `window.mck3D = {` assignment and add `applySceneMode, getSceneMode, SCENE_MODES` to the exported object.

- [ ] **Step 3: Reload; verify the functions exist via CDP.**

```bash
python3 /tmp/cdp-eval.py 'typeof window.mck3D.applySceneMode'
```

Expected: `{"result": "function"}`.

- [ ] **Step 4: Try applying a mode manually from CDP** to confirm the pipeline works before wiring UI.

```bash
python3 /tmp/cdp-eval.py 'window.mck3D.applySceneMode(dd3DScene, "interior"); setTimeout(()=>{}, 500); "applied"'
```

Look at the Door Designer — after ~1 second the background should change from the grey gradient to the victorian hallway HDRI. If it stays grey, check DevTools console for `HDRI load failed`.

- [ ] **Step 5: Commit.**

```bash
git add app/mck-sketch.html
git commit -m "feat: implement applySceneMode() for HDRI environment swapping

Loads a Poly Haven HDRI, converts to PMREM, sets scene.environment
(and optionally scene.background). Exposes via window.mck3D."
```

---

### Task 2.4: Change default scene init to use Product mode HDRI

**Files:** Modify `app/mck-sketch.html` — inside `createScene()` at `L21230-L21234` (the `RoomEnvironment` init block).

**Why:** `RoomEnvironment` is a synthetic lightbox — fine as a fallback but worse than our studio HDRI. Switch the default.

- [ ] **Step 1: Keep the existing `RoomEnvironment` init as a synchronous fallback, then async-upgrade to HDRI.** Replace `L21230-L21234`:

```js
  // Environment map for reflections
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envTexture = pmremGenerator.fromScene(new RoomEnvironment()).texture;
  scene.environment = envTexture;
  pmremGenerator.dispose();
```

with:

```js
  // Initial synchronous environment: RoomEnvironment (used for the first frame
  // only). An HDRI from SCENE_MODES.product is loaded async immediately after
  // and replaces it.
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const fallbackEnv = pmremGenerator.fromScene(new RoomEnvironment()).texture;
  scene.environment = fallbackEnv;
  pmremGenerator.dispose();
```

And, just before the `function animate()` declaration inside `createScene()` (around `L21307`), append:

```js
  // Upgrade env to the Product-mode HDRI as soon as possible.
  const sceneObj = { renderer, scene, camera, controls, composer, screenshot, resize };
  Promise.resolve().then(() => applySceneMode(sceneObj, 'product'));
```

Make sure the existing `return { renderer, scene, camera, controls, composer, screenshot, resize };` line at the bottom of `createScene()` now becomes `return sceneObj;` and every property it exposed is defined on `sceneObj` first. Read `L21307-end-of-function` to confirm the exact structure before editing.

- [ ] **Step 2: Reload; confirm Door Designer loads with Product HDRI by default.**

```bash
python3 /tmp/cdp-eval.py 'window.mck3D.getSceneMode(dd3DScene)'
```

Expected: `"product"`.

- [ ] **Step 3: Commit.**

```bash
git add app/mck-sketch.html
git commit -m "feat: default designer scenes to Product HDRI environment

Replaces synthetic RoomEnvironment with Poly Haven studio HDRI
for more realistic reflections on hardware and glass."
```

---

### Task 2.5: Add Product / Interior / Exterior mode toggle UI to Door Designer

**Files:** Modify `app/mck-sketch.html`:
- The Door Designer sidebar HTML (grep for `dd3DReset` to find the 3D-view toolbar — it's near `L5300-L5500`).
- The JS handler in the `dd3D*` function cluster (`L29476-L29510`).

- [ ] **Step 1: Locate the Door Designer 3D view toolbar.** Grep for `dd3DReset` or `dd-3d-` to find the button row in the HTML.

- [ ] **Step 2: Add a mode selector above those buttons.** Insert inside the 3D-view toolbar (exact placement: right before the Reset button):

```html
<div class="dd-mode-toggle" style="display:flex;gap:4px;margin-right:8px">
  <button type="button" class="fp-tool-btn dd-mode-btn is-active" data-mode="product" onclick="ddSetMode('product')">Product</button>
  <button type="button" class="fp-tool-btn dd-mode-btn" data-mode="interior" onclick="ddSetMode('interior')">Interior</button>
  <button type="button" class="fp-tool-btn dd-mode-btn" data-mode="exterior" onclick="ddSetMode('exterior')">Exterior</button>
</div>
```

- [ ] **Step 3: Add scoped CSS** (put it near the other `.dd-*` rules, grep for `.dd-row`):

```css
.dd-mode-btn { padding: 4px 10px; font-size: 12px; }
.dd-mode-btn.is-active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }
```

- [ ] **Step 4: Add the `ddSetMode()` function** next to the other `dd3D*` functions (after `dd3DUpdate`, around `L29495`):

```js
function ddSetMode(modeKey) {
  if (!dd3DScene || !window.mck3D) return;
  window.mck3D.applySceneMode(dd3DScene, modeKey);
  document.querySelectorAll('.dd-mode-btn').forEach(b => {
    b.classList.toggle('is-active', b.dataset.mode === modeKey);
  });
}
window.ddSetMode = ddSetMode;
```

- [ ] **Step 5: Reload; click each of the three buttons.** Expected: each click swaps the background and reflections visibly within ~0.5s. Active button gains the gold border. Product mode shows the grey studio gradient (since `background === 'gradient'`, scene.background is left alone) but reflections still sample the studio HDRI.

- [ ] **Step 6: Commit.**

```bash
git add app/mck-sketch.html
git commit -m "feat: add Product/Interior/Exterior mode toggle to Door Designer

Three buttons in the 3D view toolbar swap HDRI environment + exposure."
```

---

### Task 2.6: Same toggle for Window Designer

**Files:** Modify `app/mck-sketch.html` — the Window Designer 3D toolbar HTML and the `wd3D*` function cluster (`L30365-L30389`).

- [ ] **Step 1: Find the Window Designer 3D toolbar.** Grep for `wd3DReset`.

- [ ] **Step 2: Insert the same toggle markup**, with class prefix `wd-` instead of `dd-`:

```html
<div class="wd-mode-toggle" style="display:flex;gap:4px;margin-right:8px">
  <button type="button" class="fp-tool-btn wd-mode-btn is-active" data-mode="product" onclick="wdSetMode('product')">Product</button>
  <button type="button" class="fp-tool-btn wd-mode-btn" data-mode="interior" onclick="wdSetMode('interior')">Interior</button>
  <button type="button" class="fp-tool-btn wd-mode-btn" data-mode="exterior" onclick="wdSetMode('exterior')">Exterior</button>
</div>
```

- [ ] **Step 3: Add matching CSS** (next to `.dd-mode-btn`):

```css
.wd-mode-btn { padding: 4px 10px; font-size: 12px; }
.wd-mode-btn.is-active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }
```

- [ ] **Step 4: Add the `wdSetMode()` function** next to the other `wd3D*` functions:

```js
function wdSetMode(modeKey) {
  if (!wd3DScene || !window.mck3D) return;
  window.mck3D.applySceneMode(wd3DScene, modeKey);
  document.querySelectorAll('.wd-mode-btn').forEach(b => {
    b.classList.toggle('is-active', b.dataset.mode === modeKey);
  });
}
window.wdSetMode = wdSetMode;
```

- [ ] **Step 5: Reload; verify toggling works in the Window Designer.**

- [ ] **Step 6: Commit.**

```bash
git add app/mck-sketch.html
git commit -m "feat: add Product/Interior/Exterior mode toggle to Window Designer"
```

---

### Task 2.7: Phase 2 acceptance check

- [ ] **Step 1: Open Door Designer, click Interior.** Brass/chrome hardware should now reflect warm indoor tones.
- [ ] **Step 2: Click Exterior.** Hardware should reflect cool overcast sky; glass should pick up lighter highlights.
- [ ] **Step 3: Click Product.** Back to grey studio.
- [ ] **Step 4: Repeat for Window Designer.**
- [ ] **Step 5: No new commit needed** — each task committed its own changes.

**End of Phase 2.**

---

# Phase 3 — PBR material overhaul + heritage paint colour library + paint picker rebuild

**Goal of phase:** replace the procedural canvas textures produced by `getMaterial()` with real 1K PBR texture sets (colour / normal / roughness / AO) for the finishes Taylor actually sells, AND add the 10 heritage paint brands so the picker shows branded swatches.

**Outcome you should see:** "sapele" now looks like a photograph of actual sapele wood. Brass, chrome, and satin nickel hardware look like real metal. Paint swatches show Farrow & Ball "Railings" as #3a3c3e with the exact grain and sheen of eggshell paint. The paint picker has a "Brand" dropdown with all 10 brands; picking one filters the colour list to that brand.

---

### Task 3.1: Source and bundle PBR texture sets

**Files:** Create `app/assets/textures/<name>/` for each of: sapele, oak, accoya, paint-base, brass, satin-nickel. (`chrome`, `matt-black`, `antique-bronze` stay material-only, no textures needed.)

Each folder should contain four files: `color.jpg`, `normal.jpg`, `roughness.jpg`, `ao.jpg`, plus a `SOURCE.txt`.

- [ ] **Step 1: Create folders.**

```bash
mkdir -p /Users/taylor/McKinlayBuilt/app/assets/textures/{sapele,oak,accoya,paint-base,brass,satin-nickel}
```

- [ ] **Step 2: Download CC0 sets from Poly Haven.** Suggested slugs (all CC0, all 1K):

| Folder | Poly Haven slug | Notes |
|---|---|---|
| `sapele` | `mahogany_wood` | Reddish-brown hardwood — best visual match for sapele |
| `oak` | `wood_table_001` | Classic oak grain |
| `accoya` | `plywood` (tinted beige in material) | No dedicated set; tint a clean softwood |
| `paint-base` | `painted_plaster_wall` | Flat paint base; tint via `material.color` |
| `brass` | `brass_patina` | Darker, aged brass — suits period doors |
| `satin-nickel` | `brushed_metal` | Brushed nickel look |

For each slug, download the 4 maps from `https://polyhaven.com/a/<slug>`. Pull `diff_1k.jpg`, `nor_gl_1k.jpg`, `rough_1k.jpg`, `ao_1k.jpg` and rename to `color.jpg`, `normal.jpg`, `roughness.jpg`, `ao.jpg` inside each folder.

If any specific slug 404s, pick a visually similar CC0 set from Poly Haven or ambientCG and note the actual slug used in `SOURCE.txt`.

- [ ] **Step 3: Verify each folder** has exactly four `.jpg` files each around 100–400 KB.

```bash
ls -lh /Users/taylor/McKinlayBuilt/app/assets/textures/sapele/
```

- [ ] **Step 4: Append to `app/assets/SOURCE.txt`** one line per texture set:

```
Textures — CC0, source: Poly Haven

sapele/           mahogany_wood    https://polyhaven.com/a/mahogany_wood
oak/              wood_table_001   https://polyhaven.com/a/wood_table_001
accoya/           plywood          https://polyhaven.com/a/plywood     (tinted beige)
paint-base/       painted_plaster_wall   https://polyhaven.com/a/painted_plaster_wall
brass/            brass_patina     https://polyhaven.com/a/brass_patina
satin-nickel/     brushed_metal    https://polyhaven.com/a/brushed_metal
```

- [ ] **Step 5: Commit.**

```bash
git add app/assets/textures/ app/assets/SOURCE.txt
git commit -m "feat: bundle CC0 PBR texture sets for door/window materials"
```

---

### Task 3.2: Add `getPBRMaterial()` alongside existing `getMaterial()`

**Files:** Modify `app/mck-sketch.html` — add a new function directly below `getMaterial()` closing brace (grep `return mat;` inside the file to find the end of `getMaterial`).

**Scope:** `getPBRMaterial()` is NEW — it does not replace `getMaterial()`. The existing function stays intact so the other 5 designers keep working unchanged.

- [ ] **Step 1: Add the loader + material cache plumbing.** Directly above the new function:

```js
// ===== PBR MATERIAL LIBRARY (doors + windows only) =====
const _pbrTextureLoader = new THREE.TextureLoader();
const _pbrCache = {};           // keyed by material type + colour
const _pbrTextureSetCache = {}; // keyed by texture set name (e.g. 'sapele')

// Load a texture set from app/assets/textures/<name>/ synchronously-ish:
// returns { map, normal, roughness, ao } where each is a THREE.Texture whose
// onLoad triggers a single scene re-render.
function _loadPBRTextureSet(name, onLoaded) {
  if (_pbrTextureSetCache[name]) return _pbrTextureSetCache[name];
  const base = `app/assets/textures/${name}/`;
  const trigger = () => { if (onLoaded) onLoaded(); };
  const tex = (file, colorSpace) => {
    const t = _pbrTextureLoader.load(base + file, trigger);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (colorSpace) t.colorSpace = colorSpace;
    return t;
  };
  const set = {
    map:       tex('color.jpg', THREE.SRGBColorSpace),
    normal:    tex('normal.jpg'),
    roughness: tex('roughness.jpg'),
    ao:        tex('ao.jpg')
  };
  _pbrTextureSetCache[name] = set;
  return set;
}
```

- [ ] **Step 2: Add `getPBRMaterial(type, color)`.**

```js
// Public: returns a MeshStandardMaterial (or MeshPhysicalMaterial for glass)
// using real PBR textures. Valid types: 'sapele', 'oak', 'accoya', 'painted',
// 'brass', 'chrome', 'satin-nickel', 'matt-black', 'antique-bronze', 'glass'.
// For 'painted', pass the hex colour (the painted base is tinted by material.color).
function getPBRMaterial(type, color) {
  const key = type + (color || '');
  if (_pbrCache[key]) return _pbrCache[key];

  const woodTint = {
    sapele:  0xc8785a,  // warm reddish brown
    oak:     0xd2a45a,
    accoya:  0xd8c89a,  // softwood honey
  };

  let mat;
  if (type === 'sapele' || type === 'oak' || type === 'accoya') {
    const set = _loadPBRTextureSet(type);
    mat = new THREE.MeshStandardMaterial({
      map: set.map,
      normalMap: set.normal,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughnessMap: set.roughness,
      roughness: 1.0,
      aoMap: set.ao,
      aoMapIntensity: 0.8,
      metalness: 0.0,
      color: new THREE.Color(woodTint[type]),
      envMapIntensity: 0.9
    });
  } else if (type === 'painted') {
    const set = _loadPBRTextureSet('paint-base');
    mat = new THREE.MeshStandardMaterial({
      map: set.map,
      normalMap: set.normal,
      normalScale: new THREE.Vector2(0.15, 0.15),
      roughnessMap: set.roughness,
      roughness: 0.55,
      aoMap: set.ao,
      aoMapIntensity: 0.5,
      metalness: 0.0,
      color: new THREE.Color(color || '#3a3a3c'),
      envMapIntensity: 0.8
    });
  } else if (type === 'brass') {
    const set = _loadPBRTextureSet('brass');
    mat = new THREE.MeshStandardMaterial({
      map: set.map,
      normalMap: set.normal,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughnessMap: set.roughness,
      roughness: 0.3,
      metalness: 1.0,
      envMapIntensity: 1.4
    });
  } else if (type === 'satin-nickel') {
    const set = _loadPBRTextureSet('satin-nickel');
    mat = new THREE.MeshStandardMaterial({
      map: set.map,
      normalMap: set.normal,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: set.roughness,
      roughness: 0.35,
      metalness: 1.0,
      color: 0xd8d4cc,
      envMapIntensity: 1.1
    });
  } else if (type === 'chrome') {
    mat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee, roughness: 0.03, metalness: 1.0, envMapIntensity: 1.8
    });
  } else if (type === 'matt-black') {
    mat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a, roughness: 0.7, metalness: 0.85, envMapIntensity: 0.5
    });
  } else if (type === 'antique-bronze') {
    mat = new THREE.MeshStandardMaterial({
      color: 0x6b4c2a, roughness: 0.45, metalness: 0.85, envMapIntensity: 0.8
    });
  } else if (type === 'glass') {
    mat = new THREE.MeshPhysicalMaterial({
      color: 0xeaf2f5,
      roughness: 0.02,
      metalness: 0.0,
      transmission: 0.95,
      thickness: 6,
      ior: 1.52,
      transparent: true,
      opacity: 0.35,
      envMapIntensity: 1.3,
      specularIntensity: 1.0,
      specularColor: 0xffffff,
      reflectivity: 0.5
    });
  } else {
    // Unknown type — fall back to procedural getMaterial().
    console.warn('getPBRMaterial: unknown type, falling back to getMaterial:', type);
    return getMaterial(type, color);
  }

  _pbrCache[key] = mat;
  return mat;
}
```

- [ ] **Step 3: Expose on `window.mck3D`** (append to the existing export object).

- [ ] **Step 4: Commit.**

```bash
git add app/mck-sketch.html
git commit -m "feat: add getPBRMaterial() using bundled PBR texture sets

Parallel to getMaterial(); doors/windows migrate in next tasks."
```

---

### Task 3.3: Migrate `buildDoor3D()` call sites from `getMaterial` → `getPBRMaterial`

**Files:** Modify `app/mck-sketch.html` — inside `buildDoor3D()` (starts at `L21855`) and anywhere else the door-specific building functions reference `getMaterial(...)`.

- [ ] **Step 1: Find every `getMaterial(` inside `buildDoor3D`.** Grep within the function body:

```
Grep pattern: getMaterial\(
```

Confirm matches are within the door-build code path (not the other 5 designers). Record every line number.

- [ ] **Step 2: Replace each call with `getPBRMaterial(`.** Do this one at a time, reading the surrounding context each time. Only migrate types the PBR function supports: `sapele`, `oak`, `accoya`, `painted`, `brass`, `chrome`, `satin-nickel`, `matt-black`, `antique-bronze`, `glass`. If any call uses a type like `walnut` or `pine` that Taylor does not sell for doors, leave as-is (the fallback branch in `getPBRMaterial` still handles it).

- [ ] **Step 3: Reload; open Door Designer; step through every timber option in the sidebar** (Sapele / Oak / Accoya). Each should now show photographic grain. If a wood option shows a blank grey, texture load failed — check DevTools network tab for 404 on `app/assets/textures/<name>/color.jpg`.

- [ ] **Step 4: Step through every hardware finish.** Brass / Chrome / Satin Nickel / Matt Black / Antique Bronze.

- [ ] **Step 5: Commit.**

```bash
git add app/mck-sketch.html
git commit -m "feat: migrate Door Designer materials to PBR textures

buildDoor3D now uses getPBRMaterial for sapele, oak, accoya, painted,
brass, chrome, satin-nickel, matt-black, antique-bronze, glass."
```

---

### Task 3.4: Migrate `buildWindow3D()` call sites to `getPBRMaterial`

**Files:** Modify `app/mck-sketch.html` — inside `buildWindow3D()` (grep for the function declaration).

- [ ] **Step 1: Grep for `getMaterial(` within `buildWindow3D`'s body.** Same approach as Task 3.3.
- [ ] **Step 2: Replace each with `getPBRMaterial(`.**
- [ ] **Step 3: Reload; step through every timber in the Window Designer.**
- [ ] **Step 4: Commit.**

```bash
git add app/mck-sketch.html
git commit -m "feat: migrate Window Designer materials to PBR textures"
```

---

### Task 3.5: Expand `PAINT_COLOURS` to 10 heritage brands (full data)

**Files:** Modify `app/mck-sketch.html` — the `PAINT_COLOURS` object at `L27951`.

**Scope:** existing keys `ral`, `farrow` (~49 colours), `little-greene` (~29), `dulux` (~27) stay. Add/expand:

1. **`farrow`** — top up to ~132 colours (full current F&B range).
2. **`little-greene`** — top up to ~200 colours.
3. Add **`paint-and-paper-library`** — ~200 colours (Architectural I–V + Originals).
4. Add **`mylands`** — ~100 colours (Colours of London + Heritage).
5. Add **`edward-bulmer`** — ~100 colours.
6. Add **`craig-and-rose`** — ~100 colours (1829 Vintage + Archive).
7. Add **`fired-earth`** — ~150 colours.
8. Add **`dulux-heritage`** — ~100 colours (distinct from existing `dulux` key).
9. Add **`neptune`** — ~40 colours (Chichester collection).
10. Add **`benjamin-moore-historical`** — ~180 colours.

Existing `dulux` key is the **Trade** range — leave it in place for backwards compatibility. `dulux-heritage` is a separate key.

**Data source:** the engineer implementing this must pull colour lists from each brand's current published colour card. This is public factual data. Prefer:
- The brand's downloadable PDF colour chart.
- A trusted third-party listing (e.g. `encycolorpedia.com/farrow-and-ball`).

Each entry follows the existing shape:

```js
{ code: '<brand code>', name: '<colour name>', hex: '#rrggbb' }
```

- [ ] **Step 1: Prepare per-brand draft files.** To keep the diff manageable, write each brand's array to a separate temporary file first.

```bash
mkdir -p /tmp/paints
```

For each brand, save a file like `/tmp/paints/farrow.js` containing the full array.

- [ ] **Step 2: Verify hex values look sensible.** Spot-check ~5 random entries per brand against the brand's published colour card (open the URL, compare visually). If a hex looks clearly wrong (e.g. Farrow & Ball "Hague Blue" comes out pink), the source was wrong — find another.

- [ ] **Step 3: Paste each brand array into `PAINT_COLOURS` inside `app/mck-sketch.html`.** Expected final shape:

```js
const PAINT_COLOURS = {
  ral: [ /* unchanged */ ],
  farrow: [ /* expanded to ~132 */ ],
  'little-greene': [ /* expanded to ~200 */ ],
  'paint-and-paper-library': [ /* new, ~200 */ ],
  mylands: [ /* new, ~100 */ ],
  'edward-bulmer': [ /* new, ~100 */ ],
  'craig-and-rose': [ /* new, ~100 */ ],
  'fired-earth': [ /* new, ~150 */ ],
  dulux: [ /* unchanged Dulux Trade */ ],
  'dulux-heritage': [ /* new, ~100 */ ],
  neptune: [ /* new, ~40 */ ],
  'benjamin-moore-historical': [ /* new, ~180 */ ]
};
```

- [ ] **Step 4: Sanity-count via CDP.**

```bash
python3 /tmp/cdp-eval.py 'Object.fromEntries(Object.entries(PAINT_COLOURS).map(([k,v]) => [k, v.length]))'
```

Expected: each brand roughly matches the target count (±10%). Total ~1,300.

- [ ] **Step 5: Commit.**

```bash
git add app/mck-sketch.html
git commit -m "feat: expand PAINT_COLOURS to 10 heritage paint brands (~1,300 colours)

Adds Paint & Paper Library, Mylands, Edward Bulmer, Craig & Rose,
Fired Earth, Dulux Heritage, Neptune, Benjamin Moore Historical;
expands Farrow & Ball and Little Greene to their full ranges."
```

---

### Task 3.6: Update Door Designer paint-brand dropdown options

**Files:** Modify `app/mck-sketch.html:5319-5325` (the `<select id="dd-paint-brand">` markup).

- [ ] **Step 1: Replace the `<option>` list** at `L5320-L5324` with:

```html
<option value="farrow">Farrow &amp; Ball</option>
<option value="little-greene">Little Greene</option>
<option value="paint-and-paper-library">Paint &amp; Paper Library</option>
<option value="mylands">Mylands</option>
<option value="edward-bulmer">Edward Bulmer</option>
<option value="craig-and-rose">Craig &amp; Rose</option>
<option value="fired-earth">Fired Earth</option>
<option value="dulux-heritage">Dulux Heritage</option>
<option value="neptune">Neptune</option>
<option value="benjamin-moore-historical">Benjamin Moore Historical</option>
<option value="ral">RAL Classic</option>
<option value="dulux">Dulux Trade</option>
<option value="custom">Custom RAL/Colour</option>
```

- [ ] **Step 2: Change the default `paintBrand` in `doorDesign`** at `L26403` from `paintBrand: 'ral',` to `paintBrand: 'farrow',` so first-open shows the Farrow & Ball palette.

- [ ] **Step 3: Reload; open Door Designer; confirm** the brand dropdown lists all 13 options and defaulting to Farrow & Ball populates the colour list with real F&B colours.

- [ ] **Step 4: Commit.**

```bash
git add app/mck-sketch.html
git commit -m "feat: list all 10 heritage paint brands in Door Designer picker

Default brand now Farrow & Ball (was RAL)."
```

---

### Task 3.7: Rebuild the colour picker as a swatch grid (not a plain select)

**Files:** Modify `app/mck-sketch.html` — the markup at `L5327-L5332` and the function `ddUpdatePaintColours()` at `L26782`.

**Why:** a `<select>` with 200 colours is unusable. A clickable swatch grid lets Taylor see the colour.

- [ ] **Step 1: Replace the `<select id="dd-paint-colour">` with a grid container.**

At `L5327-L5332`, change from:

```html
<div class="dd-field">
  <label>Colour</label>
  <select id="dd-paint-colour" onchange="updateDoorDesign()">
    <option value="">Select colour...</option>
  </select>
</div>
```

to:

```html
<div class="dd-field dd-colour-field">
  <label>Colour <span id="dd-paint-colour-label" class="dd-colour-label"></span></label>
  <div id="dd-paint-colour-grid" class="dd-colour-grid"></div>
</div>
```

- [ ] **Step 2: Add scoped CSS** (near `.dd-mode-btn`):

```css
.dd-colour-field { width: 100%; }
.dd-colour-label { color: var(--fg-muted); font-weight: 400; margin-left: 6px; font-size: 11px; }
.dd-colour-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(26px, 1fr));
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;
  padding: 4px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 4px;
}
.dd-colour-swatch {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 3px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 80ms;
}
.dd-colour-swatch:hover { transform: scale(1.15); }
.dd-colour-swatch.is-active { border-color: var(--accent); }
```

- [ ] **Step 3: Rewrite `ddUpdatePaintColours()` at `L26782`** to populate the grid and handle clicks — using safe DOM methods (no `innerHTML`):

```js
function ddUpdatePaintColours() {
  const brand = document.getElementById('dd-paint-brand').value;
  const grid = document.getElementById('dd-paint-colour-grid');
  const label = document.getElementById('dd-paint-colour-label');
  if (!grid) return;

  grid.replaceChildren();
  if (label) label.textContent = '';

  const colours = PAINT_COLOURS[brand] || [];
  colours.forEach(c => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dd-colour-swatch';
    btn.style.backgroundColor = c.hex;
    btn.title = `${c.code} - ${c.name}`;
    btn.dataset.hex = c.hex;
    btn.dataset.code = c.code;
    btn.dataset.name = c.name;
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.dd-colour-swatch').forEach(s => s.classList.remove('is-active'));
      btn.classList.add('is-active');
      doorDesign.paintColour = c.hex;
      if (label) label.textContent = `${c.code} - ${c.name}`;
      updateDoorDesign();
    });
    grid.appendChild(btn);
  });

  // Pre-select if the current doorDesign.paintColour matches one of these.
  if (doorDesign.paintColour) {
    const match = grid.querySelector(`[data-hex="${doorDesign.paintColour}"]`);
    if (match) {
      match.classList.add('is-active');
      if (label) label.textContent = `${match.dataset.code} - ${match.dataset.name}`;
    }
  }

  updateDoorDesign();
}
```

- [ ] **Step 4: Remove the now-unused `<select>`-based branch** in `ddUpdateColourPreview()` at `L26819-L26822` (which reads from `.selectedOptions`). Replace those lines with a grid-aware lookup:

```js
    colour = doorDesign.paintColour;
    const brand = doorDesign.paintBrand;
    const entry = (PAINT_COLOURS[brand] || []).find(c => c.hex === colour);
    label = entry ? `${entry.code} - ${entry.name}` : 'Select a colour';
```

- [ ] **Step 5: Reload; open Door Designer; set finish to Painted; pick a Farrow & Ball colour by clicking a swatch.** Expected: clicked swatch gets gold border, label shows "No.31 - Railings", the door in 3D takes on the new paint colour within ~0.2s.

- [ ] **Step 6: Commit.**

```bash
git add app/mck-sketch.html
git commit -m "feat: rebuild Door Designer paint picker as clickable swatch grid

Replaces the unusable 200-item <select> with a 26px swatch grid
showing brand code + colour name on hover and selection."
```

---

### Task 3.8: Add the same paint picker to the Window Designer

**Files:** Modify `app/mck-sketch.html`:
- The Window Designer sidebar markup (grep `wd-` attributes near `L5500-L5800`).
- `windowDesign` object at `L29624`.
- `updateWindowDesign` at `L29673`.

**Why this is not a paste of Task 3.7:** the Window Designer currently has no finish picker at all. We are adding one. Sash windows in Glasgow tenements are almost always painted — this is essential.

- [ ] **Step 1: Find the Window Designer timber selector** — grep `wd-timber` to locate the markup.

- [ ] **Step 2: Add a "Finish" section** to the Window Designer sidebar directly below the timber row:

```html
<div class="wd-row">
  <div class="wd-field">
    <label>Finish</label>
    <select id="wd-finish-type" onchange="updateWindowDesign()">
      <option value="timber" selected>Stained timber</option>
      <option value="painted">Painted</option>
    </select>
  </div>
</div>
<div id="wd-paint-options" style="display:none">
  <div class="wd-row">
    <div class="wd-field">
      <label>Paint Brand</label>
      <select id="wd-paint-brand" onchange="wdUpdatePaintColours()">
        <option value="farrow">Farrow &amp; Ball</option>
        <option value="little-greene">Little Greene</option>
        <option value="paint-and-paper-library">Paint &amp; Paper Library</option>
        <option value="mylands">Mylands</option>
        <option value="edward-bulmer">Edward Bulmer</option>
        <option value="craig-and-rose">Craig &amp; Rose</option>
        <option value="fired-earth">Fired Earth</option>
        <option value="dulux-heritage">Dulux Heritage</option>
        <option value="neptune">Neptune</option>
        <option value="benjamin-moore-historical">Benjamin Moore Historical</option>
        <option value="ral">RAL Classic</option>
        <option value="dulux">Dulux Trade</option>
      </select>
    </div>
  </div>
  <div class="wd-row">
    <div class="wd-field wd-colour-field">
      <label>Colour <span id="wd-paint-colour-label" class="wd-colour-label"></span></label>
      <div id="wd-paint-colour-grid" class="wd-colour-grid"></div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add matching CSS** — copy the `.dd-colour-*` rules and rename `dd-` → `wd-` (keep the existing per-designer prefix convention).

- [ ] **Step 4: Extend the `windowDesign` object** at `L29624` with:

```js
  finishType: 'timber',
  paintBrand: 'farrow',
  paintColour: null,
```

- [ ] **Step 5: Add `wdUpdatePaintColours()` function** (adapt Task 3.7 Step 3, renaming `dd-` → `wd-`, `doorDesign` → `windowDesign`, `updateDoorDesign` → `updateWindowDesign`):

```js
function wdUpdatePaintColours() {
  const brand = document.getElementById('wd-paint-brand').value;
  const grid = document.getElementById('wd-paint-colour-grid');
  const label = document.getElementById('wd-paint-colour-label');
  if (!grid) return;

  grid.replaceChildren();
  if (label) label.textContent = '';

  const colours = PAINT_COLOURS[brand] || [];
  colours.forEach(c => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wd-colour-swatch';
    btn.style.backgroundColor = c.hex;
    btn.title = `${c.code} - ${c.name}`;
    btn.dataset.hex = c.hex;
    btn.dataset.code = c.code;
    btn.dataset.name = c.name;
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.wd-colour-swatch').forEach(s => s.classList.remove('is-active'));
      btn.classList.add('is-active');
      windowDesign.paintBrand = brand;
      windowDesign.paintColour = c.hex;
      if (label) label.textContent = `${c.code} - ${c.name}`;
      updateWindowDesign();
    });
    grid.appendChild(btn);
  });

  if (windowDesign.paintColour) {
    const match = grid.querySelector(`[data-hex="${windowDesign.paintColour}"]`);
    if (match) {
      match.classList.add('is-active');
      if (label) label.textContent = `${match.dataset.code} - ${match.dataset.name}`;
    }
  }

  updateWindowDesign();
}
window.wdUpdatePaintColours = wdUpdatePaintColours;
```

- [ ] **Step 6: Make `updateWindowDesign` read the finish type and paint selections.** In `updateWindowDesign` at `L29673`, add near the other reads:

```js
  const finishTypeEl = document.getElementById('wd-finish-type');
  if (finishTypeEl) windowDesign.finishType = finishTypeEl.value;
  const paintOpts = document.getElementById('wd-paint-options');
  if (paintOpts) paintOpts.style.display = windowDesign.finishType === 'painted' ? 'block' : 'none';
  const wdBrandEl = document.getElementById('wd-paint-brand');
  if (wdBrandEl) windowDesign.paintBrand = wdBrandEl.value;
```

- [ ] **Step 7: Modify `buildWindow3D()` to respect `finishType`.** Where the timber frame material is picked (grep inside `buildWindow3D` for `windowDesign.timber`), wrap:

```js
const frameMat = windowDesign.finishType === 'painted'
  ? window.mck3D.getPBRMaterial('painted', windowDesign.paintColour || '#f5f1e8')
  : window.mck3D.getPBRMaterial(windowDesign.timber);
```

(Adjust variable names to match the existing code's local-variable names.)

- [ ] **Step 8: Reload; open Window Designer; flip Finish to Painted; pick Farrow & Ball "All White"** — the sash frame should now look like a painted sash, not stained timber.

- [ ] **Step 9: Commit.**

```bash
git add app/mck-sketch.html
git commit -m "feat: add painted-finish picker to Window Designer

Adds finish type toggle (timber/painted), 10-brand paint picker,
and wires the painted PBR material through buildWindow3D."
```

---

### Task 3.9: Phase 3 acceptance check

- [ ] **Step 1: Door Designer — Sapele timber finish.** Compare against a photo of an actual sapele door. Grain, tone, sheen should be recognisable as sapele.
- [ ] **Step 2: Door Designer — Painted, Farrow & Ball "Railings".** Colour on screen should match the F&B swatch.
- [ ] **Step 3: Door Designer — Brass handles.** Look like warm brass, not yellow plastic.
- [ ] **Step 4: Window Designer — Painted sash in Farrow & Ball "All White".** Matte eggshell look, not flat grey.
- [ ] **Step 5: Take before/after screenshots** of door + window, save to `/tmp/phase3-after/`.

**End of Phase 3.**

---

# Phase 4 — Rich scene context (sandstone exterior + Victorian hallway)

**Goal of phase:** when the user selects Interior or Exterior mode, they see the door/window fitted into an appropriate scene — not floating on a placeholder ground plane.

---

### Task 4.1: Extend `addRoomContext()` with `'sandstone-exterior'` preset

**Files:** Modify `app/mck-sketch.html:21007` — extend the existing function with a new preset branch.

**Design:** The sandstone exterior preset wraps the door (or window) in:
- A carved sandstone reveal (jambs, lintel, cill) with depth ~300 mm.
- A sandstone step at the bottom of the door (exterior doors only).
- Behind the reveal, the HDRI provides the sky.

See `/Users/taylor/McKinlayBuilt/app/assets/textures/sandstone/` for the texture set — create it first:

```bash
mkdir -p /Users/taylor/McKinlayBuilt/app/assets/textures/sandstone
# download 4 maps from https://polyhaven.com/a/sandstone_cracks (CC0)
```

- [ ] **Step 1: Add the preset inside `addRoomContext()`.** Add a new early branch at the top of the function:

```js
  // Preset: sandstone-exterior — a Glasgow tenement doorway/window reveal.
  if (opts.preset === 'sandstone-exterior') {
    let sand;
    try {
      const set = _loadPBRTextureSet('sandstone');
      sand = new THREE.MeshStandardMaterial({
        map: set.map,
        normalMap: set.normal,
        roughnessMap: set.roughness,
        aoMap: set.ao,
        color: 0xb8a078,
        roughness: 1.0,
        metalness: 0.0
      });
    } catch (e) {
      sand = getMaterial('painted', '#b8a078');
    }

    const openingW = opts.doorOpening?.w || opts.windowOpening?.w || 900;
    const openingH = opts.doorOpening?.h || opts.windowOpening?.h || 2100;
    const openingX = (opts.doorOpening?.x ?? opts.windowOpening?.x ?? -openingW/2);
    const openingY = opts.windowOpening?.y || 0;
    const revealD = 300;
    const jambT = 250;
    const lintelH = 300;
    const cillH = 100;
    // Left jamb
    const leftJamb = new THREE.Mesh(
      new THREE.BoxGeometry(jambT, openingH + lintelH + cillH, revealD), sand);
    leftJamb.position.set(openingX - jambT/2, (openingH + lintelH + cillH)/2 - cillH, -revealD/2);
    leftJamb.receiveShadow = true; leftJamb.castShadow = true;
    leftJamb.userData.sceneCtx = true; scene.add(leftJamb);
    // Right jamb
    const rightJamb = leftJamb.clone();
    rightJamb.position.x = openingX + openingW + jambT/2;
    scene.add(rightJamb);
    // Lintel
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(openingW + jambT*2, lintelH, revealD), sand);
    lintel.position.set(openingX + openingW/2, openingH + lintelH/2, -revealD/2);
    lintel.receiveShadow = true; lintel.castShadow = true;
    lintel.userData.sceneCtx = true; scene.add(lintel);
    // Cill (below opening)
    if (cillH > 0) {
      const cill = new THREE.Mesh(
        new THREE.BoxGeometry(openingW + jambT*2, cillH, revealD + 60), sand);
      cill.position.set(openingX + openingW/2, openingY - cillH/2, -revealD/2 + 30);
      cill.receiveShadow = true; cill.castShadow = true;
      cill.userData.sceneCtx = true; scene.add(cill);
    }
    // Step (door only)
    if (opts.doorOpening) {
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(openingW + 400, 180, 600), sand);
      step.position.set(openingX + openingW/2, -90, 300);
      step.receiveShadow = true; step.castShadow = true;
      step.userData.sceneCtx = true; scene.add(step);
    }
    return;
  }
```

- [ ] **Step 2: Wire `applySceneMode` to invoke it.** Inside the `applySceneMode` function (Task 2.3), before the HDRI loads, clear any previous context meshes; after the HDRI loads, call `addRoomContext` if the mode has a context:

```js
  // Clear any previous sceneCtx meshes first.
  const toRemove = scene.children.filter(o => o.userData?.sceneCtx);
  toRemove.forEach(o => scene.remove(o));

  // After the HDRI resolves, also add the room context if defined.
  // (Put this inside the RGBELoader load callback, after scene.environment = envMap.)
  if (mode.context === 'sandstone-exterior') {
    const isDoorScene = sceneObj === dd3DScene;
    const openingOpts = isDoorScene
      ? { doorOpening: { x: -doorDesign.width/2, w: doorDesign.width, h: doorDesign.height, wall: 'back' } }
      : { windowOpening: { x: -windowDesign.width/2, y: 900, w: windowDesign.width, h: windowDesign.height, wall: 'back' } };
    addRoomContext(scene, { preset: 'sandstone-exterior', ...openingOpts });
  }
  if (mode.context === 'victorian-hallway') {
    addRoomContext(scene, {
      preset: 'victorian-hallway',
      doorOpening: { x: -doorDesign.width/2, w: doorDesign.width, h: doorDesign.height, wall: 'back' }
    });
  }
```

Note: the `sceneObj === dd3DScene` comparison relies on `dd3DScene` being in scope where `applySceneMode` runs (it's a module-level var). If scope doesn't permit, expose `window.dd3DScene` / `window.wd3DScene` when the designers initialise them.

- [ ] **Step 3: Reload; Door Designer → Exterior mode.** The door should now be fitted into a sandstone doorway with jambs, lintel, cill, and a step.

- [ ] **Step 4: Commit.**

```bash
git add app/mck-sketch.html app/assets/textures/sandstone/
git commit -m "feat: add sandstone-exterior preset to addRoomContext

Carved sandstone reveal (jambs, lintel, cill) plus step for doors,
textured from Poly Haven CC0 sandstone set."
```

---

### Task 4.2: Add `'victorian-hallway'` preset

**Files:** Modify `app/mck-sketch.html:21007` — add another preset branch inside `addRoomContext`.

First, fetch the parquet and plaster texture sets:

```bash
mkdir -p /Users/taylor/McKinlayBuilt/app/assets/textures/oak-parquet
mkdir -p /Users/taylor/McKinlayBuilt/app/assets/textures/plaster
# Download 4 PBR maps into each from Poly Haven
# oak-parquet: https://polyhaven.com/a/wood_floor_worn
# plaster:     https://polyhaven.com/a/beige_wall_001
```

- [ ] **Step 1: Add the preset block.** Below the `'sandstone-exterior'` branch:

```js
  if (opts.preset === 'victorian-hallway') {
    // Parquet floor
    let floorMat;
    try {
      const set = _loadPBRTextureSet('oak-parquet');
      floorMat = new THREE.MeshStandardMaterial({
        map: set.map, normalMap: set.normal, roughnessMap: set.roughness,
        aoMap: set.ao, roughness: 1.0, metalness: 0.0
      });
      set.map.repeat.set(4, 4);
      set.normal.repeat.set(4, 4);
      set.roughness.repeat.set(4, 4);
      set.ao.repeat.set(4, 4);
    } catch (e) {
      floorMat = getMaterial('oak');
    }
    const floorW = 4000, floorD = 3500;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(floorW, 30, floorD), floorMat);
    floor.position.set(0, -15, floorD/2 - 500);
    floor.receiveShadow = true; floor.userData.sceneCtx = true; scene.add(floor);

    // Plaster back wall (with door cutout handled by the door geometry itself)
    let wallMat;
    try {
      const set = _loadPBRTextureSet('plaster');
      wallMat = new THREE.MeshStandardMaterial({
        map: set.map, normalMap: set.normal, roughnessMap: set.roughness,
        color: 0xf0ece2, roughness: 0.95, metalness: 0.0
      });
    } catch (e) {
      wallMat = getMaterial('wall');
    }
    const wallH = 2700;
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(24, wallH, floorD), wallMat);
    leftWall.position.set(-floorW/2 + 12, wallH/2, floorD/2 - 500);
    leftWall.receiveShadow = true; leftWall.userData.sceneCtx = true; scene.add(leftWall);
    const rightWall = leftWall.clone();
    rightWall.position.x = floorW/2 - 12;
    scene.add(rightWall);
    // Back wall above door
    const openingH = opts.doorOpening?.h || 2100;
    if (wallH > openingH) {
      const above = new THREE.Mesh(
        new THREE.BoxGeometry(floorW, wallH - openingH, 24), wallMat);
      above.position.set(0, openingH + (wallH - openingH)/2, -12);
      above.receiveShadow = true; above.userData.sceneCtx = true; scene.add(above);
    }
    // Skirting
    const skirtMat = getPBRMaterial('painted', '#f5f1e8');
    const skirtH = 150;
    const leftSkirt = new THREE.Mesh(new THREE.BoxGeometry(30, skirtH, floorD), skirtMat);
    leftSkirt.position.set(-floorW/2 + 30, skirtH/2, floorD/2 - 500);
    leftSkirt.userData.sceneCtx = true; scene.add(leftSkirt);
    const rightSkirt = leftSkirt.clone();
    rightSkirt.position.x = floorW/2 - 30;
    scene.add(rightSkirt);

    // Warm pendant light to sell the indoor mood
    const pendant = new THREE.PointLight(0xffd8a0, 1.2, 6000, 2);
    pendant.position.set(0, 2400, 1500);
    pendant.castShadow = true;
    pendant.userData.sceneCtx = true;
    scene.add(pendant);
    return;
  }
```

- [ ] **Step 2: Reload; Door Designer → Interior mode.** The door should now stand inside a hallway with parquet, skirting, pendant warmth.

- [ ] **Step 3: Commit.**

```bash
git add app/mck-sketch.html app/assets/textures/oak-parquet/ app/assets/textures/plaster/
git commit -m "feat: add victorian-hallway preset to addRoomContext

Parquet floor, plaster walls, skirting, warm pendant light for the
Interior presentation mode."
```

---

### Task 4.3: Phase 4 acceptance check

- [ ] **Step 1: Door Designer — Exterior.** Sandstone reveal + step, door sits in doorway, sky HDRI behind.
- [ ] **Step 2: Door Designer — Interior.** Hallway with parquet, pendant, skirting.
- [ ] **Step 3: Door Designer — Product.** Clean studio, no room geometry (because `context: null`).
- [ ] **Step 4: Window Designer — Exterior.** Window set in sandstone reveal with cill (no step).
- [ ] **Step 5: Window Designer — Interior.** Window in plaster wall with skirting.
- [ ] **Step 6: Frame-rate spot-check.**

```bash
python3 /tmp/cdp-eval.py '(() => { let f=0; const t0=performance.now(); function tick(){ f++; if(performance.now()-t0<1000) requestAnimationFrame(tick); } requestAnimationFrame(tick); return new Promise(r=>setTimeout(()=>r(f),1100)); })()'
```

Expected: ≥50 on an M-series MacBook. If substantially lower, check which pass is the culprit via DevTools Performance panel.

---

# Phase 5 — Wrap-up

### Task 5.1: Update HANDOVER.md

**Files:** Modify `/Users/taylor/McKinlayBuilt/HANDOVER.md`.

- [ ] **Step 1: Add a new section** under "What was done this session":

```markdown
### 3D realism for doors & windows (2026-04-20)
- **Phase 1** — Exposure dropped 1.05->0.85, lighting rebalanced, GTAO/bloom tightened. Fixes the previously blown-out 3D renders.
- **Phase 2** — `RGBELoader` + three CC0 HDRIs (studio / victorian hallway / overcast exterior), Product/Interior/Exterior mode toggle in both designers.
- **Phase 3** — `getPBRMaterial()` alongside `getMaterial()` using 1K PBR texture sets for sapele, oak, accoya, painted, brass, satin-nickel; `PAINT_COLOURS` expanded to 10 heritage brands (~1,300 colours) with a clickable swatch-grid picker; Window Designer gained a painted finish option.
- **Phase 4** — `addRoomContext()` presets `sandstone-exterior` (jambs / lintel / cill / step) and `victorian-hallway` (parquet / plaster / skirting / pendant).
- Other 5 designers (Cabinet, Kitchen, Staircase, Panelling, Ceiling) still on procedural `getMaterial()` — queued for follow-up.
```

- [ ] **Step 2: Commit.**

```bash
git add HANDOVER.md
git commit -m "docs: update HANDOVER with 3D realism work"
```

---

### Task 5.2: Sanity-check bundle size

- [ ] **Step 1: Measure the assets folder.**

```bash
du -sh /Users/taylor/McKinlayBuilt/app/assets/
```

Expected: ≤ 25 MB. If larger, the main culprit will be over-downloaded textures (someone pulled 2K/4K by mistake). Re-fetch 1K variants.

- [ ] **Step 2: Build a test DMG to confirm electron-builder picks up the new assets folder.**

```bash
cd /Users/taylor/McKinlayBuilt
npm run build:mac
ls -lh dist/TradeSketch.dmg
```

Expected: DMG size increases by ~20 MB over the previous build.

- [ ] **Step 3: Install the test DMG, open Door Designer, flip through all 3 modes** to confirm assets load inside a packaged build (path resolution is different from dev mode).

- [ ] **Step 4: No commit** — build artefacts are gitignored.

---

## Self-review checklist

1. **Spec coverage:**
   - Lighting calibration → Tasks 1.1–1.3 ✓
   - HDRI environments → Tasks 2.1, 2.4 ✓
   - Product / Interior / Exterior toggle → Tasks 2.5–2.6 ✓
   - PBR materials → Tasks 3.1–3.4 ✓
   - Heritage paint library → Tasks 3.5, 3.6 ✓
   - Paint picker rebuild → Tasks 3.7–3.8 ✓
   - Sandstone exterior context → Task 4.1 ✓
   - Victorian hallway context → Task 4.2 ✓
   - Acceptance checks → 1.4, 2.7, 3.9, 4.3 ✓
   - Bundle size ≤ 30 MB → Task 5.2 ✓

2. **Placeholder scan:** no TBDs, no "add appropriate error handling"; every step has code or a concrete command. The one unavoidable manual step is Task 3.5 Step 1 (gather colour data from brand colour charts).

3. **Type / name consistency:** `applySceneMode`, `getSceneMode`, `SCENE_MODES`, `_sceneModeState`, `getPBRMaterial(type, color)`, `_loadPBRTextureSet`, brand keys, and `{ code, name, hex }` shape all used consistently across tasks.

4. **Spec deviation to flag to Taylor:** spec said "new data file `app/assets/paints.json`." Plan instead expands the existing `PAINT_COLOURS` object inside `mck-sketch.html` — consistent with the single-file architecture, no new loading path needed, same colour data.

## Follow-up work (not in this plan)

- Apply `getPBRMaterial()`, HDRI modes, and scene contexts to the other 5 designers (Cabinet, Kitchen, Staircase, Panelling, Ceiling). Each is a smaller repeat of Tasks 3.3–3.4 once the groundwork here is in place.
- Option: cache tinted paint-base textures so the paint swatch grid can show a preview of how the colour will look rendered, not just the raw hex.
- Option: expand hardware finishes to include Brushed Brass, Gun Metal, Aged Copper.
