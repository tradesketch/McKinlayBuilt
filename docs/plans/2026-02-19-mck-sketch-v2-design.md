# McK Sketch v2 — Full Product Design

**Date:** 2026-02-19
**Status:** Approved

---

## Vision

McK Sketch becomes a standalone commercial SaaS product for designing houses — easy enough for a homeowner planning a self-build, accurate enough for a small builder to produce warrant-ready drawings without hiring an architect or structural engineer. Tiered pricing: Homeowner (~£15/mo) and Pro (~£49/mo).

Inspired by Plan7Architect but built around Scottish timber kit construction, UK Building Regulations compliance, and a real product catalogue (the warehouse).

---

## The Big Change: Floor Plan Becomes the App

Currently the floor plan is a popup overlay on top of a 3D component designer. For v2, **the floor plan IS the app**. The overlay is removed. The existing component designers (kitchen, door, staircase, etc.) become sub-panels that slide in when configuring an item.

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  McK Sketch  [File] [Project]    Ground · First · Roof    [Share]│
├──────────┬──────────────────────────────────────┬───────────────┤
│          │                                      │               │
│  Tools   │         2D FLOOR PLAN                │  Warehouse /  │
│          │         (main canvas)                │  Properties   │
│  Wall    │                                      │               │
│  Door    │                                      │  [Furniture]  │
│  Window  │                                      │  [Kitchen]    │
│  Select  │                                      │  [Bathroom]   │
│  Measure │                                      │  [Structural] │
│  Stairs  ├──────────────────────────────────────│  [External]   │
│          │         3D VIEW                      │               │
│  Render  │         (live, always on)            │               │
│          │                                      │               │
└──────────┴──────────────────────────────────────┴───────────────┘
```

- **Left column:** Tool palette (fixed width ~56px)
- **Centre top:** 2D floor plan canvas (primary workspace)
- **Centre bottom:** 3D live view (always rendering, resizable divider)
- **Right column:** Context-sensitive panel — warehouse catalogue or item properties
- **Top bar:** Storey tabs, project name, share/export, account

The centre divider is draggable. Keyboard shortcut toggles full 2D, full 3D, or split. On first open, defaults to 60/40 split (2D larger).

---

## Multi-Storey

A storey tab bar at the top: **Ground Floor · First Floor · Roof**. Tabs can be added (up to the plan tier limit) or removed.

- Active storey is drawn fully in 2D
- The storey below is shown as a faint ghost (30% opacity) so walls line up
- The 3D view always shows **all storeys stacked** — full house visible at all times
- Each storey has its own walls, openings, items, and floor/ceiling heights
- Storey heights default to 2400mm, adjustable per floor

---

## Smart Bidirectional Editing

Walls stay 2D-only (accuracy matters, structural). Everything else is editable in both views.

| Feature | 2D Plan | 3D View |
|---|---|---|
| Draw walls | ✅ | ❌ |
| Move / delete walls | ✅ | ❌ |
| Place doors & windows | ✅ click wall | ✅ click wall face |
| Adjust door/window size | ✅ sidebar | ✅ drag handles |
| Place furniture / warehouse items | ✅ drag onto plan | ✅ drag into scene |
| Move / rotate furniture | ✅ drag | ✅ drag |
| Roof | ❌ | ✅ parametric handles |
| Stairs | ✅ place footprint | ✅ see result |
| Room labels & dimensions | ✅ | view only |
| Site boundary / plot | ✅ | ✅ view |

**3D selection:** Click an object in 3D to select it. Selected objects show a highlight ring and transform handles (move XZ, rotate Y). Changes sync immediately to 2D plan and data model. Furniture snaps to walls and floors in 3D.

---

## Roof Generator

In the 3D view, click **"Add Roof"** once walls are drawn. A panel appears:

**Styles:** Gable · Hip · Lean-to · Flat · L-shaped (auto-detects L-plan) · Complex (custom planes)

**Controls:**
- Pitch (degrees) — slider + type-in, live preview
- Ridge height — auto-calculated from pitch, override available
- Overhang (eaves) — default 300mm
- Ridge position — drag handle in 3D

**Materials:** Concrete interlocking tile · Clay plain tile · Natural slate · Metal standing seam · EPDM (flat only)

Roof snaps to wall tops automatically. Dormers added as a sub-feature (click a roof plane, add dormer). Gable ends auto-filled with wall material.

---

## Warehouse Integration

A collapsible right-side panel with categories:

- Furniture (sofas, beds, tables, chairs, wardrobes)
- Kitchen (appliances, units, worktops)
- Bathroom (sanitary ware, taps, radiators)
- Stairs & Balustrades
- Doors & Windows (swap placed items)
- Structural (beams, posts, steels)
- External (fencing, decking, planting)
- Fixtures (lights, sockets, switches, radiators)

**Workflow:**
1. Browse or search catalogue (thumbnail grid)
2. Drag item onto 2D plan OR onto 3D scene
3. Item snaps to floor, rotates to nearest wall
4. Click to select, right panel shows properties (material variants, dimensions)
5. Items carry real dimensions — a 900mm wide sofa is 900mm wide in the model

Backend already built (49 seeded models, full CRUD API). This phase is UI-only.

---

## Photorealistic Rendering

### Real-Time (always on)
The existing Three.js pipeline (ACES tone mapping, GTAO ambient occlusion, bloom) is upgraded:
- Full PBR texture sets on all materials: diffuse, normal, roughness, AO maps
- Plaster, timber, brick, stone, tile, carpet, concrete
- Time-of-day lighting: a sun position slider (6am–10pm) rotates the directional light and changes colour temperature
- Interior lights: placed light fixtures become actual Three.js point/spot lights
- Environment: interior HDRI for reflections on glass and metallic surfaces

### On-Demand Render
A **"Generate Render"** button in the toolbar:
1. Captures current camera view
2. Renders at 4× resolution with full quality settings (4096px shadow maps, SSGI, max samples)
3. Optionally passes through a cloud AI upscaler (Replicate API) for photorealistic enhancement
4. Delivered in ~15–30 seconds, saved to project
5. Can share directly or download as PNG

Homeowner plan: 5 renders/month. Pro: unlimited.

---

## Building Regulations Compliance

### Live Warnings (while drawing)
Yellow flag icons appear in the 2D canvas next to violations:

- Room below habitable minimum area (Scotland: 6.5m² single bedroom, 10m² double)
- Ceiling height below 2.1m
- Window area below 1/10th of floor area (natural daylight)
- Door width below 775mm (accessibility / Part M)
- Stair pitch above 42° or headroom below 2m
- Habitable room with no window (ventilation)
- Party wall / fire separation not specified
- Structural span warnings (beam/lintel spans)

Click a flag to see the specific regulation reference and how to fix it.

### Compliance Export (Pro tier)
A **"Export Drawing Pack"** button generates a professional PDF:

1. **Floor plans** — each storey, dimensioned, with title block, scale bar, north arrow, revision number
2. **Elevations** — N/S/E/W auto-generated from 3D model
3. **Section drawing** — through stairwell, auto-generated
4. **Room schedule** — name, use, area (m²), ceiling height, window area, regs status
5. **Window & door schedule** — type, size, U-value, hardware
6. **Building regs checklist** — Scotland (BSD warrant) / England (Parts A–P) toggle, pass/fail per item with regulation references
7. **Structural summary** — wall types, lintels, beam spans, timber spec

Scotland and England/Wales have separate regulation sets (toggled per project).

---

## Additional Features

### Site Plan
Draw the plot boundary around the house. Add driveway, garden areas, trees, outbuildings. Useful for planning permission drawings. Site plan exports as a separate PDF.

### Virtual Walkthrough
First-person mode in 3D — WASD to walk through rooms. Very effective for client presentations. Accessible from the toolbar.

### Dimensioning Tool
Click two points on the 2D plan, drop a dimension line. Snaps to wall faces automatically. Dimensions appear on exported drawings.

### Client Share Link (Pro)
Generate a read-only 3D view link. Client opens it in a browser — no install required. They can orbit and walk through but not edit. Big differentiator vs competitors.

### Cost Estimator (Pro)
Rough cost estimate based on:
- Floor area by storey
- Wall types (external timber kit vs internal CLS)
- Spec level (standard / mid / high)
- Scottish regional build cost rates (updated quarterly)
Outputs a ballpark range, not a quote. McK branding opportunity.

### Revision History
Named saves within a project: "Draft 1", "After client call 18 Feb". Restore any previous version. Last 20 saves kept.

### Auto-Save
Project auto-saves to server every 30 seconds. Offline? Saves locally and syncs when reconnected.

---

## Data Model (high level)

```
Project
├── meta: { name, address, clientName, createdAt, tier }
├── site: { plotWidth, plotDepth, orientation, terrain[] }
└── storeys[]
    ├── id, name, label (Ground / First / etc.)
    ├── floorHeight (mm from ground)
    ├── ceilingHeight (mm)
    ├── walls[]     { x1,y1,x2,y2, thickness, height, material }
    ├── openings[]  { wallIndex, t, width, height, type, sillHeight }
    ├── items[]     { warehouseId, x, y, rotation, scale, variant }
    └── rooms[]     { name, use, polygon[] }  — auto-detected

