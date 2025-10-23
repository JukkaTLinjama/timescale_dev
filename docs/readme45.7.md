# 🕒 Timescale v45.7 – Present theme refactor / Numeric clock removed

## Summary
Version 45.7 focuses on simplifying the real-time “present” theme:
- removed the entire **NumericClock overlay** (no SVG clocklines)  
- re-activated **live present theme** updating every second  
- re-implemented the **buildPresent()** logic for cleaner, data-driven event anchors  
- added the first **dynamic 5 s step trail** (currently running with ~4 s offset to be fixed in v45.8)  
- labels now use **(ago)** notation — e.g. `12:34:57 (time 1 s ago)`

---

## Current features
| Area | Status |
|:--|:--|
| Present theme updater | Runs 1 Hz via `refreshPresent()` hook after render |
| “this sec” anchor | Fixed position ≈ 1 s ago, label = next clock second + “(time 1 s ago)” |
| Short reference | “0.1 s ago” sits slightly above “this sec” |
| Trail events | Dynamic 5 s step list (currently ~4 s offset) |
| Larger anchors | 1 min ago / 1 h ago / 1 d ago / 1 month ago / 1 year ago |
| Color refresh | Instant after zoom/scroll (thanks to `timeline:render` hook) |
| Parentheses around labels | Still added by `timeline.js` renderer → to be removed later |

---

## Known issues / next steps
1. **Trail offset (~4 s)** to be corrected in v45.8.  
2. **Parentheses around labels.** Need to strip from render function in `timeline.js`.  
3. **Fine-tune “this sec” anchoring.** Evaluate using real clock within-second offset instead of fixed −1 s.  
4. **Optional fade effects.** Future plan to introduce alpha decay for older trail events.  

---

## File structure in v45.7
```
index.html     →  main HTML + buildPresent() + 1 Hz updater
style.css      →  no numeric-clock CSS; only theme colors
timeline.js    →  unchanged renderer (uses updateTimeline)
eventsDB.json  →  unchanged dataset
```

---

## Changelog (high-level)
- ✂ Removed NumericClock overlay (JS & CSS)  
- ➕ Added `Present theme live updater (1 Hz)`  
- 🔁 Refactored `buildPresent()` with structured anchors and labels  
- 🕐 “this sec” = `next clock second (time 1 s ago)`  
- 📊 Dynamic 5 s trail (currently 4 s offset)  
- 🎨 Immediate color refresh on zoom and scroll  
- 🪶 Cleaned comments / consistent English annotations  

---

## Next version (v45.8) goals
- correct 4 s offset in trail logic  
- optional fade-out or remove after 60 s  
- strip extra parentheses from labels  
- optional micro-timeline of sub-second anchors (0.1 s – 1 s)

---

**Author:** Jukka Linjama  
**Date:** 2025-10-23  
**Project:** Timescale / Logarithmic Timeline  
