# Logarithmic Timeline — v40.2

**Scope:** UI cleanup, right-edge dim strip fix, safer zoom bounds.  
**Status:** stable for v40.2; one known issue left with activation (see below).

---

## What’s new in v40.2

### 1) Zoom overscroll fixed
- Clamped pan/zoom to the *visible content box* so the view no longer “runs away” when you scroll into the top/bottom edge.
- **Change:** replaced loose `translateExtent([[0, -2000], [w, h+2000]])` with tight extents derived from the current layout:
  - In **ResizeObserver**:  
    ```js
    const H = innerHeight();
    zoomBehavior.extent([[0, 0], [state.width, H]])
                .translateExtent([[0, 0], [state.width, H]]);
    ```
  - In **layout()**:  
    ```js
    const innerH = innerHeight();
    zoomBehavior.extent([[0, 0], [innerWidth(), innerH]])
                .translateExtent([[0, 0], [innerWidth(), innerH]]);
    ```

### 2) Right-edge grey strip eliminated
- The overlay and clip widths now align with the **actual SVG right edge** (leaving a tiny 8 px padding) so cards no longer get clipped and the constant grey band on the right disappears.
- **Change (layout):**
  ```js
  const axisGap = 2;
  const contentLeft = rootTX + axisGap;
  const contentWidthSVG = Math.max(0, state.width - contentLeft - 8);

  dimRect
    .attr("x", contentLeft)
    .attr("y", 0)
    .attr("width", contentWidthSVG)
    .attr("height", state.height);

  const clipWidthLocal = Math.max(0, state.width - rootTX - 8);
  plotClipRect
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", clipWidthLocal)
    .attr("height", innerHeight());

  d3.select("#plot-rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", clipWidthLocal)
    .attr("height", innerHeight());
  ```

### 3) ZoomBar is indicator-only
- All interaction removed from the ZoomBar; it no longer captures input.
- **CSS:**  
  ```css
  /* v40: Zoom bar is indicator-only; let all input pass through it */
  svg .zoomBar,
  svg .zoomBar .track,
  svg .zoomBar .window,
  svg .zoomBar .hit { pointer-events: none; }
  ```
- **Z-order:** removed `gZoom.raise()` from `setZOrder()` so it can’t cover UI layers.

### 4) Dimming behavior
- Global dim overlay (`dimRect`) is retained for layout, but **not** used to dim content in v40.2 (no constant band on the right).
- Per-card dimming is handled via CSS on `g.card.inactive`, dimming the entire card (rect + text):
  ```css
  g.card.inactive { filter: brightness(0.55); opacity: 1 !important; }
  g.card.inactive rect { fill-opacity: 1; }
  ```

---

## Known issue (to be addressed in v40.3)
- **Activation:** occasionally a previously active card remains styled as active. Root cause: legacy per-card class updates competing with the state-driven move to `gActive`. Fix will unify activation after `merged` is computed and ensure a single active theme at a time.

---

## File touches (summary)
- **timeline.js**
  - Tight `extent/translateExtent` (ResizeObserver + layout).
  - Fixed `dimRect` / `clipPath` widths.
  - Removed `gZoom.raise()` in `setZOrder()`.
- **style.css**
  - Added `pointer-events:none` selectors for `.zoomBar…`.
  - Added `g.card.inactive` dimming rules.

---

## Run
Open `index.html` in a browser / local server. Use scroll to pan, pinch/trackpad to zoom. Edges now clamp cleanly.

---

## Notes
- The left axis remains visible; overlays start **after** the 2 px axis gap by design.
- If you prefer *only* the background to dim (not text), move the `filter: brightness()` rule from `g.card.inactive` to `g.card.inactive rect` and tune text opacity separately.

© 2025 J.L.
