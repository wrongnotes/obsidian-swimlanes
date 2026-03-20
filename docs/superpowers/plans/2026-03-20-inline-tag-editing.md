# Inline Tag Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit tags inline on swimlane cards via a context menu entry point.

**Architecture:** "Edit tags…" context menu item triggers an inline editor on the card's tag row (chips with × buttons + autocomplete input + done button). Each add/remove writes immediately to frontmatter. The editing card is protected from board re-renders via detach-and-reattach. A single undo operation is created on dismiss.

**Tech Stack:** TypeScript, Obsidian API (`processFrontMatter`, `AbstractInputSuggest`, `Menu`), vanilla DOM, Jest.

**Spec:** `docs/superpowers/specs/2026-03-20-inline-tag-editing-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/swimlane-card.ts` | `renderTagEditor()` function, `onEditTags` on `CardRenderOptions`, "Edit tags…" menu item |
| `src/swimlane-card.test.ts` | Tests for `renderTagEditor()` and the menu item |
| `src/undo/types.ts` | `EditTags` operation variant |
| `src/undo/apply.ts` | Undo/redo handlers for `EditTags` |
| `src/undo/apply.test.ts` | Tests for `EditTags` undo/redo |
| `src/swimlane-view.ts` | `onEditTags` callback, re-render protection, undo transaction on dismiss |
| `styles.css` | Edit-mode tag styles |
| `src/inputs/tag-suggest.ts` | Already complete — no changes |

---

### Task 1: Add `EditTags` undo operation type

**Files:**
- Modify: `src/undo/types.ts:5-77` (add variant to `UndoOperation` union)

- [ ] **Step 1: Add the `EditTags` variant to `UndoOperation`**

In `src/undo/types.ts`, add this variant to the union (after `ExecuteScheduledAction`, before the closing of the type):

```ts
| {
      type: "EditTags"
      file: TFile
      previousTags: string[]
      newTags: string[]
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes/.worktrees/card-tags && npx tsc --noEmit 2>&1 | head -20`

Expected: Compile errors in `apply.ts` about non-exhaustive switch — this is expected and will be fixed in the next task.

- [ ] **Step 3: Commit**

```bash
git add src/undo/types.ts
git commit -m "feat(undo): add EditTags operation type"
```

---

### Task 2: Add undo/redo handlers for `EditTags`

**Files:**
- Modify: `src/undo/apply.ts:36-173` (add case to `undoOne` switch)
- Modify: `src/undo/apply.ts:184-316` (add case to `redoOne` switch)
- Test: `src/undo/apply.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/undo/apply.test.ts`. Find the existing test patterns — they use a mock `UndoRedoContext` with `app.fileManager.processFrontMatter`. Add these tests:

```ts
describe("EditTags", () => {
    it("undo restores previous tags", async () => {
        const file = { path: "note.md" } as TFile
        const captured: Record<string, unknown>[] = []
        const ctx = makeCtx({
            processFrontMatter: jest.fn(async (_f: any, cb: (fm: any) => void) => {
                const fm: Record<string, unknown> = {}
                cb(fm)
                captured.push(fm)
            }),
        })
        await applyUndo(
            {
                label: "Edit tags",
                operations: [
                    {
                        type: "EditTags",
                        file,
                        previousTags: ["bug", "urgent"],
                        newTags: ["bug"],
                    },
                ],
            },
            ctx,
        )
        expect(ctx.app.fileManager.processFrontMatter).toHaveBeenCalledWith(
            expect.objectContaining({ path: "note.md" }),
            expect.any(Function),
        )
        expect(captured[0]?.tags).toEqual(["bug", "urgent"])
    })

    it("undo deletes tags field when previousTags is empty", async () => {
        const file = { path: "note.md" } as TFile
        const captured: Record<string, unknown>[] = []
        const ctx = makeCtx({
            processFrontMatter: jest.fn(async (_f: any, cb: (fm: any) => void) => {
                const fm: Record<string, unknown> = { tags: ["old"] }
                cb(fm)
                captured.push(fm)
            }),
        })
        await applyUndo(
            {
                label: "Edit tags",
                operations: [
                    { type: "EditTags", file, previousTags: [], newTags: ["new"] },
                ],
            },
            ctx,
        )
        expect(captured[0]?.tags).toBeUndefined()
    })

    it("redo applies new tags", async () => {
        const file = { path: "note.md" } as TFile
        const captured: Record<string, unknown>[] = []
        const ctx = makeCtx({
            processFrontMatter: jest.fn(async (_f: any, cb: (fm: any) => void) => {
                const fm: Record<string, unknown> = {}
                cb(fm)
                captured.push(fm)
            }),
        })
        await applyRedo(
            {
                label: "Edit tags",
                operations: [
                    {
                        type: "EditTags",
                        file,
                        previousTags: ["bug"],
                        newTags: ["bug", "feature"],
                    },
                ],
            },
            ctx,
        )
        expect(captured[0]?.tags).toEqual(["bug", "feature"])
    })

    it("redo deletes tags field when newTags is empty", async () => {
        const file = { path: "note.md" } as TFile
        const captured: Record<string, unknown>[] = []
        const ctx = makeCtx({
            processFrontMatter: jest.fn(async (_f: any, cb: (fm: any) => void) => {
                const fm: Record<string, unknown> = { tags: ["old"] }
                cb(fm)
                captured.push(fm)
            }),
        })
        await applyRedo(
            {
                label: "Edit tags",
                operations: [
                    { type: "EditTags", file, previousTags: ["old"], newTags: [] },
                ],
            },
            ctx,
        )
        expect(captured[0]?.tags).toBeUndefined()
    })
})
```

