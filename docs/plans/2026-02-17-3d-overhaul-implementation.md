# 3D Overhaul + McK Warehouse Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all box-based 3D geometry with proper joinery construction (bevels, chamfers, profiled mouldings), upgrade to PBR textures, and build the McK Warehouse parametric + catalogue asset library.

**Architecture:** New geometry primitives (TimberMember, MouldingProfile, RaisedPanel) replace raw BoxGeometry across all 7 designers. PBR texture sets bundled as static assets. Warehouse is a server-side API + SQLite table with a client-side browser panel. Parametric models generated client-side; catalogue models stored as glTF served from /server/warehouse/.

**Tech Stack:** Three.js 0.182, Electron 33, Express 4, better-sqlite3, glTF format for catalogue models

**Key file:** `/Users/taylor/McKinlayBuilt/app/mck-sketch.html` (53,879 lines — all 3D code lives here)
**Server:** `/Users/taylor/McKinlayBuilt/server/`

---

## Phase 1: Geometry Primitives

### Task 1: TimberMember utility function

**Files:**
- Modify: `app/mck-sketch.html:19566` (insert before MOULDING FRAME section)

**Step 1: Write TimberMember function**

Insert after line 19565 (end of tile texture generator), before the moulding frame section. This function replaces `BoxGeometry` for all timber components. It creates an extruded cross-section with configurable edge profiles and orients UV mapping so grain follows the member's length axis.

```javascript
// ===== TIMBER MEMBER (replaces BoxGeometry for all timber) =====
function createTimberMember(length, width, thickness, edgeProfile, grainAxis) {
  // edgeProfile: 'square' | 'chamfer' | 'round' | 'pencil-round'
  // grainAxis: 'x' | 'y' | 'z' — which axis grain runs along (default 'y' = vertical)
  edgeProfile = edgeProfile || 'pencil-round';
  grainAxis = grainAxis || 'y';
  const w = width, t = thickness;
  const hw = w / 2, ht = t / 2;
  const chamfer = Math.min(w, t) * 0.06; // 6% chamfer relative to smallest dimension
  const roundR = Math.min(w, t) * 0.08;

  const shape = new THREE.Shape();

  if (edgeProfile === 'square') {
    shape.moveTo(-hw, -ht);
    shape.lineTo(hw, -ht);
    shape.lineTo(hw, ht);
    shape.lineTo(-hw, ht);
    shape.closePath();
  } else if (edgeProfile === 'chamfer') {
    shape.moveTo(-hw + chamfer, -ht);
    shape.lineTo(hw - chamfer, -ht);
    shape.lineTo(hw, -ht + chamfer);
    shape.lineTo(hw, ht - chamfer);
    shape.lineTo(hw - chamfer, ht);
    shape.lineTo(-hw + chamfer, ht);
    shape.lineTo(-hw, ht - chamfer);
    shape.lineTo(-hw, -ht + chamfer);
    shape.closePath();
  } else if (edgeProfile === 'round') {
    const r = roundR;
    shape.moveTo(-hw + r, -ht);
    shape.lineTo(hw - r, -ht);
    shape.quadraticCurveTo(hw, -ht, hw, -ht + r);
    shape.lineTo(hw, ht - r);
    shape.quadraticCurveTo(hw, ht, hw - r, ht);
    shape.lineTo(-hw + r, ht);
    shape.quadraticCurveTo(-hw, ht, -hw, ht - r);
    shape.lineTo(-hw, -ht + r);
    shape.quadraticCurveTo(-hw, -ht, -hw + r, -ht);
  } else { // pencil-round — slight round on front edges only, square back
    const r = roundR * 0.6;
    shape.moveTo(-hw, -ht);
    shape.lineTo(hw - r, -ht);
    shape.quadraticCurveTo(hw, -ht, hw, -ht + r);
    shape.lineTo(hw, ht - r);
    shape.quadraticCurveTo(hw, ht, hw - r, ht);
    shape.lineTo(-hw, ht);
    shape.closePath();
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1, depth: length, bevelEnabled: false
  });

  // Rotate so extrusion aligns with the requested grain axis
  // ExtrudeGeometry extrudes along Z by default
  if (grainAxis === 'y') {
    geo.rotateX(-Math.PI / 2); // Z -> Y
  } else if (grainAxis === 'x') {
    geo.rotateY(Math.PI / 2); // Z -> X
  }
  // grainAxis === 'z' needs no rotation

  // Fix UV mapping: orient grain along the length axis
  const uvAttr = geo.attributes.uv;
  const posAttr = geo.attributes.position;
  for (let i = 0; i < uvAttr.count; i++) {
    let u, v;
    const px = posAttr.getX(i), py = posAttr.getY(i), pz = posAttr.getZ(i);
    if (grainAxis === 'y') {
      u = px / width;
      v = py / length;
    } else if (grainAxis === 'x') {
      u = px / length;
      v = py / width;
    } else {
      u = px / width;
      v = pz / length;
    }
    uvAttr.setXY(i, u, v);
  }
  uvAttr.needsUpdate = true;

  geo.computeVertexNormals();
  return geo;
}
```

