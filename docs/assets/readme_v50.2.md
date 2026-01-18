# Timescale Editor – v50.2

v50.2 lukitsee Timescale-editorin datanhallinnan:

- **eventsDB** on kanoninen ja deterministinen (julkaistava tila)
- **Draftit** ovat erillinen, siirrettävä työtila (käyttäjän hallussa)
- Editorista ei voi syntyä vahingossa “sekoitettua exporttia” (DB + draft)

---

## Taustaa: mikä tietokanta on

Timescalen timeline-sisältö on yhdessä JSON-tiedostossa (“eventsDB”).

### DB:n rakenne

DB on yksi JSON-objekti, jossa on kaksi pääosaa:

- `meta`
  - tietokannan metatiedot (versio, kuvaus, kieli jne.)
  - `themes`: teemojen määrittelyt (vähintään `label` ja `color`)
- `events`
  - flat-lista tapahtumista, joita timeline renderöi

### Event (konseptuaalinen skeema)

Tarkat kentät voivat elää, mutta intentio on:

- identiteetti: `id` (string)
- ajoitus: `year` ja/tai `date`
- otsikko: `label` (näkyvä nimi)
- ryhmittely: `theme` (avaimen pitää löytyä `meta.themes`:stä)
- sisältö: `info`, `ref`, `author`, `language`, jne.

**v50.x periaate:** DB on julkaistava sisältö. Editorin toiminta ei mutatoi DB:tä suoraan.

---

## Ydinkäsitteet (v50.x)

### 1) Kanoninen DB

- ladataan kerran käynnistyksessä `eventsDB.json`-tiedostosta
- talletetaan:

```js
window.__BASE_EVENTSDB
```

- editori ei mutatoi tätä
- exportataan **sellaisenaan** (ei filtteröintiä, ei mergeä, ei schemamuutoksia)

**Invariantti**
> Export DB = sama data kuin ladattu DB.

### 2) Draftit (preview-layer)

Draftit ovat work-in-progress -eventtejä runtime-tilassa:

- `event.theme === "preview"`
- `event.draftTargetTheme === "<teema jota oikeasti työstetään>"`

Draftit voi:
- editoida
- exportata/importata bundlena
- hylätä ilman vaikutusta DB:hen

### 3) Draft bundle (siirrettävä)

Draftit tallennetaan ja ladataan siirrettävänä JSON-bundlena (liitteeksi sopiva):

- `kind`-tunniste (esim. `timescale-draft-bundle`)
- `draftTargetTheme`
- `events` (draft-eventit)

---

## Arkkitehtuuridiagrammi

```
                 (load)
eventsDB.json  --------->  window.__BASE_EVENTSDB
 (canonical)                (canonical snapshot)
      |                              |
      | Export DB (as-is)            |  (never mutated)
      v                              |
eventsDB.json (download)  <----------+

               Draft workspace (runtime)
               ------------------------
               PreviewData (draft events list)
                    |
                    | Import Draft Bundle (replace)
                    | Export Draft Bundle
                    v
            draftBundle.json (portable)

Editor UI:
- opens either DB event or Draft event
- Draft editing targets draftTargetTheme (not raw theme="preview")
- no implicit Draft -> DB merge

Explicitly NOT in v50.x:
- exporting mixed DB + Draft
- writing Draft into DB automatically
```

---

## Yksi normalisointipiste: PreviewData.set

Kaikki draft-flow’t kulkevat:

```js
PreviewData.set(list)
```

v50.2 enforceaa:

- kaikilla preview-drafteilla on `draftTargetTheme`
- jos puuttuu, se täytetään DraftSession fallbackilla

**Invariantti**
> Jokaisella `theme:"preview"` eventillä on `draftTargetTheme` PreviewData.setin jälkeen.

---

## Editorin käyttäytyminen (draft theme UX)

### Draft-teeman käsittely

- `theme:"preview"` on kontaineri, ei käyttäjän muokattava teema
- editori näyttää/muokkaa **Draft target theme** -arvoa
- header-badge pysyy siistinä:

```
Theme: draft: <target>
```

Ei provenance-tekstiä (“from …”) pää-UI:ssa.

### Save Draft

- kirjoittaa vain draft-tilaan (`PreviewData`)
- päivittää DraftSessionin **vain onnistuneen tallennuksen jälkeen**

---

## Export-säännöt (v50.x)

### Export Draft
- exporttaa vain draft bundlen
- ei koske DB:tä

### Export DB
- exporttaa vain `window.__BASE_EVENTSDB`
- ei filtteröintiä, ei mergeä, ei schemamuutoksia

---

## v50.2 yhteenveto

- kanoninen DB-export on deterministinen (as loaded)
- draftit ovat siirrettäviä bundleina (import/export)
- draftTargetTheme on näkyvä ja muokattava
- provenance-melu poistettu UI:sta (header + InfoBox)
- PreviewData normalisoi draftTargetTheme invariantin