Note: Check `apply.test.ts` for the existing `makeCtx` helper pattern. The tests above assume a `makeCtx` that accepts overrides for `processFrontMatter`. Adapt the mock construction to match the existing pattern — the important thing is that `processFrontMatter` is called with the right file and the callback sets `fm.tags` correctly.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes/.worktrees/card-tags && npx jest src/undo/apply.test.ts --no-coverage 2>&1 | tail -20`

Expected: FAIL — switch cases not yet implemented.

- [ ] **Step 3: Add `EditTags` case to `undoOne` in `src/undo/apply.ts`**

Add this case to the switch in `undoOne` (around line 170, before the closing `}`):

```ts
case "EditTags": {
    const file = app.vault.getFileByPath(op.file.path)
    if (!file) {
        new Notice("Cannot undo: file no longer exists.")
        return
    }
    await app.fileManager.processFrontMatter(file, fm => {
        if (op.previousTags.length === 0) {
            delete fm.tags
        } else {
            fm.tags = [...op.previousTags]
        }
    })
    break
}
```

- [ ] **Step 4: Add `EditTags` case to `redoOne` in `src/undo/apply.ts`**

Add this case to the switch in `redoOne` (around line 315, before the closing `}`):

```ts
case "EditTags": {
    const file = app.vault.getFileByPath(op.file.path)
    if (!file) {
        new Notice("Cannot redo: file no longer exists.")
        return
    }
    await app.fileManager.processFrontMatter(file, fm => {
        if (op.newTags.length === 0) {
            delete fm.tags
        } else {
            fm.tags = [...op.newTags]
        }
    })
    break
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes/.worktrees/card-tags && npx jest src/undo/apply.test.ts --no-coverage 2>&1 | tail -20`

Expected: PASS

- [ ] **Step 6: Verify TypeScript compiles cleanly**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes/.worktrees/card-tags && npx tsc --noEmit 2>&1 | head -5`

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/undo/apply.ts src/undo/apply.test.ts
git commit -m "feat(undo): add EditTags undo/redo handlers"
```

---

### Task 3: Add `renderTagEditor()` function

**Files:**
- Modify: `src/swimlane-card.ts` (add `renderTagEditor` export)
- Test: `src/swimlane-card.test.ts`

- [ ] **Step 1: Write the failing tests for `renderTagEditor`**

Add to `src/swimlane-card.test.ts`. Import `renderTagEditor` alongside existing imports. These tests verify the editor DOM structure and add/remove behavior:

```ts
import { renderCard, renderTagEditor, propLabel, CardRenderOptions } from "./swimlane-card"

describe("renderTagEditor", () => {
    function makeFile(path = "note.md") {
        return { path } as any
    }

    it("renders editable chips with remove buttons for existing tags", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        renderTagEditor(card, makeFile(), ["bug", "urgent"], makeApp(), jest.fn())
        const chips = card.querySelectorAll(".swimlane-card-tag--editable")
        expect(chips).toHaveLength(2)
        expect(chips[0]?.textContent).toContain("#bug")
        expect(chips[0]?.querySelector(".swimlane-card-tag-remove")).not.toBeNull()
    })

    it("renders input and done button", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        renderTagEditor(card, makeFile(), [], makeApp(), jest.fn())
        expect(card.querySelector(".swimlane-tag-input")).not.toBeNull()
        expect(card.querySelector(".swimlane-tag-done-btn")).not.toBeNull()
    })

    it("adds editing class to container", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        renderTagEditor(card, makeFile(), [], makeApp(), jest.fn())
        expect(card.querySelector(".swimlane-card-tags--editing")).not.toBeNull()
    })

    it("creates tag container when card has none", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        // No .swimlane-card-tags exists
        renderTagEditor(card, makeFile(), [], makeApp(), jest.fn())
        expect(card.querySelector(".swimlane-card-tags")).not.toBeNull()
    })

    it("reuses existing tag container", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        const existing = document.createElement("div")
        existing.classList.add("swimlane-card-tags")
        card.appendChild(existing)
        renderTagEditor(card, makeFile(), ["a"], makeApp(), jest.fn())
        // Should still have exactly one container
        expect(card.querySelectorAll(".swimlane-card-tags")).toHaveLength(1)
    })

    it("calls processFrontMatter when remove button is clicked", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        const app = makeApp()
        renderTagEditor(card, makeFile(), ["bug", "urgent"], app, jest.fn())
        const removeBtn = card.querySelector(".swimlane-card-tag-remove") as HTMLElement
        removeBtn?.click()
        expect(app.fileManager.processFrontMatter).toHaveBeenCalled()
    })

    it("calls onDone when done button is clicked", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        const onDone = jest.fn()
        renderTagEditor(card, makeFile(), [], makeApp(), onDone)
        const doneBtn = card.querySelector(".swimlane-tag-done-btn") as HTMLElement
        doneBtn?.click()
        expect(onDone).toHaveBeenCalledTimes(1)
    })

    it("does not call onDone twice (settled flag)", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        const onDone = jest.fn()
        renderTagEditor(card, makeFile(), [], makeApp(), onDone)
        const doneBtn = card.querySelector(".swimlane-tag-done-btn") as HTMLElement
        doneBtn?.click()
        doneBtn?.click()
        expect(onDone).toHaveBeenCalledTimes(1)
    })

    it("does not add duplicate tags", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        const app = makeApp()
        renderTagEditor(card, makeFile(), ["bug"], app, jest.fn())
        const input = card.querySelector(".swimlane-tag-input") as HTMLInputElement
        input.value = "bug"
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
        // processFrontMatter should NOT have been called (tag already exists)
        expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled()
    })

    it("ignores empty input on Enter", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        const app = makeApp()
        renderTagEditor(card, makeFile(), [], app, jest.fn())
        const input = card.querySelector(".swimlane-tag-input") as HTMLInputElement
        input.value = ""
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
        expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled()
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes/.worktrees/card-tags && npx jest src/swimlane-card.test.ts --no-coverage 2>&1 | tail -20`

Expected: FAIL — `renderTagEditor` is not exported.

- [ ] **Step 3: Implement `renderTagEditor` in `src/swimlane-card.ts`**

Add this exported function after `renderCard`. Also add `TFile` to the imports from `obsidian`:

```ts
import type { App, BasesPropertyId, TFile, Value } from "obsidian"
```

Add `TagSuggest` import:

```ts
import { TagSuggest } from "./inputs/tag-suggest"
```

The function:

```ts
/** Transform a card's tag row into an inline editor with removable chips + autocomplete input. */
export function renderTagEditor(
    cardEl: HTMLElement,
    file: TFile,
    currentTags: string[],
    app: App,
    onDone: () => void,
): void {
    const tags = [...currentTags]
    let settled = false

    // Find or create the tag container. It lives on the content wrapper (if images)
    // or directly on the card.
    const content = cardEl.querySelector(".swimlane-card-content") ?? cardEl
    let container = content.querySelector(".swimlane-card-tags") as HTMLElement | null
    if (!container) {
        // Insert after title, before properties table
        const title = content.querySelector(".swimlane-card-title")
        container = document.createElement("div")
        container.classList.add("swimlane-card-tags")
        if (title?.nextSibling) {
            content.insertBefore(container, title.nextSibling)
        } else {
            content.appendChild(container)
        }
    }

    function settle() {
        if (settled) return
        settled = true
        onDone()
    }

    function renderChips() {
        // Clear and rebuild chips only (preserve input + done btn)
        container!.querySelectorAll(".swimlane-card-tag--editable").forEach(el => el.remove())
        const input = container!.querySelector(".swimlane-tag-input")
        for (let i = tags.length - 1; i >= 0; i--) {
            const tag = tags[i]
            const chip = document.createElement("span")
            chip.classList.add("swimlane-card-tag", "swimlane-card-tag--editable")
            chip.textContent = `#${tag}`
            const removeBtn = document.createElement("span")
            removeBtn.classList.add("swimlane-card-tag-remove")
            removeBtn.textContent = "×"
            removeBtn.addEventListener("click", e => {
                e.stopPropagation()
                const idx = tags.indexOf(tag)
                if (idx !== -1) {
                    tags.splice(idx, 1)
                    writeTags()
                    renderChips()
                }
            })
            chip.appendChild(removeBtn)
            if (input) {
                container!.insertBefore(chip, input)
            } else {
                container!.prepend(chip)
            }
        }
    }

    function writeTags() {
        app.fileManager.processFrontMatter(file, fm => {
            if (tags.length === 0) {
                delete fm.tags
            } else {
                fm.tags = [...tags]
            }
        })
    }

    function addTag(raw: string) {
        const tag = raw.trim().replace(/^#/, "")
        if (!tag || tags.includes(tag)) return
        tags.push(tag)
        writeTags()
        renderChips()
    }

    // Clear container and set up editing UI
    container.empty()
    container.classList.add("swimlane-card-tags--editing")

    // Input
    const input = document.createElement("input")
    input.type = "text"
    input.placeholder = "Add tag…"
    input.classList.add("swimlane-tag-input")
    input.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            e.preventDefault()
            addTag(input.value)
            input.value = ""
        } else if (e.key === "Escape") {
            e.preventDefault()
            settle()
        }
    })
    container.appendChild(input)

    // Done button
    const doneBtn = document.createElement("span")
    doneBtn.classList.add("swimlane-tag-done-btn")
    doneBtn.textContent = "✓"
    doneBtn.addEventListener("click", e => {
        e.stopPropagation()
        settle()
    })
    container.appendChild(doneBtn)

    // Render initial chips (before the input)
    renderChips()

    // Attach autocomplete (TagSuggest extends AbstractInputSuggest)
    new TagSuggest(app, input, tag => {
        addTag(tag)
        input.value = ""
    })

    // Blur detection: when focus leaves the container entirely
    container.addEventListener("focusout", e => {
        const related = (e as FocusEvent).relatedTarget as Node | null
        if (related && container!.contains(related)) return
        // Delay slightly to allow click events on done btn / remove btn to fire first
        setTimeout(() => {
            if (!settled && !container!.contains(document.activeElement)) {
                settle()
            }
        }, 100)
    })

    // Focus the input
    input.focus()
}
```

Note: `container.empty()` is an Obsidian DOM extension available on `HTMLElement`. In tests (jsdom), this won't exist — the test helper `makeApp` tests don't call `empty()` on containers they create. If tests fail because `empty()` is not a function, add a polyfill at the top of the test file:

```ts
// Polyfill Obsidian's HTMLElement.empty() for jsdom
if (!HTMLElement.prototype.empty) {
    HTMLElement.prototype.empty = function () {
        while (this.firstChild) this.removeChild(this.firstChild)
    }
}
```

Check if this polyfill already exists in the test file or a setup file before adding.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes/.worktrees/card-tags && npx jest src/swimlane-card.test.ts --no-coverage 2>&1 | tail -30`

