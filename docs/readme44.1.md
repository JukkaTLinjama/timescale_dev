# v44.1 – Refactor summary (Timescale / log‑aikajana)

Short summary: `timeline.js` simplified; pure helpers and configuration moved to **index.html**.  
Rendering and D3 logic remain inside `timeline.js`. No visual layout changes.

---

## What changed

### 1) Configuration
- **TS_CFG / TS_DELAY** moved to index.html (easier tuning without editing JS).
- `timeline.js` now reads: `const cfg = window.TS_CFG` and delay constants from `TS_DELAY`.

### 2) InfoBox (event popover)
- DOM module **InfoBox.show/hide** now lives in index.html (IIFE pattern).
- `timeline.js` only calls `InfoBox.show(ev, box)`.

### 3) SwipeZoom (gesture mode lock)
- Old `setupGlobalSwipeZoom()` replaced with  
  **SwipeZoom.attach(svg, zoomBehavior, { innerHeight })** (from index).
- Same behavior, fewer lines.

### 4) Tick‑math
- **Ticks.majorsFromDomain / minorsFromDomain** defined in index (pure math).
- `drawAxis()` uses them as before.

### 5) CenterBand
- **CenterBand.compute(w,h,axisRight,zoomBarLeft)** central geometry calculator.
- `layoutCenterOverlay()` measures DOM edges, applies attributes.

### 6) Card‑helpers
- **Util.eventLabel / eventMeta / truncate / cardMetrics / textHaloOffset**  
  now in index.html.
- They are automatically safe‑checked in `timeline.js`.

### 7) DataUtil.normalizeData
- Pure helper in index.html that:
  - merges `group.theme` for events  
  - selects the i18n label (`meta.locale_default`)  
  - returns `events`, `themes`, and `themeColors`

### 8) loadData()
- JSON → `DataUtil.normalizeData()` → updates `state.events`, `state.themes`
- Theme colors: use `meta.ui.themeColors` if found, else fallback palette.

### 9) Minor optimization
- **Y‑map**: `state._yMap = new Map(events → y(time_years))` built in `applyZoom()`
- `drawCards()` reads from `_yMap` (fallback `state.y(...)`).

---

## Structural overview

```
index.html
 ├─ TS_CFG / TS_DELAY (configuration)
 ├─ Util (helpers: truncate, eventLabel/meta, textHaloOffset, cardMetrics)
 ├─ InfoBox (event popover)
 ├─ SwipeZoom (pointer gesture logic)
 ├─ Ticks (major/minor tick math)
 ├─ CenterBand (geometry)
 ├─ DataUtil.normalizeData (data preprocessing)
 └─ <script src="timeline.js">
```

`timeline.js` now focuses purely on:
- state management  
- D3 rendering  
- event handlers  

---

## Local testing

Browsers block `fetch('eventsDB.json')` from **file://**.  
Run a lightweight local server:

```bash
python3 -m http.server 8000
# open http://localhost:8000/index.html
```

or use VS Code “Live Server”.

---

## Compatibility / migration

- If you later create `utils.js`, simply move the helper IIFEs from index there  
  and link it before `timeline.js`.
- Script order matters:  
  **Util → InfoBox/SwipeZoom/Ticks/CenterBand/DataUtil → timeline.js**

---

## Known fixes (v44.1)

- ✅ Duplicate clipPath IDs removed (only `plotClip`/`plotClipRect` kept)
- ✅ Prefocus offset now null‑safe (`Util.textHaloOffset` fallback)
- ✅ Unified `computeTranslateExtent()` avoids undefined vars
- ✅ Zoom bounds scaled with zoom factor (no more infinite panning)
- ✅ Prefocus labels ease smoothly (`transition: transform 160ms ease-out`)
- ✅ Centerline / zoom label geometry uses `CenterBand.compute()`

---

## TODO (next safe refactor steps)

1. **CenterBand cleanup:**  
   Make `layoutCenterOverlay()` rely only on `CenterBand.compute()` (remove fallback geometry).

2. **Data pipeline:**  
   Keep a single normalization route (`DataUtil.normalizeData`), remove any parallel logic.

3. **Helper safety:**  
   Apply the same null‑safe pattern to all `Util.*` calls (like `textHaloOffset`).

4. **Label transitions:**  
   Confirm CSS includes `transition: transform 160ms ease-out;` for `text.event-label`.

5. **Clip updater:**  
   Add a small `updatePlotClip(x,y,w,h)` utility called only from `layout()` to avoid redundant updates.

---

## Performance impact

View‑structure and helper extraction reduced `timeline.js` by ~400 lines,  
improving readability and separation of concerns.

---

© v44.1 – refactor snapshot (Timescale / log‑aikajana).  
Refactored iteratively, step by step.
