# McK Sketch — CAD / Floor Plan View Toggle Design

**Date:** 2026-03-01
**Status:** Approved

## Problem

The V2 floor-plan-as-primary-workspace change placed `#fp-main-2d` (floor plan canvas) on top of `#canvas` (main CAD canvas) with `z-index: 2`. This breaks all main CAD drawing tools — clicks intended for the CAD canvas (circle, line, rectangle, etc.) are intercepted by the floor plan canvas.

## Goal

Two switchable views:
1. **Floor Plan mode** — draw and edit the room layout
2. **CAD mode** — sketch joinery details with the floor plan visible as a faint ghost underlay

The user lays out walls in Floor Plan mode, then switches to CAD mode to draw detailed joinery on top of the floor plan as a background reference.

## Approved Design — Option A: Layer Stack with View Toggle

### DOM Structure

`#canvas-wrap` becomes a flex column with two children:

```
#canvas-wrap (flex column, position:relative, overflow:hidden)
  #fp-tools-bar          ← floor plan toolbar (hidden in CAD mode)
  #canvas-area           ← flex:1, position:relative
    #canvas               ← main CAD canvas (position:absolute, inset:0)
    #fp-main-2d           ← floor plan canvas (position:absolute, inset:0)
    #axis-indicator       ← CAD-only overlay
    #coords               ← CAD-only overlay
    #scale                ← CAD-only overlay
    #vcb                  ← CAD-only overlay
```

Both canvases fill `#canvas-area` exactly. The view toggle controls which one is active.

### View Toggle UI

A segmented control in the main `<header>` bar (same style as mm/ft toggle):

```html
<div class="view-toggle">
  <button class="view-toggle-btn active" data-view="floorplan" onclick="setAppView('floorplan')">Floor Plan</button>
  <button class="view-toggle-btn" data-view="cad" onclick="setAppView('cad')">CAD</button>
</div>
```

### Layer Switching — `setAppView(view)`

**Floor Plan mode:**
- `#fp-tools-bar`: `display: flex`
- `#fp-main-2d`: z-index:2, pointer-events:all, opacity:1
- `#canvas`: z-index:1, pointer-events:none, display:none
- `#fp-sidebar-in-panel`: visible
- `#axis-indicator`, `#coords`, `#scale`, `#vcb`: hidden
- Calls `fpResizeCanvas()`

**CAD mode:**
- `#fp-tools-bar`: `display: none`
- `#fp-main-2d`: z-index:1, pointer-events:none, opacity:0.15 (ghost underlay)
- `#canvas`: z-index:2, pointer-events:all, display:block
- `#fp-sidebar-in-panel`: hidden
- `#axis-indicator`, `#coords`, `#scale`, `#vcb`: visible
- Calls `resize()`

Last used view persisted to `localStorage('app-view')`, restored on startup.

### Resize Handling

`#canvas-area` gets a single `ResizeObserver`. On resize:
- If current view is CAD → call `resize()`
- If current view is Floor Plan → call `fpResizeCanvas()`

Existing `resize()` reads `canvas-wrap` dimensions — needs updating to read `canvas-area` instead so it doesn't include the fp-tools-bar height in CAD mode.

### CSS Changes

```css
#canvas-area {
  flex: 1;
  position: relative;
  overflow: hidden;
  min-height: 0;
}
#canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
#fp-main-2d {
  /* remove flex:1 — now position:absolute inside canvas-area */
  position: absolute;
  inset: 0;
}
.view-toggle-btn.active {
  background: var(--accent);
  color: #fff;
}
```

## Files Changed

- `app/mck-sketch.html` — all changes (CSS, HTML, JS)

## Commit Message

```
feat: CAD/floor-plan view toggle with floor plan ghost underlay
```