**Step 2: Verify visually**

Launch the app (`npm start` from project root), open a door in the door designer, and confirm the app still loads. The new function isn't called yet — this step just confirms no syntax errors.

**Step 3: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: add TimberMember geometry primitive with edge profiles and grain-aligned UVs"
```

---

### Task 2: MouldingProfile utility functions

**Files:**
- Modify: `app/mck-sketch.html` — insert after TimberMember, before existing moulding frame code (~line 19566)

**Step 1: Write moulding profile cross-section definitions**

These define the actual 2D cross-section shapes for each moulding type. Each returns a `THREE.Shape` that can be extruded along a path.

```javascript
// ===== MOULDING PROFILE CROSS-SECTIONS =====
// Each returns a THREE.Shape for the cross-section. Origin at inner edge, extends outward.
// mSize = total moulding width, depth = how far it projects from the surface

function mouldingOgeeShape(mSize, depth) {
  depth = depth || mSize * 0.6;
  const s = new THREE.Shape();
  s.moveTo(0, 0); // inner edge (against panel)
  // Ogee: concave curve into convex curve (S-shape)
  s.bezierCurveTo(mSize * 0.15, depth * 0.1, mSize * 0.25, depth * 0.7, mSize * 0.5, depth * 0.85);
  s.bezierCurveTo(mSize * 0.75, depth, mSize * 0.9, depth * 0.6, mSize, depth * 0.15);
  s.lineTo(mSize, 0);
  s.closePath();
  return s;
}

function mouldingOvoloShape(mSize, depth) {
  depth = depth || mSize * 0.5;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  // Ovolo: quarter-round convex curve
  s.quadraticCurveTo(0, depth, mSize * 0.5, depth);
  s.quadraticCurveTo(mSize, depth, mSize, depth * 0.3);
  s.lineTo(mSize, 0);
  s.closePath();
  return s;
}

function mouldingBolectionShape(mSize, depth) {
  depth = depth || mSize * 0.7;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  // Bolection: stepped profile with raised centre section
  s.lineTo(0, depth * 0.3);
  s.quadraticCurveTo(mSize * 0.1, depth * 0.9, mSize * 0.3, depth);
  s.lineTo(mSize * 0.7, depth);
  s.quadraticCurveTo(mSize * 0.9, depth * 0.9, mSize, depth * 0.3);
  s.lineTo(mSize, 0);
  s.closePath();
  return s;
}

function mouldingLambsTongueShape(mSize, depth) {
  depth = depth || mSize * 0.45;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  // Lambs tongue: tapered with slight curve
  s.quadraticCurveTo(mSize * 0.2, depth * 0.8, mSize * 0.45, depth);
  s.lineTo(mSize * 0.55, depth);
  s.quadraticCurveTo(mSize * 0.8, depth * 0.6, mSize, depth * 0.05);
  s.lineTo(mSize, 0);
  s.closePath();
  return s;
}

function mouldingTorusShape(mSize, depth) {
  depth = depth || mSize * 0.5;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  // Torus (half-round)
  s.absarc(mSize / 2, 0, mSize / 2, Math.PI, 0, true);
  s.lineTo(mSize, 0);
  s.closePath();
  return s;
}

function mouldingBeadButtShape(mSize, depth) {
  depth = depth || mSize * 0.35;
  const beadR = mSize * 0.2;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  // Flat section then small bead at inner edge
  s.lineTo(0, depth * 0.4);
  s.absarc(beadR, depth * 0.4, beadR, Math.PI, 0, true);
  s.lineTo(beadR * 2, 0);
  s.lineTo(mSize, 0);
  s.closePath();
  return s;
}

function mouldingSquareShape(mSize, depth) {
  depth = depth || mSize * 0.5;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0, depth);
  s.lineTo(mSize, depth);
  s.lineTo(mSize, 0);
  s.closePath();
  return s;
}

