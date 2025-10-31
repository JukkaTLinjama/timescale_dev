// editor.js — v47 unified module (keep file count low)
// Includes:
//   (A) Draft storage + inline editor + floating toolbar
//   (B) InfoBox popup (Edit button dispatches `timeline:edit-event`)
//   (C) Startup intro (skippable via ?demo=0)
//
// Load order: include this BEFORE timeline.js so InfoBox & intro exist when the renderer starts.

(function () {
  // =========================
  // (A) DRAFT STORAGE + EDIT
  // =========================
  const LS_KEY = 'TS_DRAFTS_v47';

  function readLS() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch { return []; }
  }
  function writeLS(list) { localStorage.setItem(LS_KEY, JSON.stringify(Array.isArray(list) ? list : [])); }
  function uid() { return 'draft-' + Math.random().toString(36).slice(2, 8); }
  function normalizeDraft(ev) {
    const theme = ev.theme || 'Edits';
    const id = ev.id || uid();
    const stamp = { __draft: true, __editedAt: new Date().toISOString(), theme };
    return { id, ...ev, theme, ...stamp };
  }

  const Store = {
    list() { return readLS(); },
    add(ev) { writeLS([...readLS(), normalizeDraft(ev)]); Store._notify(); },
    update(id, patch) {
      if (!id) return Store.add(patch);
      const next = readLS().map(x => x.id === id ? normalizeDraft({ ...x, ...patch }) : x);
      writeLS(next); Store._notify();
    },
    remove(id) { writeLS(readLS().filter(x => x.id !== id)); Store._notify(); },
    clear() { writeLS([]); Store._notify(); },
    import(arr) { writeLS((arr || []).map(normalizeDraft)); Store._notify(); },
    exportDraftsJSON() {
      const blob = new Blob([JSON.stringify(readLS(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: 'timeline_drafts_v47.json' });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    exportMerged(baseData) {
      // EN: If no baseData is available yet, export only the Edits group.
      const drafts = readLS();
      const merged = (baseData && Array.isArray(baseData.events))
        ? { ...baseData, events: [...baseData.events, { theme: 'Edits', events: drafts }] }
        : { events: [{ theme: 'Edits', events: drafts }] };

      const blob = new Blob([JSON.stringify(merged, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: 'eventsDB_merged_with_edits_v47.json' });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    _notify() {
      if (window.TimelineAPI?.refreshDrafts) {
        try { window.TimelineAPI.refreshDrafts(); return; } catch {}
      }
      document.dispatchEvent(new CustomEvent('editor:drafts-updated'));
    }
  };
  window.StagingStore = Store; // exposed for external editor UI

  // --- Inline editor wiring (uses #event-editor panel if present) ---
  const editor = document.getElementById('event-editor');
  if (editor) {
    const f = {
      title: document.getElementById('edit-title'),
      year: document.getElementById('edit-year'),
      desc: document.getElementById('edit-desc'),
      theme: document.getElementById('edit-theme'),
      id: document.getElementById('edit-id'),
      date: document.getElementById('edit-date'),
      linkText: document.getElementById('edit-link-text'),
      linkUrl: document.getElementById('edit-link-url'),
      source: document.getElementById('edit-source'),
      tags: document.getElementById('edit-tags'),
      editedBy: document.getElementById('edit-edited-by'),
      editedAt: document.getElementById('edit-edited-at'),
      createdBy: document.getElementById('edit-created-by'),
      createdAt: document.getElementById('edit-created-at')
    };
    const closeBtn = document.getElementById('close-editor');

    function asCSV(v) { return Array.isArray(v) ? v.join(', ') : (v ?? ''); }
    function str(v) { return (v == null ? '' : String(v)); }
    function extractLink(ev) {
      if (ev?.link && typeof ev.link === 'object') {
        return { text: ev.link.text ?? ev.link.label ?? ev.link.title ?? '', url: ev.link.url ?? ev.link.href ?? '' };
      }
      return { text: ev?.link_text ?? ev?.linkLabel ?? ev?.linkTitle ?? '', url: ev?.url ?? ev?.href ?? '' };
    }

    function openEditor(ev) {
      editor.hidden = false;
      f.title.value = ev?.display_label ?? ev?.label ?? '';
      f.year.value = Number.isFinite(ev?.year) ? String(ev.year) : (ev?.date ?? '');
      f.desc.value = ev?.display_comments ?? ev?.comments ?? ev?.body ?? '';
      f.theme.value = ev?.theme ?? '';
      f.id.value = str(ev?.id ?? ev?._id ?? '');
      f.date.value = str(ev?.date ?? ev?.iso_date ?? '');
      const link = extractLink(ev);
      f.linkText.value = str(link.text);
      f.linkUrl.value = str(link.url);
      f.source.value = str(ev?.source ?? ev?.ref ?? ev?.reference ?? '');
      f.tags.value = asCSV(ev?.tags ?? ev?.keywords ?? []);
      f.editedBy.value = str(ev?.edited_by ?? ev?.editedBy ?? '');
      f.editedAt.value = str(ev?.edited_at ?? ev?.editedAt ?? '');
      f.createdBy.value = str(ev?.created_by ?? ev?.createdBy ?? '');
      f.createdAt.value = str(ev?.created_at ?? ev?.createdAt ?? '');
      editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function closeEditor() { editor.hidden = true; }
    if (closeBtn) closeBtn.addEventListener('click', closeEditor);

    function ensureActions() {
      if (editor.querySelector('.editor-actions')) return;
      const wrap = document.createElement('div');
      wrap.className = 'editor-actions';
      wrap.style.cssText = 'margin-top:10px;display:flex;gap:8px;';
      const mk = (label, title, fn) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = label; b.title = title;
        b.style.cssText = 'font:600 12px system-ui;padding:6px 10px;border-radius:8px;border:1px solid #666;background:#2a2a2a;color:#ffd399;cursor:pointer;';
        b.addEventListener('click', fn);
        b.addEventListener('keyup', (e) => { if (e.key === 'Enter') fn(); });
        return b;
      };
      const getData = () => {
        const tagsArr = (f.tags.value || '').split(',').map(s => s.trim()).filter(Boolean);
        const yearNum = Number.isFinite(+f.year.value) ? +f.year.value : undefined;
        const link = (f.linkText.value || f.linkUrl.value) ? { text: f.linkText.value || undefined, url: f.linkUrl.value || undefined } : undefined;
        return {
          id: f.id.value || undefined,
          label: f.title.value || '(untitled)',
          display_label: f.title.value || undefined,
          year: yearNum,
          date: yearNum ? undefined : (f.year.value || undefined),
          comments: f.desc.value || undefined,
          theme: f.theme.value || 'Edits',
          link,
          source: f.source.value || undefined,
          tags: tagsArr,
          edited_by: f.editedBy.value || undefined,
          edited_at: f.editedAt.value || undefined,
          created_by: f.createdBy.value || undefined,
          created_at: f.createdAt.value || undefined
        };
      };
      wrap.appendChild(mk('Save draft', 'Save a new draft in the “Edits” theme', () => {
        StagingStore.add({ ...getData(), id: undefined });
        alert('Draft saved to “Edits”.');
      }));
      wrap.appendChild(mk('Update draft', 'Update an existing draft by ID (or save new if no ID)', () => {
        const d = getData(); const id = d.id;
        StagingStore.update(id, d);
        alert(id ? 'Draft updated.' : 'Draft saved as new (no ID present).');
      }));
      wrap.appendChild(mk('Clear form', 'Clear all fields', () => {
        editor.querySelectorAll('input, textarea').forEach(el => el.value = '');
      }));
      editor.appendChild(wrap);
    }
    ensureActions();
      // --- (FINAL) Compact mobile layout: main fields visible; meta truly hidden until expanded ---
      function setupAdvancedFields() {
          // EN: Only hide *less frequently used* metadata fields.
          // Main fields (title, year/date, desc, theme, link text/url) remain visible.
          const advancedIds = [
              'edit-source', 'edit-tags',
              'edit-edited-by', 'edit-edited-at', 'edit-created-by', 'edit-created-at'
          ];

          // (1) Prepare a container for rows we can fully move
          let adv = editor.querySelector('.advanced-fields');
          if (!adv) {
              adv = document.createElement('div');
              adv.className = 'advanced-fields';
              adv.hidden = true; // collapsed by default
              const actions = editor.querySelector('.editor-actions');
              editor.insertBefore(adv, actions || null);
          }

          // (2) Collect "bits" we will explicitly hide/show (label + control) on mixed rows
          const advBits = []; // array of nodes to hide/show when collapsed/expanded

          const countInputs = (node) => (node ? node.querySelectorAll('input,textarea,select').length : 0);
          const fieldRowFor = (inputEl) => (inputEl ? (inputEl.closest('.field') || inputEl.parentElement || inputEl) : null);

          function markAsAdvBit(inputEl) {
              if (!inputEl) return;
              // Find its label by [for=id]
              const id = inputEl.id;
              const label = id ? editor.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
              // We'll hide both the input and its label (separately), not the whole row.
              if (label) advBits.push(label);
              advBits.push(inputEl);
          }

          // Pass: decide move vs. per-node hide
          advancedIds.forEach(id => {
              const el = document.getElementById(id);
              if (!el) return;
              const row = fieldRowFor(el);
              const totalInputs = countInputs(row);

              if (row && totalInputs === 1) {
                  // Single-field row → can be moved completely under advanced section
                  if (!adv.contains(row)) adv.appendChild(row);
              } else {
                  // Mixed row → DO NOT move the row; hide only this field (and its label)
                  markAsAdvBit(el);
              }
          });

          // (3) Toggle logic that never relies on external CSS to actually hide bits
          function applyCollapsed(collapsed) {
              // Hide/show mixed-row bits
              advBits.forEach(node => {
                  if (!node) return;
                  if (collapsed) {
                      // store previous display only once
                      if (!node.dataset.prevDisplay) node.dataset.prevDisplay = node.style.display || '';
                      node.style.display = 'none';
                  } else {
                      node.style.display = node.dataset.prevDisplay || '';
                      delete node.dataset.prevDisplay;
                  }
              });
              // Hide/show the fully-moved advanced section
              adv.hidden = collapsed;
              // Marker class for optional styling
              editor.classList.toggle('adv-collapsed', collapsed);
          }

          // (4) Create the toggle button if needed
          if (!editor.querySelector('#toggle-advanced')) {
              const toggles = document.createElement('div');
              toggles.className = 'editor-toggles';
              toggles.style.cssText = 'margin-top:8px;display:flex;gap:8px;align-items:center;';

              const btn = document.createElement('button');
              btn.type = 'button';
              btn.id = 'toggle-advanced';
              btn.setAttribute('aria-expanded', 'false');
              btn.textContent = 'More fields';
              btn.style.cssText = 'font:600 12px system-ui;padding:6px 10px;border-radius:8px;border:1px solid #666;background:#2a2a2a;color:#fff;cursor:pointer;';

              const setCollapsed = (collapsed) => {
                  applyCollapsed(collapsed);
                  btn.setAttribute('aria-expanded', String(!collapsed));
                  btn.textContent = collapsed ? 'More fields' : 'Fewer fields';
              };

              btn.addEventListener('click', () => {
                  const collapsed = editor.classList.contains('adv-collapsed');
                  setCollapsed(!collapsed);
                  if (!editor.classList.contains('adv-collapsed')) {
                      // When opening, bring new content into view
                      const firstShown = adv.querySelector('.field') || advBits.find(n => n && n.offsetParent !== null);
                      if (firstShown && firstShown.scrollIntoView) {
                          firstShown.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                      }
                  }
              });

              const actions = editor.querySelector('.editor-actions');
              editor.insertBefore(toggles, actions || null);
              toggles.appendChild(btn);

              // Initial state: collapsed (main fields visible, meta hidden)
              setCollapsed(true);
          }
      }

      setupAdvancedFields();

    // Listen to InfoBox → "Edit event"
    window.addEventListener('timeline:edit-event', (e) => {
      const ev = e?.detail?.event;
      if (ev) openEditor(ev);
    });
  }

  // Floating quick toolbar (small, non-invasive)
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('editor-toolbar')) return;
    const bar = document.createElement('div');
    bar.id = 'editor-toolbar';
    bar.style.cssText = [
      'position:fixed; right:10px; bottom:26px; z-index:2400; display:flex; gap:6px;',
      'background:rgba(30,30,30,.85); border:1px solid #555; padding:6px 8px; border-radius:8px;',
      'font:12px/1 system-ui; color:#ddd;'
    ].join('');
    const mkBtn = (txt, fn) => {
      const b = document.createElement('button');
      b.textContent = txt;
      b.style.cssText = 'font:12px system-ui; padding:5px 8px; border-radius:6px; border:1px solid #777; background:#2b2b2b; color:#eee; cursor:pointer;';
      b.onclick = fn; return b;
    };
    bar.appendChild(mkBtn('Show Edits', () => window.TimelineAPI?.selectTheme && TimelineAPI.selectTheme('Edits')));
    bar.appendChild(mkBtn('Clear', () => { if (confirm('Clear all drafts?')) StagingStore.clear(); }));
    bar.appendChild(mkBtn('Export drafts', () => StagingStore.exportDraftsJSON()));
    bar.appendChild(mkBtn('Accept & export', () => StagingStore.exportMerged(window.__BASE_EVENTSDB || null)));
    document.body.appendChild(bar);
  });
})();

(function () {
  // =================
  // (B) INFOBOX POPUP
  // =================
  // EN: Exposes window.InfoBox.show(ev, screenBox) and InfoBox.hide()

  const infoCfg = { margin: 10 };
  let infoEl = null;
  let __lastUserIntentTs = 0;
  const __USER_INTENT_WINDOW_MS = 1200;

  ['pointerdown', 'wheel', 'keydown', 'touchstart'].forEach((type) => {
    window.addEventListener(type, (e) => { if (e && e.isTrusted) { __lastUserIntentTs = performance.now(); } }, { capture: true, passive: true });
  });

  function ensureInfoEl() {
    if (infoEl && infoEl.parentNode) return infoEl;
    infoEl = document.createElement('div');
    infoEl.id = 'event-info';
    document.body.appendChild(infoEl);
    infoEl.addEventListener('click', e => e.stopPropagation());
    return infoEl;
  }

  function buildEventHTML(ev) {
    const label = ev?.display_label || ev?.label || 'Event';
    const when = (ev?.display_when || ev?.display_ago || (ev?.year ?? '').toString());
    const meta = [when, ev?.theme ? `Theme: ${ev.theme}` : null].filter(Boolean).join(' · ');
    const comments = (typeof ev?.display_comments === 'string' && ev.display_comments.trim().length > 0)
      ? ev.display_comments.trim()
      : ((typeof ev?.comments === 'string') ? ev.comments.trim() : '');
    const ref = (ev?.ref || '').trim();
    const link = ref && /^https?:\/\//i.test(ref)
      ? `<div class="hint">Ref: <a href="${ref}" target="_blank" rel="noopener">link</a></div>`
      : (ref ? `<div class="hint">Ref: ${ref}</div>` : ``);
    const body = comments ? `<div class="body">${comments}</div>` : `<div class="body" style="opacity:.8;">(No notes)</div>`;
    return `
      <div class="title">${label}</div>
      <div class="meta">${meta}</div>
      ${body}${link}
      <div class="actions">
        <button class="edit-event" type="button" aria-label="Edit event">Edit event</button>
      </div>`;
  }

  function show(ev, screenBox) {
    __lastUserIntentTs = 0;
    const el = ensureInfoEl();
    el.innerHTML = buildEventHTML(ev);
    const btn = el.querySelector('.edit-event');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('timeline:edit-event', { detail: { event: ev } }));
      });
    }
    el.classList.remove('is-visible');
    el.style.visibility = 'hidden';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px) scale(0.98)';
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const M = infoCfg.margin;
      let x = Math.round(screenBox.left + 12);
      let y = Math.round(screenBox.top - rect.height - 8);
      if (y < M) y = Math.round(screenBox.bottom + 8);
      if (x + rect.width + M > innerWidth) x = Math.max(M, innerWidth - rect.width - M);
      if (y + rect.height + M > innerHeight) y = Math.max(M, innerHeight - rect.height - M);
      el.style.left = `${x}px`; el.style.top = `${y}px`;
      requestAnimationFrame(() => {
        el.style.visibility = ''; el.style.opacity = ''; el.style.transform = ''; el.classList.add('is-visible');
      });
    });
  }

  function hide() {
    const now = performance.now();
    const userAllowed = (now - __lastUserIntentTs) <= __USER_INTENT_WINDOW_MS;
    if (!userAllowed) return; // avoid hiding during programmatic redraws
    ensureInfoEl().classList.remove('is-visible');
  }

  document.addEventListener('click', hide);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });

  window.InfoBox = { show, hide };
})();

