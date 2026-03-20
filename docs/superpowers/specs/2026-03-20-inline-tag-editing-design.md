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

Add an "Edit tags…" menu item. On click, it calls a callback provided via `CardRenderOptions` that puts the card into edit mode.

New option on `CardRenderOptions`:
```ts
/** Called when the user selects "Edit tags…" from the context menu. */
onEditTags?: (cardEl: HTMLElement, entry: BasesEntry) => void
```

The view (`swimlane-view.ts`) provides this callback, which:
1. Marks the card as "editing" (stores `entry.file.path` on the view).
2. Calls `renderTagEditor()` to transform the tag row in-place.

### Tag Editor — `renderTagEditor()` in `swimlane-card.ts`

New exported function that takes a card element, the current tags, the `App`, the file, and an `onDone` callback.

Behavior:
- Finds (or creates) the `.swimlane-card-tags` container on the card.
- Clears it and re-renders as editable: chip spans with × buttons, a text input, and a ✓ button.
- Attaches `TagSuggest` to the input.
- Each add/remove writes immediately: `app.fileManager.processFrontMatter(file, fm => { fm.tags = newTags })`.
- On blur of the entire editor container (using `focusout` + `relatedTarget` check) or ✓ click, calls `onDone()`.
- Uses a settled flag to prevent double-firing.

### Re-render Protection — `swimlane-view.ts`

While a card is in edit mode, the board must not destroy that card element (which would lose focus and the editor state).

Approach:
- `SwimlaneView` stores `editingTagsPath: string | null`.
- In `renderBoard()`, when rebuilding the card list for a column, if an entry's path matches `editingTagsPath`, skip re-rendering that card — leave the existing DOM element in place.
- On dismiss (`onDone`), clear `editingTagsPath` and trigger a re-render to pick up the latest state.

### Undo

Tag edits are batched into a single undo transaction:
- **On enter edit mode:** Open an undo transaction capturing the original tags array.
- **On dismiss:** Commit the transaction with the final tags array.
- Undo restores the original tags via `processFrontMatter`.

### Styling — `styles.css`

New/modified selectors:
- `.swimlane-card-tags--editing` — edit mode container, keeps flex layout.
- `.swimlane-card-tag--editable` — chips with × button, `cursor: default`.
- `.swimlane-card-tag-remove` — × button inside chip, styled subtly (muted color, hover accent).
- `.swimlane-tag-input` — inline text input, transparent background, no border, matching card font size.
- `.swimlane-tag-done-btn` — small checkmark button, muted, hover accent.

All styles use Obsidian CSS variables for theme consistency.

## Files Modified

| File | Changes |
|------|---------|
| `src/swimlane-card.ts` | Add "Edit tags…" menu item, `renderTagEditor()` function, `onEditTags` callback in options |
| `src/swimlane-view.ts` | Provide `onEditTags` callback, re-render protection (`editingTagsPath`), undo transaction |
| `src/swimlane-card.test.ts` | Tests for tag editor rendering, add/remove chip behavior |
| `styles.css` | Edit mode styles |
| `src/inputs/tag-suggest.ts` | No changes (already complete) |

## Edge Cases

- **Card has no tags yet:** "Edit tags…" still works — creates the tag row container and shows just the input.
- **Tag already exists:** Adding a duplicate tag is a no-op (deduplication before write).
- **Empty input on Enter:** Ignored (no empty tags created).
- **Board re-render during editing:** Protected — editing card element preserved in DOM.
- **Tags property not in Bases view:** "Edit tags…" menu item still appears (tags are a frontmatter concept independent of Bases property selection). Tags just won't render as chips on the card after dismiss unless `note.tags`/`file.tags` is in the properties list.
