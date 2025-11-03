# Timescale Timeline v47.4 — Prefocus & Help Interaction Refinement

**Date:** 2025-11-03

## Overview
Version 47.4 refines the user interaction model between the **prefocus information popup** and the **help/info panel (the "?" button)**.  
The goal is to make the experience smoother, avoid accidental popup activations, and ensure that only one system controls help panel behavior.

---

## Key Improvements

### 1. Prefocus Info Behavior
- Prefocus info (automatic event popup) now appears **only after zooming or scrolling** interaction.  
- It does not react to button clicks or UI interactions.  
- A "dwell" delay ensures that information only appears when the user pauses on a focused event.

**Technical changes:**
- `PrefocusInfo` module updated to include an “armed-after-motion” model.  
- It is **armed** only when viewport motion has been detected and stayed still for ~350 ms.  
- Any click outside the SVG (buttons, side panels) **disarms** it.

### 2. Help ("?") Panel Interaction
- Opening the help/info panel now fully disables prefocus logic.  
- Prefocus does not react or rearm until the help is closed and the user performs a new viewport motion.  
- Closing the help panel automatically restores the normal behavior, but it will wait until the next zoom/pan.

### 3. One Click to Open Help
Previously, both `index.html` and `timeline.js` reacted to the “?” button.  
This caused the help panel to open and instantly close, requiring **two clicks**.  
Now, only `index.html` handles it — a single, reliable click opens and closes the help panel.

### 4. No Extra Scripts Required
Instead of adding new `<script>` blocks, this version simply adds a constant at the top of `timeline.js`:

```javascript
const DISABLE_INTERNAL_INFO_TOGGLE = true;
```

and wraps the internal help toggle logic like this:

```javascript
if (!DISABLE_INTERNAL_INFO_TOGGLE && infoToggle && infoBox) {
    // original toggle handlers here
}
```

This approach is cleaner, avoids duplication, and reduces risk of race conditions between UI and rendering layers.

---

## Results

✅ **Single click** opens and closes the help panel.  
✅ **Prefocus info** appears only after real zoom/scroll activity.  
✅ **No overlap** between event info popups and help window.  
✅ **No new script blocks** were added; timeline.js remains self-contained.  

---

## Next Steps (optional ideas)
- Add a fade-in animation to PrefocusInfo popup for more subtle appearance.  
- Add a “mute” icon or visual cue when PrefocusInfo is temporarily disabled (e.g., help mode).  
- Consider merging PrefocusInfo dwell delay into timeline config for user-adjustable sensitivity.

---

**Version label:** `v47.4 — Prefocus Dwell + Help Panel Integration`  
**Status:** Stable / Interactive behavior verified on desktop and mobile browsers.
