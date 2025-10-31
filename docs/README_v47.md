
# Timeline v47 — Editor + InfoBox + Intro (single-module) 

**Date:** 2025‑10‑31  
**Scope:** v47 focuses on simplifying the architecture for the editor experience—merging Editor, InfoBox and Startup Intro into a single file (`editor.js`), improving mobile usability, and keeping the renderer (`timeline.js`) untouched.

---

## TL;DR (suomeksi)
- **Yksi moduuli:** `editor.js` sisältää **luonnosvaraston (StagingStore)**, **InfoBoxin** ja **startup-intro**n.  
- **Mobiilissa:** editori on koko näytön paneeli **otsikon ja “?”-napin alapuolella**, eikä peitä niitä.  
- **“More fields”**: vähemmän käytetyt metakentät ovat piilossa. Tärkeimmät kentät näkyvät heti.  
- **Tallennus:** Muokkaukset menevät **Edits‑teemaan** luonnoksina; pysyvää tallennusta ei tehdä, ennen kuin viet/mergaat JSONin.

---

## What’s new in v47
1. **Single editor module (`editor.js`)**
   - (A) **StagingStore**: localStorage‑pohjainen luonnosvarasto (`TS_DRAFTS_v47`).  
   - (B) **Inline editor**: käyttää sivun `#event-editor`‑paneelia (lomake).  
   - (C) **Floating toolbar**: *Show Edits / Clear / Export drafts / Accept & export*.  
   - (D) **InfoBox** popup: *Edit event* ‑nappi lähettää `timeline:edit-event`.  
   - (E) **Startup Intro**: ohitettavissa `?demo=0`‑parametrilla.

2. **Mobile UX**
   - Editoripaneeli on **fixed, full‑screen**, mutta alkaa **otsikon alta**:  
     `top: calc(env(safe-area-inset-top) + var(--header-h));`  
     → **Säilyttää sivun otsikon ja “?”‑napin näkyvissä.**
   - **Sticky actions**: editorin *Save / Update / Clear* ‑painikkeet pysyvät näkyvissä paneelin alareunassa.
   - **“More fields” toggle**: tärkeimmät kentät (title, year/date, desc, theme, link text/url) **näkyvät heti**.  
     Vähemmän käytetyt kentät (source, tags, edited/created by/at) avautuvat napista.

3. **CSS cleanup (recommended)**
   - Yhtenäistä `text.event-label`‑transition yhteen sääntöön.  
   - Valitse **yksi “totuuden lähde”** touch‑kursorin tyyleille (CSS *tai* JS).

---

## File structure (compact)
```
index.html        # Layout + minimal glue
style.css         # Styles (cards, InfoBox, editor panel, mobile tweaks)
editor.js         # Editor module (StagingStore + Inline editor + Toolbar + InfoBox + Intro)
timeline.js       # Core renderer (scales, zoom/pan, draw cards/axis, TimelineAPI)
eventsDB45.json   # Data (example), optional
```

**Load order in `index.html`:**
```html
<script src="https://d3js.org/d3.v7.min.js"></script>
<script src="editor.js"></script>   <!-- must load before timeline.js -->
<script src="timeline.js"></script>
```

> Rationale: `editor.js` provides `window.InfoBox`, handles `timeline:first-render` for the intro, and exposes `window.StagingStore` before the renderer starts.

---

## Editor module (`editor.js`)
### A) StagingStore (drafts)
- **API**:  
  - `StagingStore.list()` → luonnoslista  
  - `StagingStore.add(draft)` / `update(id, patch)` / `remove(id)` / `clear()`  
  - `StagingStore.exportDraftsJSON()` → lataa pelkät luonnokset  
  - `StagingStore.exportMerged(window.__BASE_EVENTSDB)` → lataa yhdistetyn JSONin (events + Edits‑ryhmä)
- **No persistent writes**: kaikki pysyy localStoragessa kunnes viet JSONin.

### B) Inline editor
- Täyttää lomakkeen, kun `window` saa eventin `timeline:edit-event` (InfoBoxin “Edit event” ‑napista).
- **“More fields”**: vain meta piilotetaan. Jaetuilla riveillä piilotetaan **vain meta‑kenttä + label**, ei koko riviä.
- *Save draft* luo uuden luonnoksen, *Update draft* päivittää ID:n perusteella (tai luo uuden, jos ID puuttuu).

