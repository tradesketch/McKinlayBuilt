# McK Sketch 3D Overhaul + McK Warehouse

**Date:** 2026-02-17
**Status:** Approved
**Goal:** Bring all 3D designers to Plan7Architect-level realism. Replace box-based geometry with proper joinery construction (bevels, chamfers, rounds, profiled mouldings). Build McK Warehouse — a parametric + catalogue asset library with cloud-hosted model delivery.

---

## 1. Geometry System Overhaul

### Problem
Every 3D component (stiles, rails, panels, architraves, cabinets, worktops) uses `BoxGeometry`. No chamfers, no rounded edges, no proper profiles. Raised panels are three stacked boxes. Mouldings are flat rectangular extrusions.

### Solution: New Geometry Primitives

**TimberMember** — Replaces all box-based timber. Parameters: length, width, thickness, edge profile (square, chamfer, round, pencil-round). Uses `ExtrudeGeometry` with cross-section `Shape` that has correct edge treatment. UV mapping orients grain along the member length automatically.

**MouldingProfile** — Real cross-sections defined as 2D `Shape` paths:
- Ogee: S-curve (concave into convex)
- Ovolo: quarter-round
- Bolection: raised stepped profile
- Lambs tongue: tapered tongue
- Torus: half-round
- Bead & butt: small half-round bead
- Pencil round: slight chamfer with round

Extrude along straight paths; follow curved paths for arched doors.

**RaisedPanel** — Single geometry with angled bevel faces (7-12 degrees) between field and tongue. Configurable bevel angle and field raise height. Replaces the three-stacked-box approach.

**TurnedComponent** — `LatheGeometry` from profile curves. For knobs, finials, balusters, newel caps, spindles.

**CabinetCarcass** — Parametric box with edge-banding, shelf pin holes, hinge cups, internal dados and rabbets. Visible detail when doors are open.

**WorktopProfile** — Extrusion with configurable edge: bullnose, pencil round, bevelled, waterfall, square.

---

## 2. Material System Upgrade

### Bundled PBR Texture Sets (~30MB total)

Wood species (each with diffuse, normal, roughness, AO at 2K):
- Oak, Walnut, Ash, Pine, Sapele, Maple, Cherry, Iroko, Accoya

Stone/tile:
- Carrara marble, black granite, metro tile, herringbone tile, slate

Metals (PBR metallic workflow):
- Chrome, brass, satin nickel, matt black, antique bronze

### Procedural Textures (keep for paint)
Paint finishes stay procedural but add brush stroke normal maps for matt/eggshell/satin/gloss distinction.

### UV Mapping Fix
Grain direction must follow component length. Horizontal rails get horizontal grain. Vertical stiles get vertical grain. Currently textures apply uniformly regardless of orientation.

---

## 3. McK Warehouse

### Tier 1 — Parametric Library (bundled with app)

All bespoke joinery generated from parameters:

**Doors:** Victorian 4-panel, Edwardian, Shaker, Flush, Cottage, Stable, Contemporary
**Windows:** Casement, sash, bay, Venetian, skylight
**Cabinet doors:** Shaker, raised & fielded, slab, beaded, glass, J-pull
**Moulding profiles:** Ogee, ovolo, bolection, torus, lambs tongue, bead & butt, pencil round
**Skirting profiles:** Ogee, torus, chamfer, bullnose, Victorian, Edwardian
**Architrave profiles:** Ogee, chamfer, bullnose, ovolo
**Staircase components:** Balusters (turned, square, contemporary), newels, handrails, treads, risers, stringers
**Worktop edges:** Bullnose, pencil round, bevelled, waterfall, square

### Tier 2 — Catalogue Library (cloud-hosted, cached locally)

Fixed high-detail glTF models:

**Ironmongery:** Door handles (lever, knob, pull), cabinet pulls, knobs, T-bars, cup handles, hinges (butt, parliament, tee), locks, letterboxes, knockers, numerals. Organised by style: contemporary, traditional, industrial.