function getMouldingShape(profile, mSize, depth) {
  switch (profile) {
    case 'ogee': return mouldingOgeeShape(mSize, depth);
    case 'ovolo': return mouldingOvoloShape(mSize, depth);
    case 'bolection': return mouldingBolectionShape(mSize, depth);
    case 'lambs-tongue': return mouldingLambsTongueShape(mSize, depth);
    case 'torus': return mouldingTorusShape(mSize, depth);
    case 'bead-butt': return mouldingBeadButtShape(mSize, depth);
    case 'square': return mouldingSquareShape(mSize, depth);
    default: return mouldingOgeeShape(mSize, depth);
  }
}
```

**Step 2: Write extruded moulding frame builder**

This replaces the existing `addPanelMouldings` function (lines 19586-19617) with one that uses real profiled cross-sections and creates proper mitred corners.

```javascript
// ===== PROFILED MOULDING FRAME (replaces flat extrusion) =====
function addProfiledMouldings(scene, cx, cy, openingW, openingH, frontZ, profile, mSize, material, tag) {
  // Creates four mitred moulding strips around a panel opening.
  // Each strip is a profiled extrusion with 45-degree mitre cuts at corners.
  mSize = mSize || 15;
  const mDepth = mSize * 0.6;
  const shape = getMouldingShape(profile, mSize, mDepth);

  const hw = openingW / 2, hh = openingH / 2;

  // Four straight strips: bottom, top, left, right
  // Each extruded along its length, then positioned and rotated

  // Bottom strip (extrude along X)
  const bottomLen = openingW;
  const bottomGeo = new THREE.ExtrudeGeometry(shape, { steps: 1, depth: bottomLen, bevelEnabled: false });
  const bottomMesh = new THREE.Mesh(bottomGeo, material);
  bottomMesh.position.set(cx - hw, cy - hh, frontZ);
  bottomMesh.castShadow = true; bottomMesh.userData[tag] = true;
  scene.add(bottomMesh);

  // Top strip (flipped, extrude along X)
  const topGeo = new THREE.ExtrudeGeometry(shape, { steps: 1, depth: bottomLen, bevelEnabled: false });
  const topMesh = new THREE.Mesh(topGeo, material);
  topMesh.rotation.z = Math.PI; // flip upside down
  topMesh.position.set(cx + hw, cy + hh, frontZ);
  topMesh.castShadow = true; topMesh.userData[tag] = true;
  scene.add(topMesh);

  // Left strip (rotate 90, extrude along Y)
  const sideLen = openingH;
  const leftGeo = new THREE.ExtrudeGeometry(shape, { steps: 1, depth: sideLen, bevelEnabled: false });
  const leftMesh = new THREE.Mesh(leftGeo, material);
  leftMesh.rotation.z = -Math.PI / 2;
  leftMesh.position.set(cx - hw, cy + hh, frontZ);
  leftMesh.castShadow = true; leftMesh.userData[tag] = true;
  scene.add(leftMesh);

  // Right strip (rotate -90, extrude along Y)
  const rightGeo = new THREE.ExtrudeGeometry(shape, { steps: 1, depth: sideLen, bevelEnabled: false });
  const rightMesh = new THREE.Mesh(rightGeo, material);
  rightMesh.rotation.z = Math.PI / 2;
  rightMesh.position.set(cx + hw, cy - hh, frontZ);
  rightMesh.castShadow = true; rightMesh.userData[tag] = true;
  scene.add(rightMesh);
}
```

**Step 3: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: add real moulding profile cross-sections (ogee, ovolo, bolection, lambs-tongue, torus, bead-butt)"
```

---

### Task 3: RaisedPanel geometry

**Files:**
- Modify: `app/mck-sketch.html` — insert after moulding profiles, before existing moulding frame code

**Step 1: Write RaisedPanel function**

Replaces the three-stacked-boxes approach with a single geometry that has proper angled bevel faces.

