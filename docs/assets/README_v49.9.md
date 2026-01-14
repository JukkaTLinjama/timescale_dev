# Timescale — v49.9 README
Draft sessions, cross-theme editing, and portable draft bundles

Baseline: v49.5 — optional Editor module on top of a stable renderer  
Intent (v49.9): make event editing safe, portable, and cross-theme by introducing
draft sessions, preview staging, and exportable draft bundles — without touching
the renderer’s core logic.

## 1) What changed since v49.5
v49.9 completes the first real editing workflow:
- Events can be duplicated from any source theme into a single active draft session.
- All edits happen in preview (staging), never directly in production themes.
- Each draft explicitly declares its target theme (draftTargetTheme).
- Drafts can be renamed, exported, imported, and reviewed before committing.
- Clear separation between source theme and target theme.

Renderer behaviour remains unchanged.

## 2) Core concept: Draft Session
A Draft Session represents one editing intent:
“I am currently preparing events that will become theme X.”

Session state:
DraftSession = {
  targetThemeName: "historia 2",
  createdAt: "2026-01-12T10:15:00Z"
}

Rules:
- Exactly one active draft target at a time.
- Drafts may originate from any source theme.
- Renaming the target updates all drafts.

## 3) Draft events (preview)
Drafts live in an internal preview layer.

Key properties:
- theme = "preview" (internal only)
- draftTargetTheme = intended destination
- sourceTheme = origin (optional provenance)

Labels always reflect the target theme.

## 4) UI principles
Visible:
- Editor badge shows draft target theme.
- Draft-prefixed labels.
Hidden:
- Raw preview theme.
- Internal provenance fields.

## 5) Draft target renaming
Renaming updates:
- DraftSession.targetThemeName
- draftTargetTheme on all drafts
- label prefixes

No export/import cycle required.

## 6) Draft bundle format
Bundles are portable JSON artifacts:

{
  "kind": "timescale-draft-bundle",
  "version": 2,
  "draftTargetTheme": "historia 2",
  "events": [...]
}

Import restores preview drafts and target theme, without touching production data.

## 7) Out of scope
- No automatic commit to eventsDB.json
- No backend assumptions
- No renderer persistence

## 8) Planned next step
Commit drafts into a new or existing theme, with explicit conflict rules.

## 9) Changelog
- v49.9: Draft sessions, cross-theme drafts, bundles
- v49.5: Optional Editor module
- v49.2: Stable renderer baseline

## 10) Design philosophy
Editing is intent. Rendering is truth.
Drafts are explicit, reversible, and portable.
