# Batch Operations — Multi-Card Selection & Actions

## Goal

Allow users to select multiple cards and perform bulk operations (move, delete, tag) on them. Selection is a dedicated mode entered via a toolbar button. All batch data mutations are undoable as single transactions.

## Selection Mode

### Entering

A "Select" button in the board toolbar (both desktop and mobile). Clicking it enters selection mode. This is NOT placed on the undo stack.

### Exiting

- X button on the floating action bar
- Escape key

Exiting clears the selected set and removes all selection UI. Not undoable. All selection-only undo operations are purged from the undo stack on exit — batch data transactions (move/delete/tag) remain.

### Card Interaction

In selection mode, clicking/tapping a card toggles it in/out of the selected set instead of opening the note. Drag-and-drop is disabled while selection mode is active to avoid conflicts.

Selected cards receive a `.swimlane-card--selected` CSS class (visual treatment: border highlight or subtle background tint using Obsidian CSS variables).

### Selection Scope

Selection works across columns. Cards from any column can be selected simultaneously.

## SelectionManager

A new class that owns all selection state and UI:

- `active: boolean` — whether selection mode is on
- `selected: Set<string>` — file paths of selected cards
- Methods: `toggle(path)`, `selectAll()`, `deselectAll()`, `selectColumn(groupKey)`, `deselectColumn(groupKey)`, `enter()`, `exit()`
- Callbacks to the view for re-rendering cards and the action bar

The view creates the `SelectionManager` and wires it into card rendering and the rebuild cycle.

### Surviving Rebuilds

`onDataUpdated()` triggers `rebuildBoard()`. The selected set persists by file path. After render, selection state is re-applied by matching paths. Cards whose files were deleted are silently pruned from the set.

## Floating Action Bar

### Position

Fixed to the bottom of the board container (not the viewport). Horizontally centered with rounded corners and slight elevation/shadow. Must not obscure add-card buttons — the card list gets bottom padding to compensate.

### Contents

- Selected count label: "N selected"
- Quick-select buttons: **Select all** | **Deselect all**
- Action buttons: **Move to...** | **Tag...** | **Delete**
- **X** button to exit selection mode

Action buttons (Move, Tag, Delete) are disabled when nothing is selected. The bar is visible for the entire duration of selection mode, even with 0 selected.

### Styling

Uses Obsidian CSS variables for background, text, borders, shadow — consistent with existing plugin UI.

## Quick-Select Helpers

### Column Menu Additions

Appended to the existing column context menu:

- **Select all in column** — adds all cards in that column to the selected set. If selection mode isn't active, enters it first.
- **Deselect all in column** — removes all cards in that column from the selected set. Only shown when selection mode is active.

### Action Bar Buttons

- **Select all** — selects every card on the board across all columns
- **Deselect all** — clears the selected set but stays in selection mode

### Undo

All selection changes are pushed to the undo stack as selection-only operations:

- Individual card toggle (select/deselect)
- Select all / Deselect all
- Select all in column / Deselect all in column

Undoing restores the previous selected set state. These operations are purged from the undo stack when selection mode is exited.

## Batch Actions

### Move To

Opens a menu listing all columns (reuses the same column list pattern as the single-card "Move to" submenu).

- Cards already in the target column are silently skipped
- Each moved card's swimlane property is set via `processFrontMatter`
- Automation mutations apply per-card (same as single-card move)
- Moved cards get new ranks appended to the end of the target column, preserving their current relative order
- One undo transaction: "Move N cards"
- Selection mode stays active after the move, selected set preserved

### Delete

- Confirmation modal: "Delete N cards? This will trash N notes."
- Each file trashed via `app.fileManager.trashFile()`
- One undo transaction: "Delete N cards"
- Exits selection mode after delete (selected cards no longer exist)

### Tag

Opens a popover with two sections:

**Add tags:** Tag input with autocomplete (reuses existing `TagSuggest`). Type a tag and press Enter to add it to all selected cards. Cards that already have the tag are silently skipped.

**Remove tags:** Displays the union of all tags across all selected cards, each as a removable chip. Clicking the X removes that tag from all selected cards. Cards that don't have the tag are a silent no-op.

The popover stays open for multiple add/remove operations. Dismissed with outside click or Escape.

One undo transaction for the entire tag editing session (all adds and removes while the popover is open): "Edit tags on N cards".

Writes via `processFrontMatter` per card.

Selection mode stays active after the popover closes.

## Mobile

- Enter selection mode via the same toolbar "Select" button
- Tap cards to toggle selection
- Floating action bar sits at the bottom of the board, above the carousel dot indicator
- Tag popover renders as a full-width bottom sheet for easier touch interaction
- DnD is disabled in selection mode, so no conflict with long-press-to-drag
