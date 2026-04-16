# Floor Plan Sidebar Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the floor plan right sidebar so it looks professional and consistent with the dark theme design system.

**Architecture:** All changes are in the single file `app/mck-sketch.html` — CSS edits in the `<style>` block (lines ~20–4100) and HTML edits in the sidebar markup (lines ~19545–19675). No server changes. No new files.

**Tech Stack:** CSS, HTML, Electron 33

---

## Task 1: Fix tool button typography and weight

The 3×3 tool grid buttons (Wall, Door, Window, etc.) look cheap because of tiny 11px inline font-size, thin padding, and lack of visual weight. Fix by improving the `.fp-tool-btn` class and removing inline style overrides.

**Files:**
- Modify: `app/mck-sketch.html:3937-3944` (CSS — `.fp-tool-btn` rule)
- Modify: `app/mck-sketch.html:19548-19558` (HTML — remove inline `style="font-size:11px;padding:6px 4px"` from each button)
- Modify: `app/mck-sketch.html:19559-19562` (HTML — Undo/Clear row, remove inline styles)

- [ ] **Step 1: Update `.fp-tool-btn` CSS for sidebar grid context**

Add a scoped rule for tool buttons when inside the sidebar grid. These need slightly larger text, more padding, and a subtle background lift so they read as proper controls:

```css
/* Tool grid buttons inside sidebar */
.fp-sidebar .fp-tool-btn {
  font-size: 11.5px;
  padding: 7px 6px;
  font-weight: 600;
  letter-spacing: 0.3px;
  text-align: center;
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
}
.fp-sidebar .fp-tool-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
  color: var(--text-primary);
}
```

Insert after `.fp-tool-btn.active` rule at line ~3944.

- [ ] **Step 2: Remove inline styles from tool grid buttons**

Remove `style="font-size:11px;padding:6px 4px"` from all 9 tool buttons (lines 19549–19557) and remove ALL inline styles from Undo/Clear buttons (lines 19560–19561) — including `flex:1`, `font-size`, `padding`. The `flex:1` will be handled by `.fp-tool-row > *` in Task 6.

- [ ] **Step 3: Fix Clear button hardcoded colour**

On line ~19561, change `color:#f87171` to `color:var(--error)`.

- [ ] **Step 4: Test in Electron**

Launch the app, open floor plan. Verify:
- Tool buttons have consistent sizing and better visual weight
- Hover states show accent border
- Active state (gold background) still works
- Clear button is red using the CSS variable

- [ ] **Step 5: Commit**

```bash
git add app/mck-sketch.html
git commit -m "fix: improve tool button styling in floor plan sidebar"
```

---

## Task 2: Move inline styles to CSS classes for sidebar selects

The `<select>` elements for External Finish, Internal Finish, Paint Colour presets, and Fascia/Soffit all have long inline `style=` attributes that duplicate each other. Move to a shared CSS class.

**Files:**
- Modify: `app/mck-sketch.html:~3991` (CSS — add new `.fp-select` class after `.fp-sidebar-section`)
- Modify: `app/mck-sketch.html:19615-19665` (HTML — replace inline styles with `class="fp-select"`)

- [ ] **Step 1: Add `.fp-select` CSS class**

Insert after the `.fp-sidebar-section` rule (~line 3991):

```css
.fp-select {
  width: 100%;
  margin-bottom: 8px;
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 5px 8px;
  font-size: 11px;
  transition: border-color 0.15s;
  cursor: pointer;
}
.fp-select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(245, 197, 24, 0.15);
}
```

- [ ] **Step 2: Replace inline styles on all sidebar selects**

For each of these selects, remove the `style="..."` and add `class="fp-select"`:
- `#fp-ext-finish` (line ~19615)
- `#fp-int-finish` (line ~19628)
- `#fp-paint-preset` (line ~19643)
- `#fp-fascia-mat` (line ~19659)

- [ ] **Step 3: Test in Electron**

Open floor plan sidebar. Verify:
- All 4 dropdowns look identical
- Focus ring appears on click (gold border + glow)
- Dropdown options are readable on dark background

- [ ] **Step 4: Commit**

```bash
git add app/mck-sketch.html
git commit -m "refactor: extract sidebar select inline styles to .fp-select class"
```

---

## Task 3: Make Finishes and View sections collapsible

External Finish, Internal Finish, Paint Colour, and Fascia/Soffit are all in one `#fp-wall-finishes` section. Along with the View section, these are less frequently changed. Make them collapsible using the existing `toggleSec` pattern (already used in the right panel Properties/Entity sections). Tools, Wall, and Rooms stay always-visible.