Expected: PASS

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes/.worktrees/card-tags && npx tsc --noEmit 2>&1 | head -5`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/swimlane-card.ts src/swimlane-card.test.ts
git commit -m "feat(cards): add renderTagEditor for inline tag editing"
```

---

### Task 4: Add "Edit tags…" context menu item

**Files:**
- Modify: `src/swimlane-card.ts:26-46` (add `onEditTags` to `CardRenderOptions`)
- Modify: `src/swimlane-card.ts:248-299` (add menu item to `showCardMenu`)

- [ ] **Step 1: Add `onEditTags` to `CardRenderOptions`**

In `src/swimlane-card.ts`, add to the `CardRenderOptions` interface (after `tagColorScheme`):

```ts
/** Called when the user selects "Edit tags…" from the context menu. */
onEditTags?: (cardEl: HTMLElement) => void
```

- [ ] **Step 2: Add the menu item to `showCardMenu`**

In `showCardMenu()`, add the "Edit tags…" item after the "Move to" item and before the separator (before `menu.addSeparator()`). The `card` element is not directly available in `showCardMenu` — you need to find it. The menu item should only show when `onEditTags` is defined.

Note: `showCardMenu` doesn't have the card element. The card is the element with `data-path` matching `entry.file.path`. But since `showCardMenu` doesn't have access to the DOM container, we need to pass it. Change the approach: `renderCard` already has the `card` element. Pass it into `showCardMenu` as a parameter.

