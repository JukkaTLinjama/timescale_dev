# Timeline v48.4 – Prefocus & Active Card Improvements

## Overview
Version **v48.4** focuses on fixing active-card prefocus behavior, improving halo offset logic, and ensuring smoother, more consistent rendering on desktop and mobile.

## Key Changes
- **Unified halo-offset logic**  
  Active cards now use the same halo offsets as passive cards.  
  → Neighbour events dodge smoothly around the prefocus event on all cards.

- **Removed active-card halo suppression**  
  The previous rule `if (activeTheme) { textOffsetY = 0 }` caused jumps and incorrect crowding.  
  This special case is removed.

- **Stable prefocus anchor**  
  Uses a frozen prefocus Y + hairline anchor to minimise vertical jumps, especially on mobile.

- **Correct prefocus targeting of overlay card**  
  Prefocus class now prioritises the bright overlay clone.  
  → Scaling happens on the visible card, not only on the dim background copy.

- **Consistent animations**  
  Active and passive cards now share identical transform transitions.

## Result
- Smooth prefocus zoom animation on both desktop and mobile.  
- Bright active card behaves identically to other cards (no jumps).  
- Cleaner and more predictable vertical layout behaviour.  
- Prefocus remains stable relative to the hairline.

## Files Updated
- `timeline.js`  
- (CSS unchanged in this patch; inline transition logic already present)

## Notes
This version prepares the ground for future refinements in v48.5, especially mobile stability testing and tuning transform origins.