(function () {
  // =================
  // (C) STARTUP INTRO
  // =================
  // EN: Small, skippable intro that highlights a nearby theme and demonstrates
  //     zoom/pan. Skipped with ?demo=0. Emits 'timeline:intro-done'.

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function ensureTouchCursor() {
    let el = document.getElementById('touch-cursor');
    if (!el) {
      el = document.createElement('div');
      el.id = 'touch-cursor';
      el.style.cssText = [
        'position:fixed;width:18px;height:18px;border-radius:50%;',
        'background:rgba(255,255,255,0.95);',
        'box-shadow:0 0 0 10px rgba(255,255,255,0.10),0 1px 6px rgba(0,0,0,.35);',
        'z-index:1700;pointer-events:none;opacity:0;',
        'transform:translate(-9px,-9px);',
        'transition:opacity .20s ease,left .60s cubic-bezier(.2,.8,.2,1),top .60s cubic-bezier(.2,.8,.2,1);'
      ].join('');
      document.body.appendChild(el);
    }
    return el;
  }
  function moveTouchCursor(el, x, y, visible = true) { el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.opacity = visible ? '1' : '0'; }
  function moveTouchCursorInstant(el, x, y, visible = true) {
    const prev = el.style.transition;
    el.style.transition = 'opacity .20s ease, left 0s, top 0s';
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.opacity = visible ? '1' : '0';
    void el.offsetWidth; el.style.transition = prev;
  }
  function tapRipple(x, y) {
    const r = document.createElement('div');
    r.style.cssText = [
      'position:fixed;width:28px;height:28px;border-radius:50%;',
      'border:2px solid rgba(255,255,255,0.85);box-shadow:0 0 8px rgba(255,255,255,0.45);',
      'pointer-events:none;z-index:1699;opacity:0.85;',
      'transform:translate(-14px,-14px) scale(0.6);transition:transform .35s ease, opacity .35s ease;'
    ].join('');
    r.style.left = x + 'px'; r.style.top = y + 'px';
    document.body.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = 'translate(-14px,-14px) scale(1.15)'; r.style.opacity = '0'; });
    setTimeout(() => { r.parentNode && r.parentNode.removeChild(r); }, 400);
  }
  function hideTouchCursor(el) { if (!el) return; el.style.opacity = '0'; setTimeout(() => { el.parentNode && el.parentNode.removeChild(el); }, 280); }

  async function runStartup() {
    const api = window.TimelineAPI; if (!api) return;
    let cursor = ensureTouchCursor();

    const svg = document.getElementById('timeline');
    const titles = svg?.querySelectorAll('text.card-title') || [];
    const midY = window.innerHeight / 2;
    let nearest = null, bestDist = Infinity;
    titles.forEach(t => {
      const r = t.getBoundingClientRect(); const cy = r.top + r.height * 0.5;
      const d = Math.abs(cy - midY);
      if (d < bestDist) { bestDist = d; nearest = { el: t, x: r.left + r.width * 0.5, y: cy, theme: t.textContent.trim() }; }
    });
    const target = nearest || { x: window.innerWidth / 2, y: midY, theme: null };
    moveTouchCursor(cursor, target.x, target.y, true);
    await sleep(520); tapRipple(target.x, target.y);
    if (target.theme && api.selectTheme) { api.selectTheme(target.theme); }
    moveTouchCursor(cursor, target.x, target.y, false);
    await sleep(1000);

    const cont = document.getElementById('timeline-container');
    const r = cont.getBoundingClientRect();
    const start = { x: Math.round(r.left + r.width * 0.5), y: target.y };
    tapRipple(start.x, start.y); await sleep(260);
    cursor = ensureTouchCursor(); moveTouchCursorInstant(cursor, start.x, start.y, true); await sleep(180);

    const dx = 120;
    api.animScaleBy(1.5, start.x, start.y, 700); moveTouchCursor(cursor, start.x - dx, start.y, true); await sleep(740);
    api.animScaleBy(0.8, start.x - dx, start.y, 560); moveTouchCursor(cursor, start.x, start.y, true); await sleep(600);

    await sleep(500);
    const dy = -90;
    moveTouchCursor(cursor, start.x, start.y + dy, true); api.animTranslateBy(0, dy, 620); await sleep(660);
    moveTouchCursor(cursor, start.x, start.y, true); api.animTranslateBy(0, -dy, 520); await sleep(540);

    hideTouchCursor(cursor);
    window.__introCompleted = true;
    document.dispatchEvent(new CustomEvent('timeline:intro-done'));
  }

  document.addEventListener('timeline:first-render', () => {
    const url = new URL(location.href);
    const demoParam = url.searchParams.get('demo');
    const force = demoParam !== '0';
    if (!force) {
      console.log('[startup] skipped by ?demo=0');
      window.__introCompleted = true;
      document.dispatchEvent(new CustomEvent('timeline:intro-done'));
      return;
    }
    console.log('[startup] running intro');
    setTimeout(runStartup, 380);
  });
})();