Update `showCardMenu` signature to accept `cardEl`:

```ts
function showCardMenu(
    position: { x: number; y: number },
    entry: BasesEntry,
    app: App,
    options: CardRenderOptions,
    cardEl: HTMLElement,
): Menu {
```

Update both call sites in `renderCard`:
- Line 233: `openMenu = showCardMenu({ x: rect.right, y: rect.bottom }, entry, app, options, card)`
- Line 242: `showCardMenu({ x: e.clientX, y: e.clientY }, entry, app, options, card)`

Then add the menu item in `showCardMenu`, before `menu.addSeparator()`:

```ts
if (options.onEditTags) {
    menu.addItem(item => {
        item.setTitle("Edit tags…")
            .setIcon("lucide-tags")
            .onClick(() => {
                options.onEditTags!(cardEl)
            })
    })
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes/.worktrees/card-tags && npx tsc --noEmit 2>&1 | head -5`

Expected: No errors.

- [ ] **Step 4: Run all card tests to verify nothing broke**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes/.worktrees/card-tags && npx jest src/swimlane-card.test.ts --no-coverage 2>&1 | tail -10`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/swimlane-card.ts
git commit -m "feat(cards): add Edit tags context menu item"
```

---

### Task 5: Wire up `onEditTags` callback and re-render protection in the view

