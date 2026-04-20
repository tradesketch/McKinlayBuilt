# 3D Realism Overhaul — Door & Window Designers

**Status:** Approved design, awaiting implementation plan
**Date:** 2026-04-20
**Owner:** Taylor McKinlay
**Scope:** Door Designer + Window Designer only. Cabinet, Kitchen, Staircase, Panelling, Ceiling deferred (see "Follow-up work").

---

## Problem

The 3D View in the Door and Window designers is functionally unviewable. Reference screenshots from the live app (`/tmp/refs/shot1.png`, `shot4.png`) show doors and windows almost completely washed out to pure white — the object is in the scene but the exposure blows it out so badly you can only just make out the silhouette.

Past sessions attributed this to "cheap-looking materials" and attempted material tweaks. That diagnosis was wrong. The primary cause is an overexposed scene, not cheap materials. Procedural canvas-generated textures (wood grain, marble, tile etc. drawn pixel-by-pixel in JavaScript) are a secondary issue — they will never match photoreal quality, but they cannot even be evaluated while the scene clips to white.

The 2D views of the same designs look good (sapele-toned, proper stiles/rails/panels/glazing bars), which confirms the geometry and colour logic is sound. The gap is purely in the 3D presentation layer: lighting, tone mapping, materials, and scene context.

## Goals

1. **Visibility first** — fix exposure so the rendered piece is clearly readable against its background before touching anything else.
2. **Photoreal materials** — replace procedural canvas textures with real photographed PBR texture sets for the materials Taylor actually sells (sapele, oak, accoya, painted, brass, chrome, satin nickel, glass).
3. **Three selectable presentation modes** — Product / Interior / Exterior, toggled from the designer sidebar.
4. **Context that matches the market** — Taylor fits doors on Glasgow sandstone Victorian/Edwardian tenements; the Exterior mode must reflect that look (carved sandstone reveal, step, daylight), not a generic abstract setting.
5. **Heritage paint colour library** — branded swatches from Farrow & Ball, Little Greene, Paint & Paper Library, Mylands, Craig & Rose, Edward Bulmer, Fired Earth, Dulux Heritage, Neptune, and Benjamin Moore Historical, picked by brand + colour name instead of raw hex.

## Non-goals

- The other 5 designers (Cabinet, Kitchen, Staircase, Panelling, Ceiling). They'll re-use the foundation built here but are scoped in a separate spec.
- Animation, walk-throughs, VR/AR, ray tracing. Real-time Three.js render only.
- User-uploaded textures or HDRIs. The asset library is curated.
- Procedural texture generators (`generateWoodTexture`, `generateMarbleTexture` etc.) stay in the codebase as a fallback but are no longer the default path for the materials we upgrade.

## Success criteria

- Doors and windows are clearly visible in all three modes at default camera position with no user adjustment.
- Material surfaces are distinguishable from one another at typical viewing distance — a sapele door does not look like an oak door does not look like a painted door.
- Exterior mode produces a render a customer would recognise as "a door in a Glasgow sandstone doorway."
- Interior mode produces a render a customer would recognise as "a door inside a period hallway."
- Product mode produces a clean studio product shot suitable for export/inclusion in a client quote PDF.
- Paint picker lists all 10 heritage brands with their official colour names (e.g. "Farrow & Ball — Railings No. 31"); rendered paint tints match the brand's published chip within reasonable on-screen tolerance.
- No measurable frame-rate regression on Taylor's MacBook (M-series) — target 60fps in all three modes.
- Total installer size increase ≤ 30 MB.

---

## Architecture

One refactor, four new subsystems (HDRI, PBR materials, paint library, scene contexts), two UI additions (mode toggle, paint picker rebuild).

### 1. `createScene()` refactor (existing function, `app/mck-sketch.html` ~line 21196)

**Current behaviour:** Six light sources (ambient + key + fill + rim + back fill + hemi) plus a bright warm-gradient canvas background plus a `RoomEnvironment` PMREM environment map. Total illumination overruns the ACES tone mapper, causing clipping to white.