```javascript
// ===== RAISED PANEL GEOMETRY =====
function createRaisedPanelGeometry(panelW, panelH, thickness, bevelAngle, fieldRaise, tongueWidth) {
  // bevelAngle: degrees (typically 7-12 for joinery), default 9
  // fieldRaise: how much the centre field is raised above the tongue, default 4mm
  // tongueWidth: width of the bevel transition area, default 25mm
  bevelAngle = bevelAngle || 9;
  fieldRaise = fieldRaise || 4;
  tongueWidth = tongueWidth || 25;

  const hw = panelW / 2, hh = panelH / 2;
  const ht = thickness / 2;
  const bevelRad = (bevelAngle * Math.PI) / 180;
  const bevelDepth = Math.tan(bevelRad) * tongueWidth;

  // Build as BufferGeometry with explicit vertices for the bevel faces
  // Panel has: back face (flat), tongue edges (thin), bevel transitions (angled), raised field (flat front)

  const fieldHW = hw - tongueWidth;
  const fieldHH = hh - tongueWidth;
  const tongueZ = -ht; // back of panel
  const fieldZ = ht; // front face of raised field
  const tongueEdgeZ = fieldZ - fieldRaise - bevelDepth; // front face of tongue

  // Use a simpler approach: ExtrudeGeometry with a custom shape for the cross-section
  // Cross-section along width at mid-height:
  // tongue -> bevel up -> field -> bevel down -> tongue
  const shape = new THREE.Shape();
  shape.moveTo(-hw, tongueEdgeZ);
  shape.lineTo(-hw, tongueZ); // tongue back
  shape.lineTo(hw, tongueZ);
  shape.lineTo(hw, tongueEdgeZ); // tongue front
  shape.lineTo(fieldHW, fieldZ); // bevel up to field
  shape.lineTo(-fieldHW, fieldZ); // field front face
  shape.lineTo(-hw, tongueEdgeZ); // bevel back down
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1, depth: panelH, bevelEnabled: false
  });

  // Rotate so panel faces forward (extrusion was along Z, we want it along Y)
  geo.rotateX(-Math.PI / 2);
  // Centre on origin
  geo.translate(0, 0, 0);
  geo.computeVertexNormals();
  return geo;
}
```

**Step 2: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: add RaisedPanel geometry with angled bevel faces"
```

---

### Task 4: Skirting and architrave profile functions

**Files:**
- Modify: `app/mck-sketch.html` — replace existing `createSkirtingGeometry` at line 19626

**Step 1: Replace skirting with parametric profiled version**

```javascript
// ===== SKIRTING & ARCHITRAVE PROFILES =====
function createSkirtingGeometry(length, skirtH, skirtD, profile) {
  skirtH = skirtH || 120; skirtD = skirtD || 18;
  profile = profile || 'ogee';

  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(skirtD, 0);

  if (profile === 'ogee') {
    shape.lineTo(skirtD, skirtH * 0.65);
    shape.bezierCurveTo(skirtD, skirtH * 0.78, skirtD * 0.8, skirtH * 0.88, skirtD * 0.55, skirtH * 0.93);
    shape.bezierCurveTo(skirtD * 0.3, skirtH * 0.97, skirtD * 0.25, skirtH, skirtD * 0.2, skirtH);
    shape.lineTo(0, skirtH);
  } else if (profile === 'torus') {
    shape.lineTo(skirtD, skirtH * 0.6);
    shape.quadraticCurveTo(skirtD, skirtH, skirtD * 0.3, skirtH);
    shape.lineTo(0, skirtH);
  } else if (profile === 'chamfer') {
    shape.lineTo(skirtD, skirtH * 0.75);
    shape.lineTo(skirtD * 0.3, skirtH);
    shape.lineTo(0, skirtH);
  } else if (profile === 'bullnose') {
    shape.lineTo(skirtD, skirtH * 0.5);
    shape.absarc(skirtD * 0.5, skirtH * 0.5, skirtD * 0.5, 0, Math.PI / 2, false);
    shape.lineTo(0, skirtH);
  } else if (profile === 'victorian') {
    shape.lineTo(skirtD, skirtH * 0.5);
    shape.bezierCurveTo(skirtD, skirtH * 0.65, skirtD * 0.85, skirtH * 0.72, skirtD * 0.7, skirtH * 0.78);
    shape.bezierCurveTo(skirtD * 0.55, skirtH * 0.84, skirtD * 0.5, skirtH * 0.88, skirtD * 0.45, skirtH * 0.92);
    shape.quadraticCurveTo(skirtD * 0.3, skirtH, skirtD * 0.2, skirtH);
    shape.lineTo(0, skirtH);
  } else { // square
    shape.lineTo(skirtD, skirtH);
    shape.lineTo(0, skirtH);
  }

  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { steps: 1, depth: length, bevelEnabled: false });
}

