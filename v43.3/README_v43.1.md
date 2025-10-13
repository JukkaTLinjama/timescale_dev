## **README_v43.1.md**

### 🔹 Version
**v43.1 – Focus stabilization, visual halo refinement & eventDB metadata update**  
**Date:** 2025-10-11  
**Previous:** [v42.2](./README_v42.2.md)

---

### 🧭 Summary
This release introduces a **data-driven prefocus system** that completely removes visual jitter during scrolling, adds a refined **neighbor halo** animation around the focused event label, and extends the **eventsDB.json format** with improved metadata and multilingual labels.

---

### ✳️ Key Improvements
#### **1. Stable Prefocus Logic**
- Replaced DOM-based `getBBox()` detection with **pure data-driven computation**.
- The focused event is chosen by comparing its scaled Y-position (`state.y(e.time_years)`) with the timeline’s visual center.
- Stored for reuse:
  ```js
  state.__prefocusKey
  state.__prefocusY
  ```
- Removed feedback loops — focus stays steady during scroll and zoom.

#### **2. Neighbor Text Halo**
- Neighboring labels now shift gently away from the focused label:
  ```js
  function computeTextFocusOffsetY(yEvt, yFoc) {
      const R = 56;   // influence radius in px
      const MAX = 10; // maximum offset
      const t = 1 - Math.abs(yEvt - yFoc) / R;
      const strength = Math.pow(t, 1.4); // ease-out falloff
      return Math.sign(yEvt - yFoc) * MAX * strength;
  }
  ```
- Focused label stays fixed; only near neighbors move a few pixels up/down.

#### **3. Smooth Animation**
- Offsets use CSS transform instead of SVG `y` for native easing:
  ```css
  text.event-label {
      transition: transform 200ms ease-out;
      will-change: transform;
  }
  ```
- Font-size change in `.prefocus` removed → no layout “jump”:
  ```css
  text.event-label.prefocus {
      font-weight: 700;
      letter-spacing: 0.2px;
  }
  ```

#### **4. eventsDB.json Enhancements**
- **Metadata and UI definitions** supported:
  ```json
  {
    "metadata": {
      "locale_default": "fi",
      "ui": {
        "themeOrder": ["kosmos", "elämä", "ihmiskunta", "kulttuuri", "teknologia"],
        "themeColors": {
          "kosmos": "#6372b2ff",
          "elämä": "#70a8c6",
          "ihmiskunta": "#4b9fa8",
          "kulttuuri": "#368d60ff",
          "teknologia": "#5a9646ff"
        }
      }
    },
    "events": [...]
  }
  ```
- **Localized labels** now read automatically:
  ```js
  e.display_label =
      (e.i18n && e.i18n[lang] && e.i18n[lang].label)
          ? e.i18n[lang].label
          : e.label;
  ```
- Allows future language switching and per-theme customization without code changes.

---

### 🧩 Code Structure Affected
| File | Change | Description |
|------|---------|-------------|
| `timeline.js` | Replaced `updatePrefocusNow` with `computePrefocusData()` & `markPrefocusClass()` | Pure data-driven prefocus |
| `timeline.js` | Updated `applyZoom()` | Computes prefocus before drawing |
| `timeline.js` | Updated `drawCards()` | Uses `style.transform` for label offset |
| `style.css` | Updated `.prefocus` rule | Removed font-size transition |
| `style.css` | Verified transition for `.event-label` | Smooth `ease-out` motion |
| `eventsDB.json` | Added `metadata.ui`, `themeColors`, and `i18n` fields | Language-aware UI and color mapping |

---

### 🧪 Result
✅ No focus jitter during scroll or zoom  
✅ Smooth “ease-out” halo motion for nearby labels  
✅ Fully stable center reference for prefocus  
✅ Extended JSON format for theme colors and multilingual labels  

---

### ⚙️ Next Steps (planned v43.2)
- Add small deterministic offset for events with identical timestamps.  
- Optional fade-in/out transition for focus change.  
- Add language switcher and color palette override from JSON.

---

**Author:** Resonoiva / Jukka Linjama  
**Project:** Logarithmic Timeline v43 branch  
**Date:** 2025-10-11  