### C) Floating toolbar
- Pieni, kelluva paneeli oikeassa alakulmassa:  
  **Show Edits**, **Clear**, **Export drafts**, **Accept & export**.

### D) InfoBox
- Popupissa **Edit event** ‑nappi, joka lähettää:  
  ```js
  window.dispatchEvent(new CustomEvent('timeline:edit-event', { detail: { event } }));
  ```

### E) Startup Intro
- Skippaa `?demo=0` param:  
  - Etsii lähimmän teeman otsikon, aktivoi sen, näyttää zoom/pan‑demon.  
  - Emit `timeline:intro-done` lopuksi.

---

## Mobile specifics
- Editoripaneeli **ei peitä otsikkoa eikä “?”‑nappia** (z‑index < info‑toggle ja info‑popover).
- `position: fixed; top: calc(env(safe-area-inset-top) + var(--header-h)); bottom: 0;` + `overflow: auto;`.
- *Actions* ovat **sticky** paneelin alaosassa.  
- *More/Fewer fields* ‑toggle piilottaa ja näyttää meta‑kentät **JS:llä** (ei pelkällä CSS:llä), jotta jaetut rivit säilyvät järkevinä.

---

## Optional: show drafts live on the timeline
If you want drafts to appear as their own **“Edits”** theme **without persistent saving**, add a small hook in `timeline.js` after data load:
```js
// after base data is in state.*
window.__BASE_EVENTSDB = (typeof data === 'object' ? data : null);
state.__baseEvents = (events || []).slice();

function mergeDraftsIntoState() {
  const drafts = (window.StagingStore?.list() || []).map(d => ({ ...d, theme: d.theme || 'Edits', __draft: true }));
  state.events = state.__baseEvents.concat(drafts);
  const t = new Set(state.themes || []); t.add('Edits'); state.themes = Array.from(t);
  if (!state.themeColors.has('Edits')) state.themeColors.set('Edits', '#d77a5a');
  computeDomainFromData();
}

mergeDraftsIntoState();

// expose a refresh method
window.TimelineAPI = Object.assign({}, window.TimelineAPI, {
  refreshDrafts() { mergeDraftsIntoState(); applyZoom(); requestAnimationFrame(setZOrder); }
});
```
> This keeps drafts visible as a separate theme; you can still export/merge later.

---

## CSS notes (cleanup)
- **Unify `text.event-label` transitions** into a single rule (avoid two different durations).  
- **Cursor/ripple styles**: choose **either CSS or JS** as the single source.  
- Mobile editor uses:  
  - `z-index: 1800` (under the info toggle and InfoBox),  
  - `top: calc(env(safe-area-inset-top) + var(--header-h))` to keep the header visible.

---

## Events (public)
- `timeline:first-render` — emitted by renderer when first draw completes (intro listens).  
- `timeline:intro-done` — emitted after the demo sequence.  
- `timeline:edit-event` — emitted by InfoBox with `{ detail: { event } }` for editor.

---

## Upgrade checklist
1. **Include** `<script src="editor.js"></script>` **before** `timeline.js` in `index.html`.  
2. Ensure `#event-editor` paneeli on HTML:ssä (editori käyttää sitä).  
3. Lisää uudet mobiilityylit `style.css`:ään (header‑safe full‑screen, sticky actions).  
4. (Optional) Lisää `TimelineAPI.refreshDrafts()`‑hook `timeline.js`:ään jos haluat Edits‑teeman näkyvän livenä.  
5. Testaa:
   - Desktop + mobile (full‑screen editor starts below header, “?” stays visible).  
   - “More fields” piilottaa/avaa vain metan.  
   - Toolbarin toiminnot (Clear / Export / Accept & export).

---

## Known limitations
- StagingStore ei tee versiohistoriaa; pelkkä tuorein luonnos jää talteen.  
- `exportMerged` lisää Edits‑ryhmän datan loppuun; jos haluat “in‑place” päivitykset alkuperäisiin eventteihin, tee se erillisessä muokkausvaiheessa.

---

## Version history
- **v47**: editor.js (Editor+InfoBox+Intro), mobile full‑screen editor (header‑safe), More/Fewer fields, CSS cleanups.
- **v46.x**: realtime “present” anchors, scale fixes, refactors (not covered here).

---

© 2025 — Timeline dev