function createArchitravGeometry(length, archW, archD, profile) {
  archW = archW || 60; archD = archD || 18;
  profile = profile || 'ogee';

  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(archD, 0);

  if (profile === 'ogee') {
    shape.lineTo(archD, archW * 0.6);
    shape.bezierCurveTo(archD, archW * 0.78, archD * 0.75, archW * 0.88, archD * 0.5, archW * 0.94);
    shape.bezierCurveTo(archD * 0.25, archW, archD * 0.15, archW, 0, archW);
  } else if (profile === 'chamfer') {
    shape.lineTo(archD, archW * 0.7);
    shape.lineTo(archD * 0.3, archW);
    shape.lineTo(0, archW);
  } else if (profile === 'bullnose') {
    shape.lineTo(archD, archW * 0.5);
    shape.absarc(archD * 0.5, archW * 0.5, archD * 0.5, 0, Math.PI / 2, false);
    shape.lineTo(0, archW);
  } else if (profile === 'ovolo') {
    shape.lineTo(archD, archW * 0.55);
    shape.quadraticCurveTo(archD, archW, archD * 0.2, archW);
    shape.lineTo(0, archW);
  } else { // square
    shape.lineTo(archD, archW);
    shape.lineTo(0, archW);
  }

  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { steps: 1, depth: length, bevelEnabled: false });
}
```

**Step 2: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: add parametric skirting and architrave profiles (ogee, torus, chamfer, bullnose, victorian)"
```

---

## Phase 2: Material System Upgrade

### Task 5: Create PBR texture assets directory

**Files:**
- Create: `app/textures/` directory
- Create: `app/textures/wood/` — oak, walnut, ash, pine, sapele, maple, cherry
- Create: `app/textures/stone/` — marble, granite, slate
- Create: `app/textures/metal/` — chrome, brass, nickel, black, bronze

**Step 1: Create directory structure**

```bash
mkdir -p app/textures/wood app/textures/stone app/textures/metal app/textures/tile
```

**Step 2: Generate high-quality procedural PBR texture sets**

For each wood species, generate 2K (2048x2048) texture sets using improved canvas generators. Write a texture generation script that outputs PNG files:
- `{species}_diffuse.png`
- `{species}_normal.png`
- `{species}_roughness.png`

This runs once at build time, not at runtime. The current runtime generation creates new textures every session which is wasteful and low quality.

Create `app/generate-textures.js` — an Electron-compatible script that renders high-quality textures to disk using the existing procedural generators at 2048x2048 resolution, then saves them as PNGs.

**Step 3: Commit**

```bash
git add app/textures/ app/generate-textures.js
git commit -m "feat: add PBR texture generation pipeline and directory structure"
```

---

### Task 6: Upgrade getMaterial() to load PBR textures

**Files:**
- Modify: `app/mck-sketch.html:19371-19487` — rewrite `getMaterial()` function

**Step 1: Rewrite getMaterial to load texture files with proper UV settings**

Replace the current `getMaterial` that generates textures at runtime with one that loads pre-generated PBR texture files. Fall back to procedural generation if texture files aren't available (for development/first run).

Key changes:
- Use `THREE.TextureLoader` to load from `app/textures/`
- Set `texture.wrapS = THREE.RepeatWrapping` and `texture.wrapT = THREE.RepeatWrapping` on all textures
- Set `texture.colorSpace = THREE.SRGBColorSpace` on diffuse maps
- Keep procedural as fallback

**Step 2: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: upgrade material system to load PBR texture files with proper UV wrapping"
```

---

### Task 7: Rendering pipeline tweaks

**Files:**
- Modify: `app/mck-sketch.html:19833-19976` — update `createScene()`

**Step 1: Apply rendering improvements**

In `createScene()`, change:
- Line 19848: `renderer.toneMapping = THREE.ACESFilmicToneMapping;`
- Line 19849: `renderer.toneMappingExposure = 1.1;`
- Line 19929: SSAO radius from 0.3 to 0.8: `gtaoPass.updateGtaoMaterial({ radius: 0.8, distanceExponent: 2, thickness: 5, scale: 1.0 });`
- Line 19933: Bloom threshold from 0.98 to 0.85: `new UnrealBloomPass(new THREE.Vector2(w, h), 0.05, 0.3, 0.85);`

**Step 2: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: enable ACES tone mapping, widen SSAO radius, lower bloom threshold"
```

---

## Phase 3: Rebuild Door Designer 3D

### Task 8: Replace door stiles and rails with TimberMember

**Files:**
- Modify: `app/mck-sketch.html:20734-20757` — stiles and rails section of `buildDoor3D()`

**Step 1: Replace BoxGeometry stiles with TimberMember**

Change stile construction from:
```javascript
const geo = new THREE.BoxGeometry(stW, H, T);
```
To:
```javascript
const geo = createTimberMember(H, stW, T, 'pencil-round', 'y');
```

