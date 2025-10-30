// timeline.js — v46 stable (2025-10-30)
// Pure renderer: all data preloaded by index.html (TS_DATA_P / TS_DATA)
// This version removes redundant Util fallbacks and old I/O logic.

// Safe debug logger (no-op unless ?debug=1 used)
const DBG = !!window.__DBG__;
const log = (...args) => { if (DBG) console.log("[timeline]", ...args); };
// --- Runtime helpers ---
// NOTE v45.5: Util.safe and Util.timed are already defined in index_.html.
// These are kept only as fallback for standalone testing; can be removed later.
const U = window.Util || {};
const safe = U.safe || ((fn) => (typeof fn === "function" ? fn() : undefined));
const timed = U.timed || ((label, fn) => (typeof fn === "function" ? fn() : undefined));
const Util = window.Util || (window.Util = {});

// TODO v45.5: duplicate definition — cardMetrics now lives in index_.html Util.
// Keep temporarily for safety until verified on all browsers.
if (typeof Util.cardMetrics !== "function") {
    Util.cardMetrics = function (titleSel, groupSel, yTopEv, yBotEv, viewH) {
        const titleH = 10;
        const evH = 9;
        const topPad = titleH + 6;
        const botPad = Math.ceil(evH * 2.2) + 8;
        const yRect = Math.min(yTopEv, yBotEv) - topPad;
        const hRect = Math.abs(yBotEv - yTopEv) + topPad + botPad;
        const fullyAbove = (yRect + hRect) < 15;
        const fullyBelow = yRect > viewH;
        return { topPad, botPad, yRect, hRect, fullyAbove, fullyBelow };
    };
}

// Prevent overlapping renders and allow quick perf timing in debug mode.
let __isRendering = false;
// Fire 'timeline:first-render' exactly once after the initial stable draw.
let __firstRenderFired = false;

