# History Timeline v46.0

### Overview
Version 46.0 establishes a stable baseline for the new visual and interactive features of the History Timeline project.  
It introduces improved layering, refined card rendering, and prepares the codebase for smoother animation and theme interaction.

---

## 1. Core Structure
- Project files: `index.html`, `style.css`, `timeline.js`, and `eventsDB.json`.
- The application builds a logarithmic timeline visualization where historical and present events are displayed as **cards** positioned by time.
- Architecture remains modular but avoids import/export — using global `window` bindings for robustness and browser compatibility.

---

## 2. Rendering Improvements
**Goal:** Increase clarity of cards and event positioning.

- **Cards:** SVG `<rect>` elements with rounded corners and subtle drop shadows.
- **Text:** High-contrast serif fonts for event labels; sans-serif for UI.
- **Performance:** Transition timing tuned for smoother zoom/pan animation.

**Example CSS snippet:**
```css
g.card rect {
  stroke: #474646;
  stroke-opacity: 0.35;
  stroke-width: 1.5px;
  rx: 8;
  ry: 8;
  transition: fill-opacity .35s ease, stroke-opacity .35s ease, filter .35s ease;
}
```

---

## 3. Theme & State Management
- **Active theme**: highlighted with higher brightness and drop-shadow.
- **Inactive themes**: desaturated via CSS filters (brightness/saturate).
- **Global dim layer (`.global-dim-rect`)** prepares for overlay-based focus effects.

**Result:** Clear visual separation between active and passive content.

---

## 4. Prefocus & Interaction
**Prefocus system** highlights the nearest event label to the focus line.  
Smooth transitions use `transform: scale(1.12)` for visual stability.  
Interactivity prepared for mobile gestures (`touch-action: pan-y;`).

---

## 5. Scaling & Layout
- Timeline scales logarithmically by time; the current time (0 offset) at the top.
- Zoom and scroll preserve proportions across themes.
- Layout constants defined in `timeline.js` ensure consistent behavior on various screens.

---

## 6. Version Goals
This release serves as the foundation for the v46.x series, leading toward:
1. Multi-lane horizontal card staggering.
2. Gradient fade mask for cards.
3. Axis fade-out animation after inactivity.
4. Improved theme focus and present-time updates.

---

### Summary

| Feature | Status | Notes |
|----------|--------|-------|
| Card rendering | ✅ stable | rounded edges + shadow |
| Theme logic | ✅ | active/inactive filters |
| Prefocus | ✅ | smooth transform transitions |
| Layout base | ✅ | consistent across zoom levels |
| Mobile support | ✅ | gestures tested |
| CSS transitions | ✅ | optimized easing |

---

**Author:** Jukka Linjama  
**Date:** October 2025  
**Version:** 46.0  