**New behaviour:**
- Accept a `mode` argument: `'product' | 'interior' | 'exterior'`.
- Per-mode lighting rig, exposure, and environment map — no shared global lighting values.
- Retain ACES filmic tone mapping, PCF soft shadows, FXAA, bloom — all still applicable, but with mode-specific parameters (bloom threshold raised; exposure tuned per mode).
- Retain the animate/resize/screenshot/dispose return surface so callers don't change.

### 2. HDRI environment system (new)

**New helper:** `loadHDRI(name)` — loads an equirectangular `.hdr` file from `app/assets/hdri/`, runs it through `PMREMGenerator`, returns the processed environment texture. Cached by name.

**HDRI set (3 files):**
- `studio-soft.hdr` — neutral softbox studio, used by Product mode.
- `hallway-warm.hdr` — period hallway interior with warm pendant/wall-light contribution, used by Interior mode.
- `sandstone-exterior.hdr` — overcast-to-partly-sunny daylight outside a stone building, used by Exterior mode.

HDRIs sourced from Poly Haven (CC0). Compressed to `.hdr` at 1K resolution (~1 MB each) — high enough for believable reflections on glass and hardware, low enough to keep the bundle small.

### 3. PBR material system (new)

**New function:** `getPBRMaterial(type, color)` — returns a `THREE.MeshStandardMaterial` (or `MeshPhysicalMaterial` for glass) built from real photographed texture maps: albedo + normal + roughness + AO. Cached by `type+color` key, same interface as existing `getMaterial()`.

**Material pack (textures in `app/assets/textures/<material>/`):**
- `sapele/` — albedo, normal, roughness, AO. Tileable at ~1m scale.
- `oak/`, `accoya/`, `walnut/`, `ash/`
- `painted/` — white base, tintable in shader via diffuse colour multiply (so one texture covers all heritage paint colours).
- `brass-brushed/`, `chrome-polished/`, `satin-nickel/`, `matt-black-metal/`, `antique-bronze/`
- `glass-clear/`, `glass-frosted/`, `glass-patterned-reeded/` — as `MeshPhysicalMaterial` with transmission.
- `sandstone-carved/` — for exterior reveal.
- `oak-parquet/` — for interior floor.
- `plaster-wall/` — for interior walls.

Textures sourced from Poly Haven (CC0) or ambientCG (CC0). 1K resolution, JPG compressed for albedo/AO, PNG for normal/roughness. Estimated ~20 MB total.

`getPBRMaterial()` **replaces** `getMaterial()` at the door/window call sites. `getMaterial()` stays in place for the other 5 designers until they're migrated.

### 3a. Heritage paint colour library (new)

The painted material uses **one** tintable white base texture — the colour itself comes from `material.color`. So adding branded paint colours is a data/UI addition, not more textures.

**New data file:** `app/assets/paints.json` — a curated library of heritage and high-end paint brands with official colour names and hex values.

**Brands included (seed list):**

