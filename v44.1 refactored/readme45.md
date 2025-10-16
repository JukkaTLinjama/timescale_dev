# v45 – Kickoff (Timescale / log‑aikajana)

**Baseline:** Forked from milestone **v44.1** (see `readme44.1.md`).  
**Goal:** Small, safe improvements with clear scope per step; keep UX identical unless stated.

---

## Scope for v45

- No architectural rewrites.
- Keep data format of `eventsDB.json` intact.
- Keep DOM structure and CSS class names stable.
- Only incremental refactors with immediate visual parity.
Important: add comments in english. I study coding, and please give clear instructions for code changes, diffs indicated and additioin in the form that can be pasted directly.

---

## Files (starting point)

- `index.html` — helpers (Util, InfoBox, SwipeZoom, Ticks, CenterBand, DataUtil) + config (TS_CFG, TS_DELAY)
- `timeline.js` — rendering, state, D3 event handlers
- `style.css` — visual styles and transitions
- `eventsDB.json` — data
- `readme44.1.md` — previous milestone notes (reference)

---

## Local run

```bash
python3 -m http.server 8000
# open http://localhost:8000/index.html
```

---

## Planned tasks (TODO)

1. **CenterBand cleanup**  
   Make `layoutCenterOverlay()` rely only on `CenterBand.compute()`. Remove internal fallback geometry.

2. **Data pipeline – single route**  
   Keep only `DataUtil.normalizeData(...)` as the canonical normalization. Remove any parallel theme/color handling.

3. **Helper safety**  
   Apply null‑safe checks to all `Util.*` usages (same pattern as `textHaloOffset`).

4. **Label transitions**  
   Ensure `g.cards text.event-label` has `transition: transform 160ms ease-out;` in `style.css`.

5. **Clip updater**  
   Introduce `updatePlotClip(x,y,w,h)` and call it from `layout()`; remove redundant clip rect updates elsewhere.

6. **(Optional) Config knob for overscroll**  
   Add `TS_CFG.zoom.overscrollYBase` (default `0.60`) and wire it into `computeTranslateExtent()` so tuning happens from HTML config only.

---

## Definition of done (per task)

- Code compiles, no console errors.
- Visual parity at k≈1 and when zoomed in (labels, axis, dim overlay, zoom window).
- No regressions in: click‑to‑activate theme, InfoBox open/close, prefocus highlight/offset.

---

## Versioning & publishing notes

- Working branch: local edits in place (no Git branching required for this milestone).
- GitHub Pages remains pointed to `main` (`/docs` if applicable). Publish by merging or copying changes into the active source when ready.

---

## Changelog (to be filled during v45)

- [ ] 45.0.1 — …
- [ ] 45.0.2 — …

---

© v45 – kickoff document (based on v44.1). Keep changes small and reversible.