**Files:**
- Modify: `app/mck-sketch.html:19613-19670` (HTML — wrap finishes and view sections with collapsible heads)
- Modify: `app/mck-sketch.html:~3991` (CSS — add `.fp-sidebar-section.closed .fp-sidebar-body` rule)

- [ ] **Step 1: Add collapsible CSS for sidebar sections**

Add after the `.fp-sidebar-title::after` rule (~line 4001):

```css
.fp-sidebar-section .fp-sidebar-body {
  overflow: hidden;
  transition: max-height 0.25s ease, opacity 0.2s ease;
  max-height: 500px;
  opacity: 1;
}
.fp-sidebar-section.closed .fp-sidebar-body {
  max-height: 0;
  opacity: 0;
}
.fp-sidebar-title.collapsible {
  cursor: pointer;
  user-select: none;
}
.fp-sidebar-title.collapsible:hover {
  color: var(--text-primary);
}
.fp-sidebar-title.collapsible::after {
  display: none; /* suppress the gradient line on collapsible titles */
}
.fp-sidebar-title.collapsible::before {
  content: '▾';
  font-size: 9px;
  transition: transform 0.2s;
}
.fp-sidebar-section.closed .fp-sidebar-title.collapsible::before {
  transform: rotate(-90deg);
}
```

- [ ] **Step 2: Wrap finishes section content in collapsible body**

In `#fp-wall-finishes` (line ~19613), make the title clickable and wrap the select elements in a `.fp-sidebar-body` div:

```html
<div class="fp-sidebar-section" id="fp-wall-finishes">
  <div class="fp-sidebar-title collapsible" onclick="this.parentElement.classList.toggle('closed')">Finishes</div>
  <div class="fp-sidebar-body">
    <!-- all the existing select elements for ext/int finish, paint, fascia -->
  </div>
</div>
```

Consolidate the multiple `.fp-sidebar-title` headers (External Finish, Internal Finish, Paint Colour, Fascia/Soffit) into sub-labels inside the body — use `<label>` elements styled as `fp-prop-row label` instead of full section titles. This reduces vertical space significantly.

- [ ] **Step 3: Wrap View section content in collapsible body**

Same pattern for the View section (line ~19667):

```html
<div class="fp-sidebar-section">
  <div class="fp-sidebar-title collapsible" onclick="this.parentElement.classList.toggle('closed')">View</div>
  <div class="fp-sidebar-body">
    <div class="fp-prop-row"><label>Grid</label><input ...> mm</div>
  </div>
</div>
```

- [ ] **Step 4: Test in Electron**

- Click "Finishes" title — section collapses with animation
- Click again — expands back
- Click "View" title — collapses/expands
- Tools, Wall, Rooms sections are NOT collapsible
- Collapsing both frees significant vertical space

- [ ] **Step 5: Commit**

```bash
git add app/mck-sketch.html
git commit -m "feat: make Finishes and View sidebar sections collapsible"
```

---

## Task 4: Tighten sidebar section density and spacing

Reduce padding and margins across sidebar sections so more fits without scrolling. The current 12px/14px padding is generous for a 190px-wide panel.

**Files:**
- Modify: `app/mck-sketch.html:3991` (CSS — `.fp-sidebar-section` padding)
- Modify: `app/mck-sketch.html:3992-3997` (CSS — `.fp-sidebar-title` margins)
- Modify: `app/mck-sketch.html:4002` (CSS — `.fp-prop-row` margin)

- [ ] **Step 1: Tighten section padding**

```css
.fp-sidebar-section { padding: 8px 12px; border-bottom: 1px solid var(--border); }
```

- [ ] **Step 2: Tighten title bottom margin**

```css
.fp-sidebar-title {
  font-size: 10px; font-weight: 700; color: var(--accent);
  text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 7px;
  padding-bottom: 4px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 6px;
}
```

- [ ] **Step 3: Tighten property row margin**

```css
.fp-prop-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 12px; }
```

- [ ] **Step 4: Test in Electron**

Open floor plan sidebar. Verify:
- All sections are tighter, less scrolling needed
- Nothing overlaps or feels cramped
- Labels and inputs still have breathing room

- [ ] **Step 5: Commit**

```bash
git add app/mck-sketch.html
git commit -m "fix: tighten floor plan sidebar spacing for density"
```

---

## Task 5: Fix hardcoded colours in floor plan panel

Several colours in the floor plan area are hardcoded light-theme values that don't match the dark design system.

**Files:**
- Modify: `app/mck-sketch.html:3958` (CSS — `.fp-2d-panel` background)
- Modify: `app/mck-sketch.html:3982-3985` (CSS — `.fp-dim-label` colours)
- Modify: `app/mck-sketch.html:3973` (CSS — `.fp-3d-container` background)

