# Timescale Logarithmic Timeline — Version 42.2

### Summary

v42.2 stabilizes **vertical zoom and overscroll** behavior for both mobile and desktop.  
Scrolling, panning, and zooming now feel natural across all zoom levels — even when fully zoomed in or zoomed out.  
The focus logic and visual indicators remain as in earlier v42 releases.

---

## ✅ Main Features

### 1. Vertical Zoom and Pan

- **Smooth zoom:** pinch or gesture zoom scales the entire timeline vertically.
- **Dynamic overscroll:**  
  - At full scale (k≈1), you can scroll past the top and bottom by about **½ viewport height**.  
  - As you zoom in, the overscroll **shrinks automatically**, preventing events from sliding out of view.
- **Consistent pan bounds:** uses dynamic `translateExtent` inside the zoom handler for perfect balance between freedom and control.

### 2. Horizontal Zoom (center zone)

- Horizontal “swipe → zoom” works only from the **visible center band** to avoid accidental gestures.
- Visual indicator (dashed orange line + “zoom <->” label) marks the active center zone.

### 3. Prefocus Highlight

- The event label closest to the center line is automatically highlighted.
- Updates in real time while scrolling or zooming.
- CSS class: `text.event-label.prefocus`.

### 4. Styling Overview

Key visual layers:

| Element | CSS class / ID | Purpose |
|----------|----------------|---------|
| Center dashed line | `.centerZoomLine` | visual indicator for zoom center |
| Center label | `.centerZoomLabel` | “zoom <->” hint text |
| Event focus | `.prefocus` | highlight for nearest event |
| Timeline area | `#timeline-container` | viewport wrapper |

Accent color follows `--accent` (default orange `#ff8c42`).

---

## ⚙️ Technical Details

### Zoom Behavior Example

```js
const ZOOM_MIN = 0.85;
const ZOOM_MAX = 6;

const zoomBehavior = d3.zoom()
  .scaleExtent([ZOOM_MIN, ZOOM_MAX])
  .on("zoom", (event) => {
    const t = event.transform;
    state.y = t.rescaleY(state.yBase);

    // dynamic overscroll based on current zoom
    const base = Math.round(state.height * 0.5);
    const extra = Math.max(16, Math.round(base / Math.max(1e-6, t.k)));

    let x0 = 0, y0 = 0, x1 = state.width, y1 = state.height;
    try {
      const bb = svg.select("#plot-rect").node().getBBox();
      x0 = bb.x;
      y0 = bb.y - extra;
      x1 = bb.x + bb.width;
      y1 = bb.y + bb.height + extra;
    } catch (_) {
      y0 = -extra;
      y1 = state.height + extra;
    }

    zoomBehavior
      .extent([[0, 0], [state.width, state.height]])
      .translateExtent([[x0, y0], [x1, y1]]);

    updateZoomIndicator(t);
    applyZoom();
  });
