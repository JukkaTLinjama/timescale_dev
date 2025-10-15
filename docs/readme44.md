# v44 – Refactor summary (Timescale / log‑aikajana)

Lyhyesti: `timeline.js` kevennetty siirtämällä konffit ja puhtaat apurit **index.html**:ään. Piirto ja d3‑logiikka pysyy `timeline.js`:ssä. Ei rikottu ulkoasua.

## Mitä muuttui

### 1) Konfiguraatio
- **TS_CFG / TS_DELAY** siirretty indexiin (helppo säätää ilman koodimuutoksia).
- `timeline.js` lukee: `const cfg = window.TS_CFG` ja viiveet `TS_DELAY`.

### 2) InfoBox (event‑popover)
- DOM‑moduuli **InfoBox.show/hide** indexiin (IIFE).
- `timeline.js` kutsuu vain `InfoBox.show(ev, box)`.

### 3) SwipeZoom (gesture mode‑lock)
- `setupGlobalSwipeZoom()` korvattiin **SwipeZoom.attach(svg, zoomBehavior, { innerHeight })** indexistä.
- Sama toiminnallisuus, vähemmän rivejä `timeline.js`.

### 4) Tick‑math
- **Ticks.majorsFromDomain / minorsFromDomain** indexiin (puhdas matikka).
- `drawAxis()` piirtää major/minor‑tikit kuten ennen.

### 5) CenterBand
- **CenterBand.compute(w,h,axisRight,zoomBarLeft)** indexiin (puhdas geometria).
- `layoutCenterOverlay()` mittaa DOM‑reunat ja asettaa attribuutit.

### 6) Card‑helpers
- **Util.eventLabel / eventMeta / truncate** indexiin.
- **Util.cardMetrics(...)** laskee korttien paddit ja rectit (bbox‑mittaus).

### 7) DataUtil.normalizeData
- Indexiin puhdas apu, joka:
  - yhdistää `group.theme` tapahtumille
  - valitsee i18n‑labelin (`meta.locale_default`)
  - tuottaa `themes` + palauttaa `themeColors`

### 8) loadData()
- JSON → `DataUtil.normalizeData()` → `state.events`, `state.themes`.
- Teemavärit: käytä `meta.ui.themeColors` jos löytyvät, muuten paletti.

### 9) Pieni optimointi (valinnainen)
- **Y‑map**: `state._yMap = new Map(events → y(time_years))` `applyZoom()`issa.
- `drawCards()` käyttää `_yMap.get(e)` (fallback `state.y(...)`).

---

## Rakennemuutokset (lyhyesti)

```
index.html
 ├─ TS_CFG / TS_DELAY (konffit)
 ├─ Util (helpers: truncate, eventLabel/meta, textHaloOffset, cardMetrics)
 ├─ InfoBox (event‑popover)
 ├─ SwipeZoom (pointer gesture logic)
 ├─ Ticks (major/minor laskenta)
 ├─ CenterBand (geometrian laskenta)
 ├─ DataUtil.normalizeData (datan esikäsittely)
 └─ <script src="timeline.js">
```

`timeline.js` keskittyy: data‑lataus, state, d3‑piirto, handlerit.

---

## Ajaminen paikallisesti

Selaimet estävät `fetch('eventsDB.json')` **file://** ‑poluilta. Käytä pientä dev‑palvelinta:

```bash
python3 -m http.server 8000
# selaimeen: http://localhost:8000/index.html
```

Tai VS Code “Live Server”.

---

## Yhteensopivuus / migraatio

- Jos lisäät myöhemmin `utils.js`‑tiedoston, voit **siirtää** indexin IIFE‑blokit sinne
  ja korvata ne `<script src="utils.js"></script>` – ei muutoksia `timeline.js`:ään.
- Latausjärjestys tärkeä: **Util → InfoBox/SwipeZoom/Ticks/CenterBand/DataUtil → timeline.js**.

---

## Tunnetut virheet ja korjaukset (v44)

- `ev is not defined` → vanha meta‑lohko viittasi `ev`:iin. Korvaa DataUtil‑versiolla.
- `requestPrefocusUpdate is not defined` → lisää stub tai poista kutsu ResizeObserverista.
- `Cannot access 'viewH' before initialization` → julista `const viewH = innerHeight()` heti `drawCards()` alussa.
- `Util.cardMetrics is not a function` → varmista että Util‑blokki latautuu **ennen** `timeline.js`:ää.
- `yRect is not defined` → poista vanhat yRect/hRect‑viittaukset ja käytä `M.yRect/M.hRect`.

---

## TODO (turvalliset seuraavat askeleet)

1. **applyZoom()**: siivoa extent‑laskenta pieneen utiliin (puhdas matikka).
2. **drawCards()**: puskuroi label‑tekstit (d3 selections reuse) → hieman vähemmän DOMia.
3. **theme legend** (jos käytössä): tee laskenta utiliin, piirto timelineen.
4. Tee `utils.js` myöhemmin: kopioi indexin IIFE‑blokit tiedostoon ja linkitä se ennen `timeline.js`:ää.

---

## Koon vaikutus (suuntaa‑antava)

- Viewport‑fix, config, InfoBox, SwipeZoom, Tick‑math, CenterBand, Card‑helpers →
  `timeline.js` lyheni ~350–450 riviä (projektikohtainen).

---

© v44 – refactor snapshot. Muutokset tehty “askel kerrallaan” ‑periaatteella.
