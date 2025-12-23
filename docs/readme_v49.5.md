# Timescale – README v49.5 (Post-mortem)

## Status

**v49.5 = stabilisation checkpoint (WIP)**  
Editor *controls tray* on nyt näkyvä ja avattavissa/suljettavissa, mutta **napit eivät vielä renderöidy**.

Tämä versio on tietoisesti pysäytyspiste: toimiva UI-kuori ennen sisällön korjaamista.

---

## What works now

- Editor controls -tray ilmestyy ruudun alareunaan (musta palkki näkyy)
- Trayn näkyvyys vaihtuu oikein (`display: none ↔ flex`)
- Help / info -paneeli ei enää estä toggle-klikkiä
- CSS-opacity ja JS-tila ovat synkassa
- Tray ei enää sulkeudu välittömästi timeline-renderien takia

Tämä muodostaa **vakaan visuaalisen ja interaktiivisen perustan**.

---

## What does NOT work yet

- Editor-kontrollien napit eivät vielä näy trayn sisällä
- Tray-sisällön build-logiikka on keskeneräinen
- Osassa koodia on edelleen legacy-oletuksia init-järjestyksestä

Tämä on **tiedossa ja hyväksytty tila v49.5:ssa**.

---

## Root causes (post-mortem)

### 1. Varhainen `return` UI-initissä

Editor.js sisälsi guardin:

```js
if (getElementById('editor-controls-toggle') || getElementById('editor-controls')) return;
