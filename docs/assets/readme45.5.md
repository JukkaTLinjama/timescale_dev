# v45.5 — Stable Scale, Canonical Ticks & EventDB45

**Baseline:** based on v45.1 → migrated to `eventsDB45.json`  
**Goal:** full stability after zoom/pan, fixed logarithmic scaling, and new absolute event data set.

---

## 🔹 Summary

Version **45.5** consolidates the “absolute-time” architecture from 45.1 but fixes two long-standing issues:

1. **Log-scale stability:**  
   Zooming or panning no longer shifts the axis by one decade.
2. **Startup animation isolation:**  
   The intro animation (demo gesture) no longer distorts the zoom or domain extents.
3. **New events database:**  
   `eventsDB45.json` replaces all previous versions with a cleaner structure and explicit `metadata.ui` block.

---

## 🔹 Files updated

| File | Change summary |
|------|----------------|
| **index_.html** | - New `eventsDB45.json` loader<br>- Stable `Ticks` module (ceil/floor + EPS)<br>- Startup animation re-enabled via `timeline:first-render`<br>- Debug tools and InfoBox retained |
| **timeline.js** | - Now emits `timeline:first-render` after first stable `applyZoom()`<br>- Added one-shot guard `__firstRenderFired`<br>- All data preloaded by `index_.html` (no internal I/O)<br>- Comments cleaned up for 45.5 stable renderer |
| **eventsDB45.json** | - Clean metadata block (`ui.themeOrder`, `ui.themeColors`, `realtime.scales`)<br>- Grouped events under 5 themes (`kosmos`, `biologia`, `ihmiskunta`, `historia`, `moderni teknologia`)<br>- Includes relative events down to “1 second ago” anchored with correct logs |
| **style.css** | - Unchanged from v42 baseline; minor comment updates only |

---

## 🔹 Fixed log-scale “decade jump”

Before 45.5, each initial zoom or scroll could shift all tick labels by one 10× step due to floating-point rounding in `Math.log10(d0/d1)` boundaries.

### Fix implemented in `index_.html → Ticks`:

```js
// Stable decade ticks on zoom/pan
const EPS = 1e-12;
const n0 = Math.ceil(Math.log10(d0 * (1 + EPS)));
const n1 = Math.floor(Math.log10(d1 * (1 - EPS)));
```

✅  Result:  
Major and minor ticks stay locked even during continuous zooming.

---

## 🔹 Startup animation (optional)

The demo gesture (auto “tap → zoom → scroll”) is re-enabled safely:

- Runs **only after** the first stable render.
- Triggered by `timeline:first-render` event emitted from `timeline.js`.
- Respects `prefers-reduced-motion` and `sessionStorage['startup_v41_shown']`.

To force the animation again:  
➡️ open the page with `?demo=1` in the URL.

---

## 🔹 New Event Database (eventsDB45.json)

The dataset is now normalized with:

```json
"metadata": {
  "ui": {
    "themeOrder": ["kosmos", "biologia", "ihmiskunta", "historia", "moderni teknologia"],
    "themeColors": {
      "kosmos": "#6372b2",
      "biologia": "#70a8c6",
      "ihmiskunta": "#4b9fa8",
      "historia": "#368d60",
      "moderni teknologia": "#5a9646"
    }
  },
  "realtime": { "enable_clock": true, "scales": ["second","minute","hour","day","week","month","year"] },
  "time_spec": { "log_base": 10, "units": "years_from_present" }
}
```

Each theme’s `events[]` array is flat and uniform:
- Every event includes `label`, `year`, `time_years`, and `log`.
- Optional localized `i18n` blocks are supported.
- “Present” events (seconds–years) are rendered dynamically but stored in canonical log positions (10⁻⁸ … 10⁰).

---

## 🔹 Architecture snapshot (v45.5)

```
index_.html
 ├─ DataUtil.normalizeData()
 ├─ Ticks.majors/minors (log decade stability)
 ├─ InfoBox (popup event details)
 ├─ SwipeZoom (pan/zoom gestures)
 ├─ Startup animation (safe trigger)
 └─ calls → initTimeline() in timeline.js

timeline.js
 ├─ Pure renderer (no I/O)
 ├─ emits: "timeline:ready" + "timeline:first-render"
 ├─ API: TimelineAPI.selectTheme(), animScaleBy(), animTranslateBy()
 └─ no logic touching the data domain

eventsDB45.json
 ├─ metadata
 └─ grouped events by theme (cosmos → technology)

style.css
 ├─ same visual palette
 └─ prefocus + InfoBox + zoom bar visuals
```

---

## 🔹 Verified behavior

- ✅ Axis ticks stable on first zoom/pan  
- ✅ Timeline renders instantly after load  
- ✅ Startup animation runs only once  
- ✅ InfoBox opens and closes smoothly  
- ✅ Present markers (second–year) update live

---

## 🔹 Next steps (for v45.6)

- Add UI toggle for **real-time “present” refresh** (on/off).
- Combine **theme focus + InfoBox** for faster interaction.
- Explore **editor integration** (inline event edits).
- Optional: compress `eventsDB45.json` → `eventsDB45.min.json` for deploy.

---

**Version:** 45.5  
**Date:** 2025-10-21  
**Authors:** Jukka Linjama & ChatGPT  
**License:** CC BY 4.0  
