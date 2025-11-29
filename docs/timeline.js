// timeline.js — v48.4 stable (2025-11)
// Pure renderer: all data preloaded by index.html (TS_DATA_P / TS_DATA)
// This version removes redundant Util fallbacks and old I/O logic.

// Safe debug logger (no-op unless ?debug=1 used)
const DBG = !!window.__DBG__;
window.__HELP_MODE__ = !!window.__HELP_MODE__;
window.__HAS_INTERACTED__ = !!window.__HAS_INTERACTED__;
// v47.5: motion timestamp + last delivered prefocus key
if (typeof window.__LAST_MOTION_TS__ !== 'number') window.__LAST_MOTION_TS__ = 0;
if (typeof window.__LAST_PREFOCUS_KEY__ === 'undefined') window.__LAST_PREFOCUS_KEY__ = null;

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
let __prefocusNode = null; // EN: last chosen DOM node for is-prefocus (for smooth class toggle)

(() => {
    const cfg = (window.TS_CFG || {});
    // Disable built-in info toggle; handled externally in index.html
    const DISABLE_INTERNAL_INFO_TOGGLE = true;
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
        .attr("fill", "#222")            // dark dim color
        .attr("opacity", 0)
        .style("pointer-events", "none");  // EN: do not block clicks

    // v48.4: overlay layer for fully bright active card (static clone above dim)
    const gActiveOverlay = gRoot.append("g").attr("id", "gActiveOverlay");

    // --- group for the active card (kept for compatibility; no cards moved here in v48.4) ---
    const gActive = gRoot.append("g").attr("class", "active-layer");

    // --- axis group (kept last so it stays bright and never dimmed) ---
    const gAxis = gRoot.append("g").attr("class", "axis");

    // v47.8: axis should never intercept gestures/clicks; visuals only
    gAxis.style("pointer-events", "none");

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
    const centerZoomPad = svg.append("rect").attr("class", "centerZoomPad").style("pointer-events", "none");
    const centerZoomLine = svg.append("line").attr("class", "centerZoomLine");
    const centerZoomText = svg.append("text")
        .attr("class", "centerZoomLabel")
        .text("zoom <->");


    // --- apufunktiot ------------------------------------
    // --- v46.3: enforce correct layer order (cards → dim → active → axis) ---

    function setZOrder() {
        gCards.lower();         // 1. all cards
        gDim.raise();           // 2. global dim layer

        gActiveOverlay.raise(); // 3. overlay-card ABOVE dim (this fixes dimming)

        gActive.raise();        // 4. legacy active-layer (empty in v48.4)
        gAxis.raise();          // 5. axis always top
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
    // --- v46.3: mobile-friendly axis fade debounce ---------------------------
    // EN: Keep axis bright while user interacts; start fade only after idle delay.
    //     No inline transition toggling/no forced reflow → less jank on mobile.

    let __axisIdleTimer = null;
    let __lastAxisPoke = 0;
    const AXIS_IDLE_DELAY_MS = 500;   // try 1000–1200 ms
    const AXIS_POKE_THROTTLE_MS = 150; // ignore bursts during pinch/scroll

    function bumpAxisVisibility() {
        const now = performance.now();
        if (now - __lastAxisPoke < AXIS_POKE_THROTTLE_MS) return; // throttle rapid calls
        __lastAxisPoke = now;

        // Keep axis bright immediately on interaction
        gAxis.classed("axis-dim", false);

        // Restart the idle timer (fade later, once things are still)
        if (__axisIdleTimer) clearTimeout(__axisIdleTimer);
        __axisIdleTimer = setTimeout(() => {
            gAxis.classed("axis-dim", true);
        }, AXIS_IDLE_DELAY_MS);
    }

    // v41: smooth incremental scale around a given screen point (x,y)
    function scaleByAt(selection, zoomBehavior, factor, x, y) {
        // Use D3's built-in zoom.scaleBy with a specific pointer anchor
        selection.call(zoomBehavior.scaleBy, factor, [x, y]);
    }
    function onViewportMotion() {
        window.__LAST_MOTION_TS__ = Date.now();
        // Close any visible InfoBox immediately on motion
        if (window.InfoBox && InfoBox.hide) InfoBox.hide();

        // Notify PrefocusInfo that motion occurred (so it can arm after idle)
        if (window.PrefocusInfo && typeof PrefocusInfo.onViewportMotion === "function") {
            PrefocusInfo.onViewportMotion();
        }
    }

    function layout() {
        state.width = container.clientWidth;
        state.height = container.clientHeight;

        // koko svg ja rootin paikka (akselille vasen marginaali)
        svg.attr("width", state.width).attr("height", state.height);
        const rootTX = cfg.margin.left - 24;                 // sama siirto molemmille
        gRoot.attr("transform", `translate(${rootTX},${cfg.margin.top})`);
        // EN: Do NOT translate gActive; let it inherit gRoot's transform to avoid double-translate.
        gActive.attr("transform", null);

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

        console.log("[DBG hairline]",
            "midY=", geom.midY,
            "gRoot offset=", cfg.margin.top);

    }

    // v42: continuous prefocus for the nearest-to-center EVENT label
    let prefocusRaf = null;
    // Stable key for data-join and prefocus matching.
    // Prefer persistent ids; fallback to label+time (old behavior).
    const keyOf = (e) => (e && (e.id ?? e.sourceId ?? (e.label + e.time_years)));

    // --- v43.4: Data-driven prefocus (no DOM/BBox feedback) ---
    function getFocusAnchorY() {
        // Use same midY as the center hairline, but convert to gRoot coords
        // AND compensate for asymmetric top/bottom margins so anchor == visual center.
        const h = state.height, w = state.width;
        const geom = (window.CenterBand && CenterBand.compute)
            ? CenterBand.compute(w, h, NaN, NaN)
            : { midY: Math.round(h / 2) };

        const top = cfg.margin.top || 0;
        const bot = cfg.margin.bottom || 0;

        // EN: subtract top (to move into gRoot), then compensate half of (bottom - top)
        // so that cy matches the middle of the inner drawing area (labels’ y-scale space).
        const cy = geom.midY - top - 0.5 * (bot - top);

        return Math.round(cy);
        console.log("[DBG anchor]", "cy=", cy, "height=", state.height);

    }

    function computePrefocusData() {
        if (!state.y) {
            state.__prefocusKey = null;
            state.__prefocusY = null;
            return;
        }

        const cy = getFocusAnchorY();

        // --- v47.6: prefocus candidates = base events + preview + present (when available)
        let candidates = Array.isArray(state.events) ? state.events.slice() : [];
        // v47.8: If the preview card is hidden (attribute OR CSS), drop its events from candidates.
        {
            const pc = document.querySelector('g.card[data-theme="preview"]');
            if (pc) {
                const cs = window.getComputedStyle(pc);
                const isHidden = pc.getAttribute('data-hidden-by-controls') === '1'
                    || cs.display === 'none'
                    || cs.visibility === 'hidden'
                    || parseFloat(cs.opacity || '1') === 0;
                if (isHidden) {
                    candidates = candidates.filter(e => e && e.theme !== 'preview');
                }
            }
        }

        // Merge preview drafts only if the preview card is actually visible
        try {
            if (window.PreviewData && typeof PreviewData.get === 'function') {
                // detect if Preview card is hidden by the editor controls
                const hiddenPreview = document.querySelector('g.card[data-hidden-by-controls="1"]');
                if (!hiddenPreview) {
                    const drafts = PreviewData.get() || [];
                    if (Array.isArray(drafts) && drafts.length) {
                        candidates = candidates.concat(drafts);
                    }
                }
            }
        } catch (_) { }

        // Merge present anchors if a provider exists
        try {
            // Accept any global that returns an array of {time_years, ...}
            const presentList =
                (window.PresentData && typeof PresentData.get === 'function' && PresentData.get()) ||
                (window.PresentOps && typeof PresentOps.list === 'function' && PresentOps.list()) ||
                null;
            if (Array.isArray(presentList) && presentList.length) {
                candidates = candidates.concat(presentList);
            }
        } catch (_) { }
        // v47.8: When idle (no recent real motion), ignore "present" items as prefocus drivers.
        // This prevents the 1 s clock tick from stealing prefocus.
        {
            const now = Date.now();
            const freshMotion = (now - (window.__LAST_MOTION_TS__ || 0)) <= 800; // ms
            if (!freshMotion) {
                candidates = candidates.filter(e => e && e.theme !== 'present');
            }
        }
        // Keep only items that can be placed on the Y scale
        candidates = candidates.filter(e => typeof e?.time_years === 'number' && isFinite(e.time_years));

        if (!candidates.length) {
            state.__prefocusKey = null;
            state.__prefocusY = null;
            return;
        }

        // 1) Find the event whose Y is closest to the focus anchor
        let best = null;
        let bestDist = Infinity;
        for (const e of candidates) {
            const yy = state._yMap ? state._yMap.get(e) : state.y(e.time_years);
            const d = Math.abs(yy - cy);
            if (d < bestDist) {
                best = e;
                bestDist = d;
            }
        }
        // De-duplicate by stable key; prefer non-preview over preview
        {
            const byKey = new Map();
            for (const e of candidates) {
                const k = keyOf(e);
                if (!k) continue;
                const prev = byKey.get(k);
                if (!prev) { byKey.set(k, e); continue; }
                // prefer non-preview if duplicate
                if ((prev.theme === "preview") && (e.theme !== "preview")) byKey.set(k, e);
            }
            candidates = Array.from(byKey.values());
        }

        if (!best) {
            state.__prefocusKey = null;
            state.__prefocusY = null;
            return;
        }

        // 2) Apply distance threshold + hysteresis
        const R = (cfg.prefocus && +cfg.prefocus.radiusPx) || 36;
        // Small hysteresis smooths key swaps near the anchor (mobile jitter)
        const H = (cfg.prefocus && +cfg.prefocus.hysteresisPx) || 6;
        // Extra margin required to switch focus from previous target to a new one.
        // Prevents A<->B flapping when both are similarly close.
        const SWITCH_MARGIN = (cfg.prefocus && +cfg.prefocus.switchMarginPx) || 6;

        const prevKey = state.__prefocusKey || null;
        const candKey = keyOf(best);

        // If we are already focused on the same event, allow slightly larger distance
        let allowed = (prevKey && prevKey === candKey) ? (R + H) : R;

        // Sticky tolerance: if previous prefocus Y exists and the new best Y is very close,
        // allow a wider window (prevents 1 s present updates from kicking us out).
        {
            const prevY = state.__prefocusY;
            if (prevY != null) {
                const bestY = state.y(best.time_years);
                const STICKY = Math.max(12, Math.min(36, innerHeight() * 0.03));
                if (Math.abs(bestY - prevY) <= STICKY) {
                    allowed = Math.max(allowed, R + H);
                }
            }
        }

        // Guard against A<->B flapping near the anchor.
        // Only switch to 'best' if it is clearly closer than the previous focused event.
        if (prevKey && candKey !== prevKey) {
            let prevEv = null;
            for (const e of candidates) { if (keyOf(e) === prevKey) { prevEv = e; break; } }
            if (prevEv) {
                const prevDist = Math.abs((state._yMap?.get(prevEv) ?? state.y(prevEv.time_years)) - cy);
                if (!(bestDist < prevDist - SWITCH_MARGIN)) {
                    // Keep previous focus; update its Y to stay smooth with scroll
                    const keepY = (state._yMap?.get(prevEv) ?? state.y(prevEv.time_years));
                    state.__prefocusKey = prevKey;
                    state.__prefocusY = keepY;
                    return;
                }
            }
        }

        // 3) Only keep prefocus if within allowed distance + dead-band
        const newY = state.y(best.time_years);
        // DB=0: never quantize Y (smooth follow). You can set to 1 if you want a tiny noise guard.
        const DB = 0;

        const prevY = state.__prefocusY;
        const tinyMove = (prevY != null) && (Math.abs(newY - prevY) <= DB);

        if (bestDist <= allowed) {
            // Keep the previous key on tiny moves (prevents key flapping),
            // BUT always update Y so the halo/offset moves smoothly with scroll.
            state.__prefocusKey = tinyMove ? state.__prefocusKey : candKey;
            state.__prefocusY = newY;
        } else {
            state.__prefocusKey = null;
            state.__prefocusY = null;
        }

        console.log("[DBG prefocus]",
            "key=", state.__prefocusKey,
            "yy=", newY,
            "cy=", cy,
            "dist=", bestDist);
    }

    function markPrefocusClass() {
        const key = state.__prefocusKey;
        const all = d3.selectAll("g.e");

        // Ei prefokusta → tyhjennä ja pois
        if (!key) {
            all.classed("is-prefocus", false);
            __prefocusNode = null;
            return;
        }

        // Kerää kaikki osumat MOLEMPISTA layereista
        const matches = [];
        all.filter(d => keyOf(d) === key).each(function () { matches.push(this); });
        if (!matches.length) {
            all.classed("is-prefocus", false);
            __prefocusNode = null;
            return;
        }

        // Priority:
        //  1) active-card overlay clone (bright card in #gActiveOverlay)
        //  2) legacy g.active-layer (older versions)
        //  3) non-preview base card
        //  4) first match as a final fallback
        let chosen = null;

        // 1) Prefer overlay clone above the dim layer (v48.4)
        for (const n of matches) {
            const card = n.closest && n.closest("g.card");
            if (card && card.classList && card.classList.contains("active-card-overlay")) {
                chosen = n;
                break;
            }
        }

        // 2) Fallback: legacy active-layer (kept for older layouts)
        if (!chosen) {
            for (const n of matches) {
                if (n.closest && n.closest("g.active-layer")) {
                    chosen = n;
                    break;
                }
            }
        }

        // 3) Prefer non-preview cards when multiple copies exist
        if (!chosen) {
            chosen = matches.find(n => {
                const card = n.closest && n.closest("g.card");
                const th = card && (d3.select(card).datum()?.theme || card.getAttribute("data-theme"));
                return th !== "preview";
            }) || matches[0];
        }

        // Yksi selkeä before→after: vain chosen saa is-prefocus
        all.classed("is-prefocus", function () {
            return this === chosen;
        });

        __prefocusNode = chosen;
        try {
            const labelNode = d3.select(chosen).select("text.event-label").node();
            const lineNode = centerZoomLine.node && centerZoomLine.node();
            if (labelNode && lineNode && labelNode.getBoundingClientRect && lineNode.getBoundingClientRect) {
                const lb = labelNode.getBoundingClientRect();
                const ln = lineNode.getBoundingClientRect();
                const labelMidY = lb.top + lb.height / 2;
                const hairlineY = ln.top; // line is almost 1px high → top ≈ center
                console.log("[DBG screen]",
                    "key=", key,
                    "labelMidY=", labelMidY.toFixed(1),
                    "hairlineY=", hairlineY.toFixed(1),
                    "delta=", (labelMidY - hairlineY).toFixed(1)
                );
            }
        } catch (e) {
            console.warn("[DBG screen] failed", e);
        }

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

        /* v48: keep active card in gActive between renders (no re-parenting here) */

        const indent = 20;
        // v48.4: All real cards live in gCards; overlay lives in gActiveOverlay without data.
        // EN: Bind data only to the real cards, not the overlay clone.
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
        // Tag cards with their theme for stable DOM moves (no re-parenting every frame)
        ent.attr("data-theme", d => d.theme);
        sel.attr("data-theme", d => d.theme);

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
            // v47.9: stable key → no rebuild on tiny time_years drift
            const evSel = g.select("g.events").selectAll("g.e").data(d.events, keyOf);

            const evEnt = evSel.enter().append("g").attr("class", "e");
            evEnt.append("line").attr("class", "event-line");
            evEnt.append("text")
                .attr("class", "event-label")
                .attr("x", 18)
                .attr("dy", "0.32em")
                // EN: use view-box instead of fill-box so the origin doesn't change
                // when the card moves between g.cards and g.active-layer (no jump on mobile).
                .style("transform-box", "view-box")
                .style("transform-origin", "0% 50%")
                // inline transition so active-layer reparenting can't disable easing
                .style("transition", "transform .28s cubic-bezier(.22,.7,.13,1)")
                .style("will-change", "transform");

            evSel.exit().remove();

            evSel.merge(evEnt).each(function (e) {
                // EN: keep inline transition across merges (some browsers drop it on reparent)
                d3.select(this).select("text.event-label")
                    .style("transform-box", "view-box")      // keep origin stable across layers
                    .style("transform-origin", "0% 50%")
                    .style("transition", "transform .28s cubic-bezier(.22,.7,.13,1)")
                    .style("will-change", "transform");

                const yy0 = state.y(e.time_years);
                const yy = Math.round(yy0); // v48: snap to device pixel
                const gg = d3.select(this);

                // Keep lines at data Y (axis-aligned, no visual offset)
                gg.select("line.event-line")
                    .attr("x1", -x + 4).attr("x2", 8)
                    .attr("y1", yy).attr("y2", yy)
                    .attr("stroke", "#aaa");

                // v48.4: use the visual center hairline as the halo anchor
                // EN: This keeps the prefocus zoomed label vertically locked to the center
                //     line on mobile (no "jump ~20% down" when it crosses the hairline).
                let yFoc = null;
                if (typeof getFocusAnchorY === "function") {
                    try {
                        yFoc = getFocusAnchorY();
                    } catch (_) {
                        yFoc = null;
                    }
                }

                // Fallback to the frozen prefocus Y if the anchor cannot be computed
                if (yFoc == null) {
                    const yFocRaw = (state.__prefocusY_frozen != null)
                        ? state.__prefocusY_frozen
                        : state.__prefocusY;
                    yFoc = (yFocRaw == null) ? yy : Math.round(yFocRaw);
                }

                // v48.6: Use the same halo offset for focused and non-focused events.
                // EN: Let the prefocus label move naturally with scrolling instead of
                //     being hard-locked to the center line on mobile/desktop.
                let textOffsetY = (Util && typeof Util.textHaloOffset === "function")
                    ? Math.round(Util.textHaloOffset(yy, yFoc))
                    : 0;

                gg.select("text.event-label")
                    .attr("x", 12)
                    .attr("y", yy)                       // keep baseline at integer y (no layout thrash)
                    .style("--ty", `${textOffsetY}px`)   // halo offset via CSS variable → GPU transform
                    .text(Util.eventTitleShort(e));

            });

            // v47.7/v48.7: mobile-friendly double-tap + long-press (pointer-based)
            (function attachOpenHandlers() {
                const TAP_MS = 450;     // max interval between taps (double-tap)
                const PRESS_MS = 450;   // long-press threshold
                const MOVE_TOL = 24;    // px – enemmän liikkumavaraa sormelle

                let lastTapTime = 0;
                let pressTimer = null;
                let startX = 0, startY = 0;
                let moved = false;

                function openInfoFor(target, evData) {
                    try {
                        const labelNode = d3.select(target).select("text.event-label").node();
                        const anchor = labelNode || target;
                        const box = anchor && anchor.getBoundingClientRect && anchor.getBoundingClientRect();
                        if (box && window.InfoBox && typeof InfoBox.show === "function") {
                            InfoBox.show(evData, box);
                        }
                    } catch (_) { }
                }

                evSel.merge(evEnt)
                    // help the browser: avoid double-tap zoom stealing the gesture
                    .style("touch-action", "manipulation")
                    .on("pointerdown", function (d3evt, evData) {
                        // EN: prevent native long-press selection / callout stealing our timer
                        d3evt.preventDefault();
                        d3evt.stopPropagation();

                        // primary pointer only
                        if (d3evt.button != null && d3evt.button !== 0) return;

                        const now = performance.now();
                        const isDoubleTap = (now - lastTapTime) <= TAP_MS;
                        lastTapTime = now;

                        startX = d3evt.clientX;
                        startY = d3evt.clientY;
                        moved = false;

                        // long-press timer
                        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
                        pressTimer = setTimeout(() => {
                            if (!moved) openInfoFor(this, evData);
                            pressTimer = null;
                        }, PRESS_MS);

                        if (isDoubleTap) {
                            // open immediately on double-tap
                            if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
                            d3evt.preventDefault();
                            d3evt.stopPropagation();
                            openInfoFor(this, evData);
                        }

                        // track movement/cancel across the page (finger may leave element bounds)
                        const onMove = (e) => {
                            if (moved) return;
                            const dx = (e.clientX - startX);
                            const dy = (e.clientY - startY);
                            if (Math.hypot(dx, dy) > MOVE_TOL) moved = true;
                        };
                        const onEnd = () => {
                            if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
                            window.removeEventListener('pointermove', onMove, { passive: true });
                            window.removeEventListener('pointerup', onEnd, { passive: true });
                            window.removeEventListener('pointercancel', onEnd, { passive: true });
                            window.removeEventListener('pointerleave', onEnd, { passive: true });
                        };

                        window.addEventListener('pointermove', onMove, { passive: true });
                        window.addEventListener('pointerup', onEnd, { passive: true });
                        window.addEventListener('pointercancel', onEnd, { passive: true });
                        window.addEventListener('pointerleave', onEnd, { passive: true });
                    })
                    .on("contextmenu", function (evt) {
                        // EN: iOS/Android long-press menu
                        evt.preventDefault();
                        evt.stopPropagation();
                    })
                    .on("dblclick", function (evt, evData) {
                        // desktop double-click
                        evt.preventDefault();
                        evt.stopPropagation();
                        openInfoFor(this, evData);
                    });
            })();
        });

        // v40.3: change active only on click (single source of truth = state.activeTheme)
        merged.on("click", function (event, d) {
            event.preventDefault();     // NEW
            event.stopPropagation();    // NEW

            if (state.activeTheme === d.theme) return; // no toggle-off
            state.activeTheme = d.theme;               // set new active
            console.log("[debug] re-render", state.activeTheme);

            drawCards();                               // re-render → classes & move to gActive
            setZOrder();                               // keep layers correct
        });
        merged.on("dblclick", function (event) { event.preventDefault(); event.stopPropagation(); }); 

        // v48.4: stableActiveMove no longer re-parents cards.
        // EN: The visual focus is now provided by a full-card overlay above the dim layer.
        // The original cards always stay in gCards to keep all transitions smooth.
        (function stableActiveMove() {
            // no-op in v48.4
        })();

        // EN: Only animate the dim layer when the target opacity actually changes (prevents flicker).
        const hasActiveNow = !!state.activeTheme;
        {
            const targetOpacity = hasActiveNow ? 0.45 : 0.0;
            if (state.__dimOpacityLast !== targetOpacity) {
                state.__dimOpacityLast = targetOpacity;
                gDim.transition().duration(180).attr("opacity", targetOpacity);
            }
        }

        /* v48.4 – Full active card overlay above dim mask.
           EN:
           - Clone the active card into #gActiveOverlay (above the dim layer).
           - Copy event data to the clone so prefocus can target it.
           - Re-apply prefocus classes after cloning so the bright overlay
             animates scale exactly kuten alkuperäinen kortti.
        */
        (function renderActiveOverlay() {
            const active = state.activeTheme;
            const gOverlay = d3.select("#gActiveOverlay");

            // no active theme → clear overlay and exit
            if (!active) {
                gOverlay.selectAll("*").remove();
                return;
            }

            // Detect passive 1 s "present" repaint (no recent user motion)
            const now = Date.now();
            const freshMotion = (now - (window.__LAST_MOTION_TS__ || 0)) <= 800; // ms
            const isPresentTick = (now - (window.__PRESENT_TICK__ || 0)) <= 250;
            const passivePresent = isPresentTick && !freshMotion;

            if (passivePresent) {
                // Keep existing overlay as-is so we don't retrigger the
                // prefocus animation every second.
                return;
            }

            // 1) Clear previous overlay only when we actually rebuild it
            gOverlay.selectAll("*").remove();

            // 2) Find the original active card only from the real cards layer
            const src = gCards.selectAll("g.card")
                .filter(d => d && d.theme === active)
                .node();
            if (!src) return;

            // 3) Clone the whole card (rects + lines + texts)
            const clone = src.cloneNode(true);
            gOverlay.node().appendChild(clone);

            // 4) Copy bound event data into overlay <g.e> nodes
            try {
                const srcEvents = d3.select(src).selectAll("g.e").nodes();
                const overlayEvents = d3.select(clone).selectAll("g.e");

                overlayEvents.each(function (_, i) {
                    const srcNode = srcEvents[i];
                    if (!srcNode) return;
                    const d = d3.select(srcNode).datum();
                    if (d) d3.select(this).datum(d);
                });
            } catch (e) {
                if (DBG) console.warn("[v48.4] overlay data copy failed", e);
            }

            // 5) Make overlay visually full-bright
            d3.select(clone).classed("active-card-overlay", true);

            // EN v48.43: Do NOT call markPrefocusClass() here.
        })();

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
        // v47.8: detect passive 1 s "present tick" vs. real user motion
        const __now = Date.now();
        const __freshMotion = (__now - (window.__LAST_MOTION_TS__ || 0)) <= 800;
        const __isPresentTick = (__now - (window.__PRESENT_TICK__ || 0)) <= 250;
        // EN: Only treat as "idle" when there's neither recent user motion nor a present-loop repaint.
        //     This prevents the 1 Hz clock refresh from toggling idle → transition on every second.
        const __svg = d3.select(svg.node ? svg.node() : svg);
        const __idle = (!__freshMotion) && (!__isPresentTick);
        __svg.classed('is-idle', __idle);

        try {
            // 0) prefocus päivitys: älä vaihda kohdetta hiljaisella present-tickillä
            if (!(__isPresentTick && !__freshMotion)) {
                computePrefocusData();
            } // muussa tapauksessa pidetään aiempi state.__prefocusKey ja __prefocusY_frozen

            // 1) draw
            if (typeof drawAxis === "function") timed("drawAxis", () => safe(drawAxis, "drawAxis"));
            if (typeof drawCards === "function") timed("drawCards", () => safe(drawCards, "drawCards"));
            state._yMap = new Map();
            for (const e of state.events) state._yMap.set(e, state.y(e.time_years));

            // 2) mark prefocus on rendered nodes (no feedback loop)
            // EN: Defer class toggle to next frame so CSS transition sees a before→after change (fixes jump on active card).
            if (window.__mpfRaf) cancelAnimationFrame(window.__mpfRaf);
            window.__mpfRaf = requestAnimationFrame(() => {
                try { markPrefocusClass(); } finally { window.__mpfRaf = null; }
            });

                    /* PrefocusInfo: request popup only after we know the current prefocus target.
            - key: a stable identifier for the focused event (matches how you build the prefocus key)
            - resolver(): computes the event label's bounding box and returns { box, data } for positioning
            */
            /* PrefocusInfo: only notify on key change or shortly after real motion.
                - Prevents present-loop re-firing the same popup every second on mobile.
            */
            if (window.PrefocusInfo && typeof PrefocusInfo.onPrefocus === 'function') {
                const key = (state && state.__prefocusKey) ? state.__prefocusKey : null;
                // v47.8: Freeze the "halo anchor" (prefocus Y) between real motions.
                // Only refresh the frozen anchor when there was recent user motion.
                (function freezeHaloAnchor() {
                    try {
                        const now = Date.now();
                        const freshMotion = (now - (window.__LAST_MOTION_TS__ || 0)) <= 800; // ms
                        if (freshMotion) {
                            state.__prefocusY_frozen = (state.__prefocusY == null) ? null : Math.round(state.__prefocusY);
                        } else if (state.__prefocusY_frozen == null) {
                            // first run fallback
                            state.__prefocusY_frozen = (state.__prefocusY == null) ? null : Math.round(state.__prefocusY);
                        }
                    } catch { }
                })();

                const unchanged = (key === window.__LAST_PREFOCUS_KEY__);
                const freshMotion = (Date.now() - window.__LAST_MOTION_TS__) <= 750;

                // Älä laukaise InfoBoxia passiivisella present-tickillä (joka ei seurannut oikeaa liikehdintää)
                if (!(__isPresentTick && !freshMotion) && !(unchanged && !freshMotion)) {
                    const resolver = () => {
                        if (!key) return null;
                        const groupSel = d3.selectAll("g.e")
                            // EN: Match using the same stable key that prefocus uses (id/sourceId or label+time).
                            .filter(d => (!!d) && (keyOf(d) === key));

                        const groupNode = groupSel.node();
                        if (!groupNode) return null;
                        const labelNode = d3.select(groupNode).select("text.event-label").node();
                        const targetNode = labelNode || groupNode;
                        if (!targetNode) return null;

                        // --- new guard: ensure element is still in DOM and visible ---
                        let box = targetNode.getBoundingClientRect?.();
                        // v47.8: if the label is fully clipped (height === 0), synthesize a small anchor box
                        if (!box || !Number.isFinite(box.top) || box.height <= 0) {
                            const r = svg.node().getBoundingClientRect();
                            const cy = (state.height / 2);            // screen-space center Y in SVG coords
                            // Build a tiny 1×1 box at the center hairline, near the card area
                            box = {
                                x: Math.round(r.left + r.width * 0.60),
                                y: Math.round(r.top + cy),
                                left: Math.round(r.left + r.width * 0.60),
                                top: Math.round(r.top + cy),
                                width: 1, height: 1, right: Math.round(r.left + r.width * 0.60) + 1, bottom: Math.round(r.top + cy) + 1
                            };
                        }

                        const data = groupSel.datum?.();
                        return (data) ? { box, data } : null;
                    };

                    try {
                        PrefocusInfo.onPrefocus(key, resolver);
                        window.__LAST_PREFOCUS_KEY__ = key;
                    } catch (err) {
                        if (window.__DBG__) console.warn('[prefocus] skipped invalid resolver', err);
                    }
                }
            }

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
            window.__HAS_INTERACTED__ = true; // v47.5: any zoom/pan unlocks prefocus

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
            // EN: brighten axis only on real user input, not on programmatic zooms
            if (event && event.sourceEvent) bumpAxisVisibility();
            updateZoomIndicator(t);
            onViewportMotion();
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

        // Info-box toggle: skip internal handler if external controller (index.html) present
        const infoToggle = document.getElementById('info-toggle') || document.getElementById('helpBtn');
        const infoBox = document.getElementById('info-box') || document.getElementById('help');

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

            // mark this repaint as a 1 s "present" tick
            window.__PRESENT_TICK__ = Date.now();

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