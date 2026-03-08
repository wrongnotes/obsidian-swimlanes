# Obsidian Swimlanes — Product Plan

## Overview

An Obsidian plugin that renders a fully interactive Kanban-style swimlane board on top of Obsidian's **Base** core plugin. The swimlane view lives in a dedicated workspace tab and provides drag-and-drop card management with bidirectional sync to Base — changes in the board immediately update the underlying Base database, and changes in Base are reflected in the board.

---

## Goals

- Give Obsidian users a first-class Kanban board experience without leaving the app
- Treat the Base plugin as the authoritative data store; the swimlane is purely a view/interaction layer
- Ship a complete, daily-usable v1 (no feature-gated future work)

## Non-Goals (v1)

- Row/lane grouping (two-dimensional grid) — flat columns only
- Embedded code-block rendering (dedicated tab only)
- Mobile support (desktop-first; `isDesktopOnly` may be set to `true`)
- Multi-database aggregation views

---

## Architecture

### Data Layer: Base Plugin Integration

The Base plugin is Obsidian's built-in database system. Since its public API is not yet well-documented, **the first engineering milestone is to reverse-engineer / research how Base exposes its data model**. Key questions to answer:

1. How do we enumerate databases (Base "tables") in the vault?
2. What is the API surface for reading rows and their properties?
3. Can we write property values back via the API, or must we patch note frontmatter directly?
4. Does Base emit events when records change (for reactive UI updates)?

Investigation approaches:

- Inspect Base plugin source in the Obsidian app bundle
- Search the Obsidian developer Discord / forum for community findings
- Prototype a minimal read from a Base table to validate the approach

### View Layer

A custom `ItemView` (`SwimlanesView`) registered with the workspace. Renders entirely with the Obsidian CSS variable system so it adapts to any community theme.

### Configuration Layer

Per-database configuration stored alongside each Base database (or keyed by database ID in plugin data). Each database can have independent column definitions, visible card fields, filter presets, and sort settings.

---

## Feature Specification

### 1. Opening the View

- A **command palette command** ("Open Swimlane board") opens the view in a new or existing leaf
- A **ribbon icon** provides a one-click shortcut
- On open, the user selects which Base database to display (dropdown of available databases)

### 2. Column Configuration

Columns represent user-defined workflow stages (e.g. Backlog, In Progress, Review, Done).

- Columns map to values of a chosen **status property** in the Base database
- The user configures columns in the **plugin settings panel** for each database:
  - Add / remove / rename columns
  - Reorder columns via drag-and-drop
  - Define which property value each column represents
  - Optionally define a "catch-all" column for unrecognised values

### 3. Card Rendering

Each card represents one Base record (note). Cards display:

| Element                | Detail                                                                     |
| ---------------------- | -------------------------------------------------------------------------- |
| **Title**              | Note filename / Base record name                                           |
| **Excerpt**            | First ~2 lines of note body (configurable character limit)                 |
| **Frontmatter fields** | User picks which Base properties to show; rendered as `label: value` pairs |
| **Tags**               | Displayed as coloured chips; colours derived from Obsidian tag system      |

Visible fields are configured per-database in settings.

### 4. Card Interactions

#### Drag and Drop

- Cards are draggable between columns using the HTML5 Drag and Drop API (or a lightweight library such as `@dnd-kit/core` if it bundles small enough, otherwise vanilla DnD)
- Dropping a card on a column sets that column's property value on the Base record / note frontmatter
- Visual feedback: column highlights on hover, ghost card follows cursor

#### Click to Open

- Clicking a card's title opens the linked note in a new leaf (respects Obsidian's modifier-key conventions: `Ctrl`/`Cmd` = new tab, `Alt` = split)

#### Inline Field Editing

- Non-title fields shown on the card are editable in place
- Clicking a field value turns it into an appropriate input (text, date picker, dropdown for select fields)
- Committing the edit writes back to the Base record / frontmatter

#### Add New Card (Inline Create)

- Each column has an **"+ Add card"** button at its bottom
- Clicking reveals a text input at the bottom of the column
- User types the note title and presses `Enter` to create
- The new note is created with the column's status value pre-set and added to the active Base database
- `Escape` cancels without creating

### 5. Card Ordering — LexoRank

Cards are ordered within columns using **LexoRank**, the same ranking system used by Trello and Jira. This gives smooth reordering without renumbering all sibling ranks.

- A dedicated `rank` property is stored on each Base record
- New cards are assigned a rank at the bottom of their column
- Drag-drop reordering computes a new LexoRank between the surrounding cards and updates the record
- When ranks become too dense (bucket exhaustion), the system rebalances ranks in the background

**Custom sorts per view:** Users can override LexoRank with a property-based sort (e.g. sort by `due_date` ascending, `priority` descending). This is a per-view, non-destructive setting — the `rank` field is never modified when a custom sort is active. Custom sorts can be saved as part of filter presets (see §6).