(() => {
    const cfg = (window.TS_CFG || {});
    const ACTIVATE_DELAY = (window.TS_DELAY && TS_DELAY.ACTIVATE) || 1000;
    const ZOOM_DELAY = (window.TS_DELAY && TS_DELAY.ZOOM) || 1500;

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

    // --- v46.3: main layer setup with global dim layer -------------------------
    // EN: We define the rendering order explicitly.
    // Structure:
    //   svg
    //    ├── g.root (holds axis, cards, etc.)
    //    │     ├── g.cards       (all normal cards live here)
    //    │     ├── rect#dimLayer (dims cards but not axis)
    //    │     ├── g.active-layer (current active card moved here)
    //    │     └── g.axis        (axis always stays bright)
    //    ├── g.zoomBar           (right-side zoom)
    //    └── overlays / center line etc.

    const gRoot = svg.append("g").attr("class", "root");
    const gCards = gRoot.append("g").attr("class", "cards");

    // --- NEW: single global dim rectangle between cards and axis ---
    const gDim = gRoot.append("rect")
        .attr("id", "dimLayer")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", 0)                // set later in layout()
        .attr("height", 0)
        .attr("fill", "#222")   // dark dim color
        .attr("opacity", 0)
        .style("pointer-events", "none");  // EN: do not block clicks

    // --- group for the active card (always above dim) ---
    const gActive = gRoot.append("g").attr("class", "active-layer");

    // --- axis group (kept last so it stays bright and never dimmed) ---
    const gAxis = gRoot.append("g").attr("class", "axis");

    // minor grid lines (behind cards)
    const gMinor = gRoot.append("g").attr("class", "minor-grid");

    // v37: clip korttialueelle
    const defs = svg.append("defs");
    const plotClip = defs.append("clipPath").attr("id", "plotClip");
    const plotClipRect = plotClip.append("rect").attr("id", "plotClipRect"); // set id for later getBBox()
    // käytä klippausta vain korteille (akseli ja zoom jäävät vapaiksi)
    gCards.attr("clip-path", "url(#plotClip)");
    // --- one-time fade-right mask (objectBoundingBox → skaalautuu joka kortille) ---
    const fadeGrad = defs.append("linearGradient")
        .attr("id", "fadeRight")
        .attr("gradientUnits", "objectBoundingBox")
        .attr("x1", 0).attr("y1", 0)
        .attr("x2", 1).attr("y2", 0);

    fadeGrad.append("stop").attr("offset", "0%").attr("stop-color", "#fff").attr("stop-opacity", 1);   // vasen täysi
    fadeGrad.append("stop").attr("offset", "85%").attr("stop-color", "#fff").attr("stop-opacity", 0.25); // pehmennys
    fadeGrad.append("stop").attr("offset", "100%").attr("stop-color", "#fff").attr("stop-opacity", 0);  // oikea läpinäkyvä

    const fadeMask = defs.append("mask")
        .attr("id", "fadeRightMask")
        .attr("maskUnits", "objectBoundingBox")
        .attr("maskContentUnits", "objectBoundingBox")
        .attr("x", 0).attr("y", 0).attr("width", 1).attr("height", 1);

    // maski on valkoinen→näkyvä vasemmalla, mustuu nollaan oikealla
    fadeMask.append("rect")
        .attr("x", 0).attr("y", 0).attr("width", 1).attr("height", 1)
        .attr("fill", "url(#fadeRight)");

    // zoom bar oikealle
    const gZoomTrack = svg.insert("g", ".root").attr("class", "zoomBar"); // v35: tausta alle
    const gZoom = svg.append("g").attr("class", "zoomBar");         // ikkuna + hitbox päälle
    const zoomBG = gZoomTrack.append("rect").attr("class", "track");
    // v36: ikkuna alimman tason track-ryhmään → ei peitä sisältöä
    const zoomWin = gZoomTrack.append("rect").attr("class", "window").attr("rx", 3).attr("ry", 3);

    // v36–v41: ensure correct layer order
    setZOrder();

    // v42: centerline + label (and a future-use invisible pad)
    const centerZoomPad = svg.append("rect").attr("class", "centerZoomPad");
    const centerZoomLine = svg.append("line").attr("class", "centerZoomLine");
    const centerZoomText = svg.append("text")
        .attr("class", "centerZoomLabel")
        .text("zoom <->");


    // --- apufunktiot ------------------------------------
    // --- v46.3: enforce correct layer order (cards → dim → active → axis) ---
    function setZOrder() {
        gCards.lower();   // 1. regular cards at bottom
        gDim.raise();     // 2. global dim layer above passive cards
        gActive.raise();  // 3. active card(s) above dim
        gAxis.raise();    // 4. axis always on top (never dimmed)
    }

    // v44.1 – scale-aware pan bounds using your tuned base (0.6 × h)
    // Generous when k≈1; shrinks as you zoom in so panning won't escape the window.
    function computeTranslateExtent() {
        const w = innerWidth();
        const h = innerHeight();

        const t = d3.zoomTransform(svg.node());
        const k = Math.max(1e-6, t && typeof t.k === "number" ? t.k : 1);

        // base overscroll factors (tuned): vertical 0.6 × h, horizontal 0.15 × w
        // vertical shrinks with k (divide by k), horizontal shrinks gently (sqrt(k)).
        const baseY = h * 0.60;
        const baseX = w * 0.15;

        const padY = Math.round(Math.max(80, baseY / k));                 // clamp min 80px
        const padX = Math.round(Math.max(12, Math.min(w * 0.25, baseX / Math.sqrt(k))));

        const x0 = -padX, y0 = -padY;
        const x1 = w + padX, y1 = h + padY;
        return [[x0, y0], [x1, y1]];
    }
    // --- Axis fade control (v46.1.2 using CSS variables) ----------------------
    let __axisFadeTimer = null;

    function bumpAxisVisibility() {
        // Cancel previous timer
        if (__axisFadeTimer) { clearTimeout(__axisFadeTimer); __axisFadeTimer = null; }

        // Step 1 – snap bright immediately
        const tSel = gAxis.selectAll("text");
        tSel.style("transition", "none");      // disable transition this frame
        gAxis.classed("axis-dim", false);      // restore bright variable values
        const n = gAxis.node(); if (n) { void n.offsetWidth; } // force reflow

        // Step 2 – re-enable transitions and start countdown
        requestAnimationFrame(() => {
            tSel.style("transition", null);      // re-enable 5 s transition
            __axisFadeTimer = setTimeout(() => {
                // When 1 s of inactivity passes → toggle .axis-dim
                gAxis.classed("axis-dim", true);
            }, 300); // EN: was 1000 ms
        });
    }

    // v41: smooth incremental scale around a given screen point (x,y)
    function scaleByAt(selection, zoomBehavior, factor, x, y) {
        // Use D3's built-in zoom.scaleBy with a specific pointer anchor
        selection.call(zoomBehavior.scaleBy, factor, [x, y]);
    }
    function onViewportMotion() {
        if (window.InfoBox && InfoBox.hide) InfoBox.hide();
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

        // Update clip to the same visual width but in gCards' local coordinates (origin at 0).
        const clipWidthLocal = Math.max(0, state.width - rootTX - 8);
        plotClipRect
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", clipWidthLocal)
            .attr("height", innerHeight());

        // --- adjust dim layer so it extends slightly under the axis --------------
        const axisPad = (state && state.axisWidth) ?? 64;
        const dimOverlap = 80;   // EN: how many pixels the dim reaches under the axis (left)
        gDim
            .attr("x", Math.max(0, axisPad - dimOverlap))      // shift left a bit
            .attr("y", 0)
            .attr("width", Math.max(0, state.width - axisPad + dimOverlap))
            .attr("height", state.height);

        setZOrder();  // v35: varmistetaan ettei track koskaan peitä tekstejä
        // alustava zoom-ikkuna = koko alue
        zoomWin.attr("x", 2).attr("width", cfg.zoomBar.width - 4).attr("y", 0).attr("height", innerH - 1); // synkassa taustan kanssa
    }

    function layoutCenterOverlay() {
        const w = state.width;
        const h = state.height;

        // --- Measure current axis right edge (prefer concrete axis group) ---
        let axisRight = NaN;
        const axisSel = svg.select("g.axis");
        if (!axisSel.empty()) {
            try {
                const ab = axisSel.node().getBBox();
                axisRight = ab.x + ab.width; // rightmost pixel of the axis group
            } catch (_) { }
        }

        // --- Measure current zoom bar left edge (prefer its .track rect) ---
        let zoomBarLeft = NaN;
        let zoomBarTarget = svg.select("g.zoomBar .track");
        if (zoomBarTarget.empty()) zoomBarTarget = svg.select("g.zoomBar");
        if (!zoomBarTarget.empty()) {
            try {
                const zb = zoomBarTarget.node().getBBox();
                zoomBarLeft = zb.x; // leftmost pixel of the zoom bar/track
            } catch (_) { }
        }

        // --- Compute pure geometry (no DOM inside) ---
        const geom = (window.CenterBand && CenterBand.compute)
            ? CenterBand.compute(w, h, axisRight, zoomBarLeft)
            : { zoneY: (h - 120) / 2, zoneH: 120, midY: Math.round(h / 2), xLeft: 14, xRight: w - 4 }; // safe fallback

        // --- Apply to DOM elements ---
        // Invisible pad (kept non-interactive for now)
        centerZoomPad
            .attr("x", 0)
            .attr("y", geom.zoneY)
            .attr("width", w)
            .attr("height", geom.zoneH);

        // Hairline (dashed accent is styled in CSS)
        centerZoomLine
            .attr("x1", geom.xLeft)
            .attr("x2", geom.xRight)
            .attr("y1", geom.midY)
            .attr("y2", geom.midY);

        // Label centered near the computed endpoints
        centerZoomText
            .attr("x", Math.round((geom.xLeft + geom.xRight) / 1.2)) // slightly to the right
            .attr("y", geom.midY - 8);
    }

    // v42: continuous prefocus for the nearest-to-center EVENT label
    let prefocusRaf = null;

    // --- v43.4: Data-driven prefocus (no DOM/BBox feedback) ---
    function getFocusAnchorY() {
        // Center hairline Y in gRoot's local coords (cards/text live here)
        return (state.height / 2) - cfg.margin.top;
    }

    function computePrefocusData() {
        if (!state.events || !state.events.length || !state.y) {
            state.__prefocusKey = null;
            state.__prefocusY = null;
            return;
        }

        const cy = getFocusAnchorY();

        // 1) Find the event whose Y position is closest to the screen center
        let best = null;
        let bestDist = Infinity;
        for (const e of state.events) {
            const yy = state._yMap ? state._yMap.get(e) : state.y(e.time_years);
            const d = Math.abs(yy - cy);
            if (d < bestDist) {
                best = e;
                bestDist = d;
            }
        }

        if (!best) {
            state.__prefocusKey = null;
            state.__prefocusY = null;
            return;
        }

        // 2) Apply distance threshold + hysteresis
        const R = (cfg.prefocus && +cfg.prefocus.radiusPx) || 36;
        const H = (cfg.prefocus && +cfg.prefocus.hysteresisPx) || 0;

        const prevKey = state.__prefocusKey || null;
        const candKey = best.label + best.time_years;

        // If we are already focused on the same event, allow slightly larger distance
        const allowed = (prevKey && prevKey === candKey) ? (R + H) : R;

        // 3) Only keep prefocus if event is within allowed distance
        if (bestDist <= allowed) {
            state.__prefocusKey = candKey;
            state.__prefocusY = state.y(best.time_years);
        } else {
            // No nearby event → no prefocus at all
            state.__prefocusKey = null;
            state.__prefocusY = null;
        }
    }

    function markPrefocusClass() {
        const key = state.__prefocusKey;

        // Clear previous prefocus marks
        d3.selectAll("text.event-label").classed("prefocus", false);
        d3.selectAll("g.e").classed("is-prefocus", false);

        if (!key) return; // nothing nearby → nothing highlighted

        // Mark both the event group and its label
        d3.selectAll("g.e")
            .filter(d => (d && (d.label + d.time_years) === key))
            .each(function () {
                d3.select(this).classed("is-prefocus", true);
                d3.select(this).select("text.event-label").classed("prefocus", true);
            });
    }
    // --- Safe wrapper: requestPrefocusUpdate() ---
    // Older versions scheduled computePrefocusData + markPrefocusClass in a rAF.In v44 we no longer define it, so this stub prevents errors.
    function requestPrefocusUpdate() {
        if (typeof computePrefocusData === "function") computePrefocusData();
        if (typeof markPrefocusClass === "function") markPrefocusClass();
    }

    function innerWidth() { return Math.max(0, state.width - cfg.margin.left - cfg.margin.right); }
    function innerHeight() { return Math.max(0, state.height - cfg.margin.top - cfg.margin.bottom); }

    // v36: domain datasta + pieni marginaali ylä- ja alapäähän (log-dekadeina)
    function computeDomainFromData() {
        // Gather clean values (use your ty() helper if lisäsit sen)
        const vals = state.events
            .map(e => +e.time_years)
            .filter(v => Number.isFinite(v) && v > 0);

        // Safe defaults if something odd happens
        const minData = vals.length ? Math.min(...vals) : 1e-3;
        const maxData = vals.length ? Math.max(...vals) : 1e9;

        const padTopDec = 0.15;
        const padBotDec = 0.45;

        // Allow sub-year domain (seconds/minutes/hours/day)
        state.minYears = Math.max(1e-8, minData / Math.pow(10, padTopDec));
        state.maxYears = Math.max(10, maxData * Math.pow(10, padBotDec));
    }

    function colorForTheme(t) {
        if (!state.themeColors.has(t)) {
            const idx = state.themeColors.size % cfg.palette.length;
            state.themeColors.set(t, cfg.palette[idx]);
        }
        return state.themeColors.get(t);
    }

    function drawAxis() {
        // y: log-scale. We compute tick values here, rendering stays in this function.
        const y = state.y;
        const [d0, d1] = y.domain();

        // ---- Major ticks: 10^n ----
        const { exponents, values: majors } = Ticks.majorsFromDomain(d0, d1);

        // Render major ticks (no text yet, we build 10^n labels below)
        const axis = d3.axisLeft(y)
            .tickValues(majors)
            .tickSize(4)
            .tickFormat(() => ""); // empty: we draw superscript ourselves
        gAxis.call(axis);

        // Build labels like “10^n” using tspans (superscript)
        gAxis.selectAll("g.tick > text").text("");
        gAxis.selectAll("g.tick").each(function (d, i) {
            const exp = Number.isFinite(exponents[i]) ? exponents[i] : Math.round(Math.log10(d));
            const t = d3.select(this).select("text");
            t.append("tspan").text("10");
            t.append("tspan")
                .attr("baseline-shift", "super")
                .attr("font-size", "9px")
                .text(exp);
        });

        // ---- Minor ticks: 2..9 × 10^n ----
        gMinor.selectAll("*").remove();

        // Show minors only when a reasonable number of decades is visible
        const n0 = Math.floor(Math.log10(d0)), n1 = Math.floor(Math.log10(d1));
        const visibleDecades = n1 - n0 + 1;
        const showMinor = visibleDecades <= 12;

        const minors = Ticks.minorsFromDomain(d0, d1, showMinor);
        for (const v of minors) {
            gMinor.append("line")
                .attr("x1", -4).attr("x2", 0)
                .attr("y1", y(v)).attr("y2", y(v));
        }
    }

    // v36: kortin sisäpadit = otsikon ja event-fontin mitat (ei leikkautumista)
    function drawCards() {
        const themes = state.themes;
        const w = Math.max(cfg.card.minW, innerWidth() * 0.33);
        const viewH = innerHeight();
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

        // --- two-layer card (no strokes/shadows) ---
        // A: shadow/base layer (slightly offset)
        // B: main/front layer (on top). Both share the same fadeRight mask.

        ent.append("rect")
            .attr("class", "cardA")            // base/shadow layer
            .attr("rx", 10).attr("ry", 10)
            .attr("mask", "url(#fadeRightMask)");

        ent.append("rect")
            .attr("class", "cardB")            // main/front layer
            .attr("rx", 10).attr("ry", 10)
            .attr("mask", "url(#fadeRightMask)");

        ent.append("text").attr("class", "card-title").attr("x", 8).style("font-weight", "bold");
        ent.append("g").attr("class", "events");
        sel.exit().remove();
        const merged = sel.merge(ent);

        sel.merge(ent).each(function (d, i) {
            const g = d3.select(this);
            const LANES = 3;          // kiinteä 3-tasoinen rytmi
            const gutter = 18;        // vaakasuuntainen askel (px)
            const lane = i % LANES;   // 0 = left, 1 = center, 2 = right
            const x = 10 + lane * gutter;

            g.attr("transform", `translate(${x},${0})`);

            const titleSel = g.select("text.card-title").text(d.theme);
            const M = Util.cardMetrics(titleSel, g, d.yTopEv, d.yBotEv, viewH);
            // Geometry helpers available in your code: M.yRect, M.hRect, w

            // A) shadow/base layer: subtle down-right offset so it "peeks" through the main layer
            g.select("rect.cardA")
                .attr("x", 3.6)           // slight right edge
                .attr("y", M.yRect - 4.6) // slight up
                .attr("width", w)
                .attr("height", M.hRect)
                .attr("fill", d.color);            // opacity handled in CSS

            // B) main/front layer: no offset
            g.select("rect.cardB")
                .attr("x", 0)
                .attr("y", M.yRect)
                .attr("width", w)
                .attr("height", M.hRect)
                .attr("fill", d.color);            // opacity handled in CSS

            g.select("text.card-title")
                .text(d.theme)
                .style("display", (M.fullyAbove || M.fullyBelow) ? "none" : null)
                .attr("y", Math.max(4, M.yRect + 2))
                .attr("dy", "0.9em");

            // v40: Only mark a card active when a theme is selected.
            // No selection = neutral (neither .active nor .inactive).
            const hasActive = !!state.activeTheme;
            g.classed("active", hasActive && state.activeTheme === d.theme)
                .classed("inactive", hasActive && state.activeTheme !== d.theme);

            // --- eventit: pysyvät absoluuttisessa y:ssä (state.y) ---
            const evSel = g.select("g.events").selectAll("g.e").data(d.events, e => e.label + e.time_years);
            const evEnt = evSel.enter().append("g").attr("class", "e");
            evEnt.append("line").attr("class", "event-line");
            evEnt.append("text")
                .attr("class", "event-label")
                .attr("x", 18)
                .attr("dy", "0.32em")
                .style("transform-box", "fill-box")
                .style("transform-origin", "center");
            evSel.exit().remove();

            evSel.merge(evEnt).each(function (e) {
                const yy = state.y(e.time_years);
                const gg = d3.select(this);

                // Keep lines at data Y (axis-aligned, no visual offset)
                gg.select("line.event-line")
                    .attr("x1", -x + 4).attr("x2", 8)
                    .attr("y1", yy).attr("y2", yy)
                    .attr("stroke", "#aaa");

                // v43.4: vertical halo around the data-driven prefocus
                const yFoc = (state.__prefocusY != null) ? state.__prefocusY : getFocusAnchorY();
                const textOffsetY = (Util && typeof Util.textHaloOffset === 'function') ? Util.textHaloOffset(yy, yFoc): 0;

                gg.select("text.event-label")
                    .attr("x", 12)
                    .attr("y", yy) // keep data y fixed
                    .style("transform", `translate(0px, ${textOffsetY}px)`)
                    .text(Util.eventTitleShort(e));
            });

            // v42.3 (click-only): open info when clicking an event group or its label
            evSel.merge(evEnt)
                .on('click', function (d3evt, evData) {
                    // Prevent card activation handlers and background close from firing
                    d3evt.preventDefault();
                    d3evt.stopPropagation();

                    try {
                        // Prefer anchoring to the label if present, else to the group bbox
                        const label = (Util.eventLabel ? (Util.eventLabel(evData) || 'Event') : (evData.display_label || evData.label || 'Event'));
                        const labelNode = d3.select(this).select("text.event-label").node();
                        const box = (labelNode && labelNode.getBoundingClientRect()) || this.getBoundingClientRect();
                        InfoBox.show(evData, box);
                    } catch (_) {
                        // Fallback: place near screen center if bbox fails
                        const fake = {
                            left: window.innerWidth / 2 - 40,
                            top: window.innerHeight / 2 - 20,
                            right: window.innerWidth / 2 + 40,
                            bottom: window.innerHeight / 2 + 20
                        };
                        InfoBox.show(evData, fake);
                    }
                });
                
            // --- v46.3: toggle global dim ONCE per render (outside per-card loop) ----
            // EN: Dim all regular cards if a theme is active; keep axis + active bright.
            const hasActiveNow = !!state.activeTheme;
            gDim
                .transition().duration(180)
                .attr("opacity", hasActiveNow ? 0.45 : 0.0);

            // Keep final stacking order stable
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
        // v45.5 cleanup: rendering only — no data loading or external side effects.
        if (__isRendering) { if (DBG) console.log("[render] skipped re-entrant applyZoom()"); return; }
        __isRendering = true;

        try {
            // 0) compute data-driven prefocus for current transform
            computePrefocusData();

            // 1) draw
            if (typeof drawAxis === "function") timed("drawAxis", () => safe(drawAxis, "drawAxis"));
            if (typeof drawCards === "function") timed("drawCards", () => safe(drawCards, "drawCards"));
            state._yMap = new Map();
            for (const e of state.events) state._yMap.set(e, state.y(e.time_years));

            // 2) mark prefocus on rendered nodes (no feedback loop)
            markPrefocusClass();

            setZOrder();
        } finally {
            __isRendering = false;
        }
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
                    const bb = svg.select("#plotClipRect").node().getBBox();
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
                    .translateExtent(computeTranslateExtent());
            }

            // 3) redraw
            onViewportMotion(); // close info when user zooms
            // EN: brighten axis only on real user input, not on programmatic zooms
            if (event && event.sourceEvent) bumpAxisVisibility();
            updateZoomIndicator(t);
            applyZoom();
        })

    // --- init ---
    async function init() {
        // v45.5 cleanup: this init expects TS_DATA_P prepared by index_.html.
        // Removed legacy loadData(); timeline.js is now a pure renderer.
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

        // zoom extents
        svg.call(zoomBehavior);
        // v42.4: allow vertical overscroll (works at k=1 and zoomed in)
        {
            const extra = Math.round(state.height * 0.5);   // 50 % overscroll
            let x0 = 0, y0 = 0, x1 = state.width, y1 = state.height;

            try {
                const bb = svg.select("#plotClipRect").node().getBBox();
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
                .translateExtent(computeTranslateExtent());
        }

        SwipeZoom.attach(svg, zoomBehavior, { innerHeight });

        svg.on("dblclick.zoom", null); // v40.3: disable built-in double-click zoom

        // load & render (v45.2: TS_DATA prepared in index.html)
        if (window.TS_DATA_P && typeof window.TS_DATA_P.then === "function") {
            try { await window.TS_DATA_P; } catch (e) {
                console.error("[v45.2] TS_DATA_P failed:", e);
            }
        }
        if (!(window.TS_DATA && Array.isArray(window.TS_DATA.events))) {
            throw new Error("[v45.2] No TS_DATA available. Ensure index.html prepares TS_DATA before timeline.js.");
        }
        {
            const { events, themes, themeColors } = window.TS_DATA;
            state.events = events;
            state.themes = themes || Array.from(new Set(events.map(e => e.theme)));
            if (themeColors) {
                Object.entries(themeColors).forEach(([t, c]) => state.themeColors.set(t, c));
            } else {
                state.themes.forEach(t => colorForTheme(t));
            }
            computeDomainFromData();
        }

        // update scales from computed domain
        state.yBase.domain([state.minYears, state.maxYears]);
        state.y.domain([state.minYears, state.maxYears]);

        applyZoom();
        // v45.5: signal that the very first render is complete and extents are stable
        if (!__firstRenderFired) {
            __firstRenderFired = true;
            document.dispatchEvent(new CustomEvent('timeline:first-render'));
        }
        setZOrder();
        requestAnimationFrame(setZOrder);
        bumpAxisVisibility();  // start fade-out timer after first render
        // v45.5: signal that the very first render is complete and extents are stable
        if (!__firstRenderFired) {
            __firstRenderFired = true;
            document.dispatchEvent(new CustomEvent('timeline:first-render'));
        }

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

        // --- Live refresh hook: re-read TS_DATA and redraw without changing zoom or domain
        window.updateTimeline = function () {
            if (!(window.TS_DATA && Array.isArray(window.TS_DATA.events))) return;
            // v45.5: refresh only uses preloaded TS_DATA; removed all I/O or domain recomputation.
            // This function now re-renders using the existing transform.

            // 0) cache current zoom transform
            const t = d3.zoomTransform(svg.node());

            // 1) sync data from TS_DATA (present anchors changed)
            state.events = window.TS_DATA.events;
            state.themes = window.TS_DATA.themes || Array.from(new Set(state.events.map(e => e.theme)));
            if (window.TS_DATA.themeColors) {
                Object.entries(window.TS_DATA.themeColors).forEach(([th, col]) => state.themeColors.set(th, col));
            }

            // 2) DO NOT recomputeDomain or touch scale domains here (prevents jump)
            //    --> keep the current domain + transform

            // 3) redraw using the cached transform WITHOUT firing a zoom event
            updateZoomIndicator(t);
            // IMPORTANT: do not call zoomBehavior.transform(t) here — it fires a zoom event every second.
            // That interrupts the 5s axis fade.
            applyZoom();      // redraw with existing transform only
            setZOrder();

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
                    const bb = svg.select("#plotClipRect").node().getBBox();
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
                    .translateExtent(computeTranslateExtent());
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
    // --- end of timeline.js ---
    // v45.5 verified stable: renderer decoupled from data I/O
    // next: minor cleanup candidate – move setZOrder() and computeTranslateExtent() to utilities.js
})();