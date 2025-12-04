# Timeline v49.2 — Vertical Lens Renderer (Clean Mode)

**Date:** 2025‑12  
**Scope:** v49.x focuses on rebuilding the rendering pipeline around a vertical lens deformation system.  
All editor-related modules, previews, halos, drafts, and InfoBox logic have been removed or disabled.  
The timeline now operates as a pure renderer, optimized for clarity, animation stability, and mobile/desktop parity.

---

## 1. Summary

v49 introduces:

- A unified lens-mapped Y-coordinate system
- Smooth, deterministic `lensY()` deformation with hard edges
- Lens-based horizontal scale (`scaleX`) for the focused event only
- Correct ordering & masking for prefocus text
- A minimal, predictable architecture with a small surface area
- Clean behavior on desktop and mobile (no font-size changes or special mobile hacks)

The goal is to restore simplicity after many experimental versions, while preparing the system for future interaction modules (editor, InfoBox, etc.) to be added on top safely.

---

## 2. Architecture Overview

Runtime files:

- `index.html` — loads data into `window.TS_DATA`, then loads `timeline.js`
- `style.css`  — visual design, lens band, cards, labels, prefocus styling
- `timeline.js` — all rendering, zoom, lens and prefocus logic

There are no auxiliary JS modules loaded in v49.2.  
All behavior is encapsulated in `timeline.js`.

### Main components

- **Renderer root**
  - Creates the SVG structure inside `#timeline`
  - Handles zoom and pan via D3’s zoom behavior
  - Manages z-order via `setZOrder()`

- **Center zone + lens**
  - Vertical “band” in the middle of the screen (aligned with the orange present zone)
  - Lens deformation applied only inside radius `R`
  - Outside `R` the mapping is identity (`lensY(y) = y`)

- **Event renderer**
  - Groups events by theme into stacked “cards”
  - Each card knows:
    - theme name
    - card color
    - transformed top / bottom Y extent
    - its event list
  - Events are rendered as:
    - a horizontal line from axis into the card
    - a label anchored slightly right of the line

- **Prefocus layer**
  - No halo
  - No popup
  - No editor
  - Prefocus is just:
    - one `g.e` element with `.is-prefocus`
    - a stronger `--lens-scale` (X stretch)
    - a background mask rect behind the label

- **Axis renderer**
  - Major and minor ticks mapped through `lensY`
  - Labels rendered as “10^n” with superscripts
  - Always aligned with lens-deformed coordinates

---

## 3. Vertical Lens System

The lens maps data-space Y coordinates into a visually compressed/expanded band around the center zone.

### 3.1 Configuration

```js
const lensCfg = {
    cy: 0,        // center line in gRoot space (set in layoutCenterOverlay)
    R:  0,        // radius in pixels (set in layoutCenterOverlay)
    k:  0.75,     // deformation strength
    zMax: 1.30    // max horizontal scale for labels
};
```

`layoutCenterOverlay()` updates `lensCfg.cy` and `lensCfg.R` according to the current center band geometry.

### 3.2 lensY(y0)

Vertical mapping:

- Input: logical Y from `state.y(time_years)`
- Output: lens-space Y used by all drawing code

Key properties:

- If `|y0 - cy| >= R` → `lensY(y0) = y0` (hard edge)
- Inside `R`, distance from center is modulated by a smoothstep-based weighting
- Supports both gentle and strong deformations by tuning `k` and `R`

### 3.3 lensScale(yL)

Horizontal scaling factor used only for the focused event:

- Input: lens-space Y (`yL`)
- Output: `z` in `[1, zMax]`
- `z = zMax` at the lens center
- `z = 1` at and beyond radius `R`

This matches the visual feel of the original `lens_test.html` demo.

---

## 4. Coordinate Flow

All Y-coordinates share a single pipeline:

```text
time_years
→ state.y(time_years)          // log10 mapping from data domain
→ lensY(...)
→ Math.round(...)              // snap to device pixel
→ used as Y for:
   - axis ticks
   - event lines
   - event labels
   - card extents (yTopEv / yBotEv)
```