**Files:**
- Modify: `src/swimlane-view.ts` (add `editingTagsPath`, `editingTagsCardEl`, `onEditTags` callback, detach-reattach logic)

- [ ] **Step 1: Add editing state fields to `SwimlaneView`**

Find the class property declarations in `src/swimlane-view.ts` (look for fields like `private savedScrollState`). Add:

```ts
private editingTagsPath: string | null = null
private editingTagsCardEl: HTMLElement | null = null
```

- [ ] **Step 2: Add detach logic before `this.boardEl.empty()` in `rebuildBoard()`**

In `rebuildBoard()` (around line 756), add this block **before** `this.boardEl.empty()`:

```ts
// Detach the card being tag-edited so empty() doesn't destroy it.
if (this.editingTagsPath && this.editingTagsCardEl) {
    this.editingTagsCardEl.remove()
}
```

- [ ] **Step 3: Add reattach logic after card rendering in `rebuildBoard()`**

In `rebuildBoard()`, after the card rendering loop (after the `for (const entry of group?.entries ?? [])` loop, around line 980), add reattach logic. This should be inside the column loop, after all cards for a column have been rendered:

```ts
// Reattach editing card if it belongs in this column
if (this.editingTagsPath && this.editingTagsCardEl) {
    const editingCards = cardList.querySelectorAll(`[data-path="${CSS.escape(this.editingTagsPath)}"]`)
    if (editingCards.length > 0) {
        // Replace the freshly-rendered card with the preserved editing card
        editingCards[0].replaceWith(this.editingTagsCardEl)
    }
}
```

- [ ] **Step 4: Add `onEditTags` to cardOptions**

In `rebuildBoard()`, find where `cardOptions` is constructed (around line 902). Add `onEditTags` to the object. This is a closure that captures `this` (the view):

```ts
const view = this
```

Add to `cardOptions`:

```ts
onEditTags: (cardEl: HTMLElement) => {
    // Find the entry for this card
    const path = cardEl.dataset.path
    if (!path) return
    const file = this.app.vault.getFileByPath(path)
    if (!file) return

    // Capture previous tags for undo
    const cache = this.app.metadataCache.getFileCache(file)
    const rawTags = cache?.frontmatter?.tags
    const previousTags: string[] = Array.isArray(rawTags)
        ? rawTags.filter((t): t is string => typeof t === "string")
        : typeof rawTags === "string"
            ? [rawTags]
            : []

    // Protect card from re-render
    this.editingTagsPath = path
    this.editingTagsCardEl = cardEl

    renderTagEditor(cardEl, file, previousTags, this.app, () => {
        // onDone: create undo transaction and clear editing state
        const finalCache = this.app.metadataCache.getFileCache(file)
        const finalRaw = finalCache?.frontmatter?.tags
        const newTags: string[] = Array.isArray(finalRaw)
            ? finalRaw.filter((t): t is string => typeof t === "string")
            : typeof finalRaw === "string"
                ? [finalRaw]
                : []

        const changed =
            previousTags.length !== newTags.length ||
            previousTags.some((t, i) => t !== newTags[i])

        if (changed) {
            this.undoManager.beginTransaction("Edit tags")
            this.undoManager.pushOperation({
                type: "EditTags",
                file,
                previousTags,
                newTags,
            })
            this.undoManager.endTransaction()
        }

        this.editingTagsPath = null
        this.editingTagsCardEl = null
        this.rebuildBoard()
    })
},
```

Add the import for `renderTagEditor` at the top of `swimlane-view.ts`:

```ts
import { renderCard, renderTagEditor } from "./swimlane-card"
```

(Check what's already imported from `./swimlane-card` and add `renderTagEditor` to the existing import.)

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes/.worktrees/card-tags && npx tsc --noEmit 2>&1 | head -10`

Expected: No errors.

- [ ] **Step 6: Run all tests**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes/.worktrees/card-tags && npx jest --no-coverage 2>&1 | tail -15`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/swimlane-view.ts
git commit -m "feat(cards): wire up onEditTags callback with re-render protection and undo"
```

---

### Task 6: Add edit-mode CSS styles

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Add the tag editor styles**

Find the existing `.swimlane-card-tag` styles in `styles.css` (around line 280). Add the following after the existing tag styles:

```css
/* ── Tag editor (inline editing mode) ──────────────────── */

.swimlane-card-tags--editing {
    background: var(--background-modifier-form-field);
    border-radius: var(--radius-s);
    padding: 4px;
}

.swimlane-card-tag--editable {
    cursor: default;
    padding-right: 2px;
}

.swimlane-card-tag-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 2px;
    padding: 0 3px;
    cursor: pointer;
    color: var(--text-muted);
    border-radius: var(--radius-s);
    font-size: 0.85em;
    line-height: 1;
}

.swimlane-card-tag-remove:hover {
    color: var(--text-error);
    background: var(--background-modifier-hover);
}

.swimlane-tag-input {
    flex: 1 1 60px;
    min-width: 60px;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-normal);
    font-size: var(--font-smallest);
    padding: 2px 4px;
}

.swimlane-tag-input::placeholder {
    color: var(--text-faint);
}

.swimlane-tag-done-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px 6px;
    cursor: pointer;
    color: var(--text-muted);
    border-radius: var(--radius-s);
    font-size: var(--font-smallest);
    user-select: none;
}

.swimlane-tag-done-btn:hover {
    color: var(--text-accent);
    background: var(--background-modifier-hover);
}
```

- [ ] **Step 2: Build to verify CSS parses**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes/.worktrees/card-tags && npm run build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style: add inline tag editor styles"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run all tests**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes/.worktrees/card-tags && npx jest --no-coverage 2>&1 | tail -20`

Expected: All tests PASS.

- [ ] **Step 2: TypeScript check**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes/.worktrees/card-tags && npx tsc --noEmit 2>&1 | head -5`

Expected: No errors.

- [ ] **Step 3: Full build**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes/.worktrees/card-tags && npm run build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 4: Lint**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes/.worktrees/card-tags && npx eslint src/swimlane-card.ts src/undo/types.ts src/undo/apply.ts src/swimlane-view.ts 2>&1 | tail -10`

Expected: No errors (warnings are OK).
