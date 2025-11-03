# README v47.2 — Timeline Editor & Preview Controls

**Päivitetty:** 2025-11-01  
**Versio:** v47.2 (editor & preview improvements)

---

## TL;DR (Suomi)
- Editorin kaikki napit siirrettiin **ikkunan yläreunaan** (Save draft, Duplicate to Preview, Delete draft, Clear form).
- Lisättiin kelluva **“Show / Hide editor controls”** -nappi, joka avaa alareunan ohjauspaneelin.
- **Preview-teema** voidaan **näyttää/piilottaa** ohjauspaneelin togglella. Alkunäkymässä preview on **piilossa**.
- Intro-animaatio palautettiin ja siihen lisättiin **fallbackit** (jos `timeline:first-render` puuttuu).
- Korjattiin `insertBefore`-virheet mobile/layout-tilanteissa (turvallinen `insert` ilman erillistä helperiä).
- **Mobiilikorjaus:** Close (×) pysyy näkyvissä; header wrap + absolute close -sijoittelu.
- “Focus Edits” poistettu; **tray** avattaessa valitaan automaattisesti **preview**-teema.

**Seuraava kriittinen tehtävä (TODO):**  
Korjaa editorin sulkemislogiikka: nyt editorin avaaminen **luo tallennettavan preview-luonnoksen** joka kerta (auto-duplicate).

---

## Overview (EN)
This release focuses on **editor UX and runtime preview management**:

1. **Editor header actions** — All editor buttons live in the window header:  
   - **Save draft** → upserts a visible preview draft (runtime) using `EditorPreviewOps.duplicateFromEventId(baseId, overrides)` + `rerenderTimeline()`  
   - **Duplicate to Preview** → creates `baseId(1)`, `baseId(2)`, … in the `preview` theme  
   - **Delete draft** → removes last duplicated preview (or a prompted id) from `PreviewData`  
   - **Clear form** → clears inputs; no data changes
2. **Floating controls tray** — A small **“Show / Hide editor controls”** button (bottom-right) toggles a bottom-wide tray containing global utilities (export, clear drafts, etc.). When opening, it auto-selects the **preview** theme.
3. **Preview theme visibility** — The tray toggle also **shows/hides the entire _preview_ card**. Startup and subsequent redraws keep preview hidden unless the tray is open.
4. **Intro resilience** — Startup intro now has **two fallbacks** (listen to `timeline:render` and a 2s timeout) for cases when `timeline:first-render` is missing or late.
5. **Layout safety** — All header re-parenting avoids `NotFoundError` by checking that the target “before” node actually belongs to the same parent; otherwise we `appendChild`.
6. **Mobile header fix** — The editor header wraps (`flex-wrap`) and the **Close** button is placed absolutely in the top-right. Title reserves space with right padding.

---

## What changed (files & key edits)

### `editor.js`
- **Header actions / ensureActions()**
  - Re-homes existing `.editor-actions` into `.editor-header` safely (no early return).
  - Adds **Delete draft** (removes an item from `PreviewData`).  
  - Records `editor.dataset.lastDupId` in Save/Duplicate handlers for quick deletion.
- **Preview runtime**
  - Introduces `PreviewData` list and `PreviewData.merge(basePack)` (lives in `editor.js` so editor owns preview).
  - Adds `EditorPreviewOps.duplicateFromEventId(eventId, overrides)` which:  
    - Finds base event in `TS_DATA.events`  
    - Picks next id `base(1..n)` without collisions (checks both `PreviewData` and `TS_DATA.events`)  
    - Computes `time_years` if missing  
    - Pushes to `PreviewData`, then calls `rerenderTimeline()`
- **Tray (bottom controls)**
  - Replaces old “Show Edits” with **“Show / Hide editor controls”** (toggle).  
  - `setOpen(open)` updates:
    - tray visibility & ARIA
    - selects **preview** theme on open
    - **caches** the preview card node (`__previewCard`) and toggles its visibility
  - Ensures **preview is hidden** at startup and after any redraws if tray is closed (`timeline:first-render`, `timeline:render` listeners → `setOpen(false)`).
- **Startup intro**
  - Still runs on `timeline:first-render`, but also:  
    - fallback via `timeline:render` (once)  
    - fallback via 2s timeout if API ready

### `index.html`
- Publishes a pristine `__BASE_PACK` at the end of `prepare()` and exports `TS_DATA = PreviewData.merge(__BASE_PACK)` initially.
- Defines `window.rerenderTimeline()` which **re-merges** base + current `PreviewData` and then calls `updateTimeline()` (soft redraw).

### `style.css`
- **Mobile header fix** under `@media (max-width: 640px)`:
  - `.editor-header { flex-wrap; padding-right: 38px; position: relative; }`
  - `.editor-header .editor-actions { flex: 1 1 100%; flex-wrap }`
  - `#close-editor { position: absolute; top: 6px; right: 8px; z-index: 10 }`

---

## Usage notes
- **Show editor controls** opens the tray, selects **preview**, and **shows the preview card**.  
- **Hide editor controls** closes the tray and **hides** the preview card.  
- **Save draft** is the primary way to create/update a visible runtime draft card (Preview).  
- **Delete draft** removes the latest or a specified preview draft id (e.g. `origId(1)`).  
- The editor **does not modify** the base data files; everything is merged at runtime via `PreviewData.merge`.  
- Exports remain available for **drafts-only** (JSON) and **merged** (base + Edits).

---

## Known issues
1. **Editor open auto-creates a preview draft** (auto-duplicate) for the selected event. This is currently intended for instant visual feedback, but it also means opening the editor _creates/saves_ a draft every time.
2. If the DOM structure of cards/titles changes, the preview card lookup may need an updated selector (we cache `<g.card>` with `text.card-title="preview"`).

---

## Next TODO (critical)
- **Correct editor close; now creates/saves created draft event every time you open editor.**  
  - Suggested change: move the auto-duplicate from `openEditor()` behind an explicit user action (e.g. “Create preview draft from this event”), or gate it behind a temporary flag in `editor.dataset` so that:
    - First open → only **loads fields** (no duplicate yet)
    - “Save draft” or “Duplicate to Preview” → creates the actual preview
    - Optional: if auto-preview is desired, run auto-duplicate **once per sourceId per session**, not per open

Secondary:
- Add a small hint under the ID field clarifying that preview drafts get `sourceId(n)` ids (e.g. `origId(1)`, `origId(2)`).
- Optional: mini fade for preview card hide/show (CSS transition).

---

## Change log
- **v47.2**
  - Editor header actions (Save, Duplicate, Delete, Clear) moved to **header**.
  - Bottom tray toggle: **Show/Hide editor controls**.
  - Preview theme **show/hide** wired to the tray toggle; **hidden by default**.
  - Intro fallback on `timeline:render` and timeout.
  - Safer DOM re-parenting for header elements (no `NotFoundError`).
  - Mobile header wrap + Close absolute positioning.
- **v47.1** (previous)
  - Preliminary editor actions; Save/Update split (now consolidated).
  - PreviewData & duplicate helper draft.

---

## Credits
- Design & development: Jukka L.
- Chat-assist: “History timeline dev from v45” project (v47.2 editor pass)