- [ ] **Step 1: Fix `.fp-2d-panel` background**

Line 3958: change `background: #f8f8f6;` to `background: var(--canvas);`

Note: `--canvas: #fafbfc` is already defined and intentionally light — the 2D canvas represents a drawing surface (like paper). This isn't a dark-theme fix; it's a maintainability fix so the canvas colour is centrally controlled via the CSS variable rather than hardcoded.

- [ ] **Step 2: Fix `.fp-dim-label` colours**

Lines 3982-3985: change from:
```css
.fp-dim-label {
  position: absolute; font-size: 10px; color: #666;
  background: rgba(255,255,255,0.9); padding: 1px 4px;
  border-radius: 2px; pointer-events: none; white-space: nowrap;
}
```
to:
```css
.fp-dim-label {
  position: absolute; font-size: 10px; color: var(--text-muted);
  background: var(--bg-surface); padding: 1px 4px;
  border-radius: 2px; pointer-events: none; white-space: nowrap;
}
```

- [ ] **Step 3: Test in Electron**

- Open floor plan — 2D canvas should still look like paper/drawing surface
- Dimension labels on walls should be readable on dark background
- 3D panel background unchanged (already dark)

- [ ] **Step 4: Commit**

```bash
git add app/mck-sketch.html
git commit -m "fix: replace hardcoded colours in floor plan with CSS variables"
```

---

## Task 6: Clean up inline styles on sidebar grid and tool row

The tool grid `div` and Undo/Clear row have inline `style=` for layout that should be CSS classes. This is the last inline-style cleanup pass.

**Files:**
- Modify: `app/mck-sketch.html:~3944` (CSS — add `.fp-tool-grid` and `.fp-tool-row` classes)
- Modify: `app/mck-sketch.html:19548` (HTML — replace inline grid style)
- Modify: `app/mck-sketch.html:19559` (HTML — replace inline flex style)

- [ ] **Step 1: Add CSS classes**

After the sidebar `.fp-tool-btn` rules:

```css
.fp-tool-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3px;
}
.fp-tool-row {
  display: flex;
  gap: 3px;
  margin-top: 4px;
}
.fp-tool-row > * {
  flex: 1;
}
```

- [ ] **Step 2: Replace inline styles in HTML**

Line 19548: change `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px">` to `<div class="fp-tool-grid">`

Line 19559: change `<div style="display:flex;gap:3px;margin-top:4px">` to `<div class="fp-tool-row">`

- [ ] **Step 3: Test in Electron**

Tool grid and undo/clear row render identically to before.

- [ ] **Step 4: Commit**

```bash
git add app/mck-sketch.html
git commit -m "refactor: move tool grid inline styles to CSS classes"
```

---

## Task 7: Polish the Properties section

The Properties section (Type, Length, Area, X, Y, Angle) shows dashes when nothing is selected and looks sparse. Give it a subtle empty state and tighter layout.

**Files:**
- Modify: `app/mck-sketch.html:4768-4779` (HTML — Properties section in `<aside id="panel">`)
- Modify: `app/mck-sketch.html:~417` (CSS — add `.row` styling improvements)

- [ ] **Step 1: Style the property rows for a less sparse look**

The Properties section currently shows literal `—` text in each span when nothing is selected. Rather than changing the JS, style the `—` state to look intentional. Add after the `.section-arrow` rules (~line 445):

```css
.row {
  padding: 4px 0;
}
.row-label {
  font-size: 11px;
}
.row-value {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
```

This gives property values monospaced number alignment so they look clean when populated with dimensions.

- [ ] **Step 2: Test in Electron**

- Open floor plan with nothing selected — Properties shows dashes (styled consistently)
- Select a wall — Properties shows Type: Wall, Length, etc. with aligned numbers
- Deselect — back to dashes

- [ ] **Step 3: Commit**

```bash
git add app/mck-sketch.html
git commit -m "fix: polish Properties section empty state"
```

---

## Summary

| Task | What | Type |
|------|------|------|
| 1 | Tool button typography & weight | Visual fix |
| 2 | Extract select inline styles to `.fp-select` | Refactor + polish |
| 3 | Collapsible Finishes & View sections | Feature |
| 4 | Tighten sidebar spacing | Visual fix |
| 5 | Fix hardcoded colours in floor plan | Bug fix |
| 6 | Clean up inline styles on tool grid | Refactor |
| 7 | Polish Properties empty state | Visual fix |

**Estimated commits:** 7 (one per task)

**Risk:** Low — all CSS/HTML changes in one file, no logic changes, easy to test visually.
