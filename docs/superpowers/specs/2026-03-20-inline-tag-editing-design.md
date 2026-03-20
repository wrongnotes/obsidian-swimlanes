# Inline Tag Editing on Cards

## Overview

Add the ability to edit tags directly on swimlane cards. The entry point is a context menu item ("Edit tags…"), which transforms the card's tag row into an inline editor with removable chips, autocomplete input, and a done button.

## Interaction Flow

1. User right-clicks a card (or taps the menu button on mobile) → context menu appears.
2. User clicks "Edit tags…" → the card's tag row enters **edit mode**.
3. In edit mode:
   - Existing tags render as chips with an × remove button.
   - A text input with "Add tag…" placeholder appears after the chips.
   - `TagSuggest` autocomplete is attached to the input.
   - A small checkmark (✓) button appears at the end for explicit dismiss.
4. **Adding a tag:** User types in the input, selects a suggestion or presses Enter. The tag is added immediately via frontmatter write-back.
5. **Removing a tag:** User clicks the × on a chip. The tag is removed immediately via frontmatter write-back.
6. **Dismissing:** Clicking outside the editor (blur) or clicking the ✓ button exits edit mode. The card re-renders with the latest tag state.

## Architecture

### Entry Point — `showCardMenu()` in `swimlane-card.ts`

Add an "Edit tags…" menu item. On click, it calls a callback provided via `CardRenderOptions`.

New option on `CardRenderOptions`:
```ts
/** Called when the user selects "Edit tags…" from the context menu. */
onEditTags?: (cardEl: HTMLElement) => void
```

The view provides this callback as a closure that captures `app`, `entry`, and the view instance. The callback:
1. Sets `editingTagsPath` on the view to protect the card from re-render.
2. Calls `renderTagEditor()` to transform the tag row in-place.

### Tag Editor — `renderTagEditor()` in `swimlane-card.ts`

New exported function:
```ts
function renderTagEditor(
    cardEl: HTMLElement,
    file: TFile,
    currentTags: string[],
    app: App,
    onDone: () => void,
): void
```

Behavior:
- Finds (or creates) the `.swimlane-card-tags` container on the card's content area.
- Clears it and re-renders as editable: chip spans with × buttons, a text input, and a ✓ button.
- Adds `.swimlane-card-tags--editing` class to the container.
- Attaches `TagSuggest` to the input for autocomplete.
- Maintains a local `tags: string[]` array (copied from `currentTags`).
- Each add/remove:
  - Updates the local array.
  - Re-renders the chips.
  - Writes immediately: `app.fileManager.processFrontMatter(file, fm => { fm.tags = [...tags] })`.
- Dismiss triggers: `focusout` on the container (when `relatedTarget` is outside) or ✓ button click.
- Uses a `settled` flag to prevent double-firing of `onDone()`.
- On dismiss, calls `onDone()` which clears `editingTagsPath` and triggers board re-render.

### Re-render Protection — `swimlane-view.ts`

While a card is in edit mode, `renderBoard()` must not destroy the editing card's DOM element.

Approach: **Detach-and-reattach.**
- `SwimlaneView` stores `editingTagsPath: string | null` and `editingTagsCardEl: HTMLElement | null`.
- Before `this.boardEl.empty()`, if `editingTagsPath` is set, detach the card element from the DOM (remove from parent but keep reference).
- After rebuilding the board, find the card list for the column the editing card belongs to and reattach the preserved card element at the correct position (by matching `data-path`).
- On dismiss (`onDone`), clear both fields and trigger a final re-render to replace the stale card with a fresh one.

This is simple and doesn't require refactoring the full-rebuild approach.

### Undo

New `UndoOperation` variant:
```ts
| {
      type: "EditTags"
      file: TFile
      previousTags: string[]
      newTags: string[]
  }
```

Undo/redo handlers in `apply.ts`:
- **Undo:** `processFrontMatter(file, fm => { fm.tags = op.previousTags })` (or `delete fm.tags` if `previousTags` is empty).
- **Redo:** `processFrontMatter(file, fm => { fm.tags = op.newTags })` (or `delete fm.tags` if `newTags` is empty).

Transaction flow:
- The `onEditTags` callback in the view captures `previousTags` (current tags at edit start).
- The `onDone` callback reads the final tags from frontmatter cache, and if they differ from `previousTags`, pushes a single `EditTags` operation as a one-operation transaction.
- This avoids the need for an open transaction during editing (which would conflict with other operations like undo/redo while editing).

### Styling — `styles.css`

New selectors:
- `.swimlane-card-tags--editing` — edit mode container. Same flex layout as read-only, but with a subtle background or border to indicate editability.
- `.swimlane-card-tag--editable` — chips in edit mode with × button visible.
- `.swimlane-card-tag-remove` — × button inside chip. Small, muted color, hover shows accent.
- `.swimlane-tag-input` — inline text input. Transparent background, no border, matching card font size. Flex-grows to fill remaining space.
- `.swimlane-tag-done-btn` — small checkmark button at the end. Muted, hover accent.

All styles use Obsidian CSS variables for theme consistency.

## Files Modified

| File | Changes |
|------|---------|
| `src/swimlane-card.ts` | Add "Edit tags…" menu item, `renderTagEditor()` function, `onEditTags` callback in options |
| `src/swimlane-view.ts` | Provide `onEditTags` callback, re-render protection (detach/reattach), undo transaction on dismiss |
| `src/swimlane-card.test.ts` | Tests for tag editor rendering, add/remove chip behavior |
| `src/undo/types.ts` | Add `EditTags` operation variant |
| `src/undo/apply.ts` | Add undo/redo handlers for `EditTags` |
| `styles.css` | Edit mode styles |
| `src/inputs/tag-suggest.ts` | No changes (already complete) |

## Edge Cases

- **Card has no tags yet:** "Edit tags…" still works — `renderTagEditor()` creates the `.swimlane-card-tags` container and shows just the input.
- **Tag already exists:** Adding a duplicate is a no-op (deduplicate before write).
- **Empty input on Enter:** Ignored (no empty tags created).
- **Board re-render during editing:** Detach-and-reattach preserves the editing card element.
- **Other undo/redo while editing:** Safe because there's no open transaction during tag editing. The undo transaction is only created on dismiss.
- **Tags property not in Bases view:** "Edit tags…" still appears in context menu. Tags won't render as chips after dismiss unless `note.tags`/`file.tags` is in the properties list, but the frontmatter is still correctly updated.
- **Focus after dismiss:** No explicit focus target — focus returns naturally to wherever the user clicked.
