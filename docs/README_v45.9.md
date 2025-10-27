# History Timeline v45.9 — streamlined startup & live updates

### ✨ Highlights
- **Startup animation always enabled**
  - The intro now runs automatically after each page load.
  - It can be explicitly skipped with `?demo=0`.
  - All system “reduce motion” and session-based checks removed.

- **Dynamic theme selection**
  - At startup, the animation now picks **the theme whose title is closest to the prefocus line (screen center)**.
  - No hard-coded `"ihmiskunta"` — works dynamically with any visible theme.

- **Simplified 1 Hz “present” updater**
  - The realtime overlay updates every second after the intro finishes.
  - Redundant fallbacks and motion checks removed.

- **Cleaner console**
  - All debug `console.log('trail', ...)` lines removed.
  - Keeps only meaningful startup/info messages.

### ✅ Version summary
| Area | Change |
|------|---------|
| `index.html` | Simplified startup script with dynamic theme detection |
| `index.html` | Cleaned up 1 Hz present-loop |
| `buildPresent()` | Debug trail log removed |
| Dependencies | No sessionStorage / reduced-motion logic |
| Control | `?demo=0` disables intro completely |

---

**Author:** Jukka Linjama & ChatGPT (GPT-5)  
**Date:** 2025-10-27  
**License:** CC BY 4.0  