Prefocus logic uses the same `lensY`-mapped values via `state._yMap`, so the focused event aligns with both axis and cards after deformation.

---

## 5. Prefocus System (Minimal)

Prefocus is intentionally small and predictable:

1. `computePrefocusData()` selects the best candidate event based on proximity.
2. `markPrefocusClass()`:
   - assigns `.is-prefocus` to exactly one `g.e`
   - moves that event to the end of its parent group (DOM order → drawn on top)
   - updates `--lens-scale` on all copies (card + active-card overlay)
   - updates the bounding box of `rect.label-bg` for the focused event only
3. The renderer reuses the same SVG nodes:
   - no cloning on each frame
   - transitions are handled via CSS only

### 5.1 Background mask rectangle

Every event has a hidden `rect.label-bg`.  
Only the focused event makes it visible:

- Width/height set to the label bbox + padding
- Opacity set to 1
- This masks overlapping labels behind the focused one

Non-focused events keep width/height at 0 and opacity at 0.

---

## 6. Rendering Order & Z-Index

`setZOrder()` establishes the main stack:

1. `gCards` — all cards and their events
2. `gLens` — lens background band (behind content)
3. `gDim` — global dim layer
4. `gActiveOverlay` — active-card copy drawn on top of the dim
5. `gActive` — legacy active layer (currently unused)
6. `gAxis` — axis ticks and labels

Within each card, the focused event is “brought to front” by appending its `g.e` node as the last child.  
This guarantees that its mask and text sit on top of all other events in the same card.

---

## 7. CSS Architecture (v49.2)

### 7.1 Event labels

Single transform rule:

```css
text.event-label {
    /* v49: lens-only horizontal scaling, no vertical scale */
    transform: translateY(var(--ty, 0px)) scaleX(var(--lens-scale, 1));
    transform-origin: 0% 50%;
    transition: transform .28s cubic-bezier(.22, .7, .13, 1);
    will-change: transform;
}
```

No `font-size` changes and no uniform `scale()` are used, which keeps behavior stable on mobile.

### 7.2 Prefocus styling

```css
g.e.is-prefocus text.event-label {
    /* emphasis on top of lens-scale */
    font-weight: 700;
    letter-spacing: 0.25px;
    paint-order: stroke;
    stroke: rgba(0, 0, 0, .40);
    stroke-width: .9px;
    filter: drop-shadow(0 0 3px rgba(255, 255, 255, .45));
}
```

### 7.3 Background mask

```css
.label-bg {
    fill: rgba(5, 7, 11, 0.90);
    stroke: rgba(255, 255, 255, 0.35);
    stroke-width: 0.5px;
    rx: 4px;
    ry: 4px;
    pointer-events: none;
}
```

---

## 8. Interaction Model

v49.2 ships with a deliberately minimal interaction set:

- Vertical scroll and pinch-zoom using D3 zoom behavior
- Prefocus selection driven by position and proximity
- No InfoBox, no popup halos, no editor
- Lens band is purely visual and does not intercept input
- Center hairline serves as a visual anchor for the lens and axis

This creates a stable base renderer that can later host more complex interaction modules.

---

## 9. Mobile Behavior

Desktop and mobile share exactly the same transform logic:

- No mobile-only font-size overrides
- No mobile-only suppression of scale
- Prefocus transitions and lens behavior are identical across devices
- All touch input goes through the same D3 zoom handler

Any future mobile-specific tweaks should be implemented via JS configuration (e.g. different `lensCfg` values), not by overriding the main label transforms.

---

## 10. Public API Surface

Even though v49.2 is “renderer-only”, it exposes a small, intentional API for the rest of the page.  
Everything lives on the `window` object.

### 10.1 Data input: TS_DATA

`timeline.js` expects `window.TS_DATA` to be defined **before** the script runs.

Minimal structure:

```js
window.TS_DATA = {
    meta: {
        // optional metadata, not interpreted by the renderer
        title: "History at your fingertips",
        version: "v49.2"
    },
    events: [
        {
            id: "unique-id",
            time_years: 1e3,          // positive, in years before present
            theme: "humanity",
            title: "Sample event",
            desc: "Optional description",
            link: null,               // optional link object(s)
            author: "JL",
            created_at: "2025-01-01",
            updated_at: "2025-01-01"
        },
        // ...
    ],
    themes: [
        // optional; if omitted, themes are inferred from events
        "present",
        "modern technology",
        "humanity",
        "biology"
    ],
    themeColors: {
        // optional; if omitted, colors are generated by timeline.js
        "present": "#ff9d3a",
        "modern technology": "#5dd28b",
        "humanity": "#63d4e8",
        "biology": "#5a9df5"
    }
};
```

If `themes` or `themeColors` are missing, `timeline.js` will infer reasonable defaults from the events.

### 10.2 Optional configuration: TS_CFG

`TS_CFG` is an optional configuration object merged into internal defaults:

```js
window.TS_CFG = {
    margin: {
        top:    40,
        right:  40,
        bottom: 40,
        left:   60
    },
    zoomBar: {
        // tuning for zoom bar layout, track width, etc.
    },
    card: {
        // per-card layout tweaks (padding, corner radius, etc.)
    },
    palette: {
        // optional color palette overrides
    },
    prefocus: {
        // thresholds for prefocus distance, stickiness, etc.
    }
};
```

You can omit `TS_CFG` entirely; every key has an internal default in `timeline.js`.

### 10.3 Initialization

`timeline.js` bootstraps itself on `DOMContentLoaded`, using `TS_DATA` and `TS_CFG`.  
Once initialization is complete, it emits a custom DOM event:

```js
document.addEventListener("timeline:ready", () => {
    // safe to call TimelineAPI here
});
```

### 10.4 Runtime control: TimelineAPI

`timeline.js` exposes a small control surface via `window.TimelineAPI`:

```js
window.TimelineAPI = {
    // Instant zoom/pan (no animation)
    scaleBy(factor, x, y) { ... },
    translateBy(dx, dy) { ... },

    // Animated zoom/pan
    animScaleBy(factor, x, y, dur) { ... },
    animTranslateBy(dx, dy, dur) { ... },

    // Select a theme (as if the user clicked the card)
    selectTheme(name) { ... },

    // Utility: a convenient screen anchor near center-right
    getCenter() { return { x, y }; }
};
```

Typical usage from outside:

```js
document.addEventListener("timeline:ready", () => {
    const { x, y } = window.TimelineAPI.getCenter();
    // gentle zoom-in towards the center band
    window.TimelineAPI.animScaleBy(1.5, x, y, 600);
});
```

Calling `selectTheme(name)` changes the active card, re-runs `drawCards()` and re-applies z-order logic.

### 10.5 Periodic refresh: updateTimeline()

The renderer is designed to handle “present” ticking without re-initialization.  
If external code updates `window.TS_DATA.events` in-place (for example, present anchor text or counts), you can ask the renderer to repaint with the current zoom/scroll:

```js
// After modifying window.TS_DATA.events / themes / themeColors:
window.updateTimeline();
```

`updateTimeline()`:

- reads fresh `TS_DATA`
- keeps the current zoom transform
- redraws axis, cards and events using the existing domain and transform
- does not fire a D3 zoom event (to avoid interfering with transitions)

This function is also used by the internal “1-second present tick” logic.

---

## 11. Version Goals

### Achieved in v49.x

- Unified lens-aware coordinate system
- Lens-integrated axis, cards and events
- Stable prefocus with mask and X-only scaling
- Removal of editor/preview/halo-related complexity
- Simpler CSS and identical behavior on mobile / desktop
- A small, well-defined external API surface (`TS_DATA`, `TS_CFG`, `TimelineAPI`, `updateTimeline`)

### Planned for later versions

- Re-introduce InfoBox on top of the lens, with better layering and focus rules
- Re-introduce an editor module as a separate, pluggable script
- Theme-based filtering and color-by-topic modes
- Performance tuning and virtualisation for very large event sets
- Optional “present mode” focusing on last N decades with more live data

