# History Timeline – Version 47.5

## Overview
This version refines the UI and interaction architecture of the History Timeline project, focusing on:
- Unified help (“?”) handling and PrefocusInfo behavior
- Clean layering between InfoBox, editor, and help overlays
- Editor draft system rewritten as an **upsert** (update or create) logic
- Startup intro animation fixed (no duplicate runs)
- CSS and z-index cleanup for correct visual stacking

---

## ✨ Main Features & Fixes

### 1. Unified Help / Info Toggle
- The “?” button now opens and closes the help overlay consistently.
- The panel closes automatically:
  - when clicking or tapping outside the help area
  - when pressing **Esc**
  - or when zooming/panning (any timeline interaction)
- PrefocusInfo is disabled while help is open and rearmed after closing.
- The help panel now uses a fixed position and high z-index (2600) to ensure visibility.

### 2. PrefocusInfo Integration
- PrefocusInfo now connects to `onViewportMotion()` and `onPrefocus()` directly inside `timeline.js`.
- Prefocus behavior only activates **after the user has interacted** (zoom/pan), not on every button click.
- During help mode, PrefocusInfo is completely disabled.
- Resolvers now calculate element bounding boxes precisely, so popups align correctly to their labels.

### 3. Visual Layering (z-index)
- **Editor (`#event-editor`)** is always on top (`z-index: 2800`).
- **Help panel (`#info-box`)** sits below (`z-index: 2600`).
- **Event InfoBox (`#event-info`)** remains under both (`z-index: 2200`).
- The overall layering order:
  ```
  event-info  → 2200  
  help panel  → 2600  
  editor      → 2800
  ```
- Cleaned directly in `style.css` (no appended overrides).

### 4. Editor Draft System (Upsert Logic)
- The **Save draft** button no longer creates endless duplicate drafts.
- It performs an **upsert**:
  - If a draft for the same source already exists → it’s **updated in place**.
  - Otherwise → a **new draft** is created once.
- Each draft now includes:
  - `updated_at` (ISO timestamp)
  - Recalculated `time_years` based on `year` or `date` fields
- “Duplicate to Preview” still creates separate variants manually.
- The same draft card updates live in the preview panel (no stacking duplicates).

### 5. Editor UI Fixes
- Editor always appears above InfoBox (no overlap issues).
- Added `body.editor-open` class to support pointer disabling or visual dimming of background if desired.
- Mobile version uses consistent layering and remains scrollable within safe areas.

### 6. Startup Intro Fix
- The intro animation previously ran **twice** due to multiple triggers (`first-render`, `render`, fallback timer).
- A new function `scheduleIntroOnce()` ensures only one intro run is ever queued.
- The intro now correctly initializes the cursor at the start (`cursor = ensureTouchCursor();`).
- Intro plays once and ends cleanly without duplicate scroll sequences.

---

## 🧩 Code Structure Highlights

**timeline.js**
- Added `window.__HAS_INTERACTED__` and `window.__HELP_MODE__` flags.
- Zoom-handler now:
  - Marks `__HAS_INTERACTED__ = true` at first motion.
  - Calls `onViewportMotion()` once per zoom/pan.
- `computePrefocusData()` gated by interaction and help mode.
- Single clean call to `PrefocusInfo.onPrefocus()` after `markPrefocusClass()`.

**index.html**
- Replaced the entire help toggle IIFE.
- Added global event listeners for closing help by Esc or outside clicks.
- `timeline:render` event also closes help automatically.

**editor.js**
- Added `EditorPreviewOps.upsertFromEventId()`:
  - Handles draft update/create logic.
  - Updates existing drafts in place, recalculates `time_years`, and adds `updated_at`.
- “Save draft” handler now uses the new upsert API.
- Fixed startup intro initialization (cursor creation order).

**style.css**
- Rewritten `#event-editor` blocks for desktop and mobile to use:
  ```css
  position: fixed;
  z-index: 2800;
  ```
- Ensured `#event-info` remains at `z-index: 2200`.
- Removed conflicting mobile comments and unified layout behavior.

---

## 🧪 Behavior Summary

| Context | Behavior |
|----------|-----------|
| **Help open** | PrefocusInfo disabled, InfoBox hidden, any outside click or Esc closes it |
| **Editor open** | Event info stays behind editor, no interference |
| **First zoom/pan** | Arms PrefocusInfo dwell logic |
| **Save draft** | Updates existing preview draft or creates one if missing |
| **Duplicate** | Creates new variant as before |
| **Startup intro** | Plays exactly once per load; cursor visible and moves smoothly |

---

## 🔧 Next Steps
- Optional: dim background (`body.editor-open #event-info { opacity: .4; pointer-events:none; }`)
- Add auto-save interval for drafts.
- Improve visual highlight when upserting (e.g. brief glow on updated card).

---

**Version:** v47.5  
**Date:** November 2025  
**Author:** Jukka Linjama & ChatGPT (GPT-5 collaboration)
