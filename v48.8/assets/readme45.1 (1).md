# v45.1 — Absolute Time Anchoring & Wall-Clock Present (from v44.1)

**Baseline:** start from **v44.1** code (keep `timeline.js` lightweight; helpers in `index.html`).  
**Scope:** All events are calendar-locked (absolute timestamps → decimal year). Historical items render once; the “present” theme contains 4 items (last whole second, minute, hour, day) that can be regenerated on a timer.

---

## What changes in v45.1 (small & safe)

1) **All events are calendar-locked**
   - Every event is positioned by an **absolute timestamp → decimal year**.
   - Historical items are normalized once on page load; **they don’t move** afterward.
   - `timeline.js` remains a pure renderer.

2) **“Present” as a tiny theme with 4 fixed timestamps**
   - Exactly four calendar-anchored items:
     - **last whole second**, **last whole minute**, **last whole hour**, **last whole day**.
   - Generated in `index.html`, merged with the base dataset, and **rendered once** on load.
   - (Optional later) Recompute only these 4 every 1 s; keep history static.

3) **No changes to `timeline.js`**
   - v44.1’s split remains: helpers/config in `index.html`; D3 render in `timeline.js`.

---

## NEW: Option to move *file/data handling* into `index.html`
To keep `timeline.js` slim and testable, consider handling **all data I/O and preprocessing** in `index.html`:
- Load JSON (eventsDB) in `index.html` (`fetch(...)` + fallback).
- Normalize to absolute time there (ISO `timestamp` / `date` → decimal `year`).
- Generate/merge the 4 “present” items there.
- Call `initTimeline(merged)` with a fully prepared array.

**Benefits**
- `timeline.js` stays a pure renderer (no I/O, no branching for present/history).
- Swapping data sources or adding a live feed later won’t touch the renderer.
- Easier A/B testing (e.g., compare v44.1 vs v45.1 datasets) by simply changing the index helper block.

**Minimal wiring**
```html
<script>
async function loadEvents() {
  try {
    const res = await fetch('eventsDB.json', { cache: 'no-store' });
    const raw = await res.json();
    return Array.isArray(raw) ? raw : (raw.events || []);
  } catch (e) {
    console.warn('Using fallback events due to load error:', e);
    return (window.fallbackEvents || []);
  }
}
</script>
```

---

## Implementation (exact steps in `index.html`)

### 1) Helpers
```js
function toDecimalYear(d){
  const Y=d.getFullYear(), a=new Date(Y,0,1), b=new Date(Y+1,0,1);
  return Y + (d - a) / (b - a);
}
function normalizeAbsolute(e){
  if (typeof e.year === 'number') return e;
  if (e.timestamp){ const d=new Date(e.timestamp); return {...e, year: toDecimalYear(d)}; }
  if (e.date){ const [Y,M=1,D=1]=e.date.split('-').map(Number); const d=new Date(Y,M-1,D); return {...e, year: toDecimalYear(d)}; }
  return e; // fallback
}
function floorToSecond(d){const x=new Date(d); x.setMilliseconds(0); return x;}
function floorToMinute(d){const x=new Date(d); x.setSeconds(0,0);  return x;}
function floorToHour(d){  const x=new Date(d); x.setMinutes(0,0,0); return x;}
function floorToDay(d){   const x=new Date(d); x.setHours(0,0,0,0);  return x;}
function buildPresentCalendar(now=new Date()){
  const items = [
    { id:'present-last-second', label:'last second',  date:new Date(floorToSecond(now).getTime()-1000), theme:'present', category:'seconds' },
    { id:'present-minute',      label:'this minute',  date:floorToMinute(now),                           theme:'present', category:'minutes' },
    { id:'present-hour',        label:'this hour',    date:floorToHour(now),                             theme:'present', category:'hours' },
    { id:'present-day',         label:'today',        date:floorToDay(now),                              theme:'present', category:'days' }
  ].map(e => ({ ...e, year: toDecimalYear(e.date) }));
  items.sort((a,b)=>a.year-b.year);
  return items;
}
```

### 2) Merge & init
```js
(async () => {
  const baseEvents = (typeof window.baseEvents !== 'undefined')
    ? window.baseEvents
    : await loadEvents();

  const historyFixed = baseEvents.map(normalizeAbsolute);  // lock to calendar
  const presentOnce  = buildPresentCalendar(new Date());   // 4 items
  initTimeline( historyFixed.concat(presentOnce) );
})();
```

### 3) (Optional) Update only the 4 present items every 1 s
```js
setInterval(() => {
  const updated = buildPresentCalendar(new Date());
  // Easiest now: re-render all (ok once per second if your render is light)
  // Later: add a small timelineAPI.renderPresent(updated) for a partial draw.
  if (window.rerenderTimeline) {
    // Use your app’s differential update if available
    const merged = (window._historyFixed || []).concat(updated);
    rerenderTimeline(merged);
  } else {
    // Fallback: store history to avoid refetching / recomputing
    window._historyFixed = window._historyFixed || historyFixed;
    initTimeline(window._historyFixed.concat(updated));
  }
}, 1000);
```

---

## Why this fits the roadmap
- Keeps v44.1 architecture (light renderer) while adding calendar-locked time semantics.
- Present theme stays tiny and controllable.
- Data I/O + normalization in `index.html` makes future live feeds or editor integration safer.

**Done when**
- All items render from absolute years (no drifting).
- The four present items appear at the bottom region.
- No changes required in `timeline.js`; no console errors.
