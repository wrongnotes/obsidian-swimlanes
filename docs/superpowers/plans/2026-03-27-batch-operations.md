# Batch Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-card selection mode with batch move, delete, and tag operations to the swimlane board.

**Architecture:** A new `SelectionManager` class owns selection mode state, the selected card set, and the floating action bar. It integrates with the existing view rebuild cycle (persisting selection by file path) and undo system (selection changes are undoable while in selection mode, purged on exit). Batch data operations (move, tag) each produce one undo transaction. DnD is disabled during selection mode.

**Tech Stack:** TypeScript, Obsidian API (`processFrontMatter`, `trashFile`, `Menu`), existing undo system, existing `TagSuggest` for batch tag input.

**Spec:** `docs/superpowers/specs/2026-03-27-batch-operations-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/selection-manager.ts` | Create | Selection mode state, selected set, enter/exit, toggle, select/deselect all |
| `src/selection-manager.test.ts` | Create | Tests for SelectionManager logic |
| `src/selection-action-bar.ts` | Create | Floating action bar rendering and wiring |
| `src/selection-action-bar.test.ts` | Create | Tests for action bar rendering |
| `src/batch-actions.ts` | Create | Batch move, delete, tag operations |
| `src/batch-actions.test.ts` | Create | Tests for batch operations |
| `src/undo/types.ts` | Modify | Add `SelectionChange` undo operation type |
| `src/undo/apply.ts` | Modify | Add undo/redo handlers for `SelectionChange` |
| `src/undo/undo-manager.ts` | Modify | Add `purge()` method |
| `src/undo/undo-manager.test.ts` | Modify | Tests for purge |
| `src/undo/apply.test.ts` | Modify | Tests for SelectionChange undo/redo |
| `src/swimlane-view.ts` | Modify | Wire SelectionManager into rebuild cycle, toolbar button, column menus, DnD gating |
| `src/swimlane-card.ts` | Modify | Selection click handler, `.swimlane-card--selected` CSS class |
| `styles.css` | Modify | Selected card style, action bar style |

---

## Chunk 1: Undo Infrastructure

### Task 1: SelectionChange Undo Operation Type

**Files:**
- Modify: `src/undo/types.ts`
- Modify: `src/undo/apply.ts`
- Modify: `src/undo/apply.test.ts`

- [ ] **Step 1: Write failing test for SelectionChange undo/redo**

Add to `src/undo/apply.test.ts`:

```typescript
describe("SelectionChange", () => {
    it("undo restores previousSelection", async () => {
        const selectionState = { current: new Set(["b.md", "c.md"]) }
        const tx: UndoTransaction = {
            label: "Select cards",
            operations: [{
                type: "SelectionChange",
                previousSelection: new Set(["a.md"]),
                newSelection: new Set(["b.md", "c.md"]),
                applySelection: (s: Set<string>) => { selectionState.current = s },
            }],
        }
        await applyUndo(tx, ctx)
        expect(selectionState.current).toEqual(new Set(["a.md"]))
    })

    it("redo restores newSelection", async () => {
        const selectionState = { current: new Set(["a.md"]) }
        const tx: UndoTransaction = {
            label: "Select cards",
            operations: [{
                type: "SelectionChange",
                previousSelection: new Set(["a.md"]),
                newSelection: new Set(["b.md", "c.md"]),
                applySelection: (s: Set<string>) => { selectionState.current = s },
            }],
        }
        await applyRedo(tx, ctx)
        expect(selectionState.current).toEqual(new Set(["b.md", "c.md"]))
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/undo/apply.test.ts --testNamePattern "SelectionChange" --no-coverage`
Expected: FAIL — `SelectionChange` type doesn't exist.

- [ ] **Step 3: Add SelectionChange to UndoOperation type**

In `src/undo/types.ts`, add to the `UndoOperation` union (after the `EditTags` variant):

```typescript
    | {
          type: "SelectionChange"
          previousSelection: Set<string>
          newSelection: Set<string>
          applySelection: (selection: Set<string>) => void
      }
```

The `applySelection` callback is a closure provided by `SelectionManager` that updates its internal `selected` set and re-renders. This avoids the undo system needing a reference to the SelectionManager.

- [ ] **Step 4: Add undo/redo handlers for SelectionChange**

In `src/undo/apply.ts`, add to the `undoOne` switch:

```typescript
case "SelectionChange":
    op.applySelection(new Set(op.previousSelection))
    break
```

Add to the `redoOne` switch:

```typescript
case "SelectionChange":
    op.applySelection(new Set(op.newSelection))
    break
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/undo/apply.test.ts --testNamePattern "SelectionChange" --no-coverage`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/undo/types.ts src/undo/apply.ts src/undo/apply.test.ts
git commit -m "feat(undo): add SelectionChange operation type"
```

---

### Task 2: UndoManager.purge() Method

**Files:**
- Modify: `src/undo/undo-manager.ts`
- Modify: `src/undo/undo-manager.test.ts`

- [ ] **Step 1: Write failing tests for purge**

Add to `src/undo/undo-manager.test.ts`:

```typescript
describe("purge", () => {
    it("removes matching transactions from undo stack", () => {
        const mgr = new UndoManager()

        mgr.beginTransaction("Select")
        mgr.pushOperation({ type: "SelectionChange", previousSelection: new Set(), newSelection: new Set(["a.md"]), applySelection: () => {} })
        mgr.endTransaction()

        mgr.beginTransaction("Move")
        mgr.pushOperation({ type: "MoveCard", file: {} as any, fromSwimlane: "a", toSwimlane: "b", fromRank: "m", toRank: "n", resolvedAutomationMutations: [], automationPreviousValues: {} })
        mgr.endTransaction()

        mgr.purge(tx => tx.operations.every(op => op.type === "SelectionChange"))
        expect(mgr.canUndo).toBe(true)
        expect(mgr.undoLabel).toBe("Move")
    })

    it("removes matching transactions from redo stack", () => {
        const mgr = new UndoManager()

        mgr.beginTransaction("Select")
        mgr.pushOperation({ type: "SelectionChange", previousSelection: new Set(), newSelection: new Set(["a.md"]), applySelection: () => {} })
        mgr.endTransaction()

        mgr.undo()
        expect(mgr.canRedo).toBe(true)

        mgr.purge(tx => tx.operations.every(op => op.type === "SelectionChange"))
        expect(mgr.canRedo).toBe(false)
    })

    it("leaves non-matching transactions intact", () => {
        const mgr = new UndoManager()

        mgr.beginTransaction("Move")
        mgr.pushOperation({ type: "MoveCard", file: {} as any, fromSwimlane: "a", toSwimlane: "b", fromRank: "m", toRank: "n", resolvedAutomationMutations: [], automationPreviousValues: {} })
        mgr.endTransaction()

        mgr.purge(tx => tx.operations.every(op => op.type === "SelectionChange"))
        expect(mgr.canUndo).toBe(true)
        expect(mgr.undoLabel).toBe("Move")
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/undo/undo-manager.test.ts --testNamePattern "purge" --no-coverage`
Expected: FAIL — `purge` method doesn't exist.

- [ ] **Step 3: Implement purge method**

In `src/undo/undo-manager.ts`, add before `clear()`:

```typescript
purge(predicate: (tx: UndoTransaction) => boolean): void {
    this.undoStack = this.undoStack.filter(tx => !predicate(tx))
    this.redoStack = this.redoStack.filter(tx => !predicate(tx))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/undo/undo-manager.test.ts --testNamePattern "purge" --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/undo/undo-manager.ts src/undo/undo-manager.test.ts
git commit -m "feat(undo): add purge method to UndoManager"
```

---

## Chunk 2: SelectionManager

### Task 3: SelectionManager Core Logic

**Files:**
- Create: `src/selection-manager.ts`
- Create: `src/selection-manager.test.ts`

- [ ] **Step 1: Write failing tests for SelectionManager**

Create `src/selection-manager.test.ts`:

```typescript
import { SelectionManager } from "./selection-manager"
import { UndoManager } from "./undo/undo-manager"

describe("SelectionManager", () => {
    let mgr: SelectionManager
    let undoManager: UndoManager
    let onChanged: jest.Mock

    beforeEach(() => {
        undoManager = new UndoManager()
        onChanged = jest.fn()
        mgr = new SelectionManager(undoManager, onChanged)
    })

    describe("enter/exit", () => {
        it("starts inactive", () => {
            expect(mgr.active).toBe(false)
            expect(mgr.selected.size).toBe(0)
        })

        it("enter activates selection mode", () => {
            mgr.enter()
            expect(mgr.active).toBe(true)
        })

        it("exit deactivates and clears selection", () => {
            mgr.enter()
            mgr.toggle("a.md")
            mgr.exit()
            expect(mgr.active).toBe(false)
            expect(mgr.selected.size).toBe(0)
        })

        it("exit purges SelectionChange transactions from undo stack", () => {
            mgr.enter()
            mgr.toggle("a.md")
            expect(undoManager.canUndo).toBe(true)
            mgr.exit()
            expect(undoManager.canUndo).toBe(false)
        })
    })

    describe("toggle", () => {
        it("adds unselected card", () => {
            mgr.enter()
            mgr.toggle("a.md")
            expect(mgr.selected.has("a.md")).toBe(true)
        })

        it("removes selected card", () => {
            mgr.enter()
            mgr.toggle("a.md")
            mgr.toggle("a.md")
            expect(mgr.selected.has("a.md")).toBe(false)
        })

        it("pushes SelectionChange to undo stack", () => {
            mgr.enter()
            mgr.toggle("a.md")
            expect(undoManager.canUndo).toBe(true)
            expect(undoManager.undoLabel).toBe("Select card")
        })

        it("calls onChanged callback", () => {
            mgr.enter()
            mgr.toggle("a.md")
            expect(onChanged).toHaveBeenCalled()
        })

        it("does nothing when not active", () => {
            mgr.toggle("a.md")
            expect(mgr.selected.size).toBe(0)
        })
    })

    describe("selectAll / deselectAll", () => {
        it("selectAll adds all provided paths", () => {
            mgr.enter()
            mgr.selectAll(["a.md", "b.md", "c.md"])
            expect(mgr.selected.size).toBe(3)
            expect(undoManager.undoLabel).toBe("Select all")
        })

        it("deselectAll clears selection", () => {
            mgr.enter()
            mgr.selectAll(["a.md", "b.md"])
            mgr.deselectAll()
            expect(mgr.selected.size).toBe(0)
            expect(undoManager.undoLabel).toBe("Deselect all")
        })
    })

    describe("selectColumn / deselectColumn", () => {
        it("selectColumn adds column paths to selection", () => {
            mgr.enter()
            mgr.selectColumn(["a.md", "b.md"])
            expect(mgr.selected).toEqual(new Set(["a.md", "b.md"]))
            expect(undoManager.undoLabel).toBe("Select column")
        })

        it("deselectColumn removes column paths from selection", () => {
            mgr.enter()
            mgr.selectAll(["a.md", "b.md", "c.md"])
            mgr.deselectColumn(["a.md", "b.md"])
            expect(mgr.selected).toEqual(new Set(["c.md"]))
            expect(undoManager.undoLabel).toBe("Deselect column")
        })

        it("selectColumn enters selection mode if not active", () => {
            mgr.selectColumn(["a.md"])
            expect(mgr.active).toBe(true)
            expect(mgr.selected.has("a.md")).toBe(true)
        })
    })

    describe("pruneDeleted", () => {
        it("removes paths not in the provided set", () => {
            mgr.enter()
            mgr.selectAll(["a.md", "b.md", "c.md"])
            mgr.pruneDeleted(new Set(["a.md", "c.md"]))
            expect(mgr.selected).toEqual(new Set(["a.md", "c.md"]))
        })
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/selection-manager.test.ts --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement SelectionManager**

Create `src/selection-manager.ts`:

```typescript
import { UndoManager } from "./undo/undo-manager"

export class SelectionManager {
    active = false
    selected = new Set<string>()

    constructor(
        private undoManager: UndoManager,
        private onChanged: () => void,
    ) {}

    enter(): void {
        if (this.active) return
        this.active = true
        this.onChanged()
    }

    exit(): void {
        if (!this.active) return
        this.active = false
        this.selected.clear()
        this.undoManager.purge(tx =>
            tx.operations.every(op => op.type === "SelectionChange"),
        )
        this.onChanged()
    }

    toggle(path: string): void {
        if (!this.active) return
        const prev = new Set(this.selected)
        if (this.selected.has(path)) {
            this.selected.delete(path)
        } else {
            this.selected.add(path)
        }
        this.pushSelectionChange(
            prev,
            new Set(this.selected),
            this.selected.has(path) ? "Select card" : "Deselect card",
        )
        this.onChanged()
    }

    selectAll(allPaths: string[]): void {
        if (!this.active) return
        const prev = new Set(this.selected)
        this.selected = new Set(allPaths)
        this.pushSelectionChange(prev, new Set(this.selected), "Select all")
        this.onChanged()
    }

    deselectAll(): void {
        if (!this.active) return
        const prev = new Set(this.selected)
        this.selected.clear()
        this.pushSelectionChange(prev, new Set(this.selected), "Deselect all")
        this.onChanged()
    }

    selectColumn(columnPaths: string[]): void {
        if (!this.active) this.enter()
        const prev = new Set(this.selected)
        for (const p of columnPaths) this.selected.add(p)
        this.pushSelectionChange(prev, new Set(this.selected), "Select column")
        this.onChanged()
    }

    deselectColumn(columnPaths: string[]): void {
        if (!this.active) return
        const prev = new Set(this.selected)
        for (const p of columnPaths) this.selected.delete(p)
        this.pushSelectionChange(prev, new Set(this.selected), "Deselect column")
        this.onChanged()
    }

    pruneDeleted(existingPaths: Set<string>): void {
        let changed = false
        for (const p of this.selected) {
            if (!existingPaths.has(p)) {
                this.selected.delete(p)
                changed = true
            }
        }
        if (changed) this.onChanged()
    }

    private pushSelectionChange(
        prev: Set<string>,
        next: Set<string>,
        label: string,
    ): void {
        const applySelection = (s: Set<string>) => {
            this.selected = new Set(s)
            this.onChanged()
        }
        this.undoManager.beginTransaction(label)
        this.undoManager.pushOperation({
            type: "SelectionChange",
            previousSelection: prev,
            newSelection: next,
            applySelection,
        })
        this.undoManager.endTransaction()
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/selection-manager.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/selection-manager.ts src/selection-manager.test.ts
git commit -m "feat: add SelectionManager class"
```

---

## Chunk 3: Floating Action Bar

### Task 4: Action Bar Rendering

**Files:**
- Create: `src/selection-action-bar.ts`
- Create: `src/selection-action-bar.test.ts`
- Modify: `styles.css`

- [ ] **Step 1: Write failing tests for action bar rendering**

Create `src/selection-action-bar.test.ts`:

```typescript
import { renderActionBar } from "./selection-action-bar"

describe("renderActionBar", () => {
    it("renders count label, action buttons, and close button", () => {
        const bar = renderActionBar({
            selectedCount: 3,
            onSelectAll: jest.fn(),
            onDeselectAll: jest.fn(),
            onMove: jest.fn(),
            onTag: jest.fn(),
            onDelete: jest.fn(),
            onClose: jest.fn(),
        })
        expect(bar.querySelector(".swimlane-action-bar-count")!.textContent).toBe("3 cards selected")
        expect(bar.querySelector("[data-action='select-all']")).toBeTruthy()
        expect(bar.querySelector("[data-action='deselect-all']")).toBeTruthy()
        expect(bar.querySelector("[data-action='move']")).toBeTruthy()
        expect(bar.querySelector("[data-action='tag']")).toBeTruthy()
        expect(bar.querySelector("[data-action='delete']")).toBeTruthy()
        expect(bar.querySelector("[data-action='close']")).toBeTruthy()
    })

    it("shows singular label for 1 card", () => {
        const bar = renderActionBar({
            selectedCount: 1,
            onSelectAll: jest.fn(),
            onDeselectAll: jest.fn(),
            onMove: jest.fn(),
            onTag: jest.fn(),
            onDelete: jest.fn(),
            onClose: jest.fn(),
        })
        expect(bar.querySelector(".swimlane-action-bar-count")!.textContent).toBe("1 card selected")
    })

    it("disables action buttons when selectedCount is 0", () => {
        const bar = renderActionBar({
            selectedCount: 0,
            onSelectAll: jest.fn(),
            onDeselectAll: jest.fn(),
            onMove: jest.fn(),
            onTag: jest.fn(),
            onDelete: jest.fn(),
            onClose: jest.fn(),
        })
        expect((bar.querySelector("[data-action='move']") as HTMLButtonElement).disabled).toBe(true)
        expect((bar.querySelector("[data-action='tag']") as HTMLButtonElement).disabled).toBe(true)
        expect((bar.querySelector("[data-action='delete']") as HTMLButtonElement).disabled).toBe(true)
    })

    it("calls callbacks when buttons are clicked", () => {
        const onMove = jest.fn()
        const onClose = jest.fn()
        const bar = renderActionBar({
            selectedCount: 2,
            onSelectAll: jest.fn(),
            onDeselectAll: jest.fn(),
            onMove,
            onTag: jest.fn(),
            onDelete: jest.fn(),
            onClose,
        })
        ;(bar.querySelector("[data-action='move']") as HTMLButtonElement).click()
        expect(onMove).toHaveBeenCalled()
        ;(bar.querySelector("[data-action='close']") as HTMLButtonElement).click()
        expect(onClose).toHaveBeenCalled()
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/selection-action-bar.test.ts --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement action bar**

Create `src/selection-action-bar.ts`:

```typescript
import { setIcon } from "obsidian"

export interface ActionBarCallbacks {
    selectedCount: number
    onSelectAll: () => void
    onDeselectAll: () => void
    onMove: (e: MouseEvent) => void
    onTag: (e: MouseEvent) => void
    onDelete: () => void
    onClose: () => void
}

export function renderActionBar(callbacks: ActionBarCallbacks): HTMLElement {
    const bar = document.createElement("div")
    bar.className = "swimlane-action-bar"

    // Count label
    const count = bar.createDiv({ cls: "swimlane-action-bar-count" })
    const n = callbacks.selectedCount
    count.textContent = `${n} card${n === 1 ? "" : "s"} selected`

    // Quick-select buttons
    const quickGroup = bar.createDiv({ cls: "swimlane-action-bar-group" })

    const selectAllBtn = quickGroup.createEl("button", {
        cls: "swimlane-action-bar-btn",
        text: "Select all",
        attr: { "data-action": "select-all" },
    })
    selectAllBtn.addEventListener("click", callbacks.onSelectAll)

    const deselectAllBtn = quickGroup.createEl("button", {
        cls: "swimlane-action-bar-btn",
        text: "Deselect all",
        attr: { "data-action": "deselect-all" },
    })
    deselectAllBtn.addEventListener("click", callbacks.onDeselectAll)

    // Action buttons
    const actionGroup = bar.createDiv({ cls: "swimlane-action-bar-group" })
    const disabled = n === 0

    const moveBtn = actionGroup.createEl("button", {
        cls: "swimlane-action-bar-btn",
        text: "Move to…",
        attr: { "data-action": "move" },
    })
    moveBtn.disabled = disabled
    moveBtn.addEventListener("click", (e) => callbacks.onMove(e))

    const tagBtn = actionGroup.createEl("button", {
        cls: "swimlane-action-bar-btn",
        text: "Tag…",
        attr: { "data-action": "tag" },
    })
    tagBtn.disabled = disabled
    tagBtn.addEventListener("click", (e) => callbacks.onTag(e))

    const deleteBtn = actionGroup.createEl("button", {
        cls: "swimlane-action-bar-btn swimlane-action-bar-btn--danger",
        text: "Delete",
        attr: { "data-action": "delete" },
    })
    deleteBtn.disabled = disabled
    deleteBtn.addEventListener("click", callbacks.onDelete)

    // Close button
    const closeBtn = bar.createEl("button", {
        cls: "swimlane-action-bar-close",
        attr: { "data-action": "close", "aria-label": "Exit selection mode" },
    })
    setIcon(closeBtn, "x")
    closeBtn.addEventListener("click", callbacks.onClose)

    return bar
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/selection-action-bar.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Add action bar CSS**

Add to `styles.css`:

```css
/* ── Selection Action Bar ── */
.swimlane-action-bar {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    box-shadow: var(--shadow-s);
    z-index: 10;
    white-space: nowrap;
}

.swimlane-action-bar-count {
    font-size: var(--font-ui-small);
    color: var(--text-muted);
    padding: 0 4px;
}

.swimlane-action-bar-group {
    display: flex;
    gap: 4px;
}

.swimlane-action-bar-btn {
    padding: 4px 10px;
    border-radius: var(--radius-s);
    font-size: var(--font-ui-small);
    background: var(--interactive-normal);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-normal);
    cursor: pointer;
}

.swimlane-action-bar-btn:hover:not(:disabled) {
    background: var(--interactive-hover);
}

.swimlane-action-bar-btn:disabled {
    opacity: 0.4;
    cursor: default;
}

.swimlane-action-bar-btn--danger {
    color: var(--text-error);
}

.swimlane-action-bar-close {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border-radius: var(--radius-s);
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
}

.swimlane-action-bar-close:hover {
    background: var(--interactive-hover);
    color: var(--text-normal);
}

/* Selected card highlight */
.swimlane-card--selected {
    outline: 2px solid var(--interactive-accent);
    outline-offset: -2px;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/selection-action-bar.ts src/selection-action-bar.test.ts styles.css
git commit -m "feat: add floating selection action bar"
```

---

## Chunk 4: Batch Actions

### Task 5: Batch Move

**Files:**
- Create: `src/batch-actions.ts`
- Create: `src/batch-actions.test.ts`

- [ ] **Step 1: Write failing tests for batch move**

Create `src/batch-actions.test.ts`:

```typescript
import { batchMove } from "./batch-actions"
import { UndoManager } from "./undo/undo-manager"

// Mock processFrontMatter
const mockProcessFrontMatter = jest.fn((_file, cb) => {
    const fm: Record<string, unknown> = {}
    cb(fm)
    return Promise.resolve()
})

const mockApp = { fileManager: { processFrontMatter: mockProcessFrontMatter } } as any

describe("batchMove", () => {
    let undoManager: UndoManager

    beforeEach(() => {
        undoManager = new UndoManager()
        mockProcessFrontMatter.mockClear()
    })

    it("moves selected cards to target column", async () => {
        const cards = [
            { file: { path: "a.md" } as any, currentSwimlane: "todo", currentRank: "m" },
            { file: { path: "b.md" } as any, currentSwimlane: "doing", currentRank: "n" },
        ]
        await batchMove({
            app: mockApp,
            cards,
            targetSwimlane: "done",
            swimlaneProp: "status",
            rankProp: "rank",
            lastRankInTarget: "p",
            undoManager,
            getAutomationMutations: () => ({ mutations: [], previousValues: {} }),
        })
        expect(mockProcessFrontMatter).toHaveBeenCalledTimes(2)
        expect(undoManager.canUndo).toBe(true)
        expect(undoManager.undoLabel).toBe("Move 2 cards")
    })

    it("skips cards already in target column", async () => {
        const cards = [
            { file: { path: "a.md" } as any, currentSwimlane: "done", currentRank: "m" },
            { file: { path: "b.md" } as any, currentSwimlane: "todo", currentRank: "n" },
        ]
        await batchMove({
            app: mockApp,
            cards,
            targetSwimlane: "done",
            swimlaneProp: "status",
            rankProp: "rank",
            lastRankInTarget: "p",
            undoManager,
            getAutomationMutations: () => ({ mutations: [], previousValues: {} }),
        })
        expect(mockProcessFrontMatter).toHaveBeenCalledTimes(1)
    })

    it("does not create transaction when all cards are already in target", async () => {
        const cards = [
            { file: { path: "a.md" } as any, currentSwimlane: "done", currentRank: "m" },
        ]
        await batchMove({
            app: mockApp,
            cards,
            targetSwimlane: "done",
            swimlaneProp: "status",
            rankProp: "rank",
            lastRankInTarget: "p",
            undoManager,
            getAutomationMutations: () => ({ mutations: [], previousValues: {} }),
        })
        expect(undoManager.canUndo).toBe(false)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/batch-actions.test.ts --testNamePattern "batchMove" --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement batchMove**

Create `src/batch-actions.ts`:

```typescript
import type { App, TFile } from "obsidian"
import type { FrontmatterMutation } from "./automations"
import type { UndoManager } from "./undo/undo-manager"
import { midRank } from "./lexorank"

export interface BatchMoveCard {
    file: TFile
    currentSwimlane: string
    currentRank: string
}

export interface BatchMoveOptions {
    app: App
    cards: BatchMoveCard[]
    targetSwimlane: string
    swimlaneProp: string
    rankProp: string
    lastRankInTarget: string | null
    undoManager: UndoManager
    getAutomationMutations: (
        fromSwimlane: string,
        toSwimlane: string,
        file: TFile,
    ) => { mutations: FrontmatterMutation[]; previousValues: Record<string, unknown> }
}

export async function batchMove(opts: BatchMoveOptions): Promise<void> {
    const {
        app, cards, targetSwimlane, swimlaneProp, rankProp,
        lastRankInTarget, undoManager, getAutomationMutations,
    } = opts

    const toMove = cards.filter(c => c.currentSwimlane !== targetSwimlane)
    if (toMove.length === 0) return

    // Generate ranks: each card appends after the previous
    let prevRank = lastRankInTarget
    const ranks: string[] = []
    for (let i = 0; i < toMove.length; i++) {
        const rank = midRank(prevRank, null)
        ranks.push(rank)
        prevRank = rank
    }

    undoManager.beginTransaction(`Move ${toMove.length} card${toMove.length === 1 ? "" : "s"}`)

    for (let i = 0; i < toMove.length; i++) {
        const card = toMove[i]
        const newRank = ranks[i]
        const { mutations, previousValues } = getAutomationMutations(
            card.currentSwimlane, targetSwimlane, card.file,
        )

        undoManager.pushOperation({
            type: "MoveCard",
            file: card.file,
            fromSwimlane: card.currentSwimlane,
            toSwimlane: targetSwimlane,
            fromRank: card.currentRank,
            toRank: newRank,
            resolvedAutomationMutations: mutations,
            automationPreviousValues: previousValues,
        })

        await app.fileManager.processFrontMatter(card.file, (fm: Record<string, unknown>) => {
            fm[swimlaneProp] = targetSwimlane
            fm[rankProp] = newRank
            for (const m of mutations) {
                fm[m.property] = m.value
            }
        })
    }

    undoManager.endTransaction()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/batch-actions.test.ts --testNamePattern "batchMove" --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/batch-actions.ts src/batch-actions.test.ts
git commit -m "feat: add batchMove operation"
```

---

### Task 6: Batch Delete

**Files:**
- Modify: `src/batch-actions.ts`
- Modify: `src/batch-actions.test.ts`

- [ ] **Step 1: Write failing tests for batch delete**

Add to `src/batch-actions.test.ts`:

```typescript
import { batchDelete } from "./batch-actions"

describe("batchDelete", () => {
    it("trashes all provided files", async () => {
        const trashFile = jest.fn()
        const app = { fileManager: { trashFile } } as any
        const files = [{ path: "a.md" } as any, { path: "b.md" } as any]

        await batchDelete({ app, files })

        expect(trashFile).toHaveBeenCalledTimes(2)
        expect(trashFile).toHaveBeenCalledWith(files[0])
        expect(trashFile).toHaveBeenCalledWith(files[1])
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/batch-actions.test.ts --testNamePattern "batchDelete" --no-coverage`
Expected: FAIL — `batchDelete` not exported.

- [ ] **Step 3: Implement batchDelete**

Add to `src/batch-actions.ts`:

```typescript
export interface BatchDeleteOptions {
    app: App
    files: TFile[]
}

export async function batchDelete(opts: BatchDeleteOptions): Promise<void> {
    for (const file of opts.files) {
        await opts.app.fileManager.trashFile(file)
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/batch-actions.test.ts --testNamePattern "batchDelete" --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/batch-actions.ts src/batch-actions.test.ts
git commit -m "feat: add batchDelete operation"
```

---

### Task 7: Batch Tag

**Files:**
- Modify: `src/batch-actions.ts`
- Modify: `src/batch-actions.test.ts`

- [ ] **Step 1: Write failing tests for batch tag add/remove**

Add to `src/batch-actions.test.ts`:

```typescript
import { batchAddTag, batchRemoveTag } from "./batch-actions"

describe("batchAddTag", () => {
    it("adds tag to all files via processFrontMatter", async () => {
        const fmState: Record<string, { tags?: string[] }> = {
            "a.md": { tags: ["existing"] },
            "b.md": { tags: [] },
        }
        const app = {
            fileManager: {
                processFrontMatter: jest.fn((file: any, cb: any) => {
                    const fm = fmState[file.path]!
                    cb(fm)
                }),
            },
        } as any

        const files = [{ path: "a.md" } as any, { path: "b.md" } as any]
        batchAddTag({ app, files, tag: "new" })

        expect(fmState["a.md"].tags).toEqual(["existing", "new"])
        expect(fmState["b.md"].tags).toEqual(["new"])
    })

    it("skips files that already have the tag", async () => {
        const fmState: Record<string, { tags?: string[] }> = {
            "a.md": { tags: ["urgent"] },
        }
        const app = {
            fileManager: {
                processFrontMatter: jest.fn((file: any, cb: any) => {
                    cb(fmState[file.path]!)
                }),
            },
        } as any

        batchAddTag({ app, files: [{ path: "a.md" } as any], tag: "urgent" })
        expect(fmState["a.md"].tags).toEqual(["urgent"])
    })
})

describe("batchRemoveTag", () => {
    it("removes tag from all files", () => {
        const fmState: Record<string, { tags?: string[] }> = {
            "a.md": { tags: ["keep", "remove"] },
            "b.md": { tags: ["remove"] },
        }
        const app = {
            fileManager: {
                processFrontMatter: jest.fn((file: any, cb: any) => {
                    cb(fmState[file.path]!)
                }),
            },
        } as any

        const files = [{ path: "a.md" } as any, { path: "b.md" } as any]
        batchRemoveTag({ app, files, tag: "remove" })

        expect(fmState["a.md"].tags).toEqual(["keep"])
        expect(fmState["b.md"].tags).toEqual([])
    })

    it("is a no-op for files without the tag", () => {
        const fmState: Record<string, { tags?: string[] }> = {
            "a.md": { tags: ["other"] },
        }
        const app = {
            fileManager: {
                processFrontMatter: jest.fn((file: any, cb: any) => {
                    cb(fmState[file.path]!)
                }),
            },
        } as any

        batchRemoveTag({ app, files: [{ path: "a.md" } as any], tag: "missing" })
        expect(fmState["a.md"].tags).toEqual(["other"])
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/batch-actions.test.ts --testNamePattern "batch(Add|Remove)Tag" --no-coverage`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement batchAddTag and batchRemoveTag**

Add to `src/batch-actions.ts`:

```typescript
export interface BatchTagOptions {
    app: App
    files: TFile[]
    tag: string
}

export function batchAddTag(opts: BatchTagOptions): void {
    const { app, files, tag } = opts
    for (const file of files) {
        app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
            const tags = Array.isArray(fm.tags) ? fm.tags as string[] : []
            if (!tags.includes(tag)) {
                tags.push(tag)
                fm.tags = tags
            }
        })
    }
}

export function batchRemoveTag(opts: BatchTagOptions): void {
    const { app, files, tag } = opts
    for (const file of files) {
        app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
            if (!Array.isArray(fm.tags)) return
            const tags = fm.tags as string[]
            const idx = tags.indexOf(tag)
            if (idx !== -1) {
                tags.splice(idx, 1)
                fm.tags = tags
            }
        })
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/batch-actions.test.ts --testNamePattern "batch(Add|Remove)Tag" --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/batch-actions.ts src/batch-actions.test.ts
git commit -m "feat: add batchAddTag and batchRemoveTag operations"
```

---

## Chunk 5: View Integration

### Task 8: Toolbar Button & Selection Mode Wiring

**Files:**
- Modify: `src/swimlane-view.ts`
- Modify: `src/swimlane-card.ts`

This task wires SelectionManager into the view. It's the integration layer — no new unit tests, but the existing card/view tests must still pass.

- [ ] **Step 1: Add SelectionManager property to SwimlaneView**

In `src/swimlane-view.ts`, add import and property:

```typescript
import { SelectionManager } from "./selection-manager"
```

Add to class properties (near `undoManager` at line 139):

```typescript
selectionManager: SelectionManager
```

Initialize in the constructor (after `undoManager` initialization):

```typescript
this.selectionManager = new SelectionManager(this.undoManager, () => this.onSelectionChanged())
```

Add the callback method:

```typescript
private onSelectionChanged(): void {
    this.rebuildBoard()
}
```

- [ ] **Step 2: Add "Select" button to toolbar**

In `injectBasesToolbarButton()` (around line 542), after the automations button injection, add:

```typescript
// Select button
const selectBtnWrapper = createDiv({ cls: "bases-toolbar-item swimlane-select-btn" })
const selectBtn = selectBtnWrapper.createDiv({ cls: "text-icon-button", attr: { tabindex: "0" } })
const selectIcon = selectBtn.createSpan({ cls: "text-button-icon" })
setIcon(selectIcon, "check-square")
selectBtn.createSpan({ cls: "text-button-label", text: this.selectionManager.active ? "Cancel" : "Select" })
selectBtn.addEventListener("click", () => {
    if (this.selectionManager.active) {
        this.selectionManager.exit()
    } else {
        this.selectionManager.enter()
    }
})
```

Insert it into the toolbar after the automations button.

- [ ] **Step 3: Gate DnD registration on selection mode**

In `rebuildBoard()`, where card DnD is registered (around line 1079):

```typescript
if (!this.selectionManager.active) {
    this.cardDnd.registerDraggable(card, { path: entry.file.path, groupKey })
}
```

Also gate the swimlane DnD registration (column drag) similarly.

Also gate the DnD container and drop indicator initialization (around line 864-866) — skip `registerContainer` and `initDropIndicator` when in selection mode.

- [ ] **Step 4: Add click-to-select handler on cards in selection mode**

In `rebuildBoard()`, after rendering each card (around line 1068), when selection mode is active:

```typescript
if (this.selectionManager.active) {
    card.addEventListener("click", (e) => {
        e.stopPropagation()
        this.selectionManager.toggle(entry.file.path)
    })
    if (this.selectionManager.selected.has(entry.file.path)) {
        card.classList.add("swimlane-card--selected")
    }
}
```

- [ ] **Step 5: Prune deleted cards after rebuild**

After the main column loop in `rebuildBoard()`, add:

```typescript
if (this.selectionManager.active) {
    const allPaths = new Set<string>()
    for (const group of this.data.groupedData) {
        for (const entry of group.entries) {
            allPaths.add(entry.file.path)
        }
    }
    this.selectionManager.pruneDeleted(allPaths)
}
```

- [ ] **Step 6: Add Escape key handler for selection mode**

In the keyboard listener (around line 259), add an Escape handler. Important: only exit selection mode if no popover is currently open (the popover has its own Escape handler that should fire first):

```typescript
if (e.key === "Escape" && this.selectionManager.active) {
    // Don't exit selection mode if a popover is open — let the popover's own
    // Escape handler close it first
    if (!this.boardEl.querySelector(".swimlane-batch-tag-popover")) {
        this.selectionManager.exit()
        e.preventDefault()
    }
}
```

- [ ] **Step 7: Run all tests to verify nothing is broken**

Run: `npx jest --no-coverage`
Expected: All existing tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/swimlane-view.ts src/swimlane-card.ts
git commit -m "feat: wire selection mode into view with toolbar button and DnD gating"
```

---

### Task 9: Action Bar Integration & Column Menu

**Files:**
- Modify: `src/swimlane-view.ts`

- [ ] **Step 1: Render action bar in rebuildBoard when selection mode is active**

In `rebuildBoard()`, after the main column loop and before scroll restoration, when `this.selectionManager.active`:

```typescript
import { renderActionBar } from "./selection-action-bar"
```

```typescript
if (this.selectionManager.active) {
    const actionBar = renderActionBar({
        selectedCount: this.selectionManager.selected.size,
        onSelectAll: () => {
            const allPaths: string[] = []
            for (const group of this.data.groupedData) {
                for (const entry of group.entries) {
                    allPaths.push(entry.file.path)
                }
            }
            this.selectionManager.selectAll(allPaths)
        },
        onDeselectAll: () => this.selectionManager.deselectAll(),
        onMove: (e) => this.showBatchMoveMenu(e),
        onTag: (e) => this.showBatchTagPopover(e),
        onDelete: () => this.confirmBatchDelete(),
        onClose: () => this.selectionManager.exit(),
    })
    boardEl.appendChild(actionBar)
}
```

- [ ] **Step 2: Add column menu items for selection**

In `showColumnMenu()` (around line 1449), add before `menu.showAtPosition`. The existing signature is `showColumnMenu(triggerEl, board, groupKey, entryCount, orderedKeys)` — it receives `groupKey` but not the entries. Look up entries via `this.data.groupedData`:

```typescript
const columnEntries = this.data.groupedData.find(g => g.key === groupKey)?.entries ?? []
const columnPaths = columnEntries.map(e => e.file.path)

menu.addSeparator()

// Always show "Select all in column" (enters selection mode if needed)
menu.addItem(item => {
    item.setTitle("Select all in column")
        .setIcon("check-square")
        .onClick(() => this.selectionManager.selectColumn(columnPaths))
})

// Show "Deselect all in column" only when in selection mode
if (this.selectionManager.active) {
    menu.addItem(item => {
        item.setTitle("Deselect all in column")
            .setIcon("square")
            .onClick(() => this.selectionManager.deselectColumn(columnPaths))
    })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/swimlane-view.ts
git commit -m "feat: integrate action bar and column menu selection items"
```

---

### Task 10: Batch Move Menu Handler

**Files:**
- Modify: `src/swimlane-view.ts`

- [ ] **Step 1: Implement showBatchMoveMenu**

Add method to `SwimlaneView`:

```typescript
private showBatchMoveMenu(e: MouseEvent): void {
    const menu = new Menu()
    const orderedKeys = this.getOrderedKeys()

    for (const key of orderedKeys) {
        menu.addItem(item => {
            item.setTitle(key)
                .onClick(async () => {
                    const cards: BatchMoveCard[] = []
                    for (const group of this.data.groupedData) {
                        for (const entry of group.entries) {
                            if (this.selectionManager.selected.has(entry.file.path)) {
                                const rank = getFrontmatter<string>(this.app, entry.file, this.rankProp) ?? ""
                                cards.push({
                                    file: entry.file,
                                    currentSwimlane: group.key,
                                    currentRank: rank,
                                })
                            }
                        }
                    }

                    // Find last rank in target column
                    const targetGroup = this.data.groupedData.find(g => g.key === key)
                    let lastRank: string | null = null
                    if (targetGroup) {
                        for (const entry of targetGroup.entries) {
                            const r = getFrontmatter<string>(this.app, entry.file, this.rankProp)
                            if (r && (lastRank === null || r > lastRank)) lastRank = r
                        }
                    }

                    this.savedScrollState = this.captureScrollState()
                    await batchMove({
                        app: this.app,
                        cards,
                        targetSwimlane: key,
                        swimlaneProp: this.swimlaneProp,
                        rankProp: this.rankProp,
                        lastRankInTarget: lastRank,
                        undoManager: this.undoManager,
                        getAutomationMutations: (from, to, file) =>
                            this.getAutomationMutationsForMove(from, to, file),
                    })
                })
        })
    }

    menu.showAtMouseEvent(e)
}
```

Note: `getFrontmatter<T>(app, file, key)` takes `(App, TFile, string)` — see `src/utils.ts`. `getOrderedKeys()` and `getAutomationMutationsForMove()` are helper methods — extract from existing code in `rebuildBoard` (ordered keys) and `handleCardDrop` (automation mutations). Adapt signatures as needed; the existing code for automation mutation calculation is around lines 2235-2263 of `swimlane-view.ts`.

- [ ] **Step 2: Run all tests**

Run: `npx jest --no-coverage`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/swimlane-view.ts
git commit -m "feat: implement batch move menu handler"
```

---

### Task 11: Batch Delete Confirmation Handler

**Files:**
- Modify: `src/swimlane-view.ts`

- [ ] **Step 1: Implement confirmBatchDelete**

Add method to `SwimlaneView`:

```typescript
private confirmBatchDelete(): void {
    const n = this.selectionManager.selected.size
    if (n === 0) return

    const modal = new ConfirmModal(this.app, {
        title: `Delete ${n} card${n === 1 ? "" : "s"}?`,
        message: `This will trash ${n} note${n === 1 ? "" : "s"}. This cannot be undone.`,
        confirmLabel: "Delete",
        onConfirm: async () => {
            const files: TFile[] = []
            for (const group of this.data.groupedData) {
                for (const entry of group.entries) {
                    if (this.selectionManager.selected.has(entry.file.path)) {
                        files.push(entry.file)
                    }
                }
            }
            await batchDelete({ app: this.app, files })
            this.selectionManager.exit()
        },
    })
    modal.open()
}
```

Note: Check how existing delete confirmation modals work in the codebase (e.g., the "Remove column" modal). Use the same `ConfirmModal` pattern or Obsidian's built-in modal. If the project uses a custom confirm modal, reuse it. If not, create a lightweight one or use `Modal` from Obsidian directly.

- [ ] **Step 2: Commit**

```bash
git add src/swimlane-view.ts
git commit -m "feat: implement batch delete with confirmation modal"
```

---

### Task 12: Batch Tag Popover Handler

**Files:**
- Modify: `src/swimlane-view.ts`
- Modify: `styles.css`

This is the most complex handler. The popover opens anchored to the action bar, lets the user add/remove tags across all selected cards, and commits as one undo transaction on close.

- [ ] **Step 1: Implement showBatchTagPopover**

Add method to `SwimlaneView`. This follows the same pattern as the existing single-card `renderTagEditor` in `swimlane-card.ts` (lines 248-461) but operates on multiple files and is anchored to the action bar instead of a card.

```typescript
private showBatchTagPopover(e: MouseEvent): void {
    // Prevent duplicate popovers
    const existing = this.boardEl.querySelector(".swimlane-batch-tag-popover")
    if (existing) { existing.remove(); return }

    const selectedFiles = this.getSelectedFiles()
    if (selectedFiles.length === 0) return

    // Snapshot initial tags for undo
    const initialTagsMap = new Map<string, string[]>()
    for (const file of selectedFiles) {
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
        const tags = Array.isArray(fm?.tags) ? [...fm.tags] : typeof fm?.tags === "string" ? [fm.tags] : []
        initialTagsMap.set(file.path, tags)
    }

    // Compute union of current tags for removal chips
    const computeTagUnion = (): string[] => {
        const union = new Set<string>()
        for (const file of selectedFiles) {
            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
            const tags = Array.isArray(fm?.tags) ? fm.tags : typeof fm?.tags === "string" ? [fm.tags] : []
            for (const t of tags) union.add(t)
        }
        return [...union].sort()
    }

    // Build popover DOM
    const popover = createDiv({ cls: "swimlane-batch-tag-popover" })

    // Add section
    const addSection = popover.createDiv({ cls: "swimlane-batch-tag-section" })
    addSection.createDiv({ cls: "swimlane-batch-tag-label", text: "Add tag" })
    const addInput = addSection.createEl("input", {
        cls: "swimlane-batch-tag-input",
        attr: { type: "text", placeholder: "Type a tag…" },
    })

    // Wire TagSuggest on addInput (reuse existing TagSuggest from src/inputs/tag-suggest.ts)
    const tagSuggest = new TagSuggest(this.app, addInput)

    const commitAdd = () => {
        const tag = addInput.value.trim().replace(/^#/, "")
        if (!tag) return
        batchAddTag({ app: this.app, files: selectedFiles, tag })
        addInput.value = ""
        renderRemoveChips()
    }
    addInput.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); commitAdd() }
    })

    // Remove section
    const removeSection = popover.createDiv({ cls: "swimlane-batch-tag-section" })
    removeSection.createDiv({ cls: "swimlane-batch-tag-label", text: "Remove tags" })
    const chipContainer = removeSection.createDiv({ cls: "swimlane-batch-tag-chips" })

    const renderRemoveChips = () => {
        chipContainer.empty()
        const tags = computeTagUnion()
        if (tags.length === 0) {
            chipContainer.createSpan({ cls: "swimlane-batch-tag-empty", text: "No tags" })
            return
        }
        for (const tag of tags) {
            const chip = chipContainer.createSpan({ cls: "swimlane-card-tag" })
            chip.textContent = `#${tag}`
            const removeBtn = chip.createSpan({ cls: "swimlane-card-tag-remove" })
            setIcon(removeBtn, "x")
            removeBtn.addEventListener("click", () => {
                batchRemoveTag({ app: this.app, files: selectedFiles, tag })
                renderRemoveChips()
            })
        }
    }
    renderRemoveChips()

    // Dismiss on outside click or Escape
    const dismiss = () => {
        popover.remove()
        document.removeEventListener("pointerdown", onOutsideClick, true)
        document.removeEventListener("keydown", onEscape)
        tagSuggest.close()

        // Commit undo transaction: one EditTags op per affected file
        this.undoManager.beginTransaction(`Edit tags on ${selectedFiles.length} card${selectedFiles.length === 1 ? "" : "s"}`)
        for (const file of selectedFiles) {
            const prevTags = initialTagsMap.get(file.path) ?? []
            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
            const newTags = Array.isArray(fm?.tags) ? [...fm.tags] : typeof fm?.tags === "string" ? [fm.tags] : []
            // Only push op if tags actually changed
            if (JSON.stringify(prevTags) !== JSON.stringify(newTags)) {
                this.undoManager.pushOperation({
                    type: "EditTags",
                    file,
                    previousTags: prevTags,
                    newTags,
                })
            }
        }
        this.undoManager.endTransaction()
    }

    const onOutsideClick = (ev: PointerEvent) => {
        if (!popover.contains(ev.target as Node)) dismiss()
    }
    const onEscape = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") { ev.preventDefault(); dismiss() }
    }

    // Delay registering dismiss listeners to avoid immediate close
    setTimeout(() => {
        document.addEventListener("pointerdown", onOutsideClick, true)
        document.addEventListener("keydown", onEscape)
    }, 0)

    // Position popover above the action bar
    const actionBar = this.boardEl.querySelector(".swimlane-action-bar")
    if (actionBar) {
        this.boardEl.appendChild(popover)
    }

    addInput.focus()
}

private getSelectedFiles(): TFile[] {
    const files: TFile[] = []
    for (const group of this.data.groupedData) {
        for (const entry of group.entries) {
            if (this.selectionManager.selected.has(entry.file.path)) {
                files.push(entry.file)
            }
        }
    }
    return files
}
```

- [ ] **Step 2: Add batch tag popover CSS**

Add to `styles.css`:

```css
/* ── Batch Tag Popover ── */
.swimlane-batch-tag-popover {
    position: absolute;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%);
    width: 280px;
    padding: 12px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    box-shadow: var(--shadow-s);
    z-index: 11;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.swimlane-batch-tag-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.swimlane-batch-tag-label {
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
    font-weight: var(--font-semibold);
}

.swimlane-batch-tag-input {
    width: 100%;
    padding: 4px 8px;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: var(--font-ui-small);
}

.swimlane-batch-tag-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.swimlane-batch-tag-empty {
    font-size: var(--font-ui-small);
    color: var(--text-faint);
}
```

- [ ] **Step 3: Run all tests**

Run: `npx jest --no-coverage`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/swimlane-view.ts styles.css
git commit -m "feat: implement batch tag popover with add/remove and undo"
```

---

## Chunk 6: Mobile Refinements

### Task 13: Mobile Action Bar & Bottom Sheet

**Files:**
- Modify: `src/swimlane-view.ts`
- Modify: `styles.css`

- [ ] **Step 1: Position action bar above carousel dots on mobile**

Add to `styles.css`:

```css
/* Mobile: action bar above carousel indicator */
.swimlane-mobile .swimlane-action-bar {
    bottom: 40px; /* above the 30px carousel dot indicator */
}

/* Mobile: tag popover as bottom sheet */
.swimlane-mobile .swimlane-batch-tag-popover {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    transform: none;
    border-radius: 12px 12px 0 0;
    max-height: 50vh;
    overflow-y: auto;
    padding: 16px;
    z-index: 20;
}
```

- [ ] **Step 2: Add close button to mobile tag bottom sheet**

In `showBatchTagPopover()`, when mobile, add a header with a close button:

```typescript
if (this.isMobileLayout) {
    const header = popover.createDiv({ cls: "swimlane-batch-tag-header" })
    header.createSpan({ text: "Edit tags" })
    const closeBtn = header.createEl("button", { cls: "swimlane-action-bar-close" })
    setIcon(closeBtn, "x")
    closeBtn.addEventListener("click", dismiss)
    popover.prepend(header)
}
```

Add CSS:

```css
.swimlane-batch-tag-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: var(--font-semibold);
    padding-bottom: 8px;
    border-bottom: 1px solid var(--background-modifier-border);
}
```

- [ ] **Step 3: Run all tests**

Run: `npx jest --no-coverage`
Expected: PASS

- [ ] **Step 4: Manually test on mobile** (requires Obsidian mobile or responsive emulation)

Verify:
- Action bar appears above carousel dots
- Tag popover slides up as bottom sheet
- Close button dismisses the bottom sheet
- Selection toggle works with taps

- [ ] **Step 5: Commit**

```bash
git add src/swimlane-view.ts styles.css
git commit -m "feat: mobile refinements for selection mode and tag bottom sheet"
```

---

## Chunk 7: Integration Testing

### Task 14: End-to-End Smoke Tests

**Files:**
- Modify: `src/swimlane-view.test.ts`

- [ ] **Step 1: Add integration-level tests**

Add to `src/swimlane-view.test.ts` (or a new describe block):

```typescript
describe("batch operations integration", () => {
    it("entering selection mode disables DnD and shows action bar", () => {
        // Setup view, render board
        // Enter selection mode
        // Assert: action bar rendered, no DnD draggables registered
    })

    it("clicking cards in selection mode toggles selection", () => {
        // Setup view with cards
        // Enter selection mode
        // Click card → assert .swimlane-card--selected class
        // Click again → assert class removed
    })

    it("exiting selection mode purges selection undo ops", () => {
        // Enter selection mode, toggle some cards
        // Assert undo stack has SelectionChange entries
        // Exit selection mode
        // Assert undo stack has no SelectionChange entries
    })

    it("batch move creates single undo transaction", () => {
        // Enter selection mode, select 3 cards
        // Execute batch move to target column
        // Assert: one undo transaction with 3 MoveCard operations
    })

    it("batch delete exits selection mode", () => {
        // Enter selection mode, select cards
        // Execute batch delete (mock trashFile)
        // Assert: selection mode is inactive
    })

    it("column menu shows select/deselect column items", () => {
        // When not in selection mode: "Select all in column" present
        // When in selection mode: "Deselect all in column" present
    })
})
```

Fill in test bodies following the patterns established in the existing `swimlane-view.test.ts`. Use the existing mock setup (mock Obsidian app, mock entries, mock BasesView data).

- [ ] **Step 2: Run tests**

Run: `npx jest src/swimlane-view.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `npx jest --no-coverage`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/swimlane-view.test.ts
git commit -m "test: add integration tests for batch operations"
```