Roof
├── type, pitch, overhang, ridgeHeight
├── material
└── planes[]
```

---

## SaaS Tiers

| | **Homeowner £15/mo** | **Pro £49/mo** |
|---|---|---|
| Storeys | 2 | Unlimited |
| Projects | 3 | Unlimited |
| Warehouse items | Basic (furniture, bathroom) | Full catalogue |
| On-demand renders | 5/month | Unlimited |
| Compliance export | Checklist view only | Full PDF drawing pack |
| Client share links | ❌ | ✅ |
| Cost estimator | ❌ | ✅ |
| Revision history | Last 5 | Last 20 |
| Export (PDF/DXF) | PDF only | PDF + DXF |

---

## Implementation Phases (high level)

1. **Restructure** — Promote floor plan to main workspace. Remove overlay. Reorganise layout (left tools, split centre, right panel).
2. **Multi-storey** — Add storey tabs. Extend data model. Ghost layer display. 3D shows all storeys stacked.
3. **Warehouse UI** — Build right-panel catalogue browser. Drag-to-place in 2D and 3D. Item properties panel.
4. **Smart 3D editing** — 3D selection (raycasting). Transform handles for furniture. Door/window click-to-place on wall faces in 3D.
5. **Roof generator** — Parametric roof panel in 3D. Gable/hip/lean-to/flat. Material picker.
6. **PBR materials + real-time upgrade** — Texture sets, time-of-day sun, interior light sources from fixtures.
7. **On-demand render** — High-quality render pass + optional AI upscaler API.
8. **Building regs engine** — Live compliance warnings in 2D. Room area / window / door / stair checks.
9. **Compliance export** — PDF drawing pack generator. Floor plans, elevations, room schedule, regs checklist.
10. **SaaS plumbing** — Tier enforcement, project auto-save, revision history, client share links.
11. **Cost estimator + site plan** — Scottish build cost model, plot boundary drawing.
12. **Virtual walkthrough** — First-person WASD mode in 3D.
