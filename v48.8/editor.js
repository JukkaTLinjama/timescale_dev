// editor.js — v47 unified module (keep file count low)
// Includes:
//   (A) Draft storage + inline editor + floating toolbar
//   (B) InfoBox popup (Edit button dispatches `timeline:edit-event`)
//   (C) Startup intro (skippable via ?demo=0)
//
// Load order: include this BEFORE timeline.js so InfoBox & intro exist when the renderer starts.
// Drafts live in PreviewData (_list) and render in the "preview" theme.
// Local 'StagingStore' is disabled/removed; tray buttons operate on PreviewData.

// === Global helpers: toast + draft label parsers (shared across IIFEs) ===
(function () {
    if (!window.DraftUI) window.DraftUI = {};

    window.DraftUI.formatDraftLabel = function formatDraftLabel(origTheme, baseLabel) {
        const theme = (origTheme && String(origTheme).trim()) || 'unknown';
        const core = (baseLabel && String(baseLabel).trim()) || 'Untitled';
        return `draft: ${theme} - ${core}`;
    };
    window.DraftUI.stripDraftLabel = function stripDraftLabel(label) {
        if (typeof label !== 'string') return label;
        return label.replace(/^draft:\s*[^-]+-\s*/i, '').trim();
    };
    window.DraftUI.parseDraftThemeFromLabel = function parseDraftThemeFromLabel(label) {
        if (typeof label !== 'string') return null;
        const m = label.match(/^draft:\s*([^-]+)-\s*/i);
        return m ? m[1].trim() : null;
    };

    // Tiny toast feedback (global)
    if (!window.showToast) {
        window.showToast = function showToast(msg, ms = 1600) {
            let t = document.getElementById('ts-toast');
            if (!t) {
                t = document.createElement('div');
                t.id = 'ts-toast';
                t.style.cssText = [
                    'position:fixed; right:14px; bottom:18px; z-index:99999;',
                    'padding:6px 10px; border-radius:8px; background:#222; color:#fff;',
                    'box-shadow:0 3px 12px rgba(0,0,0,45); font:500 13px/1.3 system-ui;',
                    'opacity:0; transition:opacity .15s ease;',
                    'pointer-events:none;'
                ].join('');

                document.body.appendChild(t);
            }
            t.textContent = msg;
            requestAnimationFrame(() => (t.style.opacity = '1'));
            setTimeout(() => (t.style.opacity = '0'), ms);
        };
    }
})();