And rails from:
```javascript
const geo = new THREE.BoxGeometry(railW, rail.height, T);
```
To:
```javascript
const geo = createTimberMember(railW, rail.height, T, 'pencil-round', 'x');
```

**Step 2: Verify visually**

Open door designer, create a 4-panel Victorian door. Edges of stiles and rails should now show slight rounding instead of sharp 90-degree edges.

**Step 3: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: door designer stiles and rails use TimberMember with pencil-round edges"
```

---

### Task 9: Replace door panels with RaisedPanel geometry

**Files:**
- Modify: `app/mck-sketch.html:20759-20825` — panels section of `buildDoor3D()`

**Step 1: Replace stacked-box raised panels with RaisedPanel geometry**

Replace the three-mesh approach (baseMesh + bvMesh + centerMesh) with:
```javascript
const geo = createRaisedPanelGeometry(pFullW, pFullH, panelT, 9, 4, 25);
```

**Step 2: Replace addPanelMouldings calls with addProfiledMouldings**

All calls to `addPanelMouldings(...)` become `addProfiledMouldings(...)` to use real profiled cross-sections.

**Step 3: Verify visually**

Open door designer with raised panel + ogee moulding. Panels should show proper angled bevel. Mouldings should show curved profile instead of flat extrusion.

**Step 4: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: door panels use RaisedPanel geometry with profiled mouldings"
```

---

### Task 10: Upgrade door architrave and room context

**Files:**
- Modify: `app/mck-sketch.html:20524-20558` — wall/architrave/floor section of `buildDoor3D()`

**Step 1: Replace box architraves with profiled extrusions**

Replace:
```javascript
const archL = new THREE.Mesh(new THREE.BoxGeometry(archW, H + archW, archD), archMat);
```
With:
```javascript
const archGeo = createArchitravGeometry(H + archW, archW, archD, 'ogee');
```

Position and rotate the extruded geometry to align correctly on each side (left, right, head).

**Step 2: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: door architraves use profiled extrusion geometry"
```

---

## Phase 4: Rebuild Window Designer 3D

### Task 11: Replace window frame geometry with TimberMember

**Files:**
- Modify: `app/mck-sketch.html:20841-21082` — `buildWindow3D()` function

**Step 1: Replace all BoxGeometry in window frames with TimberMember**

Window outer frame, sashes, transoms, and mullions all become `createTimberMember()` calls with appropriate edge profiles:
- Outer frame: `pencil-round`
- Sash rails/stiles: `round`
- Glazing bars: `round`

**Step 2: Add proper glazing bar profiles**

Glazing bars (astragal bars) currently use thin boxes. Replace with a proper astragal cross-section using `ExtrudeGeometry` with a half-round or ovolo profile shape.

**Step 3: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: window designer uses TimberMember and profiled glazing bars"
```

---

## Phase 5: Rebuild Cabinet Designer 3D

### Task 12: Replace cabinet carcass and door geometry

**Files:**
- Modify: `app/mck-sketch.html:20274-20450` — `buildCabinet3D()` function (approx, verify actual bounds)

**Step 1: Replace box carcasses with TimberMember panels**

Cabinet sides, top, bottom, shelves, and back panel become `createTimberMember()` with `'chamfer'` edge profile on visible front edges.

**Step 2: Add edge banding detail**

Visible panel edges get a thin strip of matching material slightly proud of the surface (0.5mm) to simulate edge tape/lipping.

**Step 3: Replace cabinet door panels**

Shaker doors use `createTimberMember` for frame + flat panel recessed. Raised & fielded use `createRaisedPanelGeometry`. Slab doors use `createTimberMember` with `'round'` edges.

**Step 4: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: cabinet designer uses TimberMember carcasses and profiled doors"
```

---

## Phase 6: Rebuild Kitchen Elevation 3D

### Task 13: Upgrade kitchen 3D builder

**Files:**
- Modify: `app/mck-sketch.html:19978-20273` — `buildKitchen3D()` function

**Step 1: Replace all box geometry with TimberMember**

Base units, wall units, worktops, plinths — all use `createTimberMember()`. Worktop edges get a dedicated edge profile (bullnose or pencil-round).

**Step 2: Add cornice and pelmet detail**

Kitchen wall units get a cornice moulding along the top and pelmet rail along the bottom using `getMouldingShape('ogee', ...)`.

**Step 3: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: kitchen elevation uses TimberMember, profiled worktop edges, and cornice/pelmet mouldings"
```

---

