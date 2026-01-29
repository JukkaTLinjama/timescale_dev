# Timescale Project – Status Overview (v50.2)

This repository is the **meta-level project hub** for the Timescale logarithmic timeline initiative.

It contains:

- architectural documentation
- development history snapshots
- screenshots and assets
- links to the active runtime and editor repositories

This document describes the **current project status at v50.2**, relative to the last documented baseline (**v43**).

---

## What Timescale Is

Timescale is an experimental visualization project that explores **history across extreme time scales**, from the Big Bang to the present day, using a **vertical logarithmic timeline**.

The core idea is to make:

- cosmic time
- biological evolution
- human history
- modern technological time

visible within a single, continuous visual structure.

---

## Role of This Repository (Meta Repo)

`timescale-project` is **not** the runtime application.

Its role is to:

- document architectural decisions
- track development phases and milestones
- provide a stable overview of the project as a whole
- act as an entry point for contributors and collaborators

The actual running timeline and editor live in **separate repositories**.

---

## Status at v50.2 (High-Level)

As of v50.2, the project has reached a **structurally stable phase**.

Key characteristics:

- Clear separation between **renderer**, **editor**, and **data**
- Deterministic, data-driven rendering
- Stable mobile behavior
- Explicit and enforced data workflows
- Reduced coupling between UI layers

The system is now designed to be:

- predictable
- debuggable
- extensible

rather than exploratory or tightly coupled.

---

## Architectural Overview (Conceptual)

At a high level, the system is organized into three layers:

1. **Data**
   - Canonical event database (JSON)
   - Deterministic, exportable as-is

2. **Rendering**
   - Pure timeline renderer
   - No data mutation
   - No editor logic

3. **Editing & Workflow**
   - Draft-based editing
   - Explicit import/export
   - No implicit merging into published data

This separation did not fully exist at v43 and is a defining change in the v50.x line.

---

## Relation to v43 Documentation

The previous documented baseline (v43) described an earlier stage where:

- responsibilities were more fluid
- rendering and editing logic overlapped
- some behavior depended on DOM feedback

Since then, the architecture has been **intentionally tightened**.

A detailed description of this evolution is available here:

👉 **Development_Status_Since_v43.md**

This v50.2 document should be read as the **new high-level snapshot**, not as a migration guide.

---

## What v50.2 Does *Not* Try to Solve

Deliberately out of scope at this stage:

- backend services
- multi-user collaboration
- automatic publishing pipelines
- localization and translation
- performance optimization beyond current needs

The focus of v50.2 is **conceptual and structural correctness**, not feature breadth.

---

## Screenshots

Screenshots illustrating the current state (v50.2) are included in the `assets/` directory and referenced from the main README.

They demonstrate:

- the stabilized timeline layout
- editor preview and draft workflows
- present-time and info overlays

---

## Project Direction

With v50.2, Timescale transitions from a phase of **architectural exploration** to one of **incremental refinement**.

Future work is expected to focus on:

- content expansion
- UX polish
- documentation quality
- optional narrative or guided modes

rather than fundamental restructuring.

---

## Summary

v50.2 represents a point where:

- the core model is stable
- responsibilities are clearly defined
- further development can proceed without rethinking foundations

This repository serves as the **reference frame** for that state.