(function () {
  // =========================
  // (A) DRAFT STORAGE + EDIT
  // =========================

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
            return {
                text: ev.link.text ?? ev.link.label ?? ev.link.title ?? '',
                url: ev.link.url ?? ev.link.href ?? ''
            };
        }

        const text = ev?.link_text ?? ev?.linkLabel ?? ev?.linkTitle ?? '';
        const url = ev?.url ?? ev?.href ?? ev?.ref ?? '';
        return { text, url };
    }

    function openEditor(ev) {
      editor.hidden = false;
        window.__editorOpen = true;
        document.body.classList.add('editor-open');
        f.title.value = ev?.display_label ?? ev?.label ?? '';

        // Keep year/date in sync: date is primary when AD, BCE uses year only.
        const rawDate = (ev?.date ?? ev?.iso_date ?? '');
        const dateStr = str(rawDate);

        // Try to extract YYYY from date
        let yearFromDate = '';
        const ym = dateStr.match(/^(\d{4})/);
        if (ym) yearFromDate = ym[1];

        // Determine year: explicit ev.year > derived from date > empty
        let yearVal = Number.isFinite(ev?.year)
            ? ev.year
            : (yearFromDate ? Number(yearFromDate) : undefined);

        // BCE → do not keep ISO date (invalid)
        if (typeof yearVal === 'number' && yearVal < 0) {
            f.date.value = '';
            f.year.value = String(yearVal);
        } else {
            f.date.value = dateStr;
            f.year.value = (yearVal != null) ? String(yearVal) : '';
        }

        f.desc.value = ev?.display_comments ?? ev?.comments ?? ev?.info ?? ev?.body ?? '';
        f.theme.value = ev?.theme ?? '';

        // EN: Show source ID for clarity (read-only field in HTML).
        f.id.value = str(ev?.id ?? ev?._id ?? '');
        f.id.dataset.sourceId = (ev?.previewSource?.id || f.id.value);

        // ---------- Theme badge in editor header: "draft: <theme>" for preview drafts ----------
        (function ensureThemeBadge() {
            const header = editor.querySelector('.editor-header') || editor;

            let badge = header.querySelector('#edit-theme-badge');
            if (!badge) {
                badge = document.createElement('span');
                badge.id = 'edit-theme-badge';
                badge.style.cssText = [
                    'margin-left:8px; padding:2px 6px; border-radius:6px;',
                    'border:1px solid #555; background:#333; color:#ffcf8a;',
                    'font:600 11px/1 system-ui; vertical-align:middle;'
                ].join('');
                const titleEl = header.querySelector('h3, .editor-title, #edit-title') || header.firstChild;
                if (titleEl && titleEl.nextSibling) header.insertBefore(badge, titleEl.nextSibling);
                else header.appendChild(badge);
            }

            const isPreview = ev?.theme === 'preview';
            const orig = ev?.previewOriginalTheme || ev?.previewSource?.theme || DraftUI.parseDraftThemeFromLabel(ev?.label) || '';
            badge.textContent = isPreview && orig ? `Theme: draft: ${orig}` : `Theme: ${ev?.theme || '—'}`;
        })();

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

      function closeEditor() {
          editor.hidden = true;
          window.__editorOpen = false;
          document.body.classList.remove('editor-open');
      }

        if (closeBtn) closeBtn.addEventListener('click', closeEditor);
      // EN: Close the inline editor with Escape, if the panel is visible.
      document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && editor && !editor.hidden) {
              closeEditor();
          }
      });

      // Selected event id from renderer, fallback to editor field
      function findSelectedEventId() {
          try { if (window.TimelineState?.focus?.id) return TimelineState.focus.id; } catch { }
          const v = (f.id?.dataset?.sourceId || f.id?.value || '').trim();
          return v || null;
      }

      // Collect form data (minimal set you need for overrides)
      function getData() {
          const label = (f.title?.value || '').trim();
          const comments = (f.desc?.value || '').trim();

          let date = (f.date?.value || '').trim();
          const yearStr = (f.year?.value || '').trim();

          // Date is primary; if filled, derive year from its first 4 digits.
          let yearNum;
          if (date) {
              const m = date.match(/^(\d{4})/);
              if (m) {
                  yearNum = Number(m[1]);
              } else if (/^\d{4}$/.test(yearStr)) {
                  yearNum = Number(yearStr);
              } else {
                  // ei kelvollinen YYYY-alkuinen date -> tiputetaan date pois
                  date = '';
              }
          } else if (/^\d+$/.test(yearStr)) {
              yearNum = Number(yearStr);
          }

          // BCE: jos year negatiivinen, date ei saa jäädä (ei ole kelvollista ISO-aikaa)
          if (typeof yearNum === 'number' && yearNum < 0) {
              date = '';
          }

          // --- Estä tulevaisuuden date/year + näytä toast ---
          const now = new Date();
          const currentYear = now.getFullYear();

          if (date) {
              const d = new Date(date);
              if (!isNaN(d) && d > now) {
                  date = '';
                  if (window.showToast) {
                      window.showToast('Future date ignored (cannot be in the future)', 2200);
                  } else {
                      console.warn('[editor] Future date ignored');
                  }
              }
          }

          if (typeof yearNum === 'number' && yearNum > currentYear) {
              yearNum = undefined;
              if (window.showToast) {
                  window.showToast('Future year ignored (must be ≤ current year)', 2200);
              } else {
                  console.warn('[editor] Future year ignored');
              }
          }

          const link = {
              text: (f.linkText?.value || '').trim(),
              url: (f.linkUrl?.value || '').trim()
          };
          const source = (f.source?.value || '').trim();
          const tags = (f.tags?.value || '').split(',').map(s => s.trim()).filter(Boolean);
          const edited_by = (f.editedBy?.value || '').trim();
          const edited_at = (f.editedAt?.value || '').trim();
          const created_by = (f.createdBy?.value || '').trim();
          const created_at = (f.createdAt?.value || '').trim();

          return {
              label,
              display_label: label,
              comments,
              year: yearNum,
              date,
              link,
              source,
              tags,
              edited_by,
              edited_at,
              created_by,
              created_at
          };
      }

      function ensureActions() {
          // EN: Always ensure the toolbar exists AND lives in the header.
          // If it already exists, we relocate it to header (do not early-return).
          let wrap = editor.querySelector('.editor-actions');
          const header = editor.querySelector('.editor-header') || editor;
          const closeBtnInHeader = header.querySelector('#close-editor');

          if (!wrap) {
              wrap = document.createElement('div');
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

              // --- Save draft → UPSERT to Preview (update existing by source, or create once) ---
              wrap.appendChild(mk('Save draft', 'Save/update a visible draft in the “preview” theme', () => {
                  if (!window.EditorPreviewOps || typeof EditorPreviewOps.upsertFromEventId !== 'function') {
                      alert('Preview save not available (EditorPreviewOps.upsertFromEventId missing).');
                      return;
                  }

                  // Base ID: prefer focus/selection; fallback to sourceId or explicit prompt.
                  let baseId = (function () {
                      const src = (f.id?.dataset?.sourceId || '').trim();
                      if (src) return src;
                      try { if (window.TimelineState?.focus?.id) return TimelineState.focus.id; } catch { }
                      const v = (f.id?.value || '').trim();
                      return v || null;
                  })();

                  // Normalize: if current id points to a preview draft, use its original source id instead
                  try {
                      const pack = (window.TS_DATA && Array.isArray(TS_DATA.events)) ? TS_DATA : null;
                      const hit = pack ? TS_DATA.events.find(e => e && e.id === baseId) : null;
                      const src = hit && hit.previewSource && hit.previewSource.id;
                      if (src) baseId = src;
                  } catch { }

                  if (!baseId) baseId = prompt('Enter the ID to use as a base for the Preview draft:');
                  if (!baseId) return;

                  const form = getData();

                  // Build overrides; we compute time_years from year/date inside upsert
                  const overrides = {
                      label: form.label,
                      display_label: form.display_label,
                      comments: form.comments,
                      year: form.year,       // may be undefined; upsert will interpret
                      date: form.date,       // may be '', same
                      link: form.link,
                      source: form.source,
                      tags: form.tags,
                      created_by: form.created_by,
                      created_at: form.created_at,
                      edited_by: form.edited_by,
                      updated_at: new Date().toISOString(), // v47.5: canonical update timestamp
                      theme: 'preview'
                  };

                  const res = EditorPreviewOps.upsertFromEventId(baseId, overrides);
                  if (res && res.ok && res.draft) {
                      editor.dataset.lastDupId = res.draft.id; // remember for Delete
                      window.rerenderTimeline?.();
                      showToast(res.created ? `Draft created: ${res.draft.label}` : `Draft updated: ${res.draft.label}`);
                  } else {
                      alert('Preview save failed. See console for details.');
                  }
              }));

              // --- Duplicate to Preview ---
              wrap.appendChild(mk('Duplicate to Preview', 'Duplicate current/selected event into the Preview theme', () => {
                  if (!window.EditorPreviewOps || typeof EditorPreviewOps.duplicateFromEventId !== 'function') {
                      alert('Duplicate feature not available (EditorPreviewOps missing).');
                      return;
                  }
                  let id = findSelectedEventId() || (f.id?.value || '').trim();
                  if (!id) id = prompt('Enter the ID of the event to duplicate to Preview:');
                  if (!id) return;

                  const dup = EditorPreviewOps.duplicateFromEventId(id);
                  if (dup) {
                      editor.dataset.lastDupId = dup.id;
                      showToast(`Duplicated: ${dup.label}`);
                  } else {
                      alert('Duplicate failed. Check console for details.');
                  }
              }));

              // --- Delete draft (Preview) ---
              wrap.appendChild(mk('Delete draft', 'Remove the last duplicated preview (or choose id)', () => {
                  let delId = editor.dataset.lastDupId;
                  if (!delId) delId = prompt('Preview id to delete (e.g. originalId(1) ):', '');
                  if (!delId) return;

                  if (window.PreviewData?.get && window.PreviewData?.set) {
                      const list = PreviewData.get();
                      const next = list.filter(e => e && e.id !== delId);
                      PreviewData.set(next);
                      if (editor.dataset.lastDupId === delId) delete editor.dataset.lastDupId;
                      window.rerenderTimeline?.();
                      showToast(`Deleted draft: ${delId}`);
                  } else {
                      alert('PreviewData not available.');
                  }
              }));

              // --- Clear form (unchanged) ---
              wrap.appendChild(mk('Clear form', 'Clear all fields', () => {
                  editor.querySelectorAll('input, textarea').forEach(el => el.value = '');
              }));
          }

          // EN: Relocate toolbar into the header every time.
          header.style.display = 'flex';
          header.style.alignItems = 'center';
          header.style.gap = '8px';
          wrap.style.marginTop = '0';
          wrap.style.flex = '0 0 auto';

          const title = header.querySelector('.editor-title');
          if (title) title.style.flex = '1 1 auto';
          if (closeBtnInHeader) closeBtnInHeader.style.marginLeft = 'auto';

          if (wrap.parentElement !== header) {
              // EN: insert only if the reference node (closeBtnInHeader) is really a child of header
              if (closeBtnInHeader && closeBtnInHeader.parentElement === header) {
                  header.insertBefore(wrap, closeBtnInHeader);
              } else {
                  header.appendChild(wrap);
              }
          }

      }

        ensureActions();

        // EN: Press Enter on any INPUT inside the editor to trigger "Save draft".
        editor.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const target = e.target;
            if (!target) return;
            const tag = target.tagName;
            // Do NOT hijack Enter in textarea (multiline descriptions).
            if (tag !== 'INPUT') return;
            if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;

            e.preventDefault();
            const saveBtn = editor.querySelector('.editor-actions button');
            if (saveBtn) {
                saveBtn.click();
            }
        });

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
              if (actions && actions.parentElement === editor) {
                  editor.insertBefore(adv, actions);
              } else {
                  editor.appendChild(adv);
              }
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
              if (actions && actions.parentElement === editor) {
                  editor.insertBefore(toggles, actions);
              } else {
                  editor.appendChild(toggles);
              }
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

    // Floating editor controls (toggleable bottom tray)
    document.addEventListener('DOMContentLoaded', () => {
        
        // EN: Avoid duplicates if already created
        if (document.getElementById('editor-controls-toggle') || document.getElementById('editor-controls')) return;

        // --- (1) Toggle button in bottom-right corner ---
        const toggle = document.createElement('button');
        toggle.id = 'editor-controls-toggle';
        toggle.textContent = 'Show editor controls';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.style.cssText = [
            'position:fixed; right:10px; bottom:26px; z-index:2500;',
            'font:12px system-ui; padding:6px 10px; border-radius:8px;',
            'border:1px solid #777; background:#2b2b2b; color:#eee; cursor:pointer;'
        ].join('');

        // --- (2) Bottom tray that holds ALL controls (initially hidden) ---
        const tray = document.createElement('div');
        tray.id = 'editor-controls';
        tray.style.cssText = [
            'position:fixed; left:10px; right:10px; bottom:26px; z-index:2400;',
            'display:none; gap:8px; flex-wrap:wrap;',
            'background:rgba(30,30,30,.92); border:1px solid #555; padding:8px 10px; border-radius:10px;',
            'box-shadow:0 6px 18px rgba(0,0,0,.35);',
            'font:12px/1 system-ui; color:#ddd;'
        ].join('');
        tray.setAttribute('role', 'region');
        tray.setAttribute('aria-label', 'Editor controls');

        // Helper for consistent buttons
        const mkBtn = (txt, fn, title = '') => {
            const b = document.createElement('button');
            b.textContent = txt;
            if (title) b.title = title;
            b.style.cssText = 'font:12px system-ui; padding:6px 10px; border-radius:8px; border:1px solid #777; background:#3a3a3a; color:#eee; cursor:pointer;';
            b.onclick = fn;
            return b;
        };

        // --- (3) Controls inside the tray ---
        
        // Clear all preview drafts
        tray.appendChild(mkBtn('Clear drafts', () => {
            if (!window.PreviewData?.clear) return showToast('PreviewData not ready');
            if (confirm('Clear all preview drafts?')) {
                PreviewData.clear();
                window.rerenderTimeline?.();
                showToast('Cleared all preview drafts');
            }
        }, 'Delete all drafts from the Preview card'));

        // Export drafts (preview only)
        tray.appendChild(mkBtn('Export drafts', () => {
            if (!window.PreviewData?.get) return showToast('PreviewData not ready');
            const drafts = PreviewData.get();
            const blob = new Blob([JSON.stringify(drafts, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = Object.assign(document.createElement('a'), { href: url, download: 'preview_drafts.json' });
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }, 'Download all preview drafts as JSON'));

        // Accept & export (base + converted drafts)
        tray.appendChild(mkBtn('Accept & export', () => {
            if (!window.ExportOps?.buildExportJSON) return showToast('ExportOps not ready');
            const basePack = window.__BASE_EVENTSDB || window.TS_DATA || {};
            const pack = ExportOps.buildExportJSON(basePack);
            const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = Object.assign(document.createElement('a'), { href: url, download: 'eventsDB_with_preview_finals.json' });
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }, 'Download merged eventsDB (base + preview drafts converted to finals)'));

        // --- (4) Toggle behavior ---
        let __controlsOpen = false; // EN: remember tray state across renders
        let __previewCard = null;   // EN: cache the <g.card> whose title is "preview"

        function setOpen(open) {
            __controlsOpen = !!open;

            // Toggle tray UI
            tray.style.display = open ? 'flex' : 'none';
            toggle.textContent = open ? 'Hide editor controls' : 'Show editor controls';
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');

            // When opening, optionally select the "preview" theme (harmless if already active)
            if (open && window.TimelineAPI?.selectTheme) {
                try { TimelineAPI.selectTheme('preview'); } catch (_) { }
            }

            // Locate the preview card once (and revalidate if DOM changed)
            // EN: Use data-theme="preview" instead of title text for robustness.
            if (!__previewCard || !document.contains(__previewCard)) {
                const svg = document.getElementById('timeline');
                __previewCard = svg
                    ? svg.querySelector('g.card[data-theme="preview"]')
                    : null;
            }

            // Show/hide the entire preview card group if present
            if (__previewCard) {
                if (open) {
                    __previewCard.style.display = '';
                    __previewCard.removeAttribute('data-hidden-by-controls');
                } else {
                    __previewCard.style.display = 'none';
                    __previewCard.setAttribute('data-hidden-by-controls', '1');
                }
            }

        }

        toggle.addEventListener('click', () => setOpen(!__controlsOpen));
        // EN: Keep preview hidden at startup and after any redraws, unless the tray is open.
        document.addEventListener('timeline:first-render', () => {
            if (!__controlsOpen) {
                // wait a tick to run after DOM has the cards
                requestAnimationFrame(() => setOpen(false));
            }
        });

        // Some builds emit only generic "timeline:render" (or many times).
        document.addEventListener('timeline:render', () => {
            requestAnimationFrame(() => setOpen(__controlsOpen));
        });

        // --- (5) Mount to DOM ---
        document.body.appendChild(toggle);
        document.body.appendChild(tray);

        // Optional: close tray on Escape for quick keyboard control
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            // If editor is open, let the editor's ESC handler take precedence.
            if (window.__editorOpen) return;
            // Otherwise, close the tray if it's open.
            if (__controlsOpen) setOpen(false);
        });

        // Start collapsed by default
        setOpen(false);
    });

})();