**Kitchen appliances:** Ovens, hobs (gas, induction, ceramic), sinks (Belfast, undermount, inset), taps (mono, bridge, boiling water), extractors, fridges, dishwashers, washing machines.

**Sanitary ware:** Basins (countertop, wall-hung, pedestal), baths (freestanding, built-in), toilets (close-coupled, wall-hung), showers (enclosure, wetroom).

**Furniture:** Sofas, dining tables, beds, chairs, wardrobes, bookcases — for room context staging.

**Fixtures:** Pendant lights, wall lights, downlights, radiators (column, panel), towel rails, switches, sockets.

**Exterior:** Roof tiles, brick bonds, cladding (timber, composite), rainwater goods, fascias.

### Warehouse UI

- Category browser (sidebar or modal) with tree navigation
- Search with tags and filters
- Thumbnail grid with spinning 3D preview on hover
- Drag-and-drop placement or click-to-place with positioning handles
- Favourites/recently used section
- Cloud models cached in app data after first download
- Admin upload endpoint (your account) for adding new models without app updates

---

## 4. Server Additions

### New API Routes

```
GET  /api/warehouse/categories          — Category tree
GET  /api/warehouse/items               — Browse/search (?category=&search=&page=)
GET  /api/warehouse/item/:id            — Model metadata + download URL
GET  /api/warehouse/item/:id/model      — Download glTF file
GET  /api/warehouse/item/:id/thumbnail  — Thumbnail image
POST /api/warehouse/item                — Admin: upload new model
PUT  /api/warehouse/item/:id            — Admin: update model metadata
DELETE /api/warehouse/item/:id          — Admin: remove model
```

### New Database Table

```sql
CREATE TABLE warehouse_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  tags TEXT,                    -- comma-separated
  description TEXT,
  type TEXT DEFAULT 'catalogue', -- 'parametric' or 'catalogue'
  parameters TEXT,              -- JSON for parametric items
  model_filename TEXT,          -- glTF filename on disk/cloud
  thumbnail_filename TEXT,
  file_size INTEGER,
  version INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### File Storage

Models and thumbnails stored in `/server/warehouse/` directory, served as static files. For cloud deployment, swap to S3/equivalent.

---

## 5. Rendering Pipeline Tweaks

- **Tone mapping:** Switch from `NoToneMapping` to `ACESFilmicToneMapping` with exposure ~1.1
- **SSAO radius:** Increase from 0.3 to 0.8 for visible depth in panel recesses
- **Bloom threshold:** Lower from 0.98 to 0.85 for subtle specular on chrome/brass
- **Contact shadows:** Darken where objects meet surfaces (skirting-floor, door-frame)
- **Environment map:** Keep RoomEnvironment but increase intensity slightly for better reflections on polished surfaces

---

## 6. Implementation Order

1. Geometry primitives (TimberMember, MouldingProfile, RaisedPanel)
2. Material system (bundle PBR textures, fix UV grain direction)
3. Rebuild Door Designer 3D with new primitives
4. Rebuild Window Designer 3D
5. Rebuild Cabinet Designer 3D
6. Rebuild Kitchen Elevation 3D
7. Rebuild Staircase Designer 3D
8. Rebuild Wall Panelling + Coffered Ceiling 3D
9. Rendering pipeline tweaks
10. Warehouse server API + database
11. Warehouse UI (browser panel, search, drag-and-drop)
12. Populate warehouse with initial model set

---

## 7. Designers Affected

All 3D builders in `mck-sketch.html`:
- `buildDoor3D()` — line 20452
- `buildWindow3D()` — line 20842
- `buildCabinet3D()` — line 20274 (cabinet designer)
- `buildKitchen3D()` — line 19978
- `buildStaircase3D()` — line 21248
- `buildWallPanelling3D()` — line 21083
- `buildCofferedCeiling3D()` — line 21578

Shared systems:
- `createScene()` — line 19836
- `getMaterial()` — line 19374
- Procedural texture generators — lines 19132-19369
- Moulding/frame helpers — lines 19566-19617
