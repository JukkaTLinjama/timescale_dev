# Interactive Logarithmic Timeline — Architecture Draft for v40

This document describes the current architecture (v39) and the proposed modular structure for v40. The goal is to transition towards a reusable, embeddable, and open-source timeline component.

---

## ✅ Current v39 Architecture

### Files

- **`index.html`**  
  - Page structure: header, footer, info box, `<svg>` container  
  - Defines `window.Util` with safe/timed/clamp helpers  
  - Loads `timeline.js`

- **`style.css`**  
  - Global dark theme  
  - Layout variables (`--header-h`, `--bg`, etc.)  
  - Styling for zoom bar, axis ticks, cards, debug bar

- **`timeline.js`**  
  - Loads `eventsDB.json` (via `fetch`)  
  - Flattens events by theme into a single list  
  - Initializes `state`, sets up `svg` groups (`gAxis`, `gCards`, etc.)  
  - Handles zoom, resize, and draw logic for axis/cards/overlays  
  - Debug mode with URL param `?debug=1`

- **`eventsDB.json`**  
  - Hierarchical list of events grouped by theme (`cosmos`, `biology`, `humanity`, etc.)  
  - Each event has: `label`, `year`, `time_years`, optional `log` and `comments`

- **`readme_v38b.md`**: Last Finnish version  
- **`readme39.md`**: First English version, marks open-source shift

### Diagram

```
index.html
 ├── <svg> container
 ├── Util helpers (safe, timed, clamp)
 └── timeline.js
      ├── fetch("eventsDB.json")
      ├── flatten + draw
      ├── zoom behavior
      └── debug bar
```

### Strengths
- Simple, works out-of-the-box with static hosting
- Visuals are clear and layered
- Util functions now modular (`window.Util`)

### Limitations
- timeline.js grows too long and mixes responsibilities
- Not reusable in other projects without editing it directly
- Data source is fixed (`eventsDB.json`)
- State and rendering tightly coupled

---

## 🔁 Proposed v40 Architecture

### Goals
- Make `timeline.js` a **reusable component**
- Let `index.html` handle data loading and SVG mounting
- Expose a clean interface: `createTimeline(svgSelector, data, config)`

### Proposed Files

```
/v40/
├── index.html           ← Loads JSON, calls createTimeline
├── timeline.js          ← Exports createTimeline(svg, data, cfg)
├── style.css            ← Same styles
├── eventsDB.json        ← Same format
├── utils.js             ← (Optional) shared functions
└── readme40.md          ← This file (English documentation)
```

### Modular API

```js
window.createTimeline = function(svgSelector, jsonData, config = {}) {
  const svg = d3.select(svgSelector);
  const state = prepareState(jsonData, config);

  setupLayers(svg, state);
  setupZoom(svg, state);
  drawAll(svg, state);
};
```

### Example Usage in index.html

```html
<svg id="timeline" width="100%" height="1000"></svg>

<script src="utils.js"></script>
<script src="timeline.js"></script>
<script>
fetch("eventsDB.json")
  .then(r => r.json())
  .then(data => {
    createTimeline("#timeline", data);
  });
</script>
```

### Benefits

- ✅ Reusable in multiple contexts (WordPress, React, etc.)
- ✅ Easier testing, smaller code files
- ✅ JSON source and config can be dynamic
- ✅ Easier long-term maintenance

### Migration Risk

| Task                             | Est. Time | Risk Level |
|----------------------------------|-----------|------------|
| Wrap logic into createTimeline() | 15–30 min | Low        |
| Move fetch to index.html         | 10 min    | Low        |
| Clean old init calls             | 10 min    | Medium     |
| Final cleanup + test             | 30 min    | Medium     |

Estimated total: ~1 hour, medium risk if done incrementally.

---

## Recommendation

You can safely stay at v39 while studying JavaScript and gradually refactor.

**First steps if/when you proceed:**
- Add `createTimeline()` wrapper around current `init()`
- Move `fetch()` and `flattenEvents()` into `index.html`
- Delay deeper changes until you're confident

This draft supports planning a clean transition without breaking the current functionality.