### 6. Filtering and Search

#### Text Search

- A search bar at the top of the board filters cards live by title and visible field content
- Filtering is client-side (no re-query); hidden cards remain in the DOM as `display: none` to preserve column heights

#### Property Filters

- A filter builder lets users add conditions: `property operator value` (e.g. `assignee = Alice`, `priority >= High`)
- Multiple conditions are ANDed together
- Active filters are shown as chips in the toolbar; click a chip to remove it

#### Saved Filter Presets

- Users can name and save a combination of active filters + sort setting as a **preset**
- Presets are stored per-database in plugin data
- A dropdown in the toolbar lists presets; selecting one applies the filter and sort instantly
- Presets can be renamed or deleted from the settings panel

### 7. Settings Panel

Accessible from Obsidian's plugin settings. Organised by database:

**Per-database settings:**

- Status property (which field drives column placement)
- Column definitions (name, property value, order)
- Card fields (which properties to show on cards, in what order)
- Saved filter presets (view and delete)

**Global settings:**

- Card excerpt length (number of characters, default 120)
- Default leaf behaviour (same tab / new tab / split)

---

## UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ [Database: My Tasks ▾]   [Search...]  [Filters ▾]  [Preset ▾]  │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│  Backlog (4) │ In Progress  │   Review (2) │    Done (7)        │
│              │     (3)      │              │                    │
│ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐      │
│ │ Card A   │ │ │ Card D   │ │ │ Card F   │ │ │ Card H   │      │
│ │ #tag     │ │ │ Alice    │ │ │ Bob      │ │ │          │      │
│ │ excerpt… │ │ │ Due 3/12 │ │ │ excerpt… │ │ │          │      │
│ └──────────┘ │ └──────────┘ │ └──────────┘ │ └──────────┘      │
│ ┌──────────┐ │              │              │                    │
│ │ Card B   │ │              │              │                    │
│ └──────────┘ │              │              │                    │
│              │              │              │                    │
│ + Add card   │ + Add card   │ + Add card   │ + Add card         │
└──────────────┴──────────────┴──────────────┴────────────────────┘
```

- Column headers show the stage name and card count
- Columns scroll vertically independently
- Board scrolls horizontally if columns overflow the pane width

---

## Technical Stack

| Concern       | Choice                                                                  |
| ------------- | ----------------------------------------------------------------------- |
| Language      | TypeScript (existing project setup)                                     |
| Build         | esbuild (existing config)                                               |
| UI rendering  | Vanilla DOM / Obsidian API (no framework — keeps bundle small)          |
| Drag and drop | Vanilla HTML5 DnD API (revisit if accessibility gaps arise)             |
| LexoRank      | Custom implementation or small JS library (e.g. `lexorank` npm package) |
| Styling       | CSS using Obsidian CSS variables; scoped to plugin container            |

---

## Milestones

### M0 — Research & Spike (prerequisite)

- [ ] Reverse-engineer Base plugin data model (read records, properties, write-back mechanism)
- [ ] Confirm whether Base emits change events or requires polling
- [ ] Document findings in `docs/base-api-notes.md`
- [ ] Prototype: render a list of records from a Base database in a custom leaf

### M1 — Static Board Render

- [ ] Register `SwimlanesView` as a custom leaf
- [ ] Command + ribbon icon to open the view
- [ ] Database selector
- [ ] Read records from Base and render cards in user-configured columns
- [ ] Obsidian-native CSS skeleton

### M2 — Drag and Drop + LexoRank

- [ ] Drag cards between columns (updates status property)
- [ ] LexoRank ordering within columns
- [ ] Drag to reorder within a column

### M3 — Card Interactions

- [ ] Click-to-open note
- [ ] Inline field editing (write-back to Base / frontmatter)
- [ ] Inline card creation (+ Add card)

### M4 — Filtering, Search, Presets

- [ ] Live text search
- [ ] Property filter builder
- [ ] Custom sort by property
- [ ] Saved filter presets

### M5 — Settings & Polish

- [ ] Full settings panel (per-database column config, card fields, presets)
- [ ] Reactive updates (board refreshes when Base data changes)
- [ ] Visual polish, accessibility pass
- [ ] README + plugin manifest finalised

---

## Open Questions

1. **Base write-back mechanism**: Can we call a Base API to update a record, or must we directly manipulate frontmatter YAML? The answer determines how we handle writes and conflict resolution.
2. **Base change events**: Does Base provide an event we can subscribe to for reactive updates, or do we need to watch file changes via Obsidian's `vault.on('modify', ...)`?
3. **LexoRank storage**: Should the rank field be a Base property (visible to the user) or stored separately in plugin data keyed by note path?
4. **Bundle size**: If `@dnd-kit` or a LexoRank library adds significant weight, evaluate alternatives or write minimal custom implementations.
5. **Conflict resolution**: If a note is renamed or deleted while the board is open, how should the board handle stale cards?
