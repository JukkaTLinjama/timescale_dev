# History Timeline – v45.8

**Päiväys:** 2025-10-25  
**Tekijät:** Jukka Linjama & ChatGPT

## Yhteenveto
Tässä versiossa korjattiin kaksi käyttäjäkokemuksen kannalta keskeistä asiaa ilman tietokantarakenteen muutoksia:
1. **Tooltip/InfoBox** ei enää katoa sekuntipäivitysten (1 Hz) aikana.
2. **Suhteellinen aika (“… sitten”)** valmistellaan `prepare()`-vaiheessa ja näytetään sekä InfoBoxissa että tapahtumaotsikoissa (eri tavalla):
   - **InfoBox:** yhdistelmä _absoluuttinen + suhteellinen_ → `2020-03-11 · 5 v sitten`.
   - **Tapahtuman otsikko:** _vain suhteellinen_ → `… (5 v sitten)`.

Lisäksi `year` käsitellään nyt ensisijaisena (myös positiiviset vuodet), ja `date` toimii varafieldinä. BCE/eaa-merkkaukset tunnistetaan joustavasti.

---

## Muutokset lyhyesti

### Tooltipin pysyvyys (index.html)
- Lisätty sisäinen logiikka, joka **estää ohjelmallisen hide():n** sekuntipäivityksen aikana.
- Tooltip sulkeutuu vain **aidosta käyttäjätoiminnasta** (klikkaus, Esc, zoom/pan-ele).

**Vaikutus:** Tooltip ei enää vilku tai katoa, kun “present”-teema päivittyy 1 s välein.

### Suhteellisen ajan esilaskenta (index.html → prepare())
- Lisätty formatteri **`formatAgoFi(ageYears)`**, joka tuottaa suomenkielisen tekstin sekä yksikön:
  - `s`, `min`, `h`, `d`, `kk`, `v`, `tuhat v`, `milj. v`, `mrd v`
  - Skaalakohtaiset kynnysarvot: <90 s, <90 min, <36 h, <90 d, <18 kk, <950 v, <950 ka, <950 Myr, muutoin Gyr.
- Valmistelussa muodostetaan uudet kentät joka tapahtumalle:
  - `time_years` *(jo ennestään)* – ikä vuosina nykyhetkestä.
  - `ago_value`, `ago_unit`, `display_ago` – esim. `5`, `v`, `5 v sitten`.
  - `display_abs` – suosii `year`-kenttää (muuten `YYYY-MM-DD`).
  - `display_when` – yhdistelmä: `display_abs + " · " + display_ago` tai pelkkä `display_ago`.
  
**Vaikutus:** Renderöinti pysyy kevyenä; kaikki tekstit valmiina ilman lisälaskentaa.

### Vuoden ensisijaisuus ja BCE/eaa (index.html → prepare())
- Lisätty **`parseYearFlexible()`** joka tulkitsee mm. `2020`, `"-27"`, `"27 eaa"`, `"563 eKr"`, `"27 BCE"`.
- `year` (myös string) **käytetään ensisijaisena** iän laskentaan; `date` on fallback.
- `display_abs` käyttää ensisijaisesti vuotta.

**Vaikutus:** Positiiviset vuodet toimivat ilman `date`-kenttää; BCE/eaa tulkitaan oikein.

### Event-otsikot (timeline.js)
- Lisätty util-funktio **`Util.eventTitleShort(ev)`** (index.html), jota **timeline.js** käyttää labelien piirtämisessä:
  - Otsikon sulkeissa näytetään **vain `display_ago`** (esim. `5 v sitten`), ei “tyhjiä” sulkeita.
- InfoBoxissa säilyy “absoluuttinen + suhteellinen” (display_when).

**Vaikutus:** Asteikolla otsikot ovat lyhyet ja luettavat; InfoBoxissa saa täydet tiedot.

---

## Tiedostokohtainen diff-tyyppinen yhteenveto

> Muutokset on tehty mahdollisimman pieninä ja kohdistettuina. Alla oleva on dokumentaatiota varten; todelliset koodirivit ovat jo projektissa.

### index.html
- **InfoBox**: lisätty “suppress window” ohjelmallisia päivityksiä varten → hide() ohitetaan päivityksen ajan.
- **prepare()**: lisätty `parseYearFlexible`, `formatAgoFi`, `buildDisplayAbs`; muodostetaan `display_ago`, `display_abs`, `display_when`.
- **Util**: päivitetty `eventMeta` käyttämään `display_when`; lisätty `Util.eventTitleShort(ev)` tapahtumatekstejä varten.

### timeline.js
- Tapahtumien label-tekstin muodostus:  
  `text(Util.eventTitleShort(e))`  
  (korvaa aiemman muodon jossa näytettiin aina `(year)` ja aiheutui tyhjiä sulkeita).

---

## Yhteensopivuus
- **Ei DB-muutoksia**: `eventsDB.json` / `eventsDB45.json` voivat säilyä ennallaan (kentät `year` ja/tai `date`).  
- `prepare()` huolehtii laskennasta ja muotoilusta.  
- “Present”-teeman 1 Hz -päivitys säilytettiin.

---

## Esimerkit

| Syöte (eventsDB) | Otsikko (timeline) | InfoBox (meta) |
|---|---|---|
| `{ "year": 2020 }` | `(5 v sitten)` | `2020 · 5 v sitten` |
| `{ "date": "2020-03-11" }` | `(5 v sitten)` | `2020-03-11 · 5 v sitten` |
| `{ "year": "-27" }` | `(2052 v sitten)` | `-27 · 2052 v sitten` |
| `{ "year": "27 eaa" }` | `(2052 v sitten)` | `27 eaa · 2052 v sitten` |
| `{ "year": "13 000 000 000" }` | `(13 mrd v sitten)` | `13 000 000 000 · 13 mrd v sitten` |

---

## Tunnetut rajaukset / jatkoideat
- i18n: englanninkieliset ago-tekstit (”years ago”) voidaan lisätä myöhemmin.
- `approx`, `prefer_unit` vihjekentät DB:hen (valinnaiset).
- Käyttöliittymäkytkin: ”absoluuttinen / suhteellinen / yhdistelmä”.

