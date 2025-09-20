# Logarithmic Timeline — v41

**Scope:** Input model upgrades (touch + desktop), startup animation moved to `index.html`, user hints.  
**Status:** Stable on Chrome/Safari/iOS/macOS. Respects `prefers-reduced-motion`.

---

## What’s new

### 1) One‑finger horizontal swipe zoom (whole SVG)
- Touch: **swipe → zoom in**, **swipe ← zoom out**, anchored to the finger.
- Implemented with **Pointer Events** (touch‑only path) to avoid passive‑listener warnings and ghost zooms.

### 2) Desktop “press + drag horizontally” → zoom
- With a mouse/trackpad: **hold left button**, drag horizontally to zoom; vertical drags still pan.  
- Uses pointer events with a small dominance threshold so normal pans remain intact.

### 3) Startup animation moved to `index.html`
A once‑per‑session demo that runs after the timeline is ready:
1. **Select** theme **“ihmiskunta”** (visual tap).  
2. **Pause 1 s** (“finger lifted”).  
3. Start gestures **50 px to the right** of the tap point.  
4. **Zoom in +50%**, then **zoom out −20%** (net ≈ +20%).  
5. **Scroll up**, then **down**.

### 4) Touch cursor & ripple (DevTools‑like)
- A small white **touch dot** with a subtle **ripple** is shown during the startup sequence.  
- Pure CSS/inline styles; no image assets.

### 5) “Once per session” + reload override
- The demo is gated by `sessionStorage` key `startup_v41_shown`.  
- Force run with `?demo=1`.  
- Optional: on full **reload**, clear the key to replay.

### 6) Minimal public API in `timeline.js`
`TimelineAPI` is exposed for page scripts + a `timeline:ready` event is emitted when the timeline can be driven:

```js
window.TimelineAPI = {
  scaleBy   (factor, x, y) { svg.call(zoomBehavior.scaleBy, factor, [x, y]); },
  translateBy(dx, dy)      { svg.call(zoomBehavior.translateBy, dx || 0, dy || 0); },
  animScaleBy   (factor, x, y, dur) { svg.transition().duration(dur||600).ease(d3.easeCubicOut).call(zoomBehavior.scaleBy, factor, [x,y]); },
  animTranslateBy(dx, dy, dur)      { svg.transition().duration(dur||600).ease(d3.easeCubicOut).call(zoomBehavior.translateBy, dx||0, dy||0); },
  selectTheme(name){ state.activeTheme = name || null; drawCards(); setZOrder(); },
  getCenter(){ const r = container.getBoundingClientRect(); return { x: Math.round(r.left + r.width*0.60), y: Math.round(r.top + r.height*0.50) }; }
};
document.dispatchEvent(new CustomEvent("timeline:ready"));
```

> The legacy auto‑focus/auto‑zoom block from v40.x was removed to let `index.html` fully orchestrate the demo.

---

## File touches

- **`timeline.js`**
  - Added `TimelineAPI` and `timeline:ready` dispatch.
  - Implemented **global swipe zoom** with pointer events (touch‑only path) and **desktop press+drag zoom** (mouse path).  
  - Kept wheel/pinch behavior unchanged.

- **`style.css`**
  - `#timeline { touch-action: pan-y pinch-zoom; }` so pinch remains native while horizontal is custom.
  - Added styles for **touch cursor** (DevTools‑like) and (optionally) coachmarks/gesture hints.

- **`index.html`**
  - New **startup script** containing:
    - touch cursor helpers (`ensureTouchCursor`, `moveTouchCursor`, `tapRipple`, `hideTouchCursor`),
    - the **`runStartup()`** sequence (select → pause → gestures from +50 px right),
    - once‑per‑session gate with `startup_v41_shown` and `?demo=1` override,
    - optional reload reset snippet.

---

## Startup animation (index.html)

Minimal self‑contained skeleton placed **after** `timeline.js`:

```html
<script>
(function(){
  const SS_KEY = "startup_v41_shown";
  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  // Optional: replay on reload
  const nav = performance.getEntriesByType('navigation')[0];
  if (nav && nav.type === 'reload') { sessionStorage.removeItem(SS_KEY); }

  // Touch cursor helpers (DevTools-like)
  function ensureTouchCursor(){ /* creates #touch-cursor and returns it */ }
  function moveTouchCursor(el, x, y, visible=true){ /* position + fade */ }
  function tapRipple(x,y){ /* small pulse ring */ }
  function hideTouchCursor(el){ /* fade+remove */ }

  function findThemeCenter(name){
    const svg = document.getElementById('timeline'); if(!svg) return null;
    const nodes = svg.querySelectorAll('text.card-title');
    for (const t of nodes) {
      if ((t.textContent||'').trim().toLowerCase() === String(name).toLowerCase()) {
        const r = t.getBoundingClientRect();
        return { x: Math.round(r.left + r.width*0.5), y: Math.round(r.top + r.height*0.5) };
      }
    } return null;
  }

  async function runStartup(){
    const api = window.TimelineAPI; if (!api) return;
    const cursor = ensureTouchCursor();
    const tap = findThemeCenter("ihmiskunta") || api.getCenter();

    // 1) “Tap” select
    moveTouchCursor(cursor, tap.x, tap.y, true);
    await sleep(220); tapRipple(tap.x, tap.y); api.selectTheme("ihmiskunta");

    // 1s pause (finger lifted)
    moveTouchCursor(cursor, tap.x, tap.y, false);
    await sleep(1000);

    // Start gestures 50 px to the right
    const startX = tap.x + 50, startY = tap.y;
    moveTouchCursor(cursor, startX, startY, true);
    await sleep(180);

    // 2) Zoom in +50%, then out −20%
    const dx=120, kIn=1.5, kOut=0.8;
    moveTouchCursor(cursor, startX + dx, startY, true);
    api.animScaleBy(kIn, startX, startY, 700);
    await sleep(740);

    moveTouchCursor(cursor, startX, startY, true);
    api.animScaleBy(kOut, startX + dx, startY, 560);
    await sleep(600);

    // 3) Scroll up then down
    const dy=-90;
    moveTouchCursor(cursor, startX, startY + dy, true);
    api.animTranslateBy(0, dy, 620);
    await sleep(660);

    moveTouchCursor(cursor, startX, startY, true);
    api.animTranslateBy(0, -dy, 520);
    await sleep(540);

    hideTouchCursor(cursor);
  }

  document.addEventListener("timeline:ready", () => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const url=new URL(location.href), force=url.searchParams.get("demo")==="1";
    if (!force) {
      if (sessionStorage.getItem(SS_KEY)==="1") return;
      sessionStorage.setItem(SS_KEY, "1");
    }
    setTimeout(runStartup, 180);
  });
})();
</script>
```

> To also **chain the demo to the info box**: intercept the first “?” click and play the animation before opening the box.
>
> ```js
> const infoToggle = document.getElementById("info-toggle");
> const infoBox = document.getElementById("info-box");
> if (infoToggle && infoBox) {
>   infoToggle.addEventListener("click", async (e) => {
>     e.preventDefault(); e.stopPropagation();
>     await runStartup();
>     infoBox.hidden = false;
>     infoBox.style.display = "block";
>   }, { capture: true, once: true });
> }
> ```

---

## Tunables (quick reference)

**`timeline.js` (gesture logic):**
- `DEADZONE = 2` (px) — ignore jitters.  
- `SENS_TOUCH = 0.012` — zoom sensitivity for touch.  
- `SENS_MOUSE = 0.006` — zoom sensitivity for mouse/trackpad.  
- `DOMINANCE = 1.25` — horizontal must dominate vertical by this ratio to switch desktop gesture into “zoom mode”.

**`index.html` (startup animation):**
- `kIn = 1.5`, `kOut = 0.8` — zoom factors (+50%, −20%).  
- `dx = 120`, `dy = -90` — visual swipe distances.  
- Delays/durations inside `runStartup()` — adjust timings for your taste.  
- Session key: `startup_v41_shown` (override with `?demo=1`).

---

## Testing checklist

- Touch (phone/tablet):
  - One‑finger horizontal swipe zooms in/out smoothly, anchored to finger.
  - Pinch zoom works natively. Vertical drags pan as before.
- Desktop (trackpad/mouse):
  - Press + horizontal drag zooms; vertical drag pans; pinch/scroll behaves as expected.
- Startup demo:
  - Runs once per session (or with `?demo=1`), in the order: select → pause → zoom → scroll.
  - Touch cursor appears only during the demo, then disappears.
  - Optional: first click on **?** plays the demo and **then** opens the info box.
- Accessibility:
  - With `prefers-reduced-motion: reduce`, the demo does not run.
- Console:
  - You may still see a D3 “non‑passive touchstart” warning coming from `d3-zoom`. It’s harmless.

---

## Known notes

- The `d3-zoom` library installs a non‑passive `touchstart` listener internally; Chrome may warn about it. Our own listeners are passive; no action required.
- If desktop zoom triggers too easily during pans, raise `DOMINANCE` (e.g., 1.5–2.0) or reduce `SENS_MOUSE`.
- If the theme title is temporarily outside the viewport on slow devices, the demo falls back to `getCenter()` to anchor gestures.

© 2025 J.L. / v41