- **Farrow & Ball** — full current range (~132 colours, e.g. `Railings No. 31`, `Hague Blue No. 30`, `Pitch Black No. 256`, `Cornforth White No. 228`, `Pigeon No. 25`, `Down Pipe No. 26`).
- **Little Greene** — full Grey / Colour Scales / Intelligent ranges (~200 colours, includes National Trust + English Heritage collaborations such as `Obsidian Green 216`, `Livid 263`, `Invisible Green 75`).
- **Paint & Paper Library** — Architectural Colours I–V + Original Colours (~200 colours).
- **Mylands** — Colours of London + Heritage ranges (~100 colours, e.g. `FTT-001 Hanover`, `Temple Bar No. 10`).
- **Edward Bulmer Natural Paint** — full range (~100 colours, British natural paint).
- **Craig & Rose** — 1829 Vintage collection + Archive (~100 colours, Scottish heritage brand — likely well-known to Taylor's clients).
- **Fired Earth** — heritage range (~150 colours).
- **Dulux Heritage** — traditional range (~100 colours, widely spec'd).
- **Neptune Home** — Chichester collection (~40 colours).
- **Benjamin Moore** — Historical Collection (~180 colours, American but used in period work).

Total: ~1,300 named colours, single JSON file, <200 KB.

**Data format:**
```json
{
  "farrow-and-ball": {
    "name": "Farrow & Ball",
    "website": "https://www.farrow-ball.com",
    "colours": [
      { "code": "No. 31", "name": "Railings", "hex": "#2f3336" },
      { "code": "No. 30", "name": "Hague Blue", "hex": "#26353f" }
    ]
  },
  ...
}
```

**UI:** The Door/Window Designer paint picker gains a **brand dropdown** alongside the existing hex colour swatch. Selecting a brand filters the colour grid. Each swatch shows the colour chip, brand code, and name on hover. "Custom hex" option remains for anything not in the library.

**Sourcing note:** paint names and hex values are facts in the public domain (published on each brand's website / sample cards). Including them in a colour-picker library is standard practice (Benjamin Moore, Farrow & Ball, etc. are already in competing apps and design tools). No licensed assets are bundled — just colour data.

### 4. Scene context (new `addRoomContext()` variants)

Existing `addRoomContext()` (~line 21007) supports `tag`, `backWall`, `leftWall`, etc. Extended with two new presets:

- `tag: 'sandstone-exterior'` — builds a carved sandstone door surround (reveal + lintel + step), a short section of sandstone wall either side, a paving stone below, and a soft background plane with HDRI environment. Interior side of the door opening is dark (a hallway beyond). Camera positioned eye-level, slightly off-axis.
- `tag: 'victorian-hallway'` — oak parquet floor, painted skirting (~180 mm tall), papered wall section either side, section of cornice and ceiling rose visible above, a warm pendant light hanging in-frame. Door is viewed from inside the house looking at the inner face.

Product mode uses a minimal context — soft ground plane with shadow catcher, no walls.

### 5. UI — presentation mode toggle

Three segmented buttons added to the Door Designer sidebar and the Window Designer sidebar:

```
[ Product ] [ Interior ] [ Exterior ]
```

Positioned under the "3D View" toggle. Default: **Product**. State persists per-designer in `localStorage`.

Switching mode rebuilds the scene via a new `rebuildScene(mode)` helper so HDRI, lighting, and context all swap atomically.

---

## Phase plan

Each phase ships independently. Taylor sees visible improvement after each one — no month-long silence.

### Phase 1 — Exposure & lighting fix (smallest win, largest visible impact)

- Tune `toneMappingExposure`, light intensities, and bloom threshold so the current render stops clipping to white.
- Keep existing procedural materials, existing background, existing everything else.
- Purely a calibration pass in `createScene()`.
- Outcome: the door and window are visible for the first time. Materials still look procedural but are at least judgeable.

### Phase 2 — HDRI system + 3-mode toggle

- Add `loadHDRI()` helper and bundle the 3 HDRI files.
- Add `rebuildScene(mode)` and the 3-button sidebar toggle in both designers.
- Wire Product / Interior / Exterior to the three HDRIs with placeholder room contexts (simple ground plane + sky).
- Outcome: user can flip between the three modes; reflections on hardware/glass start to sell the illusion.

### Phase 3 — PBR material overhaul + heritage paint library

- Bundle texture assets for sapele, oak, accoya, painted, brass, chrome, satin nickel, matt black, antique bronze, glass (clear/frosted/reeded).
- Implement `getPBRMaterial()`.
- Switch door and window call sites from `getMaterial()` → `getPBRMaterial()`.
- Bundle `app/assets/paints.json` with the heritage paint library (see section 3a).
- Rebuild the paint colour picker in both Door Designer and Window Designer with a brand dropdown + filtered swatch grid + hover labels.
- Outcome: materials look like actual wood, actual brass, actual glass; users pick paint from real branded swatches (Farrow & Ball Railings, Little Greene Obsidian Green, etc.) instead of a raw hex code.

### Phase 4 — Rich scene context (sandstone exterior + Victorian hallway)

- Implement `addRoomContext()` variants `'sandstone-exterior'` and `'victorian-hallway'`.
- Geometry for sandstone reveal (carved jambs, lintel, step) and hallway (parquet, skirting, pendant, cornice).
- Textures for sandstone and parquet from the PBR pack.
- Outcome: Interior and Exterior modes stop feeling like a door floating in a setting and start feeling like a door fitted in a real doorway.

---

## Asset requirements

| Asset type | Files | Format | Source | Size est. |
|---|---|---|---|---|
| HDRI environments | 3 | `.hdr` @ 1K | Poly Haven (CC0) | ~3 MB |
| Wood PBR sets | 5 | 4× 1K JPG/PNG per set | Poly Haven / ambientCG (CC0) | ~6 MB |
| Metal PBR sets | 5 | 4× 1K JPG/PNG per set | Poly Haven / ambientCG (CC0) | ~6 MB |
| Glass physical material presets | 3 | Material code only (no textures) | — | ~0 MB |
| Paint tintable base texture | 1 | 4× 1K JPG/PNG | Poly Haven (CC0) | ~1 MB |
| Sandstone | 1 | 4× 1K JPG/PNG | Poly Haven (CC0) | ~1.5 MB |
| Oak parquet | 1 | 4× 1K JPG/PNG | Poly Haven (CC0) | ~1.5 MB |
| Plaster wall | 1 | 4× 1K JPG/PNG | ambientCG (CC0) | ~1 MB |
| Heritage paint library | 1 | JSON colour data (~1,300 colours across 10 brands) | Public colour chart data | ~0.2 MB |
| **Total** | | | | **~20 MB** |

Textures/HDRIs are CC0-licensed (no attribution required); paint colour data is factual/public-domain — all safe to bundle in a commercial app.

Asset folder layout:

```
app/
  assets/
    hdri/
      studio-soft.hdr
      hallway-warm.hdr
      sandstone-exterior.hdr
    textures/
      sapele/  {albedo,normal,roughness,ao}.{jpg,png}
      oak/
      accoya/
      …
```

`electron-builder` `files` config already globs `app/**/*` so new assets are picked up automatically; no build config change needed.

## Size impact

Installer goes from 104 MB → ~125 MB. Acceptable for a desktop CAD app.

---

## Risks and mitigations

- **HDRI loading blocks first render.** Mitigation: show a placeholder solid background while `loadHDRI()` resolves; swap in when ready. Cache the result so mode switches after the first are instant.
- **PBR materials increase GPU memory.** Mitigation: 1K textures (not 4K), shared cache keyed by material type, dispose on designer close.
- **Sandstone geometry for exterior mode could look fake if it's just a box.** Mitigation: model the reveal as a proper carved profile (splayed jambs, chamfered edges, visible stone coursing), not a flat rectangle. Geometry is modest — a few boxes with bevels.
- **Customers may want a different interior style** (modern, minimalist) than Victorian hallway. Out of scope here — revisit after Phase 4 ships and Taylor has feedback.

## Testing approach

Visual regression. Each phase produces a set of "golden" screenshots (one per designer × mode × representative design). After each code change:

1. Take a screenshot via CDP at the fixed default camera position.
2. Compare visually against the previous golden.
3. Verify improvement, not regression, and no unrelated changes (e.g. a shadow suddenly disappearing elsewhere).

No automated pixel diffing — Three.js renders vary slightly across runs. Human eyeball at each review gate.

## Follow-up work (deferred)

The same lighting + HDRI + PBR foundation built here applies to the remaining 5 designers. Each needs a designer-specific room context:

- **Cabinet Designer** — workshop/showroom product shot + in-room context (living room or study with the cabinet fitted).
- **Kitchen Designer** — full kitchen room with worktop, splashback, appliances, window with natural light.
- **Staircase Designer** — hallway or stairwell shot with daylight from above (landing window).
- **Panelling Designer** — full room with panelling on one wall, showing how it looks fitted.
- **Ceiling Designer** — upward-looking room shot showing cornice, rose, and ceiling detail against a real ceiling plane.

A separate spec will be written once Phase 1–4 of this plan has shipped and Taylor has sat with the result for at least a couple of days.

---

## Open questions

None at spec time. If questions arise during implementation planning, they'll be surfaced in the implementation plan, not here.
