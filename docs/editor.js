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
// --- DraftSession: strict "one target theme at a time" ------------------------
// EN: Drafts live in PreviewData (theme="preview"), but we keep session metadata here.
(function () {
    const KEY = 'ts_draft_session_v1';

    function emptySession() {
        return {
            targetThemeName: null, // EN: user-chosen label for export/apply later
            sourceTheme: null,     // EN: base theme from first duplicated event (strict mixing guard)
            createdAt: null
        };
    }

    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return emptySession();
            const obj = JSON.parse(raw);
            if (!obj || typeof obj !== 'object') return emptySession();
            return {
                targetThemeName: typeof obj.targetThemeName === 'string' ? obj.targetThemeName : null,
                sourceTheme: typeof obj.sourceTheme === 'string' ? obj.sourceTheme : null,
                createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : null
            };
        } catch {
            return emptySession();
        }
    }

    function save(s) {
        try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { }
    }

    function reset() {
        const s = emptySession();
        try { localStorage.removeItem(KEY); } catch { }
        return s;
    }

    // EN: Expose as window.DraftSession (minimal API)
    let state = load();
    window.DraftSession = {
        get: () => state,
        set: (next) => { state = next; save(state); },
        reset: () => { state = reset(); return state; }
    };
})();

// --- InfoBox: mount Editor tools into the "?" panel ---------------------------
// EN: This replaces the old bottom tray UX. The tools live inside #info-box.
(function () {
    function mountEditorTools() {
        const host = document.querySelector('#editor-tools .info-section-body');
        if (!host) return;

        // EN: Avoid double-mounting.
        if (host.dataset.mounted === '1') return;
        host.dataset.mounted = '1';

        // Replace placeholder
        host.innerHTML = '';

        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;';

        const mkBtn = (label, title, onClick) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            if (title) b.title = title;
            b.style.cssText = 'font:600 11px system-ui;padding:6px 8px;border-radius:8px;border:1px solid #666;background:#2a2a2a;color:#ffd399;cursor:pointer;';
            b.addEventListener('click', onClick);
            return b;
        };

        // (1) Toggle "editor controls" mode (dev-only UI + future toggles)
        wrap.appendChild(mkBtn(
            'Show editor controls',
            'Toggle editor tools visibility (dev-only)',
            () => {
                const on = document.body.classList.toggle('editor-controls-open');
                if (wrap.__toggleBtn) wrap.__toggleBtn.textContent = on ? 'Hide editor controls' : 'Show editor controls';
                if (window.showToast) window.showToast(on ? 'Editor controls: ON' : 'Editor controls: OFF', 1400);
            }
        ));

        // Keep a reference so we can update label text
        wrap.__toggleBtn = wrap.querySelector('button');

        // (2) Clear preview drafts (dev-only)
        const clearBtn = mkBtn(
            'Clear drafts',
            'Delete all Preview drafts',
            () => {
                if (!window.PreviewData || !PreviewData.clear) {
                    if (window.showToast) window.showToast('PreviewData not ready', 1600);
                    return;
                }
                if (confirm('Clear all preview drafts?')) {
                    PreviewData.clear();
                    if (window.DraftSession && DraftSession.reset) DraftSession.reset();
                    if (window.rerenderTimeline) window.rerenderTimeline();
                    if (window.showToast) window.showToast('Draft session cleared', 1600);
                }
            }
        );
        clearBtn.classList.add('dev-only');
        wrap.appendChild(clearBtn);

        // (3) Export preview drafts (dev-only)
        const exportBtn = mkBtn(
            'Export drafts',
            'Download Preview drafts as JSON',
            () => {
                if (!window.PreviewData || !PreviewData.get) {
                    if (window.showToast) window.showToast('PreviewData not ready', 1600);
                    return;
                }
                const sess = (window.DraftSession && DraftSession.get) ? DraftSession.get() : {};

                // EN: Ensure each exported draft has draftTargetTheme (deterministic import/apply later)
                const drafts = (PreviewData.get() || []).map(e => ({
                    ...e,
                    draftTargetTheme: (e && e.draftTargetTheme) ? e.draftTargetTheme : (sess.targetThemeName || null),
                    sourceTheme: (e && e.sourceTheme) ? e.sourceTheme : (e && e.previewSource && e.previewSource.theme) ? e.previewSource.theme : null
                }));

                const bundle = {
                    kind: 'timescale-draft-bundle',
                    version: 2,

                    // EN: New canonical key (matches per-event field)
                    draftTargetTheme: sess.targetThemeName || null,

                    createdAt: sess.createdAt || null,
                    exportedAt: new Date().toISOString(),
                    events: drafts
                };

                const safeName = (bundle.targetThemeName || 'draft').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60);
                const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${safeName}_draft_bundle.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
        );

        // (4) Import preview drafts (dev-only)
        const importBtn = mkBtn(
            'Import drafts',
            'Load a draft bundle JSON and replace current Preview drafts',
            () => {
                const inp = document.createElement('input');
                inp.type = 'file';
                inp.accept = 'application/json';

                inp.onchange = async () => {
                    const file = inp.files && inp.files[0];
                    if (!file) return;

                    const txt = await file.text();
                    let bundle = null;
                    try { bundle = JSON.parse(txt); } catch {
                        alert('Invalid JSON');
                        return;
                    }

                    // EN: Accept both old (targetThemeName) and new (draftTargetTheme) keys
                    const draftTargetTheme = bundle.draftTargetTheme || bundle.targetThemeName || null;

                    // EN: Normalize events → always preview + always have provenance fields
                    const events = Array.isArray(bundle.events) ? bundle.events : [];
                    const normalized = events.map(e => ({
                        ...e,
                        theme: 'preview',
                        draftTargetTheme: (e && e.draftTargetTheme) ? e.draftTargetTheme : draftTargetTheme,
                        sourceTheme: (e && e.sourceTheme)
                            ? e.sourceTheme
                            : (e && e.previewSource && e.previewSource.theme)
                                ? e.previewSource.theme
                                : null
                    }));

                    if (window.PreviewData && PreviewData.set) {
                        PreviewData.set(normalized);
                    } else {
                        alert('PreviewData not ready.');
                        return;
                    }

                    // EN: Update session target theme to match imported bundle
                    if (window.DraftSession && DraftSession.set) {
                        const prev = DraftSession.get ? DraftSession.get() : {};
                        DraftSession.set({
                            targetThemeName: draftTargetTheme,
                            sourceTheme: prev && prev.sourceTheme ? prev.sourceTheme : null,
                            createdAt: (bundle.createdAt || prev.createdAt || new Date().toISOString())
                        });
                    }

                    window.rerenderTimeline?.();
                    window.showToast?.('Draft bundle imported', 1600);
                };

                inp.click();
            }
        );
        importBtn.classList.add('dev-only');
        wrap.appendChild(importBtn);

        exportBtn.classList.add('dev-only');
        wrap.appendChild(exportBtn);

        host.appendChild(wrap);

        // Small hint text
        const hint = document.createElement('div');
        hint.style.cssText = 'margin-top:6px;font-size:11px;opacity:.85;color:#cfcfcf;';
        hint.textContent = 'Note: The inline editor opens only for Preview drafts.';
        host.appendChild(hint);
    }

    document.addEventListener('DOMContentLoaded', mountEditorTools);
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
    // EN: The per-event "theme" field is an internal implementation detail ("preview").
    // Hide/lock it in the editor UI to avoid confusing the user.
    (function lockAndHideThemeField() {
        if (!f.theme) return;

        // Lock (defensive)
        try {
            f.theme.readOnly = true;
            f.theme.disabled = true;
            f.theme.title = 'Internal field. Drafts are staged in "preview".';
        } catch { }

        // Hide the whole row (label + input)
        const row = f.theme.closest('.field');
        if (row) row.style.display = 'none';
    })();

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
        // EN: Hide the raw "Theme" form field for preview drafts.
        // We show the intended target theme in the header badge instead.
        (function syncThemeFieldVisibility() {
            const isPreview = (ev?.theme === 'preview');

            const themeInput = f.theme;
            const themeLabel = themeInput?.previousElementSibling;
            const labelEl = (themeLabel && themeLabel.tagName === 'LABEL') ? themeLabel : null;

            if (isPreview) {
                if (labelEl) labelEl.style.display = 'none';
                if (themeInput) {
                    themeInput.style.display = 'none';
                    themeInput.disabled = true; // prevent accidental edits
                }
            } else {
                // Restore for non-preview events (optional)
                if (labelEl) labelEl.style.display = '';
                if (themeInput) {
                    themeInput.style.display = '';
                    themeInput.disabled = false;
                }
            }
        })();

        // EN: Show source ID for clarity (read-only field in HTML).
        f.id.value = str(ev?.id ?? ev?._id ?? '');
        f.id.dataset.sourceId = (ev?.previewSource?.id || f.id.value);

        // ---------- Theme badge in editor header: show DRAFT TARGET (and optional source) ----------
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

            // EN: Draft target theme = where this draft is intended to end up (NOT "preview")
            const sess = (window.DraftSession && DraftSession.get) ? DraftSession.get() : {};
            const target = ev?.draftTargetTheme || sess?.targetThemeName || '';

            // EN: Source theme = where the event was copied from
            const src = ev?.sourceTheme
                || ev?.previewOriginalTheme
                || ev?.previewSource?.theme
                || DraftUI.parseDraftThemeFromLabel(ev?.label)
                || '';

            if (isPreview) {
                // If you want the cleanest UI: show only target.
                // badge.textContent = target ? `Theme: draft: ${target}` : 'Theme: draft';

                // Slightly more informative: show "(from ...)" when it differs.
                if (target && src && target !== src) badge.textContent = `Theme: draft: ${target} (from ${src})`;
                else if (target) badge.textContent = `Theme: draft: ${target}`;
                else if (src) badge.textContent = `Theme: draft: ${src}`;
                else badge.textContent = 'Theme: draft';
            } else {
                badge.textContent = `Theme: ${ev?.theme || '—'}`;
            }
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

              // EN: Duplicate-to-Preview is triggered from the event InfoBox flow now. v49.71

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

              // EN: In this editor layout, labels do NOT use `for=""`.
              // The DOM order is: <label> ... </label> then <input ...>.
              // So the safest way is to grab the previousElementSibling if it is a LABEL.
              const prev = inputEl.previousElementSibling;
              const label = (prev && prev.tagName === 'LABEL') ? prev : null;

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
      // EN: Editor opens ONLY for Preview events. Everything else must go through the Preview flow.
      window.addEventListener('timeline:edit-event', (e) => {
          const ev = e?.detail?.event;
          if (!ev) return;

          if (ev.theme !== 'preview') {
              // EN: Keep this strict to avoid editing base events by accident.
              if (window.showToast) window.showToast('Editor opens only for Preview drafts. Duplicate to Preview first.', 2200);
              else console.warn('[editor] Edit blocked: only preview drafts can be edited.', ev);
              return;
          }

          openEditor(ev);
      });
  }

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
    let _list = [];

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

        const hasPreview = Array.isArray(_list) && _list.length > 0;

        const out = {
            meta: b.meta || {},
            events: hasPreview ? events.concat(_list) : events.slice(),
            themes: hasPreview ? Array.from(new Set([...themes, PREVIEW_THEME])) : themes.slice(),
            themeColors
        };

        // Only define preview color if preview theme is actually present.
        if (hasPreview && !out.themeColors[PREVIEW_THEME]) out.themeColors[PREVIEW_THEME] = PREVIEW_COLOR;

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
        // EN: Ensure we have a draft target theme before creating preview drafts.
        // Ask once when starting a new draft session.
        let sess = (window.DraftSession && DraftSession.get) ? DraftSession.get() : null;
        if (!sess || !sess.targetThemeName) {
            const suggested = (window.DEFAULT_DRAFT_TARGET_THEME || '').trim();
            const name = prompt('Draft target theme name?', suggested || 'historia');
            if (!name) return { ok: false, reason: 'cancelled' };

            DraftSession.set({
                targetThemeName: name.trim(),
                sourceTheme: null, // EN: no longer used as a guard; can stay null
                createdAt: new Date().toISOString()
            });

            sess = DraftSession.get();
        }

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

        // EN: Build draft label from TARGET theme (not source theme)
        const targetTheme = sess?.targetThemeName || '';

        // EN: Remove any existing "draft: X - " prefix from base label
        const baseLabelClean = (base.label || '')
            .replace(/^draft:\s*[^-]+-\s*/i, '')
            .trim();

        const draftLabel = targetTheme
            ? `draft: ${targetTheme} - ${baseLabelClean} (copy)`
            : `${baseLabelClean} (copy)`;

        const dup = {
            id: newId,
            theme: 'preview',                    // stays in preview for visualization
            label: draftLabel,                 // "draft: <theme> - <label>"
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
            // EN: Session + provenance metadata for cross-theme draft workflows
            draftTargetTheme: (window.DraftSession && DraftSession.get && DraftSession.get().targetThemeName) ? DraftSession.get().targetThemeName : null,
            sourceTheme: origTheme,
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
            // EN: Keep cross-theme provenance on the draft
            existing.draftTargetTheme = (window.DraftSession && DraftSession.get) ? (DraftSession.get().targetThemeName || null) : (existing.draftTargetTheme || null);
            existing.sourceTheme = origTheme || existing.sourceTheme || null;

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
            // EN: Cross-theme draft session metadata
            draftTargetTheme: (window.DraftSession && DraftSession.get) ? (DraftSession.get().targetThemeName || null) : null,
            sourceTheme: origTheme,

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
  let __lastShowTs = 0;        // v49.5: when  InfoBox became visible

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

        // EN: Only preview events are directly editable. Base events can be duplicated into Preview first.
        const isPreview = (ev?.theme === 'preview');

        const actionsHtml = isPreview
            ? `<button class="edit-event" type="button" aria-label="Edit event">Edit event</button>`
            : `<button class="dup-to-preview" type="button" aria-label="Duplicate to Preview for editing">Duplicate to Preview for editing</button>`;

        return `
    <div class="title">${label}</div>
    <div class="meta">${meta}</div>
    ${body}${linkHtml}
    <div class="actions">
    ${actionsHtml}
    </div>`;
    }

    function show(ev, screenBox) {
        __lastUserIntentTs = 0;
        const el = ensureInfoEl();
        el.innerHTML = buildEventHTML(ev);
        // EN: Preview events: open editor. Base events: duplicate into Preview.
        const editBtn = el.querySelector('.edit-event');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('timeline:edit-event', { detail: { event: ev } }));
            });
        }

        const dupBtn = el.querySelector('.dup-to-preview');
        if (dupBtn) {
            dupBtn.addEventListener('click', (e) => {
                e.stopPropagation();

                if (!window.EditorPreviewOps || typeof window.EditorPreviewOps.duplicateFromEventId !== 'function') {
                    alert('Duplicate feature not available (EditorPreviewOps.duplicateFromEventId missing).');
                    return;
                }
                if (!window.PreviewData || !PreviewData.get || !PreviewData.set) {
                    alert('PreviewData not available.');
                    return;
                }
                if (!ev || !ev.id) {
                    alert('Cannot duplicate: event has no id.');
                    return;
                }

                const list = PreviewData.get();
                const isEmpty = !Array.isArray(list) || list.length === 0;
                const baseTheme = (ev.theme || '').trim() || 'unknown';

                let sess = (window.DraftSession && DraftSession.get)
                    ? DraftSession.get()
                    : { targetThemeName: null, sourceTheme: null, createdAt: null };

                if (isEmpty) {
                    const name = prompt('Start draft session.\nDraft theme name (for export/apply later):', baseTheme);
                    if (name == null) return;
                    const trimmed = String(name).trim();
                    if (!trimmed) {
                        if (window.showToast) window.showToast('Theme name required', 1800);
                        return;
                    }
                    sess = { targetThemeName: trimmed, sourceTheme: baseTheme, createdAt: new Date().toISOString() };
                    if (window.DraftSession && DraftSession.set) DraftSession.set(sess);
                    if (window.showToast) window.showToast(`Draft session started: ${sess.targetThemeName}`, 1800);
                } else {
                    if (sess && sess.targetThemeName && window.showToast) {
                        window.showToast(`Added to draft: ${sess.targetThemeName}`, 1600);
                    }
                }

                window.EditorPreviewOps.duplicateFromEventId(ev.id);

                // Ensure Preview becomes visible and active
                document.body.classList.add('editor-controls-open');
                try { window.TimelineAPI?.selectTheme && window.TimelineAPI.selectTheme('preview'); } catch (_) { }
                if (window.rerenderTimeline) window.rerenderTimeline();
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
                __lastShowTs = performance.now(); // arm hide only after box is visible
                el.style.visibility = '';
                el.style.opacity = '';
                el.style.transform = '';
                el.classList.add('is-visible');
            });
        });
    }

    function hide() {
        const now = performance.now();

        // v49.5: do not hide immediately after show (same tap sequence)
        if (now - __lastShowTs < 250) return;

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
            const name = (t.textContent || '').trim();
            // EN: Never auto-select the Preview theme during the startup intro.
            if (name.toLowerCase() === 'preview') return;

            const r = t.getBoundingClientRect();
            const cy = r.top + r.height * 0.5;
            const d = Math.abs(cy - midY);
            if (d < bestDist) {
                bestDist = d;
                nearest = { el: t, x: r.left + r.width * 0.5, y: cy, theme: name };
            }
        });
    const target = nearest || { x: window.innerWidth / 2, y: midY, theme: null };
    moveTouchCursor(cursor, target.x, target.y, true);
    await sleep(520); tapRipple(target.x, target.y);
        if (target.theme && api.selectTheme && String(target.theme).toLowerCase() !== 'preview') {
            api.selectTheme(target.theme);
        }
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
