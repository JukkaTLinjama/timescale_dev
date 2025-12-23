# Timescale — v49.5 README (milestone plan & API)
**Baseline:** v49.2 “Vertical Lens Renderer (Clean Mode)” — renderer‑only, stable core.  
**Intent (v49.5):** keep the lens‑based interactive visualization stable and **add back an Editor as a clean, optional, open‑source module** without regressing UX or performance.

---

## 1) Project intent
Timescale is an **interactive, zoomable, logarithmic timeline** of the universe and human history.  
The v49.x line rebuilds rendering around a deterministic **vertical lens** so that axis, cards, and labels share one mapping.  
Starting v49.5 the goal is to re‑introduce **editing capabilities** (add/update events, draft/preview, validation) as a **separate module** with a minimal, documented API and no coupling to the renderer’s internals.

Why this matters:
- Stable renderer = predictable UX on desktop & mobile.
- Editor evolves independently, so contributors can work on data tooling without touching lens code.
- Open‑source friendly: small surface area; clear responsibilities; testability.

Reference for v49.2 architecture and public API surface (baseline we keep intact). See “Timeline v49.2 — Vertical Lens Renderer (Clean Mode)”.

---

## 2) Scope of v49.5
- **No breaking changes** to the v49.2 runtime renderer.
- Keep all lens behaviours (prefocus, X‑only scale, center band, z‑order) identical.
- Introduce **Editor v1** as an *opt‑in* module: loaded after `timeline.js`, communicates through well‑defined hooks.
- Provide documentation, examples, and a minimal test dataset to exercise Editor features.
- Keep data format (`TS_DATA`) backwards compatible.

Out of scope (v49.5):
- No multi‑file module loader (keep plain `<script>` order).
- No theming system rewrite.
- No heavy virtualisation; performance work remains incremental.

---

## 3) Current architecture snapshot (v49.x)
Runtime files:
- `index.html` — loads `TS_DATA`, then `timeline.js`; holds small helpers/config.
- `style.css` — visuals, lens band, labels, prefocus emphasis.
- `timeline.js` — **renderer core**: D3 zoom/pan, lens mapping, axis, cards, prefocus, z‑order.
- *(new in 49.5)* `editor.js` — **optional** editor module (see §5).

Key renderer properties we keep unchanged:
- One Y‑pipeline: `time_years → state.y → lensY → round → draw all`.
- Prefocus = single element (`.is-prefocus`), background mask rect only on focus.
- X‑only scale (`scaleX`) for focus; no font‑size hacks.
- Mobile and desktop share the same transform logic.

---

## 4) Public API surface (renderer)
These are available after `timeline:ready`:
```js
window.TS_DATA   // input data (events, themes, optional themeColors)
window.TS_CFG    // optional config
window.TimelineAPI = {
  scaleBy(factor, x, y),
  translateBy(dx, dy),
  animScaleBy(factor, x, y, dur),
  animTranslateBy(dx, dy, dur),
  selectTheme(name),
  getCenter() -> { x, y }
}
window.updateTimeline()  // re-render with current transform after data tweaks
```
Keep this API stable; Editor talks only through these and the hooks in §5.

---

## 5) Editor v1 — integration plan
**Loading:** `index.html` after `timeline.js`  
**Namespace:** `window.TSEditor` (stand‑alone; no imports)

### 5.1 Responsibilities
- UI: a small toggleable panel (add, duplicate, update, delete draft).
- Data staging: write to `TS_DATA.eventsDraft` (non‑destructive).
- Validation: schema checks, date/year coherence, “not in the future” guard.
- Preview: push draft items into renderer via `window.updateTimeline()` *without* touching originals.
- Save hook: emit a `CustomEvent("timeline:save-drafts", { detail: drafts })` for host apps to persist to backend or file.

### 5.2 Renderer ↔ Editor hooks (minimal)
- **Input:** `TS_DATA` (read), `TS_CFG.editor` (optional limits, colors, autosave).
- **Output:** `TS_DATA.eventsDraft[]` (append/update by id).
- **Trigger:** `updateTimeline()` to re‑render with merged view:
  - renderer displays drafts with a distinct “preview” theme or style (CSS class `.is-draft`), but keeps all lens logic intact.
- **Events fired by Editor:**
  - `timeline:editor-open`, `timeline:editor-close`
  - `timeline:save-drafts` (host persists)
  - `timeline:validation-error` with details

### 5.3 Merging strategy (read‑only renderer)
- Renderer remains read‑only; it **never persists**.  
- A simple merge function can run inside Editor before calling `updateTimeline()`:
  ```js
  function mergeForPreview(baseEvents, drafts) {
    const byId = new Map(baseEvents.map(e => [e.id, e]));
    for (const d of drafts) byId.set(d.id, { ...byId.get(d.id), ...d, __draft: true });
    return Array.from(byId.values());
  }
  ```
- Renderer shows `__draft` events with CSS differentiation; everything else identical.

---

## 6) Data model (stable)
Minimal event shape (back‑compatible):
```js
{
  id: "unique-id",
  time_years: 1e3,       // years before present (positive)
  theme: "humanity",
  title: "Sample event",
  desc: "Optional text",
  link: null,            // optional URL/string or array
  author: "JL",
  created_at: "2025-01-01",
  updated_at: "2025-01-01"
}
```
Optional:
- `themes[]` and `themeColors{}` (renderer will infer if absent).
- Draft overlay (Editor only): `eventsDraft[]` with same shape.

Validation rules (Editor v1):
- `time_years > 0`
- If both `date` and `year` exist, they must agree within tolerance and **not be in the future**.
- Negative/CE/BCE handling must resolve into a consistent `time_years` (Editor provides helpers; renderer only consumes `time_years`).

---

## 7) Build & run
Local dev (static server is required for `fetch`):
```bash
python3 -m http.server 8000
# open http://localhost:8000/index.html
```
GitHub Pages: keep publishing from the existing branch/folder (`/docs` if configured).  
Develop v49.5 locally; publish by merging when ready.

---

## 8) Open source notes
- License: MIT (recommended).
- Contribution model:
  - Small, reviewable PRs (single topic).
  - No breaking renderer changes without an RFC.
  - Add/update a minimal test data file for each new Editor feature.
- Issue labels: `renderer`, `editor`, `data`, `docs`, `good-first-issue`.
- CI (optional later): lint + a headless smoke test that boots the page and asserts `timeline:ready` + a few DOM invariants.

---

## 9) Milestone checklist (v49.5)
- [ ] Keep v49.2 renderer behaviour bit‑for‑bit (visual parity at k≈1 and zoomed‑in).
- [ ] Add `editor.js` (opt‑in loader, separate namespace).
- [ ] Draft staging: `TS_DATA.eventsDraft[]` and merge‑for‑preview function.
- [ ] Validation helpers (date/year coherence, future guard).
- [ ] Distinct draft styling (`.is-draft`) with zero impact on lens logic.
- [ ] Save hook: `timeline:save-drafts` with payload.
- [ ] Docs: minimal Editor usage snippet in `index.html` and API in README.
- [ ] Example dataset for Editor demos.

---

## 10) Changelog
- **v49.5 (this doc):** plan to add Editor as an optional module; renderer stays stable.
- **v49.2 (baseline):** clean, renderer‑only vertical lens; defined API surface; mobile/desktop parity.

---

© Timescale v49.5 — interactive visualization with a clean, optional Editor module.
