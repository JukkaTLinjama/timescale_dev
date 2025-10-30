# History Timeline – v46.2

**Date:** Oct 30, 2025  
**Scope:** Visual polish + robust mobile behavior (cards, axis, dimming)  
**Key goals:** Keep axis always bright, make passive cards/text reliably dim on mobile, and make the active card clearly stand out — all without SVG filter glitches.

---

## 1) Card visuals (two-layer, flat style)
Each card is two SVG `<rect>` layers **without** borders or shadows:
- **cardA** (bottom) – slightly offset (`+x`, `+y`) to create a soft “matte edge” impression.
- **cardB** (top) – aligned; both layers share the same theme color and right-edge fade mask.

**CSS (final in v46.2):**
```css
/* Two-layer cards, no border, no shadow */
g.card rect.cardA,
g.card rect.cardB {
  stroke: none;
  rx: 10;
  ry: 10;
  transition: fill-opacity .30s ease;
}

/* Base opacity per layer (combined ≈ stronger than either alone) */
g.card rect.cardA { fill-opacity: 0.32; }   /* bottom */
g.card rect.cardB { fill-opacity: 0.28; }   /* top */

/* Active card: clearly more opaque (combined ≈ ~0.8) */
g.card.active rect.cardA { fill-opacity: 0.60; }
g.card.active rect.cardB { fill-opacity: 0.52; }
```

**JS (geometry, simplified idea):**
```js
// Bottom layer (offset to show a soft “thickness”)
g.select("rect.cardA")
 .attr("x", 0.8)
 .attr("y", M.yRect + 0.8 + (-extraTopPadding))
 .attr("width", w)
 .attr("height", M.hRect + extraTopPadding)
 .attr("fill", d.color);

// Top layer (aligned)
g.select("rect.cardB")
 .attr("x", 0)
 .attr("y", M.yRect - extraTopPadding)
 .attr("width", w)
 .attr("height", M.hRect + extraTopPadding)
 .attr("fill", d.color);
```

**Notes:**
- `extraTopPadding` adds air above the title without changing the bottom spacing.
- Right-edge fade is via the shared `fadeRightMask` (mask remains unchanged).

---

## 2) Global dim layer (mobile-safe dimming)
To dim **all passive cards + their text** reliably on iOS/Android, we use a **single global dim rectangle** between the cards and the axis. The active card is rendered above the dim, the axis stays on top.

**Layer order (top → bottom):**
```
gAxis           // axis – always bright
gActive         // active card(s) only
#dimLayer       // global dim rectangle
gCards          // passive/regular cards
```

**Init (concept):**
```js
const gCards  = gRoot.append("g").attr("class", "cards");
const gDim    = gRoot.append("rect").attr("id", "dimLayer")
  .attr("fill", "#000").attr("opacity", 0).style("pointer-events", "none");
const gActive = gRoot.append("g").attr("class", "active-layer");
const gAxis   = gRoot.append("g").attr("class", "axis"); // append last → on top
```

**Toggle dim once per render:**
```js
const hasActive = !!state.activeTheme;
gDim.transition().duration(180).attr("opacity", hasActive ? 0.50 : 0.0); // adjust strength
setZOrder(); // ensure correct order: cards → dim → active → axis
```

**Geometry (leave a small overlap under the axis, but don’t cover labels):**
```js
const axisPad    = (state && state.axisWidth) ?? 64;
const dimOverlap = 10; // reach slightly under the axis gutter
gDim
  .attr("x", Math.max(0, axisPad - dimOverlap))
  .attr("y", 0)
  .attr("width", Math.max(0, state.width - axisPad + dimOverlap))
  .attr("height", state.height);
```

**Why this works:**
- No element-level CSS filters → avoids Safari/Chrome mobile + mask glitches.
- Text is dimmed together with backgrounds because the dim is a separate rectangle.
- Active card and axis remain bright by z-order (no complex per-element styling).