## Phase 7: Rebuild Remaining Designers

### Task 14: Staircase designer 3D

**Files:**
- Modify: `app/mck-sketch.html:21248-21577` — `buildStaircase3D()`

**Step 1: Upgrade staircase components**

- Treads: `createTimberMember` with bullnose nosing on the front edge
- Risers: `createTimberMember` with square profile
- Strings: `createTimberMember` with chamfer profile
- Balusters: already use `createBalusterGeometry` (LatheGeometry) — keep
- Newels: `createTimberMember` with chamfer, add turned cap using `LatheGeometry`
- Handrail: already uses `createHandrailGeometry` — keep

**Step 2: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: staircase designer uses TimberMember for treads, risers, and strings"
```

---

### Task 15: Wall panelling designer 3D

**Files:**
- Modify: `app/mck-sketch.html:21083-21246` — `buildPanelling3D()`

**Step 1: Replace all box geometry**

- Stiles and rails: `createTimberMember` with `pencil-round` edges
- Raised panels: `createRaisedPanelGeometry`
- Flat panels: `createTimberMember` with `square` edges, recessed
- Corner posts: `createTimberMember` with `chamfer` edges
- Dado rail: extruded moulding profile using `getMouldingShape`
- Skirting: `createSkirtingGeometry` with selected profile

**Step 2: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: wall panelling uses profiled geometry for all components"
```

---

### Task 16: Coffered ceiling designer 3D

**Files:**
- Modify: `app/mck-sketch.html:21578-21693` — `buildCofferedCeiling3D()`

**Step 1: Replace box beams with TimberMember**

Ceiling beams (primary and secondary) become `createTimberMember` with `chamfer` profile. Add moulding detail at beam-ceiling junction using `getMouldingShape('ogee', ...)`.

**Step 2: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: coffered ceiling uses TimberMember beams with junction mouldings"
```

---

## Phase 8: McK Warehouse Server

### Task 17: Database schema for warehouse

**Files:**
- Modify: `server/src/database.js` — add warehouse_items table creation
- Create: `server/src/routes/warehouse.js`

**Step 1: Write failing test for warehouse API**

Create test file:
```bash
mkdir -p server/tests
```

Create `server/tests/warehouse.test.js`:
```javascript
const request = require('supertest');
// Test that GET /api/warehouse/categories returns category list
// Test that GET /api/warehouse/items returns paginated items
// Test that POST /api/warehouse/item requires auth and creates an item
// Test that GET /api/warehouse/item/:id returns item detail
```

Run: `cd server && npx jest tests/warehouse.test.js`
Expected: FAIL (routes don't exist yet)

**Step 2: Add warehouse_items table to database.js**

```sql
CREATE TABLE IF NOT EXISTS warehouse_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  tags TEXT,
  description TEXT,
  type TEXT DEFAULT 'catalogue',
  parameters TEXT,
  model_filename TEXT,
  thumbnail_filename TEXT,
  file_size INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Step 3: Write warehouse route**

`server/src/routes/warehouse.js`:
```javascript
const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('../middleware/auth');

// GET /categories — returns distinct category/subcategory tree
router.get('/categories', authenticate, (req, res) => { ... });

// GET /items — paginated list with optional category and search filters
router.get('/items', authenticate, (req, res) => { ... });

// GET /item/:id — single item metadata
router.get('/item/:id', authenticate, (req, res) => { ... });

// GET /item/:id/model — serve glTF file
router.get('/item/:id/model', authenticate, (req, res) => { ... });

// GET /item/:id/thumbnail — serve thumbnail image
router.get('/item/:id/thumbnail', authenticate, (req, res) => { ... });

// POST /item — create new item (admin only)
router.post('/item', authenticate, (req, res) => { ... });

// PUT /item/:id — update item metadata (admin only)
router.put('/item/:id', authenticate, (req, res) => { ... });

// DELETE /item/:id — remove item (admin only)
router.delete('/item/:id', authenticate, (req, res) => { ... });

module.exports = router;
```

**Step 4: Register route in server.js**

Add to `server/server.js`:
```javascript
const warehouseRoutes = require('./src/routes/warehouse');
app.use('/api/warehouse', warehouseRoutes);
```

**Step 5: Create warehouse file storage directory**

```bash
mkdir -p server/warehouse/models server/warehouse/thumbnails
```

**Step 6: Run tests, verify passing**

```bash
cd server && npx jest tests/warehouse.test.js
```

**Step 7: Commit**

```bash
git add server/
git commit -m "feat: add McK Warehouse API with CRUD routes, database schema, and file storage"
```

