# 🧭 Timescale v45.2 — Logarithmic Timeline with Realtime “Present” Theme

### Summary
Version 45.2 introduces a clear separation of concerns:
- **index.html** handles data loading, preprocessing, fallback, and realtime updates.  
- **timeline.js** is now purely a rendering and interaction engine.  

A new “present” theme shows the current system time as continuous anchors (this sec → this year), updated every 50 ms, without disturbing zoom or scroll position.

---

## ✳️ Main Features

### ✅ 1. Data loading moved to index.html
- All JSON fetch and metadata handling is now in `prepare()` inside `index.html`.
- Uses `DataUtil.normalizeData()` as before.
- On success: merges events with generated *present* anchors.
- On failure: activates an **index-level fallback** (present-only).

### ✅ 2. Fallback handled entirely in index.html
- If `eventsDB.json` fails, the page stays functional.
- Fallback dataset = “present-only” anchors.
- Colored using `themeColors.present = #ff8c42`.

### ✅ 3. timeline.js simplified
- Old `loadData()` function and fallback removed.
- `init()` now only consumes `window.TS_DATA`.
- A new public hook `window.updateTimeline()` refreshes view without touching zoom/scroll.
- All previous rendering features (zoom, scroll, prefocus, axis, etc.) remain unchanged.

### ✅ 4. Realtime present anchors
Implemented directly from the **system clock**:
```
this sec → this min → this hour → this day → this month → this year
```
- Updated every 50 ms (`UPDATE_INTERVAL_MS = 50`).
- `buildPresent()` now creates:
  - One invisible **anchor** (~0.1 s before now) → keeps card top steady.
  - Six current-period anchors.
  - Four-second **trail** showing a smooth continuum of recent seconds.

### ✅ 5. No jump on update
- `updateTimeline()` keeps current `d3.zoomTransform`.
- Domain is not recomputed on each tick → zoom/scroll stays locked.

### ✅ 6. Minor usability improvements
- Present-theme events omit the `(year)` suffix.
- Logging: every 10 updates prints debug info in console.
- Fallback and success messages visible in the status box.

---

## ⚙️ Architecture Overview

```
index.html
 ├─ buildPresent()              → create system-clock anchors
 ├─ prepare()                   → load eventsDB.json + merge + sanitize
 ├─ fallback (catch block)      → present-only dataset if load fails
 ├─ realtime updater (setInterval) → rebuild present anchors every 50 ms
 └─ calls window.updateTimeline()  → re-draw at current zoom

timeline.js
 ├─ init()                      → consumes TS_DATA from index.html
 ├─ computeDomainFromData()     → unchanged
 ├─ updateTimeline() hook       → re-draw without domain reset
 ├─ drawCards()                 → hides isAnchor items, no (year) for present
 └─ all zoom/scroll/prefocus logic intact
```

---

## 🧪 Testing Notes
1. **Normal case:**  
   `eventsDB.json` → Loaded ✅ → console shows “Loaded N events”.
2. **Fallback case:**  
   Temporarily rename `eventsDB.json` → console shows “fallback present-only”.
3. **Realtime:**  
   Observe “this sec” changing ~20× per second; zoom level stable.
4. **Trail:**  
   Four previous seconds visible; oldest drops out seamlessly.

---

## 📄 Future Plans (v45.3+)
- Add in-browser **event editor** with file management.
- Integrate **status panel** for editor and live save feedback.
- Smooth visual fade of the 4 s trail (CSS opacity gradient).
- Optional adaptive update rate (slower when blurred tab).
- Synchronize multiple timelines (e.g., world vs local time).

---

### Version history
| Version | Date | Key changes |
|----------|------|--------------|
| v45.1 | 2025-10 | Moved data I/O to index.html, basic present anchors |
| **v45.2** | 2025-10 | Removed loadData from timeline.js, added realtime present (50 ms), stable anchor + 4 s trail |

---

**Status:** Stable and ready for integration with the upcoming timeline editor module.