---

## 3) Axis fade (CSS variables, robust across browsers)
Axis numbers fade to grey after brief inactivity, with clean transitions.

**CSS:**
```css
g.axis {
  --axis-fill: #c9c9c9;
  --axis-op: 1;
}

g.axis text {
  fill: var(--axis-fill);
  opacity: var(--axis-op);
  transition: fill 1s ease, opacity 1s ease; /* v46.2: shorter, responsive fade */
}

g.axis.axis-dim {
  --axis-fill: #8a8a8a;
  --axis-op: 0.35;
}
```

**JS trigger (core idea):**
```js
let __axisFadeTimer = null;
function bumpAxisVisibility() {
  if (__axisFadeTimer) clearTimeout(__axisFadeTimer);
  const tSel = gAxis.selectAll("text");
  tSel.style("transition", "none");
  gAxis.classed("axis-dim", false);
  void gAxis.node().offsetWidth;             // reflow
  requestAnimationFrame(() => {
    tSel.style("transition", null);
    __axisFadeTimer = setTimeout(() => gAxis.classed("axis-dim", true), 300); // idle delay
  });
}
```

**Notes:**
- Call `bumpAxisVisibility()` on real user interactions only (`event.sourceEvent` guard).
- One-time call after the first stable render seeds the initial fade timing.

---

## 4) Mobile fixes & simplifications
- Removed all border/shadow filters and stroke-based borders (flat style).
- Stopped using CSS `filter` for card/text dimming (unreliable with masks on mobile).
- Centralized dimming to `#dimLayer` with a single opacity.
- Ensured the axis is never dimmed by keeping `gAxis` raised last.
- Optional: for stronger overall contrast, increase `#dimLayer` opacity (e.g., 0.45–0.55).

---

## 5) Quick knobs (tuning cheatsheet)
- **Active prominence:** increase `g.card.active rect.cardA/B { fill-opacity: … }`  
  Example: `0.60 / 0.52` → combined ≈ 0.80 (clearly stands out)
- **Base calmness:** lower base `0.32 / 0.28` → more transparent passives
- **Dim strength:** adjust `gDim.opacity` (0.35 → 0.50 for stronger)
- **Edge softness:** tweak `cardA` offset (0.6–1.0 px)

---

## 6) Compatibility & performance
- Works in Safari iOS / Chrome Android / desktop browsers (no filter+mask pitfalls).
- Keeps DOM light (two rects per card, one global dim rect).
- Transitions are small-scale (opacity/fill), no heavy SVG filters.

---

## 7) What changed from v46.0 → v46.2
- Adopted **two-layer** card rendering and removed shadows/borders.
- Added **global dim layer** between cards and axis (mobile-safe dimming).
- Axis fade converted to **CSS-variable** driven approach with a shorter 1s transition.
- Introduced `extraTopPadding` to give titles breathing room without inflating bottom padding.
- Fixed z-ordering so active card and axis always stay bright.

---

## Appendix – minimal CSS to keep in sync
```css
/* Cards (two-layer, flat) */
g.card rect.cardA { fill-opacity: 0.32; }
g.card rect.cardB { fill-opacity: 0.28; }
g.card.active rect.cardA { fill-opacity: 0.60; }
g.card.active rect.cardB { fill-opacity: 0.52; }

/* Dim layer */
#dimLayer {
  pointer-events: none;
  transition: opacity .18s ease;
}

/* Axis */
g.axis { --axis-fill:#c9c9c9; --axis-op:1; }
g.axis text { fill:var(--axis-fill); opacity:var(--axis-op); transition:fill 1s ease, opacity 1s ease; }
g.axis.axis-dim { --axis-fill:#8a8a8a; --axis-op:.35; }
```

---

**Author:** Jukka Linjama  
**Version:** 46.2  
**Repo area:** `index.html`, `style.css`, `timeline.js` (no data format changes)  
