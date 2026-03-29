# Column Collapsing & Context Menu Fix

## Goal

Add collapsible columns to the swimlane board and suppress card context menus during selection mode.

## Column Collapsing

### Collapsed Appearance

A collapsed column renders as a thin vertical strip (~40px wide) replacing the full column. The strip contains:

- The column label rotated 90° (bottom-to-top reading direction)
- A card count badge
- Tooltip on hover showing the full column name

Clicking anywhere on the collapsed strip expands the column.

### Triggering Collapse/Expand

- **Chevron icon** in the column header — small toggle arrow, toggles collapse state
- **Column menu item** — "Collapse" added to the existing column context menu (alongside Move, Hide, Remove). When collapsed, the strip's click-to-expand replaces the need for a menu "Expand" item.

### Persistence

Stored in the `.base` view config as `collapsedSwimlanes: string[]`, parallel to `hiddenSwimlanes`. Persists across sessions.

### Undo

Collapse/expand is a view preference, not a data mutation. No undo tracking — same as hide/show.

### DnD Interaction — Dwell-to-Expand

When dragging a card over a collapsed column:

1. **Hover hint:** A subtle highlight on the collapsed strip indicates it's a potential target.
2. **Dwell threshold (~500ms):** After hovering for ~500ms, the column smoothly expands to full width and becomes a normal drop target with drop indicator.
3. **Drop completes:** If the card is dropped into the dwell-expanded column, it stays expanded. The drop implies intent to work with that column.
4. **Auto-recollapse:** If the drag moves away from the dwell-expanded column without dropping, it re-collapses after ~300ms.
5. **Drag cancelled:** If the drag is cancelled by any means (Escape, drop elsewhere, pointer leaves window, etc.), any dwell-expanded columns recollapse.

**Invariant:** A dwell-expanded column only stays expanded permanently if a card is dropped into it.

### Selection Mode Interaction

- Collapsed columns still show their strip during selection mode.
- **"Select all in column"** on a collapsed column: auto-expands the column, then selects all cards.
- **Collapsing a column with selected cards:** Cards stay selected, collapse proceeds normally.

### Rendering

In `rebuildBoard()`, collapsed columns render as the thin strip instead of the full column. The card list is not rendered for collapsed columns (cards still exist in the data, just not in the DOM). The strip is inserted in the same position as the full column would be in the swimlane order.

## Context Menu Suppression in Selection Mode

In selection mode:

- The `contextmenu` event listener on cards calls `e.preventDefault()` and does not show a menu.
- The mobile inline menu button (`.swimlane-card-menu-btn`) is hidden during selection mode.

This is a fix — the card context menu (Open note, Move to, Edit tags, Delete) currently opens in selection mode, which is confusing since the user is in a batch-editing context and the action bar already provides batch actions.