/* --- PreviewData: runtime preview cards + merge helper -----------------------
   - Lives in editor.js so the editor owns all draft/preview concerns.
   - Exposes: PreviewData.set(list), .clear(), .get(), .merge(basePack)
   - basePack shape: { meta, events, themes, themeColors }
-------------------------------------------------------------------------------*/
(function () {
    const PREVIEW_THEME = 'preview';
    const PREVIEW_COLOR = '#f59e0b';

    // Default test card (you can remove/replace via PreviewData.set([...]))
    let _list = [{
        id: 'preview-1',
        theme: PREVIEW_THEME,
        label: 'Preview — test card',
        comments: 'A minimal sample event rendered in the Preview theme.',
        // age in years from "now" → ~6 months
        time_years: 0.5,
        previewStatus: 'added',
        edited_at: new Date().toISOString()
    }];

    // --- Draft label helpers (for consistent "draft: theme - label") ---
    function formatDraftLabel(origTheme, baseLabel) {
        const theme = (origTheme && String(origTheme).trim()) || 'unknown';
        const core = (baseLabel && String(baseLabel).trim()) || 'Untitled';
        return `draft: ${theme} - ${core}`;
    }

    function set(list) { _list = Array.isArray(list) ? list.slice() : []; }
    function clear() { _list = []; }
    function get() { return _list.slice(); }

    // Merge preview cards into a ready-to-render pack (no side effects)
    function merge(base) {
        const b = base || {};
        const events = Array.isArray(b.events) ? b.events : [];
        const themes = Array.isArray(b.themes) ? b.themes : [];
        const themeColors = { ...(b.themeColors || {}) };

        const out = {
            meta: b.meta || {},
            events: events.concat(_list),
            themes: Array.from(new Set([...themes, PREVIEW_THEME])),
            themeColors
        };
        if (!out.themeColors[PREVIEW_THEME]) out.themeColors[PREVIEW_THEME] = PREVIEW_COLOR;
        return out;
    }

    window.PreviewData = { set, clear, get, merge };
    
})();

