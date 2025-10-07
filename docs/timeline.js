// timeline.js — v42.2
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
        palette: ["#6372b2ff", "#70a8c6", "#4b9fa8", "#368d60ff", "#5a9646ff"] // korttien värit
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

    // v42: centerline + label (and a future-use invisible pad)
    const centerZoomPad = svg.append("rect").attr("class", "centerZoomPad");
    const centerZoomLine = svg.append("line").attr("class", "centerZoomLine");
    const centerZoomText = svg.append("text")
        .attr("class", "centerZoomLabel")
        .text("zoom <->");

    // v42.3 (click-only): Basic config for the info popover
    const infoCfg = {
        margin: 10 // viewport clamping margin in px
    };

    // v42.3: Singleton popover element management
    let infoEl = null;

    /** Ensure the singleton info element exists. */
    function ensureInfoEl() {
        if (infoEl && infoEl.parentNode) return infoEl;
        infoEl = document.createElement('div');
        infoEl.id = 'event-info';
        document.body.appendChild(infoEl);

        // stop clicks from bubbling to document (which would close it)
        infoEl.addEventListener('click', (e) => e.stopPropagation());
        return infoEl;
    }

    /** Hide/dismiss the popover with an exit animation. */
    function hideEventInfo() {
        if (!infoEl) return;
        // Remove the visible class; CSS handles fade-out.
        infoEl.classList.remove('is-visible');
    }

    // v42.3: hide info popup when any gesture or viewport motion starts
    function onViewportMotion() {
        hideEventInfo();
    }

    // Close on background click or ESC
    document.addEventListener('click', hideEventInfo);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideEventInfo(); });

    /** Build HTML content for a given event object. */
    function buildEventHTML(ev) {
        const label = ev?.label || 'Event';
        const year = (ev?.year ?? '').toString();
        const comments = (ev?.comments || '').trim();
        const ref = (ev?.ref || '').trim();

        const meta = [year, ev?.theme ? `Theme: ${ev.theme}` : null].filter(Boolean).join(' · ');
        const body = comments ? `<div class="body">${comments}</div>` : `<div class="body" style="opacity:.8;">(No notes)</div>`;
        const link = ref && /^https?:\/\//i.test(ref)
            ? `<div class="hint">Ref: <a href="${ref}" target="_blank" rel="noopener">link</a></div>`
            : (ref ? `<div class="hint">Ref: ${ref}</div>` : ``);

        return `
    <div class="title">${label}</div>
    <div class="meta">${meta}</div>
    ${body}
    ${link}
    <div class="hint">Tip: click outside to close.</div>
  `;
    }
    /**
     * Show the popover near the event's label and animate it in.
     * Uses class-based visibility so CSS transitions can run.
     */
    function showEventInfo(ev, screenBox) {
        const el = ensureInfoEl();
        el.innerHTML = buildEventHTML(ev);

        // Make it "measurable" while still hidden (no flicker):
        // Ensure visible styles are not yet applied to allow positioning first.
        el.classList.remove('is-visible');

        // Position based on content size
        // Temporarily force visibility for accurate measurement without opacity jump
        el.style.visibility = 'hidden';
        el.style.opacity = '0';
        el.style.transform = 'translateY(6px) scale(0.98)';

        // Next frame: measure and place
        requestAnimationFrame(() => {
            const rect = el.getBoundingClientRect(); // current size is fine even hidden
            const M = infoCfg.margin;

            let x = Math.round(screenBox.left + 12);
            let y = Math.round(screenBox.top - rect.height - 8);

            if (y < M) y = Math.round(screenBox.bottom + 8);
            if (x + rect.width + M > window.innerWidth) x = Math.max(M, window.innerWidth - rect.width - M);
            if (y + rect.height + M > window.innerHeight) y = Math.max(M, window.innerHeight - rect.height - M);

            el.style.left = `${x}px`;
            el.style.top = `${y}px`;

            // Next frame: reveal with animation
            requestAnimationFrame(() => {
                el.style.visibility = '';  // back to stylesheet control
                el.style.opacity = '';
                el.style.transform = '';
                el.classList.add('is-visible');
            });
        });
    }

    // --- apufunktiot ---
    function setZOrder() {
        gZoomTrack.lower(); // alin: kapea zoombar-tausta
        gRoot.raise();      // kaikki kortit & akseli (passiivinen sisältö)
        // gDim.raise();      // ← no need to raise: global overlay stays off
        gActive.raise();    // aktiivinen kortti overlayn yläpuolelle
        gAxis.raise();   // v37 fix: akseli + tikit overlayn yläpuolelle
    }
    // v41: smooth incremental scale around a given screen point (x,y)
    function scaleByAt(selection, zoomBehavior, factor, x, y) {
        // Use D3's built-in zoom.scaleBy with a specific pointer anchor
        selection.call(zoomBehavior.scaleBy, factor, [x, y]);
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

    // v42: layout for the center hairline, label, and (future) pad
    function layoutCenterOverlay() {
        const w = state.width;
        const h = state.height;
        const zoneH = Math.max(80, Math.min(h * 0.36, 160)); // 80–160 px using current svg height
        const zoneY = (h - zoneH) / 2;
        const midY = Math.round(h / 2);

        // Invisible pad (kept non-interactive for now)
        centerZoomPad
            .attr("x", 0)
            .attr("y", zoneY)
            .attr("width", w)
            .attr("height", zoneH);

        // --- Compute dynamic left/right stops so the hairline does not overlap axis or zoom bar ---
        const DEFAULT_LEFT_INSET = 14; // safe fallback gap from the very left
        const DEFAULT_RIGHT_INSET = 14; // safe fallback gap from the very right
        const AXIS_GAP = 1;            // extra space after axis
        const ZOOMB_GAP = 55;            // extra space before zoom bar

        // Measure axis right edge (prefer a concrete axis group)
        let axisRight = NaN;
        const axisSel = svg.select("g.axis");
        if (!axisSel.empty()) {
            try {
                const ab = axisSel.node().getBBox();
                axisRight = ab.x + ab.width; // right edge of axis group
            } catch (_) { }
        }

        // Measure zoom bar left edge (prefer the .track rect; fallback to the group)
        let zoomBarLeft = NaN;
        let zoomBarTarget = svg.select("g.zoomBar .track");
        if (zoomBarTarget.empty()) zoomBarTarget = svg.select("g.zoomBar");
        if (!zoomBarTarget.empty()) {
            try {
                const zb = zoomBarTarget.node().getBBox();
                zoomBarLeft = zb.x; // left edge of zoom bar/track
            } catch (_) { }
        }

        // Build the desired endpoints with sensible fallbacks
        let xLeft = isFinite(axisRight) ? Math.ceil(axisRight + AXIS_GAP) : DEFAULT_LEFT_INSET;
        let xRight = isFinite(zoomBarLeft) ? Math.floor(zoomBarLeft - ZOOMB_GAP) : (w - DEFAULT_RIGHT_INSET);

        // Clamp to the viewport
        xLeft = Math.max(0, Math.min(xLeft, w - DEFAULT_RIGHT_INSET));
        xRight = Math.max(DEFAULT_LEFT_INSET, Math.min(xRight, w));

        // If the computed span is suspiciously short, revert to wide defaults
        const span = xRight - xLeft;
        if (span < w * 0.3) {
            xLeft = DEFAULT_LEFT_INSET + (isFinite(axisRight) ? Math.min(axisRight + AXIS_GAP, 40) : 0);
            xRight = w - DEFAULT_RIGHT_INSET - (isFinite(zoomBarLeft) ? Math.min((w - zoomBarLeft) + ZOOMB_GAP, 40) : 0);
        }
        // Still too short? Ensure a minimal centered segment as a final safety.
        if ((xRight - xLeft) < 24) {
            const cx = Math.round(w / 2);
            xLeft = cx - 12;
            xRight = cx + 12;
        }

        // Hairline (dashed accent is styled in CSS)
        centerZoomLine
            .attr("x1", xLeft)
            .attr("x2", xRight)
            .attr("y1", midY)
            .attr("y2", midY);

        // Label centered between the computed endpoints
        centerZoomText
            .attr("x", Math.round((xLeft + xRight) / 1.4))  // slghtly to right side
            .attr("y", midY - 8); // a few pixels above the line
    }

    // v42: continuous prefocus for the nearest-to-center EVENT label
    let prefocusRaf = null;

    /** Compute and mark the <text.event-label> whose visual center is nearest to mid Y. */
    function updatePrefocusNow() {
        const cy = state.height / 2;
        let bestNode = null;
        let bestDist = Infinity;

        d3.selectAll("text.event-label").each(function () {
            try {
                const b = this.getBBox();           // current SVG-space bbox (includes transforms)
                const yCenter = b.y + b.height / 2;
                const dist = Math.abs(yCenter - cy);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestNode = this;
                }
            } catch (_) { /* element might not be measurable yet; ignore */ }
        });

        // Clear previous focus and apply the new one
        d3.selectAll("text.event-label.prefocus").classed("prefocus", false);
        if (bestNode) d3.select(bestNode).classed("prefocus", true);
    }

    /** Throttled request: ensure at most one prefocus update per frame. */
    function requestPrefocusUpdate() {
        if (prefocusRaf != null) return;
        prefocusRaf = requestAnimationFrame(() => {
            prefocusRaf = null;
            updatePrefocusNow();
        });
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
            // v42.3 (click-only): open info when clicking an event group or its label
            evSel.merge(evEnt)
                .on('click', function (d3evt, evData) {
                    // Prevent card activation handlers and background close from firing
                    d3evt.preventDefault();
                    d3evt.stopPropagation();

                    try {
                        // Prefer anchoring to the label if present, else to the group bbox
                        const labelNode = d3.select(this).select('text.event-label').node();
                        const box = (labelNode && labelNode.getBoundingClientRect()) || this.getBoundingClientRect();
                        showEventInfo(evData, box); // <- uses your existing helper
                    } catch (_) {
                        // Fallback: place near screen center if bbox fails
                        const fake = {
                            left: window.innerWidth / 2 - 40,
                            top: window.innerHeight / 2 - 20,
                            right: window.innerWidth / 2 + 40,
                            bottom: window.innerHeight / 2 + 20
                        };
                        showEventInfo(evData, fake);
                    }
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
        requestPrefocusUpdate();
    }

    // v41: simple mode-lock — zoom OR pan per gesture (no mixing)
    function setupGlobalSwipeZoom(svgSel, zoomBehavior) {
        const DEAD = 3;              // px jitter ignore
        const DOM = 1.5;             // horizontal must dominate vertical by this ratio to choose zoom
        const SENS_TOUCH = -0.006;   // reversed mapping: right = out, left = in
        const SENS_MOUSE = -0.003;   // desktop sensitivity
        const STEP = 20;             // cap per-frame delta (px)
        const CLAMP_MIN = 0.95, CLAMP_MAX = 1.05; // per-step zoom bounds

        let active = false;
        let mode = null;             // null | 'zoom' | 'pan'
        let startX = 0, startY = 0, lastX = 0, lastY = 0;

        // --- v42: vaakazoom sallitaan vain keskialueelta ---
        function inCenterZone(y) {
            const H = innerHeight();                 // käytä nykyistä sisäkorkeutta
            const zoneH = Math.max(80, Math.min(H * 0.36, 160)); // 80–160 px (~36% H)
            const y0 = (H - zoneH) / 2, y1 = y0 + zoneH;
            return y >= y0 && y <= y1;
        }
        let startInCenter = false;

        const isTouch = (e) => e.pointerType === 'touch';
        const svgNode = svgSel.node();
        const contEl = document.getElementById('timeline-container');
        function setGestureActive(on) {
            if (on) {
                svgNode.classList.add('gesture-active');
                if (contEl) contEl.classList.add('gesture-active');
            } else {
                svgNode.classList.remove('gesture-active');
                if (contEl) contEl.classList.remove('gesture-active');
            }
        }

        // Pointer down: estä D3-zoomin oma “start” → hoidamme itse lukituksen
        svgSel.node().addEventListener('pointerdown', (e) => {
            if (!e.isPrimary) return;
            active = true;
            mode = null;
            startX = lastX = e.clientX;
            startY = lastY = e.clientY;

            // v42: lukitse tieto siitä, alkoiko ele keskialueelta
            startInCenter = inCenterZone(e.clientY);

            try { e.target.setPointerCapture(e.pointerId); } catch { }
            e.stopPropagation();
        }, { passive: true, capture: true });

        svgSel.node().addEventListener('pointermove', (e) => {
            if (!active || !e.isPrimary) return;

            const dxTot = e.clientX - startX;
            const dyTot = e.clientY - startY;

            if (mode === null && (Math.abs(dxTot) >= DEAD || Math.abs(dyTot) >= DEAD)) {
                const horizDominates = (Math.abs(dxTot) > Math.abs(dyTot) * DOM);

                // v42: jos hor. dominoi mutta aloitus EI ollut keskialueella → pakota pan
                if (horizDominates && startInCenter) {
                    mode = 'zoom';
                } else {
                    mode = 'pan';
                }
                setGestureActive(true);
            }

            if (mode === 'zoom') {
                const dxStep = Math.max(-STEP, Math.min(STEP, e.clientX - lastX));
                if (Math.abs(dxStep) >= DEAD) {
                    lastX = e.clientX;
                    const sens = isTouch(e) ? SENS_TOUCH : SENS_MOUSE;
                    const factor = Math.max(CLAMP_MIN, Math.min(CLAMP_MAX, 1 + dxStep * sens));
                    svgSel.call(zoomBehavior.scaleBy, factor, [e.clientX, e.clientY]);
                }
                // Älä koskaan anna D3:n pannata zoom-moodissa
                e.stopPropagation();
                return;
            }

            if (mode === 'pan') {
                const dyStep = Math.max(-STEP, Math.min(STEP, e.clientY - lastY));
                if (Math.abs(dyStep) >= DEAD) {
                    lastY = e.clientY;
                    svgSel.call(zoomBehavior.translateBy, 0, dyStep);
                }
                // Pidetään D3 ulkona myös pan-moodissa → ei tuplapannia
                e.stopPropagation();
                return;
            }

            // mode === null: odotetaan päätöstä eikä päästetä D3:a starttaamaan
            e.stopPropagation();
        }, { passive: true, capture: true });

        const end = () => { active = false; mode = null; setGestureActive(false); };
        svgSel.node().addEventListener('pointerup', end, { passive: true, capture: true });
        svgSel.node().addEventListener('pointercancel', end, { passive: true, capture: true });
        svgSel.node().addEventListener('lostpointercapture', end, { passive: true, capture: true });
    }

    // --- zoom käyttäytyminen ---
    const ZOOM_MIN = 0.85;   // do not allow extreme zoom-out
    const ZOOM_MAX = 6;      // sensible zoom-in cap

    const zoomBehavior = d3.zoom()
        .scaleExtent([ZOOM_MIN, ZOOM_MAX])
        .extent([[0, 0], [state.width, state.height]])  // viewport anchor

        .on("zoom", (event) => {
            // 1) rescale Y (no domain clamp)
            const t = event.transform;
            state.y = t.rescaleY(state.yBase);

            // 2) dynamic overscroll: big at k≈1, shrinks as you zoom in
            //    base = 50% of viewport; actual = base / k  (min 16 px)
            {
                const base = Math.round(state.height * 0.5);
                const extra = Math.max(16, Math.round(base / Math.max(1e-6, t.k)));

                let x0 = 0, y0 = 0, x1 = state.width, y1 = state.height;
                try {
                    const bb = svg.select("#plot-rect").node().getBBox();
                    x0 = bb.x;
                    y0 = bb.y - extra;
                    x1 = bb.x + bb.width;
                    y1 = bb.y + bb.height + extra;
                } catch (_) {
                    y0 = -extra;
                    y1 = state.height + extra;
                }

                // update extent on every zoom so pan bounds match the current scale
                zoomBehavior
                    .extent([[0, 0], [state.width, state.height]])
                    .translateExtent([[x0, y0], [x1, y1]]);
            }

            // 3) redraw
            onViewportMotion(); // close info when user zooms
            updateZoomIndicator(t);
            applyZoom();
        })

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
        layoutCenterOverlay();   // v42: place hairline + label

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
        // v42.4: allow vertical overscroll (works at k=1 and zoomed in)
        {
            const extra = Math.round(state.height * 0.5);   // 50 % overscroll
            let x0 = 0, y0 = 0, x1 = state.width, y1 = state.height;

            try {
                const bb = svg.select("#plot-rect").node().getBBox();
                x0 = bb.x;
                y0 = bb.y - extra;
                x1 = bb.x + bb.width;
                y1 = bb.y + bb.height + extra;
            } catch (_) {
                // fallback if bbox not yet valid
                y0 = -extra;
                y1 = state.height + extra;
            }

            zoomBehavior
                .extent([[0, 0], [state.width, state.height]])
                .translateExtent([[x0, y0], [x1, y1]]);
        }

        setupGlobalSwipeZoom(svg, zoomBehavior); // v41: one-finger horizontal swipe -> zoom
        svg.on("dblclick.zoom", null); // v40.3: disable built-in double-click zoom

        // lataa & piirrä
        await loadData();
        // päivitä skaalat domainin mukaan
        state.yBase.domain([state.minYears, state.maxYears]);
        state.y.domain([state.minYears, state.maxYears]);
        applyZoom();
        setZOrder();                 // heti ensimmäisen piirron jälkeen
        requestAnimationFrame(setZOrder); // varmuus: myös seuraavassa framessa

        // v41 API: expose minimal controls for external (index.html) animation
        window.TimelineAPI = {
            // instant zoom/pan
            scaleBy(factor, x, y) { svg.call(zoomBehavior.scaleBy, factor, [x, y]); },
            translateBy(dx, dy) { svg.call(zoomBehavior.translateBy, dx || 0, dy || 0); },

            // animated zoom/pan
            animScaleBy(factor, x, y, dur) {
                svg.transition().duration(dur || 600).ease(d3.easeCubicOut)
                    .call(zoomBehavior.scaleBy, factor, [x, y]);
            },
            animTranslateBy(dx, dy, dur) {
                svg.transition().duration(dur || 600).ease(d3.easeCubicOut)
                    .call(zoomBehavior.translateBy, dx || 0, dy || 0);
            },

            // select theme (as if user clicked)
            selectTheme(name) {
                state.activeTheme = name || null;
                drawCards();
                setZOrder();
            },

            // a convenient screen anchor near center-right
            getCenter() {
                const r = container.getBoundingClientRect();
                return {
                    x: Math.round(r.left + r.width * 0.60),
                    y: Math.round(r.top + r.height * 0.50)
                };
            }
        };

        // notify page scripts that timeline is ready for scripted animation
        document.dispatchEvent(new CustomEvent("timeline:ready"));

        // estä contextmenu + selectstart timeline-containerissa
        const tl = document.getElementById("timeline-container");
        ["contextmenu", "selectstart"].forEach(ev =>
            tl.addEventListener(ev, e => e.preventDefault(), { passive: false })
        );
        // poista valinnat pointerdownissa
        d3.select("#timeline").on("pointerdown", () => {
            if (window.getSelection) { try { window.getSelection().removeAllRanges(); } catch (e) { } }
        });

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
            layoutCenterOverlay();   // v42: place hairline + label
            {
                const extra = Math.round(state.height * 0.5);
                let x0 = 0, y0 = 0, x1 = state.width, y1 = state.height;

                try {
                    const bb = svg.select("#plot-rect").node().getBBox();
                    x0 = bb.x;
                    y0 = bb.y - extra;
                    x1 = bb.x + bb.width;
                    y1 = bb.y + bb.height + extra;
                } catch (_) {
                    y0 = -extra;
                    y1 = state.height + extra;
                }

                zoomBehavior
                    .extent([[0, 0], [state.width, state.height]])
                    .translateExtent([[x0, y0], [x1, y1]]);
            }

            svg.call(zoomBehavior);
            svg.on("dblclick.zoom", null); // v40.3: disable built-in double-click zoom
            // v40: clamp panning/zooming to the visible content box (no overscroll).

            // käytä ajantasaista transformia indikaattoriin & piirtoon
            const tNow = d3.zoomTransform(svg.node());
            updateZoomIndicator(tNow);
            applyZoom();
            requestPrefocusUpdate();

            // 3) palauta sama zoom-tila VAIN jos ei käynnissä autofocus-animaatio
            if (!autoZooming) {
                svg.call(zoomBehavior.transform, tBefore);
            }
            setZOrder();
            requestPrefocusUpdate();
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