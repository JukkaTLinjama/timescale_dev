# Logarithmic Timeline — v41.1

**Scope:** Swipe-direction flip, startup demo refinements (tap → pause → gestures from right edge), touch cursor tweaks, and first pass of *mode-lock* (zoom vs pan) with simple implementation.  
**Status:** Working on Chrome/Safari/iOS/macOS. One known issue remains (see below).

---

## What changed since v41

### 1) Reversed swipe-to-zoom direction
- **Now:** swipe **right ⇒ zoom out**, swipe **left ⇒ zoom in**.  
- Implemented by setting:
  ```js
  const SENS_TOUCH = -0.006;
  const SENS_MOUSE = -0.003;
  ```
  and gentle per-frame clamps to prevent runaway zoom:
  ```js
  const STEP = 20;
  const CLAMP_TOUCH_MIN = 0.92, CLAMP_TOUCH_MAX = 1.08;
  const CLAMP_MOUSE_MIN = 0.95, CLAMP_MOUSE_MAX = 1.05;
  ```

### 2) Mode-lock (simple): zoom **or** pan per gesture
- First significant movement decides the mode; we keep it until **pointerup**.  
- Implementation (drop-in) for `setupGlobalSwipeZoom(svg, zoomBehavior)`:
  ```js
  // v41.1: simple mode-lock — zoom OR pan per gesture (no mixing)
  function setupGlobalSwipeZoom(svgSel, zoomBehavior) {
    const DEAD = 3, DOM = 1.5;
    const SENS_TOUCH = -0.006, SENS_MOUSE = -0.003;
    const STEP = 20, CLAMP_MIN = 0.95, CLAMP_MAX = 1.05;
    let active=false, mode=null, startX=0, startY=0, lastX=0, lastY=0;
    const isTouch = (e)=>e.pointerType==='touch';

    svgSel.node().addEventListener('pointerdown',(e)=>{
      if(!e.isPrimary) return;
      active=true; mode=null;
      startX=lastX=e.clientX; startY=lastY=e.clientY;
      try{ e.target.setPointerCapture(e.pointerId);}catch{}
      e.stopPropagation();
    },{passive:true,capture:true});

    svgSel.node().addEventListener('pointermove',(e)=>{
      if(!active||!e.isPrimary) return;
      const dxTot=e.clientX-startX, dyTot=e.clientY-startY;

      if(mode===null && (Math.abs(dxTot)>=DEAD || Math.abs(dyTot)>=DEAD)){
        mode=(Math.abs(dxTot)>Math.abs(dyTot)*DOM)?'zoom':'pan';
      }

      if(mode==='zoom'){
        const dxStep=Math.max(-STEP,Math.min(STEP,e.clientX-lastX));
        if(Math.abs(dxStep)>=DEAD){
          lastX=e.clientX;
          const sens=isTouch(e)?SENS_TOUCH:SENS_MOUSE;
          const factor=Math.max(CLAMP_MIN,Math.min(CLAMP_MAX,1+dxStep*sens));
          svgSel.call(zoomBehavior.scaleBy,factor,[e.clientX,e.clientY]);
        }
        e.stopPropagation(); return;
      }
      if(mode==='pan'){
        const dyStep=Math.max(-STEP,Math.min(STEP,e.clientY-lastY));
        if(Math.abs(dyStep)>=DEAD){
          lastY=e.clientY;
          svgSel.call(zoomBehavior.translateBy,0,dyStep);
        }
        e.stopPropagation(); return;
      }
      // undecided: block D3 from starting a pan until we decide
      e.stopPropagation();
    },{passive:true,capture:true});

    const end=()=>{active=false;mode=null;};
    svgSel.node().addEventListener('pointerup',end,{passive:true,capture:true});
    svgSel.node().addEventListener('pointercancel',end,{passive:true,capture:true});
    svgSel.node().addEventListener('lostpointercapture',end,{passive:true,capture:true});
  }
  ```

### 3) Startup animation (now fully in `index.html`)
**Order & behavior**:
1. **Tap** theme **“ihmiskunta”** (tap ripple shown).  
2. **Pause 1s** (finger hidden).  
3. **Teleport** the touch cursor near the **right edge** (no slide), using `moveTouchCursorInstant`.  
4. **Zoom**: swipe **left** → zoom **in** (+50%), then swipe **right** → zoom **out** (−20%).  
5. **Pause 0.5s**, then **scroll** up and down.

**Notes**:
- The “teleport” is achieved by hiding the cursor (`hideTouchCursor`) and recreating it at the new point with `ensureTouchCursor()` + `moveTouchCursorInstant(...)` (no motion tween).  
- The demo runs **once per session** (`sessionStorage: startup_v41_shown`) with `?demo=1` override.  
- Optional reload replay:
  ```js
  const nav = performance.getEntriesByType('navigation')[0];
  if (nav && nav.type === 'reload') sessionStorage.removeItem('startup_v41_shown');
  ```

### 4) Touch cursor & tap ripple
- DevTools-like white dot (`#touch-cursor`) + small ripple on taps.  
- Cursor is only visible during the demo; hidden otherwise.

### 5) Info-box hook (optional)
- First click on the “?” button can be intercepted to **play the demo then open** the info box:
  ```js
  infoToggle.addEventListener('click', async (e)=>{
    e.preventDefault(); e.stopPropagation();
    await runStartup();
    infoBox.hidden=false; infoBox.style.display='block';
  }, {capture:true, once:true});
  ```

---

## Tunables

- **Gesture decision:** `DOM = 1.5` (raise to 1.8–2.0 to require stronger horizontal dominance for zoom).  
- **Sensitivity:** `SENS_TOUCH`, `SENS_MOUSE` (make magnitude smaller for slower zoom).  
- **Jitter:** `DEAD = 3` px; `STEP = 20` px per frame cap.  
- **Startup demo:** `kIn = 1.5`, `kOut = 0.8`, `dx = 120`, `dy = -90` and delays inside `runStartup()`.

---

## Known issue (to be fixed next)
- On some devices, **page vertical scroll** may still start if the browser processes the gesture before the mode decision. We attempted CSS locking via a temporary `touch-action: none` class, but behavior varies by platform.  
**Next step:** add a short pre-lock (on the first `pointerdown`) that sets `touch-action: none` on the SVG, and release it at `pointerup`. If it proves too aggressive, only apply after the mode decides to `zoom`.

---

## Quick checklist
- One-finger swipe: **left=in**, **right=out**.  
- Desktop: **press + horizontal drag** zooms; vertical drag pans.  
- Startup demo: tap → pause → gestures from right edge → pauses respected.  
- Touch cursor “teleports”; no sliding between the tap location and the new start point.
- Session gating works; `?demo=1` replays.

© 2025 — v41.1