/* --- EditorPreviewOps.duplicateFromEventId -----------------------------------
   Duplicate an existing event (by id) into the "preview" theme as a new draft.
   - Keeps timeline.js untouched; only editor.js + PreviewData are used.
   - Status is always "added" (a new draft), not "edited".
   Usage:
     EditorPreviewOps.duplicateFromEventId('orig-1234');
     // with overrides:
     EditorPreviewOps.duplicateFromEventId('orig-1234', {
       label: 'My copy label',
       time_years: 2.5,
       comments: 'Tweaked note'
     });
-------------------------------------------------------------------------------*/
(function () {
    // Defensive helpers
    function _now() { return new Date(); }
    function _presentYear() { return _now().getFullYear(); }

    // Convert base event -> numeric time_years if missing
    function _inferTimeYearsFromBase(base) {
        if (typeof base.time_years === 'number') return base.time_years;
        if (typeof base.year === 'number') return Math.max(0, _presentYear() - base.year);
        if (base.date) {
            const d = (base.date instanceof Date) ? base.date : new Date(base.date);
            if (!isNaN(d)) {
                const DAY_MS = 24 * 60 * 60 * 1000;
                const YEAR_DAYS = 365.2425;
                const diffDays = (_now().getTime() - d.getTime()) / DAY_MS;
                return Math.max(0, diffDays / YEAR_DAYS);
            }
        }
        return 0; // fall back near "now"
    }

    function _findById(eventId) {
        const pack = (window.TS_DATA && Array.isArray(TS_DATA.events)) ? TS_DATA : null;
        return pack ? TS_DATA.events.find(e => e && e.id === eventId) : null;
    }

    function duplicateFromEventId(eventId, overrides = {}) {
        if (!eventId) { console.warn('[Duplicate] Missing eventId'); return null; }
        if (!window.PreviewData || typeof PreviewData.get !== 'function' || typeof PreviewData.set !== 'function') {
            console.warn('[Duplicate] PreviewData not available (editor.js must load before prepare/timeline).');
            return null;
        }

        // 1) Find base event from already-prepared dataset (what timeline.js sees)
        const pack = (window.TS_DATA && Array.isArray(TS_DATA.events)) ? TS_DATA : null;
        const base = pack ? TS_DATA.events.find(e => e && e.id === eventId) : null;
        if (!base) { console.warn('[Duplicate] Base event not found:', eventId); return null; }

        // 2) Build a unique id: baseId(1), baseId(2), ...
        const baseId = String(base.id || 'orig');

        // Collect existing preview copies that look like baseId(n)
        const rx = new RegExp('^' + baseId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\((\\d+)\\)$');
        const previews = PreviewData.get();
        let maxN = 0;
        previews.forEach(e => {
            const m = e && typeof e.id === 'string' ? e.id.match(rx) : null;
            if (m) { const n = +m[1]; if (Number.isFinite(n) && n > maxN) maxN = n; }
        });

        // Propose next id, and ensure no collision with TS_DATA.events either
        let newId = overrides.id || `${baseId}(${maxN + 1})`;
        const idTaken = (id) =>
            previews.some(e => e && e.id === id) ||
            (TS_DATA && Array.isArray(TS_DATA.events) && TS_DATA.events.some(e => e && e.id === id));

        let guard = 0;
        while (idTaken(newId) && guard++ < 50) {
            maxN += 1;
            newId = `${baseId}(${maxN})`;
        }

        // 3) Derive time_years if missing
        const tY = (typeof overrides.time_years === 'number')
            ? overrides.time_years
            : (typeof base.time_years === 'number')
                ? base.time_years
                : (typeof base.year === 'number')
                    ? Math.max(0, (new Date()).getFullYear() - base.year)
                    : (function () {
                        if (base.date) {
                            const d = (base.date instanceof Date) ? base.date : new Date(base.date);
                            if (!isNaN(d)) {
                                const DAY_MS = 86400000, YEAR_DAYS = 365.2425;
                                return Math.max(0, ((Date.now() - d.getTime()) / DAY_MS) / YEAR_DAYS);
                            }
                        }
                        return 0; // near "now"
                    })();

        // 4) Build duplicate as a PREVIEW draft (single preview card),
        //    but embed the original theme visibly into the label prefix.
        //    Also store original theme in metadata for reliable export.
        const origTheme = base.theme || null;

        const userLabel = (overrides.label != null && overrides.label !== '')
            ? String(overrides.label)
            : (base.label ? `${base.label} (copy)` : 'Copy');

        // Final label shown in the preview card
        const previewLabel = DraftUI.formatDraftLabel(origTheme, userLabel);

        // Derive basic metadata so the duplicate behaves like the original on first edit
        const dupYear = (typeof overrides.year === 'number' && Number.isFinite(overrides.year))
            ? overrides.year
            : (typeof base.year === 'number' ? base.year : undefined);

        const dupDate = (typeof overrides.date === 'string' && overrides.date.trim().length)
            ? overrides.date
            : (base.date || base.iso_date || undefined);

        const dupLink = (function () {
            if (overrides.link != null) return overrides.link;
            if (base.link && typeof base.link === 'object') return base.link;
            const url = base.url || base.href || base.ref || '';
            const text = base.link_text || base.linkLabel || base.linkTitle || '';
            if (url) return { text, url };
            return undefined;
        })();

        const dupSource = (function () {
            if (overrides.source != null) return overrides.source;
            return base.source ?? base.ref ?? base.reference ?? '';
        })();

        const dupTags = (function () {
            if (Array.isArray(overrides.tags)) return overrides.tags;
            if (Array.isArray(base.tags)) return base.tags;
            if (Array.isArray(base.keywords)) return base.keywords;
            return [];
        })();

        const dup = {
            id: newId,
            theme: 'preview',                    // stays in preview for visualization
            label: previewLabel,                 // "draft: <theme> - <label>"
            comments: overrides.comments ?? (base.comments || base.info || ''),
            time_years: tY,
            year: dupYear,
            date: dupDate,
            link: dupLink,
            source: dupSource,
            tags: dupTags,
            ref: base.ref ?? base.reference ?? undefined,
            previewStatus: 'added',
            previewSource: { id: base.id, theme: origTheme },
            previewOriginalTheme: origTheme,     // used when exporting/committing
            editor: overrides.editor || 'user',
            edited_at: new Date().toISOString(),
            display: overrides.display ?? base.display ?? undefined,
            i18n: overrides.i18n ?? base.i18n ?? undefined
        };

        // 5) Push into PreviewData and try soft re-render
        const list = PreviewData.get(); list.push(dup); PreviewData.set(list);
        showToast(`Added to Preview: ${dup.label}`);
        if (typeof window.rerenderTimeline === 'function') {
            try { window.rerenderTimeline(); } catch { }
        } else {
            console.info('[Duplicate] Draft added to preview. Reload if you do not see it.');
        }

        return dup;
    }

    // Extend existing API without clobbering prior helpers
    window.EditorPreviewOps = Object.assign({}, window.EditorPreviewOps || {}, {
        duplicateFromEventId
    });

    // Extend existing API without clobbering prior helpers
    window.EditorPreviewOps = Object.assign({}, window.EditorPreviewOps || {}, {
        duplicateFromEventId
    });
})();


// --- B )  InfoBox popup ----------------------------------------------------------
/* --- EditorPreviewOps.upsertFromEventId --------------------------------------
   Upsert a preview draft for given base event id:
   - If a draft already exists for previewSource.id === base.id → update it in place
   - Otherwise create one (equivalent to a single duplicate) and bind it to this base
   Always re-derive time_years from overrides (year/date) if provided.
-------------------------------------------------------------------------------*/
(function () {
    function _now() { return new Date(); }
    function _presentYear() { return _now().getFullYear(); }

    function _deriveTimeYears(overrides, base, existingDraft) {
        // Priority: explicit time_years > date > year > existing > base inference
        if (typeof overrides.time_years === 'number') return overrides.time_years;

        // 1) If editor provided a full date string, use that (most precise)
        if (overrides.date) {
            const d = (overrides.date instanceof Date) ? overrides.date : new Date(overrides.date);
            if (!isNaN(d)) {
                const now = Date.now();
                // Future date? clamp to 0 years ago
                if (d.getTime() > now) return 0;

                const DAY_MS = 86400000, YEAR_DAYS = 365.2425;
                return ((now - d.getTime()) / DAY_MS) / YEAR_DAYS;
            }
        }

        // 2) Fallback: numeric year (allow BCE)
        if (typeof overrides.year === 'number' && Number.isFinite(overrides.year)) {
            // distance in years is presentYear - year (year may be negative)
            const nowYear = _presentYear();
            if (overrides.year > nowYear) return 0;
            return nowYear - overrides.year;
        }

        // 3) Existing draft value, if we are updating
        if (existingDraft && typeof existingDraft.time_years === 'number') return existingDraft.time_years;

        // 4) Base event inference
        if (base) {
            if (typeof base.time_years === 'number') return base.time_years;

            if (base.date) {
                const d = (base.date instanceof Date) ? base.date : new Date(base.date);
                if (!isNaN(d)) {
                    const DAY_MS = 86400000, YEAR_DAYS = 365.2425;
                    return ((Date.now() - d.getTime()) / DAY_MS) / YEAR_DAYS;
                }
            }

            if (typeof base.year === 'number') {
                const nowY = _presentYear();
                if (base.year > nowY) return 0;
                return nowY - base.year;
            }
        }

        // 5) Default: treat as "very near present"
        return 0;
    }

    function _formatPreviewLabel(origTheme, coreLabel) {
        const baseLabel = (coreLabel && String(coreLabel).trim()) || 'Untitled';
        return (window.DraftUI && DraftUI.formatDraftLabel)
            ? DraftUI.formatDraftLabel(origTheme, baseLabel)
            : `draft: ${origTheme || 'unknown'} - ${baseLabel}`;
    }

    function upsertFromEventId(eventId, overrides = {}) {
        // Normalize: if eventId is a preview draft, switch to its previewSource.id
        try {
            const pack0 = (window.TS_DATA && Array.isArray(TS_DATA.events)) ? TS_DATA : null;
            const hit0 = pack0 ? TS_DATA.events.find(e => e && e.id === eventId) : null;
            if (hit0 && hit0.previewSource && hit0.previewSource.id) {
                eventId = hit0.previewSource.id;
            }
        } catch { }

        if (!eventId) { console.warn('[Upsert] Missing eventId'); return null; }
        if (!window.PreviewData || typeof PreviewData.get !== 'function' || typeof PreviewData.set !== 'function') {
            console.warn('[Upsert] PreviewData not available.'); return null;
        }

        const pack = (window.TS_DATA && Array.isArray(TS_DATA.events)) ? TS_DATA : null;
        const base = pack ? TS_DATA.events.find(e => e && e.id === eventId) : null;
        if (!base) { console.warn('[Upsert] Base event not found:', eventId); return null; }

        const list = PreviewData.get() || [];
        const existing = list.find(e => e && e.previewSource && e.previewSource.id === base.id);

        const origTheme = base.theme || (existing ? existing.previewOriginalTheme : null) || null;

        // Core label (strip old "draft: <theme> - " if present)
        const coreLabel = (function () {
            const raw = (overrides.label != null && overrides.label !== '')
                ? String(overrides.label)
                : (existing ? existing.label : (base.label || ''));
            if (window.DraftUI && DraftUI.stripDraftLabel) {
                return DraftUI.stripDraftLabel(raw);
            }
            return String(raw || '').replace(/^draft:\s*[^-]+-\s*/i, '').trim();
        })();

        const time_years = _deriveTimeYears(overrides, base, existing);

        // Resolve year/date so that they persist between edits
        const resolvedYear = (function () {
            if (typeof overrides.year === 'number' && Number.isFinite(overrides.year)) return overrides.year;
            if (existing && typeof existing.year === 'number') return existing.year;
            if (typeof base.year === 'number') return base.year;
            return undefined;
        })();

        const resolvedDate = (function () {
            if (typeof overrides.date === 'string' && overrides.date.trim().length) return overrides.date;
            if (existing && existing.date) return existing.date;
            if (base && (base.date || base.iso_date)) return base.date || base.iso_date;
            return undefined;
        })();

        // Resolve link/source/tags with sensible fallbacks
        const linkVal = (function () {
            if (overrides.link != null) return overrides.link;
            if (existing && existing.link) return existing.link;
            if (base.link && typeof base.link === 'object') return base.link;
            const txt = base.link_text || base.linkLabel || base.linkTitle || '';
            const url = base.url || base.href || base.ref || base.reference || '';
            if (txt || url) return { text: txt, url };
            return undefined;
        })();

        const sourceVal = (function () {
            if (overrides.source != null) return overrides.source;
            if (existing && typeof existing.source === 'string') return existing.source;
            return base.source ?? base.ref ?? base.reference ?? '';
        })();

        const tagsVal = (function () {
            if (Array.isArray(overrides.tags)) return overrides.tags;
            if (existing && Array.isArray(existing.tags)) return existing.tags;
            if (Array.isArray(base.tags)) return base.tags;
            if (Array.isArray(base.keywords)) return base.keywords;
            return [];
        })();

        // Prevent future date/year slipping in
        const nowYear = (new Date()).getFullYear();
        if (resolvedDate) {
            const d = new Date(resolvedDate);
            if (!isNaN(d) && d > new Date()) {
                resolvedDate = '';
            }
        }
        if (typeof resolvedYear === 'number' && resolvedYear > nowYear) {
            resolvedYear = undefined;
        }

        if (existing) {
            // Update in place (same id)
            existing.label = _formatPreviewLabel(origTheme, coreLabel);
            existing.comments = (overrides.comments != null)
                ? overrides.comments
                : (existing.comments ?? base.comments ?? '');
            existing.time_years = time_years;
            existing.year = resolvedYear;
            existing.date = resolvedDate;
            existing.link = linkVal;
            existing.source = sourceVal;
            existing.tags = tagsVal;
            existing.updated_at = overrides.updated_at || new Date().toISOString();
            existing.edited_by = (overrides.edited_by != null)
                ? overrides.edited_by
                : (existing.edited_by ?? undefined);
            existing.display = (overrides.display != null)
                ? overrides.display
                : (existing.display ?? base.display ?? undefined);
            existing.i18n = (overrides.i18n != null)
                ? overrides.i18n
                : (existing.i18n ?? base.i18n ?? undefined);

            PreviewData.set(list);
            return { ok: true, created: false, draft: existing };
        }

        // No draft yet → create a single preview draft tied to this base
        const baseId = String(base.id || 'orig');
        const rx = new RegExp('^' + baseId.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '\\((\\d+)\\)$');
        let maxN = 0;
        list.forEach(e => {
            const m = e && typeof e.id === 'string' ? e.id.match(rx) : null;
            if (m) { const n = +m[1]; if (Number.isFinite(n) && n > maxN) maxN = n; }
        });
        const idTaken = id => list.some(e => e && e.id === id);
        let newId = `${baseId}(${Math.max(1, maxN + 1)})`;
        let guard = 0;
        while (idTaken(newId) && guard++ < 50) {
            maxN += 1;
            newId = `${baseId}(${maxN})`;
        }

        const previewLabel = _formatPreviewLabel(origTheme, coreLabel);
        const draft = {
            id: newId,
            theme: 'preview',
            label: previewLabel,
            comments: overrides.comments ?? (base.comments || ''),
            time_years,
            year: resolvedYear,
            date: resolvedDate,
            link: linkVal,
            source: sourceVal,
            tags: tagsVal,
            previewSource: { id: base.id, theme: origTheme },
            previewOriginalTheme: origTheme,
            created_by: overrides.created_by || undefined,
            created_at: overrides.created_at || undefined,
            updated_at: overrides.updated_at || new Date().toISOString(),
            edited_by: overrides.edited_by || undefined,
            display: overrides.display ?? base.display ?? undefined,
            i18n: overrides.i18n ?? base.i18n ?? undefined
        };

        list.push(draft);
        PreviewData.set(list);
        return { ok: true, created: true, draft };
    }

    window.EditorPreviewOps = Object.assign({}, window.EditorPreviewOps || {}, {
        upsertFromEventId
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
            : (typeof ev?.comments === 'string' && ev.comments.trim().length > 0)
                ? ev.comments.trim()
                : (typeof ev?.info === 'string' ? ev.info.trim() : '');

        // EN: Prefer explicit link object from drafts, fall back to ref/url fields.
        const linkObj = (ev && typeof ev.link === 'object') ? ev.link : null;
        const rawRef = (ev?.ref || '').trim();
        const url = (linkObj?.url || rawRef || ev?.url || ev?.href || '').trim();
        const textFromLink = (linkObj?.text || linkObj?.label || linkObj?.title || '').trim();

        let linkHtml = '';
        if (url && /^https?:\/\//i.test(url)) {
            // EN: Use link text from editor if available; otherwise fall back to ref or generic "link".
            const anchorText = textFromLink || rawRef || 'link';
            linkHtml = `<div class="hint">Ref: <a href="${url}" target="_blank" rel="noopener">${anchorText}</a></div>`;
        } else if (rawRef) {
            linkHtml = `<div class="hint">Ref: ${rawRef}</div>`;
        } else if (textFromLink) {
            linkHtml = `<div class="hint">Ref: ${textFromLink}</div>`;
        }

        const body = comments
            ? `<div class="body">${comments}</div>`
            : `<div class="body" style="opacity:.8;">(No notes)</div>`;

        return `
      <div class="title">${label}</div>
      <div class="meta">${meta}</div>
      ${body}${linkHtml}
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


// --- C )  STARTUP INTRO ----------------------------------------------------------

(function () {
  // =================
  // (C) STARTUP INTRO
  // =================
  // EN: Small, skippable intro that highlights a nearby theme and demonstrates
  //     zoom/pan. Skipped with ?demo=0. Emits 'timeline:intro-done'.
    // v47.6: ensure we schedule intro only once, even if multiple triggers fire
    if (window.__introScheduled == null) window.__introScheduled = false;

    function scheduleIntroOnce(delayMs) {
        if (window.__introCompleted) return;   // already finished
        if (window.__introScheduled) return;   // already scheduled
        window.__introScheduled = true;
        setTimeout(runStartup, Math.max(0, delayMs | 0));
    }

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
        window.__introScheduled = true; // ensure single run even if manually re-called
        const api = window.TimelineAPI; if (!api) return;
        let cursor = ensureTouchCursor(); // must exist before first moveTouchCursor()

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
    cursor = ensureTouchCursor(); 
    moveTouchCursorInstant(cursor, start.x, start.y, true); await sleep(180);

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
        console.log('[startup] schedule (first-render)');
        scheduleIntroOnce(380);
    });

    // Fallback #1: if first-render never arrives, start on the first generic render.
    document.addEventListener('timeline:render', () => {
        if (window.__introCompleted) return;
        const url = new URL(location.href);
        if (url.searchParams.get('demo') === '0') return; // respect opt-out
        console.log('[startup] schedule (fallback: timeline:render)');
        scheduleIntroOnce(180);
    }, { once: true });

    // Fallback #2: time-based guard in case no custom events are fired at all.
    setTimeout(() => {
        if (window.__introCompleted) return;
        const url = new URL(location.href);
        if (url.searchParams.get('demo') === '0') return;
        if (window.TimelineAPI) {
            console.log('[startup] schedule (fallback: timeout)');
            scheduleIntroOnce(0);
        }
    }, 2000);

})();
