// timeline.js — v40.3
// switching from v38 to EN as default language

// Safe debug logger (no-op unless ?debug=1 used)
const DBG = !!window.__DBG__;
const log = (...args) => { if (DBG) console.log("[timeline]", ...args); };
// Use helpers from window.Util when available; otherwise safe fallbacks.
const U = window.Util || {};
const safe = U.safe || ((fn) => (typeof fn === "function" ? fn() : undefined));
const timed = U.timed || ((label, fn) => (typeof fn === "function" ? fn() : undefined));

// Prevent overlapping renders and allow quick perf timing in debug mode.
let __isRendering = false;

(() => {
    // v38 viewport fix for iOS Chrome/Safari
    (function v38ViewportFix() {
        const root = document.documentElement;

        function apply() {
            // 1) lue “oikea” näkyvä korkeus (visualViewport), fallback window.innerHeightiin
            const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight || 0;
            root.style.setProperty('--vhpx', `${Math.round(vh)}px`); // kommentti: pikseleinä → CSS: calc(var(--vhpx) ...)

            // 2) mittaa otsikon ja footerin todellinen korkeus → aseta CSS-muuttujiksi (CSS jo käyttää niitä)
            const hdr = document.getElementById('page-title');
            const ftr = document.getElementById('page-footer');
            const hH = hdr ? Math.round(hdr.getBoundingClientRect().height) : 0;
            const fH = ftr ? Math.round(ftr.getBoundingClientRect().height) : 0;
            root.style.setProperty('--header-h', `${hH}px`);
            root.style.setProperty('--footer-h', `${fH}px`);
        }

        // ensilaskenta
        apply();

        // reagoi selainpalkin muutoksiin iOS:ssä
        window.addEventListener('resize', apply, { passive: true });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', apply, { passive: true });
            window.visualViewport.addEventListener('scroll', apply, { passive: true });
        }
    })();

    const cfg = {
        margin: { top: 12, right: 54, bottom: 12, left: 54 },
        zoomBar: { width: 22, gap: 10 },     // oikean reunan zoom-palkki
        card: { minW: 160, pad: 10 },
        palette: ["#b6c8d4", "#70a8c6", "#4b9fa8", "#4dbc82", "#7be2a3"] // korttien värit
    };
    const ACTIVATE_DELAY = 1000; // ms ennen kuin kortti saa .active
    const ZOOM_DELAY = 1500;     // ms ennen zoom-animaatiota (säilytettiin pyyntösi mukaisena)

    // --- tila ---
    const state = {
        width: 0, height: 0,
        yBase: null, y: null,
        zoom: null,
        minYears: .01, maxYears: 1e10,        // alustava; päivitetään datasta
        events: [],
        themes: [],
        activeTheme: null, // v36: klikatun kortin teema
        themeColors: new Map()
    };

    let autoZooming = false; // v38: estä RO ylikirjoittamasta autofocus-animaatiota

    // --- perusvalinnat ---
    const svg = d3.select("#timeline");
    const container = document.getElementById("timeline-container");

    // pää-ryhmät
    const gRoot = svg.append("g").attr("class", "root");
    const gAxis = gRoot.append("g").attr("class", "axis");
    const gCards = gRoot.append("g").attr("class", "cards");
    const gMinor = gRoot.append("g").attr("class", "minor-grid");
    // v37: clip korttialueelle
    const defs = svg.append("defs");
    const plotClip = defs.append("clipPath").attr("id", "plotClip");
    const plotClipRect = plotClip.append("rect"); // mitat asetetaan layoutissa
    // käytä klippausta vain korteille (akseli ja zoom jäävät vapaiksi)
    gCards.attr("clip-path", "url(#plotClip)");

    // v36: globaali haalennus ja aktiivikerros
    const gDim = svg.append("g").attr("class", "dim");
    const dimRect = gDim.append("rect")
    .attr("class", "global-dim-rect")
    .style("pointer-events", "none")  // ei blokkaa klikkejä
    .style("fill", "#000");           // varmistetaan täyttö    
    const gActive = svg.append("g").attr("class", "active-layer");        // tänne siirretään aktiivinen kortti

    // zoom bar oikealle
    const gZoomTrack = svg.insert("g", ".root").attr("class", "zoomBar"); // v35: tausta alle
    const gZoom = svg.append("g").attr("class", "zoomBar");         // ikkuna + hitbox päälle
    const zoomBG = gZoomTrack.append("rect").attr("class", "track");
    // v36: ikkuna alimman tason track-ryhmään → ei peitä sisältöä
    const zoomWin = gZoomTrack.append("rect").attr("class", "window").attr("rx", 3).attr("ry", 3);

    // v36: varmista kerrosjärjestys heti luontivaiheessa
    setZOrder();

    // --- apufunktiot ---
    function setZOrder() {
        gZoomTrack.lower(); // alin: kapea zoombar-tausta
        gRoot.raise();      // kaikki kortit & akseli (passiivinen sisältö)
        // gDim.raise();      // ← no need to raise: global overlay stays off
        gActive.raise();    // aktiivinen kortti overlayn yläpuolelle
        gAxis.raise();   // v37 fix: akseli + tikit overlayn yläpuolelle
    }

    function layout() {
        state.width = container.clientWidth;
        state.height = container.clientHeight;

        // koko svg ja rootin paikka (akselille vasen marginaali)
        svg.attr("width", state.width).attr("height", state.height);
        const rootTX = cfg.margin.left - 24;                 // sama siirto molemmille
        gRoot.attr("transform", `translate(${rootTX},${cfg.margin.top})`);
        gActive.attr("transform", `translate(${rootTX},${cfg.margin.top})`); // ← estää “hyppäyksen” vasemmalle
        // y-skaala: log(time_years): ala=nyky, ylös=menneisyys
        const innerH = innerHeight();
        state.yBase = d3.scaleLog().domain([state.minYears, state.maxYears]).range([0, innerH]); // menneisyys alas
        state.y = state.yBase.copy();

        // zoom bar oikealle reunan tuntumaan
        const zx = state.width - cfg.margin.right + cfg.zoomBar.gap + 36; // v35: lisää oikealle
        const zy = cfg.margin.top;
        gZoomTrack.attr("transform", `translate(${zx},${zy})`);
        gZoom.attr("transform", `translate(${zx},${zy})`);

        zoomBG.attr("x", 0).attr("y", 0).attr("width", cfg.zoomBar.width).attr("height", innerH);
        zoomWin.attr("x", 2).attr("width", cfg.zoomBar.width - 4).attr("y", 0).attr("height", innerH - 1);
        // v40: global dim overlay — covers the content area from the axis gap to the right edge.
        // It deliberately leaves the left y-axis visible.
        const axisGap = 2;
        const contentLeft = rootTX + axisGap;
        // Use the actual svg width so cards don't get clipped on the right;
        // keep a tiny 8px padding to the container's border.
        const contentWidthSVG = Math.max(0, state.width - contentLeft - 8);

        dimRect
            .attr("x", contentLeft)
            .attr("y", 0)
            .attr("width", contentWidthSVG)
            .attr("height", state.height);

        // Update clip to the same visual width but in gCards' local coordinates (origin at 0).
        const clipWidthLocal = Math.max(0, state.width - rootTX - 8);
        plotClipRect
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", clipWidthLocal)
            .attr("height", innerHeight());

        // Keep the extra safety for the other clipPath variant used earlier in init()
        d3.select("#plot-rect")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", clipWidthLocal)
            .attr("height", innerHeight());

        setZOrder();  // v35: varmistetaan ettei track koskaan peitä tekstejä
        // alustava zoom-ikkuna = koko alue
        zoomWin.attr("x", 2).attr("width", cfg.zoomBar.width - 4).attr("y", 0).attr("height", innerH - 1); // synkassa taustan kanssa
    }

    function innerWidth() { return Math.max(0, state.width - cfg.margin.left - cfg.margin.right); }
    function innerHeight() { return Math.max(0, state.height - cfg.margin.top - cfg.margin.bottom); }

    // v36: domain datasta + pieni marginaali ylä- ja alapäähän (log-dekadeina)
    function computeDomainFromData() {
        if (!state.events.length) return;

        const minData = d3.min(state.events, d => Math.max(+d.time_years || 1e-8, 1e-8));
        const maxData = d3.max(state.events, d => +d.time_years || 1);

        const padTopDec = 0.15;     // ~0.15 dekadia "ylätilaa" → minYears = minData / 10^0.15 (~/1.41)
        const padBotDec = 0.45;     // kevyt alapään marginaali (valinnainen)

        state.minYears = Math.max(1e-1, minData / Math.pow(10, padTopDec));   // pienempi arvo = enemmän tilaa ylös
        state.maxYears = Math.max(10, maxData * Math.pow(10, padBotDec));   // isompi arvo = hieman tilaa alas
    }

    function colorForTheme(t) {
        if (!state.themeColors.has(t)) {
            const idx = state.themeColors.size % cfg.palette.length;
            state.themeColors.set(t, cfg.palette[idx]);
        }
        return state.themeColors.get(t);
    }

    // timeline.js v36 — v32-logiikka: major-tickit akselissa, minor-viivat .minor-grid:iin
    function drawAxis() {
        const y = state.y;
        const [d0, d1] = y.domain();

        // major: 10^n
        const n0 = Math.floor(Math.log10(d0));           // v37 fix: floor,floor → toimii myös vajaassa dekadissa
        const n1 = Math.floor(Math.log10(d1));
        const majors = d3.range(n0, n1 + 1)              // pidä vain domainiin osuvat majorit
            .map(e => 10 ** e)
            .filter(v => v >= d0 && v <= d1);

        // 1) Akseli: vain major-tickit, ei oletustekstiä
        const axis = d3.axisLeft(y).tickValues(majors).tickSize(4).tickFormat(() => "");
        gAxis.call(axis);

        // 2) Major-tickien labeli “10^n”; minor-tickeillä ei tekstejä (koska niitä ei piirretä akselille)
        gAxis.selectAll("g.tick > text").text(""); // varmuus tyhjennys
        gAxis.selectAll("g.tick").each(function (d) {
            const exp = Math.floor(Math.log10(d));
            const t = d3.select(this).select("text").text(null);
            t.append("tspan").text("10");
            t.append("tspan").attr("baseline-shift", "super").attr("font-size", "9px").text(exp);
        });

        // 3) Minor-viivat .minor-grid-ryhmään (2..9 × 10^n) — vain jos ei liian tiheää
        gMinor.selectAll("*").remove();
        const visibleDecades = n1 - n0 + 1;                 // kuinka monta dekadia näkyy
        const showMinor = visibleDecades <= 12;              // kynnys kuten v32: “riittävän väljä”
        if (showMinor) {
            for (let e = n0; e <= n1; e++) {
                for (let m = 2; m <= 9; m++) {
                    const v = m * 10 ** e;
                    if (v >= d0 && v <= d1) {
                        gMinor.append("line")
                            .attr("x1", -4).attr("x2", 0)     // lyhyt pisto akselin oikealle
                            .attr("y1", y(v)).attr("y2", y(v));
                        // HUOM: ei väriä/opacityä JS:ssä → kaikki tyyli CSS:ään
                    }
                }
            }
        }
    }

    // v36: kortin sisäpadit = otsikon ja event-fontin mitat (ei leikkautumista)
    function drawCards() {
        const themes = state.themes;
        const w = Math.max(cfg.card.minW, innerWidth() * 0.33);

        const data = themes.map(th => {
            const list = state.events.filter(e => e.theme === th);
            const logs = list.map(e => Math.log10(e.time_years));
            const minL = d3.min(logs), maxL = d3.max(logs);
            return {
                theme: th,
                yTopEv: state.y(Math.pow(10, maxL)),   // ylimmän (vanhimman) eventin y
                yBotEv: state.y(Math.pow(10, minL)),   // alimman (uusimman) eventin y
                color: colorForTheme(th),
                events: list
            };
        });

        // v40.3 fix: ensure previous active participates in the join/class update
        while (gActive.node().firstChild) {
            gCards.node().appendChild(gActive.node().firstChild);
        }

        const indent = 20;
        const sel = gCards.selectAll("g.card").data(data, d => d.theme);
        const ent = sel.enter().append("g").attr("class", "card");

        // kortin rect + otsikko + eventtiryhmä
        ent.append("rect").attr("rx", 10).attr("ry", 10).attr("filter", "url(#shadow)");
        ent.append("text").attr("class", "card-title").attr("x", 8).style("font-weight", "bold");
        ent.append("g").attr("class", "events");
        sel.exit().remove();
        const merged = sel.merge(ent);

        sel.merge(ent).each(function (d, i) {
            const g = d3.select(this);
            const x = (i % 2 === 0 ? 10 : 10 + indent);
            g.attr("transform", `translate(${x},${0})`);

            // --- mitataan tekstit → padit ---
            const titleSel = g.select("text.card-title").text(d.theme);
            // otsikon bbox → yläpadin korkeus
            const titleH = Math.ceil((() => { try { return titleSel.node().getBBox().height; } catch { return 10; } })()) || 10;

            // luodaan hetkeksi piilotettu event-label mittausta varten
            const tmp = g.append("text").attr("class", "event-label").attr("visibility", "hidden").text("X");
            const evH = Math.ceil((() => { try { return tmp.node().getBBox().height; } catch { return 9; } })()) || 9;
            tmp.remove();

            const topPad = titleH + 6;    // pieni marginaali otsikon ja eventtien väliin
            const botPad = Math.ceil(evH * 2.2) + 8; // v36: enemmän tilaa alimman eventin alle (säädä kerrointa 1.8–2.5)
            // --- kortin rect-alue: eventtialue + padit ---
            const yRect = Math.min(d.yTopEv, d.yBotEv) - topPad;
            const hRect = Math.abs(d.yBotEv - d.yTopEv) + topPad + botPad;

            g.select("rect")
                .attr("x", 0).attr("y", yRect)
                .attr("width", w).attr("height", hRect)
                .attr("fill", d.color).attr("fill-opacity", 0.55)
                .attr("stroke", "#999").attr("stroke-opacity", 0.25);

            // v40: Only mark a card active when a theme is selected.
            // No selection = neutral (neither .active nor .inactive).
            const hasActive = !!state.activeTheme;
            g.classed("active", hasActive && state.activeTheme === d.theme)
                .classed("inactive", hasActive && state.activeTheme !== d.theme);

            // v36: otsikko “sticky” yläreunaan, mutta piiloon jos kortti kokonaan ulkona
            const viewH = innerHeight();
            const fullyAbove = (yRect + hRect) < 15;  // kortti lähes kokonaan yli yläreunan
            const fullyBelow = yRect > viewH;         // kortti kokonaan yli alareunan

            g.select("text.card-title")
                .text(d.theme)
                .style("display", (fullyAbove || fullyBelow) ? "none" : null)
                .attr("y", Math.max(4, yRect + 2))  // clamp yläreunaan 4px marginaalilla
                .attr("dy", "0.9em");

            // --- eventit: pysyvät absoluuttisessa y:ssä (state.y) ---
            const evSel = g.select("g.events").selectAll("g.e").data(d.events, e => e.label + e.time_years);
            const evEnt = evSel.enter().append("g").attr("class", "e");
            evEnt.append("line").attr("class", "event-line");
            evEnt.append("text").attr("class", "event-label").attr("x", 18).attr("dy", "0.32em");
            evSel.exit().remove();

            evSel.merge(evEnt).each(function (e) {
                const yy = state.y(e.time_years);
                const gg = d3.select(this);
                gg.select("line.event-line")
                    .attr("x1", -x + 4).attr("x2", 8).attr("y1", yy).attr("y2", yy).attr("stroke", "#aaa");
                gg.select("text.event-label")
                    .attr("x", 12).attr("y", yy)
                    .text(`${e.label} (${(e.year ?? "").toString()})`);
            });
            // v40: ensure correct z-order right after toggling activation.
            // dim overlay (gDim) must sit above passive cards (gRoot) but below active ones (gActive).
            setZOrder();
        });

        // v40.3: change active only on click (single source of truth = state.activeTheme)
        merged.on("click", function (event, d) {
            event.preventDefault();     // NEW
            event.stopPropagation();    // NEW

            if (state.activeTheme === d.theme) return; // no toggle-off
            state.activeTheme = d.theme;               // set new active
            drawCards();                               // re-render → classes & move to gActive
            setZOrder();                               // keep layers correct
        });
        merged.on("dblclick", function (event) { event.preventDefault(); event.stopPropagation(); }); 

        // Move previous active back to cards, then lift the current active once.
        while (gActive.node().firstChild) {
            gCards.node().appendChild(gActive.node().firstChild);
        }

        // v40.3: lift the current active once (previous active was returned before the join)
        if (state.activeTheme) {
            merged
                .filter(d => d.theme === state.activeTheme)
                .each(function () { gActive.node().appendChild(this); });
        }

        setZOrder();         // v40: ensure layer order right after activation change
    }

    function updateZoomIndicator(transform) {
        const H = innerHeight();
        const k = transform.k, ty = transform.y;
        const winH = H / k;
        const winY = Math.max(0, Math.min(-ty / k, H - winH));
        zoomWin.attr("y", winY).attr("height", winH);
    }

    function applyZoom() {
        // Re-entrancy guard: if a render is already running, skip this call.
        if (__isRendering) {
            if (DBG) console.log("[render] skipped re-entrant applyZoom()");
            return;
        }
        __isRendering = true;

        try {
            // Wrap draw calls with timing + error safety.
            if (typeof drawAxis === "function") {
                timed("drawAxis", () => safe(drawAxis, "drawAxis"));
            }
            if (typeof drawCards === "function") {
                timed("drawCards", () => safe(drawCards, "drawCards"));
            }

            // Enforce layer order even if a draw step failed.
            setZOrder();
        } finally {
            __isRendering = false;
        }
    }

    // --- zoom käyttäytyminen ---
    const zoomBehavior = d3.zoom()
        .scaleExtent([0.3, 12])
        .translateExtent([[0, 0], [1, 1]]) // päivitetään initissä
        .on("zoom", (event) => {
            // rescale → clamp domain alkuperäiseen
            const t = event.transform;
            const tmp = t.rescaleY(state.yBase);
            const [a, b] = tmp.domain();
            const clamped = [
                Math.max(a, state.minYears),
                Math.min(b, state.maxYears)
            ];
            state.y = d3.scaleLog().domain(clamped).range(state.yBase.range());
            updateZoomIndicator(t);
            applyZoom();
        });

    // --- data ---
    async function loadData() {
        try {
            const res = await fetch('eventsDB.json', { cache: "no-store" });
            if (!res.ok) throw new Error("eventsDB.json not found");
            const data = await res.json();

            // flatten: lisätään theme jokaiselle eventille
            state.events = (data.events || []).flatMap(g => (g.events || []).map(e => ({ ...e, theme: g.theme })));
            state.themes = Array.from(new Set(state.events.map(e => e.theme)));

            // värit per teema
            state.themes.forEach(t => colorForTheme(t));

            computeDomainFromData();
            const sm = document.getElementById("status-message");
            if (sm) sm.textContent = "✅ Data loaded from eventsDB.json.";
        } catch (e) {
            console.warn("Using fallback data:", e.message);
            const sm = document.getElementById("status-message");
            if (sm) sm.textContent = "⚠️ eventsDB.json not found — using demo data.";

            state.events = [
                { label: "Alkuräjähdys", year: "13.8e9", time_years: 13.8e9, theme: "kosmos" },
                { label: "Elämän synty", year: "3.8e9", time_years: 3.8e9, theme: "elämä" },
                { label: "Dinosaurukset kuolevat", year: "6.6e7", time_years: 6.6e7, theme: "elämä" },
                { label: "Homo sapiens", year: "3.0e5", time_years: 3.0e5, theme: "ihmiskunta" },
                { label: "Antiikin Kreikka", year: "2.5e3", time_years: 2.5e3, theme: "kulttuuri" },
                { label: "Moderni tiede", year: "4.0e2", time_years: 4.0e2, theme: "teknologia" }
            ];
            state.themes = Array.from(new Set(state.events.map(e => e.theme)));
            state.themes.forEach(t => colorForTheme(t));
            computeDomainFromData();
        }
    }

    // --- init ---
    async function init() {
        // v38: mittaa H1 + margin-bottom → CSS --header-h
        const h1 = document.getElementById('page-title');
        let h1H = 0;
        if (h1) {
            const r = h1.getBoundingClientRect();                   // sisältää paddingin
            const mb = parseFloat(getComputedStyle(h1).marginBottom) || 0; // lisää margari
            h1H = Math.ceil(r.height + mb);
        }
        document.documentElement.style.setProperty('--header-h', `${h1H}px`);

        layout();
        // v33: info-paneelin toggle (tukee sekä #info-box että #help)
        const infoToggle = document.getElementById('info-toggle') || document.getElementById('helpBtn');
        const infoBox = document.getElementById('info-box') || document.getElementById('help');
        if (infoToggle && infoBox) {
            infoToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                // tue sekä [hidden] että display:none
                if ('hidden' in infoBox) infoBox.hidden = !infoBox.hidden;
                if (infoBox.style) infoBox.style.display = (infoBox.style.display === 'block' ? 'none' : 'block');
            }, { passive: true });

            document.addEventListener('click', () => {
                if ('hidden' in infoBox) infoBox.hidden = true;
                if (infoBox.style) infoBox.style.display = 'none';
            });
            infoBox.addEventListener('click', (e) => e.stopPropagation());
        }

        // varjo filtteri
        const defs = svg.append("defs");
        defs.append("filter").attr("id", "shadow")
            .append("feDropShadow")
            .attr("dx", -3).attr("dy", 3).attr("stdDeviation", 3)
            .attr("flood-color", "#000").attr("flood-opacity", 0.25);
        // v33: piirtoalueen leikkaus, estää valumisen akselin yli
        const clip = defs.append("clipPath").attr("id", "plot-clip");
        clip.append("rect")
            .attr("id", "plot-rect")
            .attr("x", 0).attr("y", 0)
            .attr("width", innerWidth())       // heti oikeat mitat
            .attr("height", innerHeight())
            .attr("fill", "none")              // EI koskaan maalaa
            .attr("stroke", "none")
            .attr("pointer-events", "none");
        gCards.attr("clip-path", "url(#plot-clip)");

        // zoom extents
        svg.call(zoomBehavior);
        svg.on("dblclick.zoom", null); // v40.3: disable built-in double-click zoom
        zoomBehavior.translateExtent([[0, -2000], [innerWidth(), innerHeight() + 2000]]); // v38: reilu pystybufferi

        // lataa & piirrä
        await loadData();
        // päivitä skaalat domainin mukaan
        state.yBase.domain([state.minYears, state.maxYears]);
        state.y.domain([state.minYears, state.maxYears]);
        applyZoom();
        setZOrder();                 // heti ensimmäisen piirron jälkeen
        requestAnimationFrame(setZOrder); // varmuus: myös seuraavassa framessa

        // estä contextmenu + selectstart timeline-containerissa
        const tl = document.getElementById("timeline-container");
        ["contextmenu", "selectstart"].forEach(ev =>
            tl.addEventListener(ev, e => e.preventDefault(), { passive: false })
        );
        // poista valinnat pointerdownissa
        d3.select("#timeline").on("pointerdown", () => {
            if (window.getSelection) { try { window.getSelection().removeAllRanges(); } catch (e) { } }
        });

        // v38: autofocus "ihmiskunta" – aktivointi viiveellä, zoom myöhemmin
        const human = state.events.filter(e => e.theme === "ihmiskunta");
        if (human.length) {
            // laske zoom-kohde
            const ys = human.map(e => state.y(e.time_years));
            const midLocal = (d3.min(ys) + d3.max(ys)) / 2;   // gRoot-koord.
            const midScreen = cfg.margin.top + midLocal;      // ruutukoord.
            const k = 3;
            const Hscreen = state.height;
            const innerH = innerHeight();

            let newY = -midScreen * k + Hscreen / 2;
            const minT = Math.min(0, Hscreen - innerH * k);
            const maxT = 0;
            newY = Math.max(minT, Math.min(maxT, newY));

            // v40: Drive activation through state so class logic stays consistent.
            d3.timeout(() => {
                state.activeTheme = "ihmiskunta";
                drawCards();     // re-render to apply classes and move the node to gActive
                setZOrder();
            }, ACTIVATE_DELAY);

            // 2) zoomaa myöhemmin
            d3.timeout(() => {
                autoZooming = true;
                svg.transition()
                    .duration(900)
                    .ease(d3.easeCubicOut)
                    .call(zoomBehavior.transform, d3.zoomIdentity.translate(0, newY).scale(k))
                    .on("end", () => { autoZooming = false; });
            }, ZOOM_DELAY);
        }

        const ro = new ResizeObserver(() => {
            // 1) v38: mittaa H1 + margin-bottom → --header-h
            const h1 = document.getElementById('page-title');
            let h1H = 0;
            if (h1) {
                const r = h1.getBoundingClientRect();                       // sisältää paddingin
                const mb = parseFloat(getComputedStyle(h1).marginBottom) || 0;
                h1H = Math.ceil(r.height + mb);
            }
            document.documentElement.style.setProperty('--header-h', `${h1H}px`);

            // 2) säilytä nykyinen zoom, päivitä layout ja extentit (laaja extent)
            const tBefore = d3.zoomTransform(svg.node());
            layout();
            svg.call(zoomBehavior);
            svg.on("dblclick.zoom", null); // v40.3: disable built-in double-click zoom
            // v40: clamp panning/zooming to the visible content box (no overscroll).
            const H = innerHeight();
            zoomBehavior.extent([[0, 0], [state.width, H]])
                .translateExtent([[0, 0], [state.width, H]]);

            // käytä ajantasaista transformia indikaattoriin & piirtoon
            const tNow = d3.zoomTransform(svg.node());
            updateZoomIndicator(tNow);
            applyZoom();

            // 3) palauta sama zoom-tila VAIN jos ei käynnissä autofocus-animaatio
            if (!autoZooming) {
                svg.call(zoomBehavior.transform, tBefore);
            }
            setZOrder();
        });
        ro.observe(container);
    }

    // start
    function reportInitError(err) {
        const msg = (err && err.message) ? err.message : String(err);
        console.error("[timeline:init]", err);
        const bar = document.getElementById("debug-bar");
        if (bar) {
            bar.style.display = "block";
            bar.textContent = "Init error: " + msg;
        } else {
            alert("Something went wrong while initializing the timeline:\n" + msg);
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        try {
            log("init start");
            const p = init(); // init on async → voi palauttaa Promisen
            if (p && typeof p.then === "function") {
                p.then(() => log("init ok")).catch(reportInitError);
            } else {
                log("init ok");
            }
        } catch (err) {
            reportInitError(err);
        }
    });
})();