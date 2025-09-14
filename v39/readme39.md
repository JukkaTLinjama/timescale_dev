# Interactive Logarithmic Timeline — v39

## Overview
This project is an **interactive D3.js-based timeline** that visualizes the history of the universe, life, and humanity on a **vertical logarithmic scale**.  
Events range from the Big Bang to the present day (2025). Each decade on the log scale can contain one or more events, grouped into partly overlapping themes.

This version (v39) marks the first step towards **open source development**:
- Documentation is now in English.
- The codebase is being gradually modularized and refactored.
- Helper functions are moving out of the main file into a shared `Util` namespace.

---

## Architecture

### Files
- **`index.html`**
  - Loads D3.js and application scripts.
  - Contains the header, info box, footer, and the `<svg>` container for the timeline.
  - Hosts lightweight helper functions (`window.Util`) for error handling, timing, debounce, clamp.
  - Loads `timeline.js` last.

- **`style.css`**
  - Global styles (dark theme by default).
  - Layout variables (`--header-h`, `--footer-h`, `--bg`, `--accent`).
  - Responsive tweaks for mobile.
  - Styling for cards, zoom bar, axis, info box.

- **`timeline.js`**
  - Core logic for layout, scaling, and rendering.
  - Initializes the SVG layers (`axis`, `cards`, `zoom bar`, `overlay`).
  - Handles zoom interactions, resize observer, and automatic card activation/zoom.
  - Loads and flattens events from `eventsDB.json`.
  - Draws axis ticks, cards per theme, and event labels.
  - Uses helper aliases (`safe`, `timed`, etc.) from `Util`.

- **`eventsDB.json`**
  - Hierarchical database of events, grouped into themes (`cosmos`, `biology`, `humanity`, `history`, `modern technology`).
  - Each event has: `label`, `year` (human readable), `time_years` (numeric), `log` (log10 scale), optional `comments`.

- **`readme39.md`**
  - Documentation in English for the first time.
  - Summarizes architecture and changes.

### ASCII Diagram
```
+-------------------+         +------------------+
|     index.html    |         |     style.css    |
| - loads D3 + JS   |         | - global styles  |
| - header/info/svg |         | - theme/axes     |
| - defines Util    |         | - cards/zoom bar |
+---------+---------+         +---------+--------+
          |                             |
          v                             |
+-------------------+                   |
|    timeline.js    |<------------------+
| - layout, scales  |
| - axis & cards    |
| - zoom & resize   |
| - load JSON data  |----+
+---------+---------+    |
          |              |
          v              v
   +-------------+   +----------------+
   | eventsDB    |   |  debug mode    |
   | .json data  |   | (?debug=1)     |
   +-------------+   +----------------+
```

---

## New in v39
1. **Open Source Readiness**
   - Documentation switched to English.
   - Code comments gradually translated.
   - Helpers extracted into a global `Util` namespace (defined in `index.html`).

2. **Cleaner Code Structure**
   - Removed duplicate helper functions from `timeline.js`.
   - Now using safe fallbacks from `window.Util` to handle rendering errors and performance logging.

3. **Debug Mode**
   - Can be enabled with `?debug=1` in the URL.
   - Adds a debug bar at the bottom of the screen to display runtime errors.
   - Extra logging for rendering performance.

---

## Getting Started

### Run locally
- Open `index.html` with a local server (e.g., VS Code Live Server).
- Optional: append `?debug=1` to the URL to enable debug mode.

### Edit data
- Open `eventsDB.json` and edit events under each theme.
- Fields: `label`, `year` (string), `time_years` (number), `log` (number, optional), `comments` (string, optional).

### Customize appearance
- Tweak colors and layout in `style.css` (e.g., `--accent`, font sizes).
- Card spacing and zoom bar width are set in `timeline.js` (`cfg` object).

---

## Enable Debug Mode

Debug mode shows a small bar at the bottom of the page when errors happen and prints extra logs.

**Quick ways to enable:**
- Add `?debug=1` to the page URL:  
  - `http://127.0.0.1:5500/v39/index.html?debug=1`  
  - If there are already query params, append `&debug=1`.
- Toggle via console:
  ```js
  const u = new URL(location.href);
  u.searchParams.set('debug','1');
  location.href = u.toString();
  ```

**Disable:** remove the parameter or set `debug=0`.

**Troubleshooting if the bar doesn’t show:**
- Ensure the debug script is loaded **before** `timeline.js` in `index.html`.
- Make sure you actually have an error (e.g., temporarily add `console.log(unknownVar__test)` to trigger it).
- Check that your URL truly contains `debug=1` (and not cached page without it).

---

## Known Limitations
- iOS Chrome cannot achieve “true fullscreen” without PWA install.
- Some events in `eventsDB.json` are still in Finnish; translations to English are in progress.
- Not all helper functions are yet moved into `Util`.

---

## Roadmap
- **Short term**
  - Finish moving helpers to `Util`.
  - Add basic data validation when loading JSON.
  - Improve modularization (`utils.js`, `config.js`).

- **Medium term**
  - Refactor into ES modules (import/export).
  - Add filtering and color coding by theme.
  - Add localization (English/Finnish toggle).

- **Long term**
  - Publish as an open source library for anyone to create their own logarithmic timelines.
  - Support multiple datasets and themes dynamically.

---

## Contributing
For now, please open issues describing bugs or feature requests. PRs are welcome once the repo structure stabilizes (planned soon).

Coding guidelines (work-in-progress):
- Prefer **English** for code, comments, and commit messages.
- Keep helpers in `Util` and avoid duplicating utilities in `timeline.js`.
- Keep rendering steps explicit: `layout` → `axis` → `cards` → `overlays` → `interactions`.

---

## License
Shared as an **experiment in open data visualization**.  
© 2025 Jukka Linjama · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
