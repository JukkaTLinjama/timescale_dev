# History Timeline – v46.5

**Date:** Oct 30, 2025**  
**Scope:** Inline event editor integration**  
**Goal:** Add a live event editor panel that opens below the InfoBox, showing all data fields from `eventsDB`.

---

## 1) Overview
Version 46.5 introduces a **non‑modal inline editor** for inspecting and editing event data directly in the main view.  
When a user clicks **“Edit event”** in an event’s InfoBox, a dark inline panel opens below, displaying all fields from the event object (`label`, `year`, `theme`, `comments`, `link`, `source`, `tags`, `edited_by`, etc.).

This editor is purely visual for now (no saving yet); the next version will enable writing back to `eventsDB`.

---

## 2) InfoBox “Edit event” button

**Old behavior:**  
> Tip: click outside to close.

**New behavior:**  
> “Edit event” button replaces the tip and emits a custom DOM event `timeline:edit-event`.

**Event structure:**
```js
window.dispatchEvent(new CustomEvent('timeline:edit-event', {
  detail: { event: ev }
}));
```

This allows other parts of the app (like the new editor panel) to react automatically.

---

## 3) Inline editor layout

**HTML structure:**
```html
<div id="event-editor" hidden>
  <div class="editor-header">
    <div class="editor-title">Edit event</div>
    <button id="close-editor" title="Close editor">×</button>
  </div>

  <div class="editor-body">
    <!-- core fields -->
    <label>Title</label> <input id="edit-title">
    <label>Year</label> <input id="edit-year">
    <label>Description</label> <textarea id="edit-desc"></textarea>
    <label>Theme</label> <input id="edit-theme">

    <!-- meta & link fields -->
    <label>ID</label> <input id="edit-id" readonly>
    <label>Date</label> <input id="edit-date">
    <label>Link text</label> <input id="edit-link-text">
    <label>Link URL</label> <input id="edit-link-url">
    <label>Source</label> <input id="edit-source">
    <label>Tags</label> <input id="edit-tags">
    <label>Edited by</label> <input id="edit-edited-by">
    <label>Edited at</label> <input id="edit-edited-at">
    <label>Created by</label> <input id="edit-created-by">
    <label>Created at</label> <input id="edit-created-at">
  </div>
</div>
```

---

## 4) JavaScript integration

**Behavior:**
- When InfoBox dispatches `timeline:edit-event`, the editor opens and fills all fields.  
- Close with × button.  
- No saving yet (read‑only UI).

---

## 5) Supported event fields

| Field | Description | Typical source key(s) |
|--------|--------------|-----------------------|
| **Title** | Main label | `label`, `display_label` |
| **Year/Date** | Temporal info | `year`, `date`, `iso_date` |
| **Description** | Comments/body text | `comments`, `display_comments`, `body` |
| **Theme** | Theme name | `theme` |
| **ID** | Internal unique id | `id`, `_id` |
| **Link text / URL** | Primary external link | `link.text/url`, `url`, `href`, `link_text` |
| **Source** | Citation/reference | `source`, `ref`, `reference` |
| **Tags** | Comma‑separated keywords | `tags`, `keywords` |
| **Edited by / at** | Last editor metadata | `edited_by`, `edited_at` |
| **Created by / at** | Creation metadata | `created_by`, `created_at` |

---

## 6) Future roadmap

| Version | Planned feature |
|----------|-----------------|
| **v46.6** | “Save changes” button → updates `TS_DATA.events` in memory |
| **v46.7** | JSON export/import for edited events |
| **v47+** | Inline validation + changed‑field highlight |

---

**Author:** Jukka Linjama  
**Version:** 46.5  
**Files touched:** `index.html`, `style.css`  
**Dependencies:** none (pure HTML/CSS/JS)
