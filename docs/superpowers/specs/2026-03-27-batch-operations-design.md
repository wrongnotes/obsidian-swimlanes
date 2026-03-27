# Batch Operations — Multi-Card Selection & Actions

## Goal

Allow users to select multiple cards and perform bulk operations (move, delete, tag) on them. Selection is a dedicated mode entered via a toolbar button. Batch move and tag mutations are undoable as single transactions. Batch delete is NOT undoable (consistent with existing single-card delete behavior).

## Selection Mode

### Entering

A "Select" button in the board toolbar (both desktop and mobile). Clicking it enters selection mode. This is NOT placed on the undo stack.

### Exiting

- X button on the floating action bar
- Escape key (only when no popover/menu is open — Escape closes the innermost open UI element first)

Exiting clears the selected set and removes all selection UI. Not undoable. All selection-only undo operations are purged from the undo stack on exit — batch data transactions (move/tag) remain.

### Undo Stack Purge

The `UndoManager` needs a new `purgeByType(type)` method that removes transactions matching a predicate from both the undo and redo stacks. Selection operations use a new `SelectionChange` undo operation type (see below). On selection mode exit, all transactions whose operations are exclusively `SelectionChange` are removed from both stacks. Transactions containing a mix of selection and data operations are left intact (though this shouldn't occur in practice since selection changes and data changes are separate transactions).

### Card Interaction

In selection mode, clicking/tapping a card toggles it in/out of the selected set instead of opening the note. The toggle is triggered by a `click` event handler on the card (not pointer events), registered only while selection mode is active. Drag-and-drop pointer handlers are not registered in selection mode, so there is no conflict.

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

`onDataUpdated()` triggers `rebuildBoard()`. The selected set persists by file path. After render, selection state is re-applied by matching paths. Cards whose files were deleted are silently pruned from the set. Cards that moved to a different column (via external change) remain selected in their new position.

## Floating Action Bar

### Position

Fixed to the bottom of the board container (not the viewport). Horizontally centered with rounded corners and slight elevation/shadow. Must not obscure add-card buttons — the card list gets bottom padding to compensate. Coexists with the existing undo float (`.swimlane-undo-float`) — the action bar sits below the undo float, or the undo float repositions above it.

### Contents

- Selected count label: "N cards selected" (singular: "1 card selected")
- Quick-select buttons: **Select all** | **Deselect all**
- Action buttons: **Move to...** | **Tag...** | **Delete**
- **X** button to exit selection mode

Action buttons (Move, Tag, Delete) are disabled when nothing is selected. The bar is visible for the entire duration of selection mode, even with 0 selected.

### Styling

Uses Obsidian CSS variables for background, text, borders, shadow — consistent with existing plugin UI.

## Quick-Select Helpers

### Column Menu Additions

Appended to the existing column context menu:

- **Select all in column** — adds all cards in that column to the selected set. If selection mode isn't active, enters it first. (Note: if the user then undoes, the selection is reverted but the user remains in selection mode with 0 selected. This is intentional — entering selection mode is never undoable.)
- **Deselect all in column** — removes all cards in that column from the selected set. Only shown when selection mode is active.

### Action Bar Buttons

- **Select all** — selects every card on the board across all columns
- **Deselect all** — clears the selected set but stays in selection mode

### Undo

All selection changes are pushed to the undo stack as selection-only operations using a new `SelectionChange` undo operation type:

```typescript
| {
      type: "SelectionChange"
      previousSelection: Set<string>  // file paths before the change
      newSelection: Set<string>        // file paths after the change
  }
```

Each selection action (individual toggle, select all, deselect all, select/deselect column) creates one transaction with one `SelectionChange` operation capturing the full before/after state of the selected set.

Undoing restores the `previousSelection` set; redoing restores the `newSelection` set. These transactions are purged from both undo and redo stacks when selection mode is exited.

## Batch Actions

### Move To

Opens a menu listing all columns (reuses the same column list pattern as the single-card "Move to" submenu).

- Cards already in the target column are silently skipped
- Each moved card's swimlane property is set via `processFrontMatter`
- Automation mutations apply per-card: each card gets its own `matchRules()` call and stores its own `resolvedAutomationMutations` and `automationPreviousValues` in the undo operation
- Moved cards get new ranks appended to the end of the target column, preserving their current relative order. Ranks are generated using `generateSpacedRanks(count)` starting after the current last rank in the target column.
- One undo transaction ("Move N cards") containing N individual `MoveCard` operations, one per moved card — each with its own automation state
- Selection mode stays active after the move, selected set preserved

### Delete

- Confirmation modal: "Delete N cards? This will trash N notes."
- Each file trashed via `app.fileManager.trashFile()`
- NOT undoable — consistent with existing single-card delete (there is no `DeleteCard` undo operation type, and `trashFile` is a one-way Obsidian API call)
- Exits selection mode after delete (selected cards no longer exist)

### Tag

Opens a popover with two sections:

**Add tags:** Tag input with autocomplete (reuses existing `TagSuggest`). Type a tag and press Enter to add it to all selected cards. Cards that already have the tag are silently skipped.

**Remove tags:** Displays the union of all tags across all selected cards, each as a removable chip. Clicking the X removes that tag from all selected cards. Cards that don't have the tag are a silent no-op.

The popover stays open for multiple add/remove operations. Dismissed with outside click or Escape (Escape closes only the popover, not selection mode).

#### Tag Transaction Semantics

One undo transaction for the entire tag editing session: "Edit tags on N cards". The transaction is structured as follows:

- **On popover open**: snapshot the current tags for every selected card (`previousTags` per file)
- Individual add/remove operations write immediately via `processFrontMatter` per affected card. The remove-tags chip list updates reactively as tags are removed.
- **On popover close**: snapshot the final tags for every affected card (`newTags` per file). Commit the transaction with one `EditTags` operation per affected card, each storing `previousTags` and `newTags`. Cards whose tags didn't change are excluded.
- The undo transaction is held open (`beginTransaction` on popover open, `endTransaction` on popover close). During the open transaction, `rebuildBoard()` calls from `onDataUpdated` must preserve the popover — the popover is anchored to the action bar (not a specific card), so it naturally survives card re-rendering. The remove-tags chip list re-reads the union of tags from the current selected set after each rebuild.

Writes via `processFrontMatter` per card.

Selection mode stays active after the popover closes.

## Mobile

- Enter selection mode via the same toolbar "Select" button
- Tap cards to toggle selection
- Floating action bar sits at the bottom of the board, above the carousel dot indicator
- Tag popover renders as a full-width bottom sheet for easier touch interaction, dismissed via close button or drag-down gesture
- DnD is disabled in selection mode, so no conflict with long-press-to-drag

## Out of Scope

- Keyboard shortcuts for selection (Ctrl+A, Shift+click range select) — can be added later
- Additional batch actions beyond move/delete/tag — extensible via the action bar