---

### Task 18: Seed warehouse with initial categories

**Files:**
- Create: `server/src/seed-warehouse.js`

**Step 1: Write seeder script**

Populates the warehouse_items table with the category structure and parametric item definitions:

Categories:
- Ironmongery > Door Handles, Cabinet Hardware, Hinges, Locks
- Appliances > Ovens, Hobs, Sinks, Taps, Extractors, Fridges
- Sanitary > Basins, Baths, Toilets, Showers
- Furniture > Seating, Tables, Beds, Storage
- Fixtures > Lighting, Radiators, Switches
- Exterior > Roofing, Brickwork, Cladding, Rainwater

Each item gets: name, category, subcategory, tags, type ('parametric' or 'catalogue'), parameters (JSON).

**Step 2: Run seeder**

```bash
cd server && node src/seed-warehouse.js
```

**Step 3: Commit**

```bash
git add server/src/seed-warehouse.js
git commit -m "feat: seed McK Warehouse with initial category structure and parametric definitions"
```

---

## Phase 9: McK Warehouse UI

### Task 19: Warehouse browser panel in the app

**Files:**
- Modify: `app/mck-sketch.html` — add warehouse panel HTML, CSS, and JavaScript

**Step 1: Add warehouse panel CSS**

Add new CSS section after existing panel styles. Warehouse panel slides in from the right (or opens as modal), with:
- Category tree sidebar (collapsible)
- Search bar with tag filters
- Thumbnail grid (responsive, 3-4 columns)
- Item detail view with 3D preview
- Favourites/recently used tabs

**Step 2: Add warehouse panel HTML**

Add the panel markup in the HTML body section, following the existing pattern for overlay panels.

**Step 3: Add warehouse JavaScript**

Functions:
- `openWarehouse()` / `closeWarehouse()` — toggle panel
- `loadWarehouseCategories()` — fetch from API, render tree
- `loadWarehouseItems(category, search, page)` — fetch and render grid
- `loadWarehouseDetail(id)` — fetch item, show detail + 3D preview
- `placeWarehouseItem(id)` — load glTF model into current scene at cursor position
- `warehouseFavourite(id)` — toggle favourite (stored in localStorage)

For catalogue items: use `GLTFLoader` from Three.js addons to load `.glb` files.

Add import at top of script section:
```javascript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
```

**Step 4: Add menu entry**

Add "Warehouse" to the header menu bar (between Trades and the settings area), with onclick `openWarehouse()`.

**Step 5: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: add McK Warehouse browser panel with category tree, search, and glTF model loading"
```

---

### Task 20: Drag-and-drop placement

**Files:**
- Modify: `app/mck-sketch.html` — add placement logic to warehouse JavaScript

**Step 1: Implement drag-to-place**

When a user clicks "Place" on a warehouse item:
1. Load the glTF model
2. Attach it to the mouse cursor in the 3D viewport (raycasting to floor/wall planes)
3. Click to place, scroll to rotate
4. Place confirms position and adds to scene with the current designer's tag

**Step 2: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: add drag-and-drop placement for warehouse models in 3D viewport"
```

---

## Phase 10: Room Context Upgrade

### Task 21: Upgrade room context system

**Files:**
- Modify: `app/mck-sketch.html:19674-19813` — `addRoomContext()`

**Step 1: Replace box skirting with profiled skirting**

All skirting in `addRoomContext` changes from `BoxGeometry` to `createSkirtingGeometry()`. Architraves around door openings change from `BoxGeometry` to `createArchitravGeometry()`.

**Step 2: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: room context uses profiled skirting and architrave geometry"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1: Geometry Primitives | 1-4 | TimberMember, MouldingProfile, RaisedPanel, Skirting/Architrave |
| 2: Materials | 5-7 | PBR textures, upgraded getMaterial(), rendering tweaks |
| 3: Door Designer | 8-10 | Fully profiled doors with real mouldings |
| 4: Window Designer | 11 | Profiled window frames and glazing bars |
| 5: Cabinet Designer | 12 | Profiled carcasses and doors |
| 6: Kitchen Elevation | 13 | Profiled worktops, cornice, pelmet |
| 7: Remaining Designers | 14-16 | Staircase, wall panelling, coffered ceiling |
| 8: Warehouse Server | 17-18 | API, database, seeded categories |
| 9: Warehouse UI | 19-20 | Browser panel, search, glTF loading, drag-and-drop |
| 10: Room Context | 21 | Profiled skirting and architraves in all room scenes |
