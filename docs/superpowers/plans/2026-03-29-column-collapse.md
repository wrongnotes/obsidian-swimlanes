# Column Collapsing & Context Menu Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add collapsible columns to the swimlane board (desktop only) with dwell-to-expand during drag, and suppress card context menus during selection mode.

**Architecture:** Collapsed state is stored in `.base` view config as `collapsedSwimlanes: string[]`. In `rebuildBoard()`, collapsed columns render as thin vertical strips instead of full columns. During drag, collapsed strips are registered as drop areas; a dwell timer triggers localized DOM expansion without full rebuild. Context menu suppression checks the `swimlane-selecting` CSS class on the board.

**Tech Stack:** TypeScript, Obsidian API, existing DnD system, vanilla DOM.

**Spec:** `docs/superpowers/specs/2026-03-29-column-collapse-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/swimlane-view.ts` | Modify | Config getters/setters, collapsed strip rendering in rebuildBoard, column menu "Collapse" item, chevron toggle, dwell-to-expand logic during drag, select-all-in-column expand |
| `src/swimlane-card.ts` | Modify | Suppress contextmenu in selection mode |
| `styles.css` | Modify | Collapsed strip styles, chevron icon, context menu suppression |

---

## Chunk 1: Context Menu Suppression (Quick Fix)

### Task 1: Suppress Context Menu in Selection Mode

**Files:**
- Modify: `src/swimlane-card.ts`
- Modify: `styles.css`

- [ ] **Step 1: Suppress contextmenu event in selection mode**

In `src/swimlane-card.ts`, find the `contextmenu` listener (around line 239):

```typescript
card.addEventListener("contextmenu", e => {
    e.preventDefault()
    showCardMenu({ x: e.clientX, y: e.clientY }, entry, app, options, card)
})
```

Change to:

```typescript
card.addEventListener("contextmenu", e => {
    e.preventDefault()
    if (card.closest(".swimlane-selecting")) return
    showCardMenu({ x: e.clientX, y: e.clientY }, entry, app, options, card)
})
```

- [ ] **Step 2: Hide mobile menu button in selection mode via CSS**

Read `styles.css`, then append:

```css
/* Hide mobile card menu button in selection mode */
.swimlane-selecting .swimlane-card-menu-btn {
    display: none;
}
```

- [ ] **Step 3: Run tests**

Run: `npx jest --no-coverage`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/swimlane-card.ts styles.css
git commit -m "fix: suppress card context menu during selection mode"
```

---

## Chunk 2: Collapse Config & Rendering

### Task 2: Collapsed Swimlanes Config

**Files:**
- Modify: `src/swimlane-view.ts`

- [ ] **Step 1: Add config getter/setter for collapsedSwimlanes**

In `src/swimlane-view.ts`, find the `CONFIG_KEYS` object and add `collapsedSwimlanes: "collapsedSwimlanes"`.

Then find the `hiddenSwimlanes` getter/setter (around line 703) and add parallel methods below:

```typescript
private get collapsedSwimlanes(): Set<GroupKey> {
    const val = this.config.get(CONFIG_KEYS.collapsedSwimlanes)
    if (!Array.isArray(val)) return new Set()
    return new Set(val.filter((v): v is GroupKey => typeof v === "string"))
}

private setCollapsedSwimlanes(collapsed: Set<GroupKey>): void {
    this.config.set(CONFIG_KEYS.collapsedSwimlanes, [...collapsed])
}

private toggleCollapsed(groupKey: GroupKey): void {
    const collapsed = this.collapsedSwimlanes
    if (collapsed.has(groupKey)) {
        collapsed.delete(groupKey)
    } else {
        collapsed.add(groupKey)
    }
    this.setCollapsedSwimlanes(collapsed)
}

private expandColumn(groupKey: GroupKey): void {
    const collapsed = this.collapsedSwimlanes
    if (collapsed.has(groupKey)) {
        collapsed.delete(groupKey)
        this.setCollapsedSwimlanes(collapsed)
    }
}
```

- [ ] **Step 2: Run tests**

Run: `npx jest --no-coverage`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/swimlane-view.ts
git commit -m "feat: add collapsedSwimlanes config getter/setter"
```

---

### Task 3: Render Collapsed Column Strips

**Files:**
- Modify: `src/swimlane-view.ts`
- Modify: `styles.css`

- [ ] **Step 1: Add collapsed strip rendering in rebuildBoard**

In `rebuildBoard()`, find the main column loop (around line 1059: `for (const groupKey of orderedKeys)`). At the start of the loop body, before creating the full column, check if the column is collapsed. If so, render a strip and `continue`.

Read `rebuildBoard()` carefully first. The collapsed check should come after the column div is NOT yet created. Insert before the `const col = board.createDiv(...)` line:

```typescript
if (collapsed.has(groupKey) && !this.isMobileLayout) {
    const entries = groupByKey.get(groupKey)?.entries ?? []
    const strip = board.createDiv({ cls: "swimlane-column-collapsed" })
    strip.dataset.groupKey = groupKey
    strip.setAttribute("aria-label", groupKey)

    const label = strip.createDiv({ cls: "swimlane-column-collapsed-label" })
    label.textContent = groupKey

    const count = strip.createDiv({ cls: "swimlane-column-collapsed-count" })
    count.textContent = String(entries.length)

    strip.addEventListener("click", () => {
        this.expandColumn(groupKey)
    })

    // Register as drop area for dwell-to-expand during drag
    if (!this.selectionManager.active) {
        this.cardDnd.registerDropArea(strip, { groupKey, collapsed: true } as any)
    }

    continue
}
```

You'll also need to read the `collapsed` set near the top of `rebuildBoard()`, where `hidden` is read. Add:

```typescript
const collapsed = this.collapsedSwimlanes
```

- [ ] **Step 2: Add collapsed strip CSS**

Read `styles.css`, then add after the `.swimlane-column` styles:

```css
/* ── Collapsed Column Strip ── */
.swimlane-column-collapsed {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 40px;
    flex-shrink: 0;
    background: var(--background-secondary);
    border-radius: var(--radius-s);
    cursor: pointer;
    overflow: hidden;
    position: relative;
}

.swimlane-column-collapsed:hover {
    background: var(--background-modifier-hover);
}

.swimlane-column-collapsed-label {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: var(--font-ui-small);
    color: var(--text-muted);
    font-weight: var(--font-medium);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-height: calc(100% - 40px);
}

.swimlane-column-collapsed-count {
    font-size: var(--font-ui-smaller);
    color: var(--text-faint);
    background: var(--background-modifier-border);
    border-radius: var(--radius-s);
    padding: 2px 6px;
    min-width: 20px;
    text-align: center;
}
```

- [ ] **Step 3: Run tests**

Run: `npx jest --no-coverage`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/swimlane-view.ts styles.css
git commit -m "feat: render collapsed column strips"
```

---

### Task 4: Collapse Chevron & Column Menu Item

**Files:**
- Modify: `src/swimlane-view.ts`
- Modify: `styles.css`

- [ ] **Step 1: Add chevron toggle to column header**

In `rebuildBoard()`, find where the column header is created (around line 1065-1086). After the menu button is created, add a chevron button before the menu button (or as the first item in the header-right area). Only render on desktop:

```typescript
if (!this.isMobileLayout) {
    const chevron = headerRight.createDiv({ cls: "swimlane-column-collapse-btn" })
    setIcon(chevron, "chevron-left")
    chevron.setAttribute("aria-label", "Collapse column")
    chevron.addEventListener("click", (e) => {
        e.stopPropagation()
        this.toggleCollapsed(groupKey)
    })
}
```

Look at how the existing menu button is created in the header-right div and follow the same pattern. The chevron should be inserted before the menu button.

- [ ] **Step 2: Add "Collapse" item to column menu**

In `showColumnMenu()` (around line 1540), add a "Collapse" item. Insert after the "Hide" item and before the "Remove" item (or after the separator). Only add when not mobile:

```typescript
if (!this.isMobileLayout) {
    menu.addItem(item => {
        item.setTitle("Collapse")
            .setIcon("columns-2")
            .onClick(() => this.toggleCollapsed(groupKey))
    })
}
```

- [ ] **Step 3: Add chevron CSS**

```css
.swimlane-column-collapse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    border-radius: var(--radius-s);
    color: var(--text-faint);
    cursor: pointer;
    opacity: 0;
    transition: opacity 100ms ease;
}

.swimlane-column-header:hover .swimlane-column-collapse-btn {
    opacity: 1;
}

.swimlane-column-collapse-btn:hover {
    color: var(--text-muted);
    background: var(--background-modifier-hover);
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest --no-coverage`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/swimlane-view.ts styles.css
git commit -m "feat: add collapse chevron and column menu item"
```

---

## Chunk 3: Dwell-to-Expand During Drag

### Task 5: Dwell Timer & Localized Expand/Recollapse

**Files:**
- Modify: `src/swimlane-view.ts`

This is the most complex task. The dwell-to-expand behavior requires:
- Tracking which collapsed column is being hovered during drag
- A 500ms timer to trigger expansion
- Localized DOM swap (not full rebuildBoard)
- Auto-recollapse when drag moves away or is cancelled

- [ ] **Step 1: Add dwell state tracking properties**

Add to the class properties:

```typescript
private dwellExpandTimer: ReturnType<typeof setTimeout> | null = null
private dwellExpandedGroupKey: GroupKey | null = null
private dwellExpandedColumnEl: HTMLElement | null = null
```

- [ ] **Step 2: Add dwell detection in onDragMove callback**

In the `onDragMove` callback of the `cardDnd` initialization (around line 240), add dwell detection. After existing logic:

```typescript
this.checkDwellExpand(clientX, clientY)
```

Then implement the method:

```typescript
private checkDwellExpand(clientX: number, clientY: number): void {
    // Find if pointer is over a collapsed strip
    const strip = document.elementFromPoint(clientX, clientY)?.closest(".swimlane-column-collapsed") as HTMLElement | null
    const groupKey = strip?.dataset.groupKey as GroupKey | undefined

    // If hovering a different target (or no target), clear timer and maybe recollapse
    if (groupKey !== (this.dwellExpandTimer ? strip?.dataset.groupKey : undefined)) {
        this.clearDwellTimer()
    }

    // If hovering a collapsed strip and no timer running, start one
    if (strip && groupKey && !this.dwellExpandTimer && groupKey !== this.dwellExpandedGroupKey) {
        strip.classList.add("swimlane-column-collapsed--hover")
        this.dwellExpandTimer = setTimeout(() => {
            this.dwellExpandTimer = null
            this.dwellExpandColumn(groupKey, strip)
        }, 500)
    }

    // If we moved away from a dwell-expanded column, start recollapse timer
    if (this.dwellExpandedGroupKey && this.dwellExpandedGroupKey !== groupKey) {
        // Check if we're over the expanded column's card list
        const overExpanded = this.dwellExpandedColumnEl?.contains(
            document.elementFromPoint(clientX, clientY)
        )
        if (!overExpanded) {
            this.startRecollapseTimer()
        } else {
            this.clearRecollapseTimer()
        }
    }
}
```

- [ ] **Step 3: Implement localized dwell expand**

```typescript
private dwellExpandColumn(groupKey: GroupKey, strip: HTMLElement): void {
    const board = strip.parentElement
    if (!board) return

    // Build full column in place of strip
    const groupByKey = new Map(this.data.groupedData.map(g => [g.key as GroupKey, g]))
    const group = groupByKey.get(groupKey)
    if (!group) return

    // Create full column element (reuse the same rendering logic as rebuildBoard)
    const col = document.createElement("div")
    col.className = "swimlane-column"
    col.dataset.groupKey = groupKey

    // Render header
    const header = col.createDiv({ cls: "swimlane-column-header" })
    header.createSpan({ text: groupKey })
    const headerRight = header.createDiv({ cls: "swimlane-column-header-right" })
    const countEl = headerRight.createDiv({ cls: "swimlane-column-count" })
    countEl.textContent = String(group.entries.length)

    // Render card list
    const cardList = col.createDiv({ cls: "swimlane-card-list" })
    this.cardDnd.registerDropArea(cardList, { groupKey })

    // Render cards (simplified — use existing renderCard patterns)
    for (const entry of group.entries) {
        const tags = this.getCardTags(entry)
        const card = renderCard(cardList, entry, this.app, this.buildCardOptions(groupKey, tags, entry))
        this.cardDnd.registerDraggable(card, { path: entry.file.path, groupKey })
    }

    // Swap strip for column
    board.replaceChild(col, strip)

    // Deregister strip, track expanded state
    this.dwellExpandedGroupKey = groupKey
    this.dwellExpandedColumnEl = col
}
```

Note: The card rendering in the dwell-expand needs to match what `rebuildBoard()` does. Read how cards are rendered in the main loop (lines 1096-1142) and extract or replicate the relevant logic. You may need to extract a helper method like `buildCardOptions()` and `getCardTags()` from the existing inline code, or just inline the same logic.

- [ ] **Step 4: Implement recollapse**

```typescript
private recollapseTimer: ReturnType<typeof setTimeout> | null = null

private startRecollapseTimer(): void {
    if (this.recollapseTimer) return
    this.recollapseTimer = setTimeout(() => {
        this.recollapseTimer = null
        this.recollapseDwellExpanded()
    }, 300)
}

private clearRecollapseTimer(): void {
    if (this.recollapseTimer) {
        clearTimeout(this.recollapseTimer)
        this.recollapseTimer = null
    }
}

private recollapseDwellExpanded(): void {
    if (!this.dwellExpandedGroupKey || !this.dwellExpandedColumnEl) return

    const groupKey = this.dwellExpandedGroupKey
    const col = this.dwellExpandedColumnEl
    const board = col.parentElement
    if (!board) return

    const entries = this.data.groupedData.find(g => String(g.key) === groupKey)?.entries ?? []

    // Build collapsed strip
    const strip = document.createElement("div")
    strip.className = "swimlane-column-collapsed"
    strip.dataset.groupKey = groupKey
    strip.setAttribute("aria-label", groupKey)

    const label = strip.createDiv({ cls: "swimlane-column-collapsed-label" })
    label.textContent = groupKey

    const count = strip.createDiv({ cls: "swimlane-column-collapsed-count" })
    count.textContent = String(entries.length)

    // Register strip as drop area for future dwell-expand
    this.cardDnd.registerDropArea(strip, { groupKey, collapsed: true } as any)

    // Swap
    board.replaceChild(strip, col)

    this.dwellExpandedGroupKey = null
    this.dwellExpandedColumnEl = null
}

private clearDwellTimer(): void {
    if (this.dwellExpandTimer) {
        clearTimeout(this.dwellExpandTimer)
        this.dwellExpandTimer = null
    }
    // Clear hover highlight on any collapsed strips
    document.querySelectorAll(".swimlane-column-collapsed--hover").forEach(el =>
        el.classList.remove("swimlane-column-collapsed--hover")
    )
}
```

- [ ] **Step 5: Handle drag end — recollapse any dwell-expanded columns**

In the `onDrop` callback of `cardDnd` (where `handleCardDrop` is called), after the drop completes, check if the drop was into the dwell-expanded column. If so, persist the expansion (remove from collapsedSwimlanes). If not (drop elsewhere or cancelled), recollapse.

Also hook into `onDropSettle` or add cleanup to ensure recollapse on any drag cancellation:

```typescript
// In the onDrop callback, after handleCardDrop:
if (this.dwellExpandedGroupKey) {
    if (context.groupKey === this.dwellExpandedGroupKey) {
        // Dropped into the dwell-expanded column — persist expansion
        this.expandColumn(this.dwellExpandedGroupKey)
    } else {
        // Dropped elsewhere — recollapse
        this.recollapseDwellExpanded()
    }
    this.dwellExpandedGroupKey = null
    this.dwellExpandedColumnEl = null
}
this.clearDwellTimer()
this.clearRecollapseTimer()
```

Also add cleanup in any drag cancellation path (Escape key handler, `flushDrag`, or wherever drag cleanup happens).

- [ ] **Step 6: Add hover highlight CSS for collapsed strip during drag**

```css
.swimlane-column-collapsed--hover {
    background: var(--background-modifier-hover);
    outline: 2px solid var(--interactive-accent);
    outline-offset: -2px;
}
```

- [ ] **Step 7: Run tests**

Run: `npx jest --no-coverage`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/swimlane-view.ts styles.css
git commit -m "feat: dwell-to-expand collapsed columns during drag"
```

---

## Chunk 4: Selection Mode + Collapsed Column Interaction

### Task 6: Select All in Column Expands Collapsed Columns

**Files:**
- Modify: `src/swimlane-view.ts`

- [ ] **Step 1: Update "Select all in column" to expand collapsed columns**

Find where "Select all in column" is wired in the column menu (Task 9 from batch operations added this). The `selectColumn` method on `SelectionManager` auto-enters selection mode. Before calling `selectColumn`, expand the column if collapsed:

```typescript
menu.addItem(item => {
    item.setTitle("Select all in column")
        .setIcon("check-square")
        .onClick(() => {
            this.expandColumn(groupKey)
            this.selectionManager.selectColumn(columnPaths)
        })
})
```

Since `expandColumn` updates the config and `selectColumn` triggers `onChanged` which calls `rebuildBoard()`, the expand will take effect on the next rebuild.

Note: For collapsed columns, the column menu is not shown (the strip doesn't have a menu button). "Select all in column" for collapsed columns would need to come from a context menu on the strip, or the strip itself could be right-clickable. However, the simplest approach: the strip's click handler already expands the column. If the user wants to select all cards, they expand first then use the column menu. No special handling needed beyond what the spec says.

Actually, re-reading the spec: "Select all in column on a collapsed column: auto-expands the column, then selects all cards." This implies the action is available from the column menu — but collapsed columns don't have a column menu. The spec likely means: if a collapsed column is expanded via any means during selection mode, the "Select all in column" in the newly visible column menu will work normally. No extra code needed beyond ensuring `expandColumn` works during selection mode.

- [ ] **Step 2: Run tests**

Run: `npx jest --no-coverage`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/swimlane-view.ts
git commit -m "feat: expand collapsed columns when selecting all in column"
```

---

## Chunk 5: Integration & Cleanup

### Task 7: Integration Testing

**Files:**
- Modify: `src/swimlane-view.test.ts`

- [ ] **Step 1: Add collapsed column tests**

Add a `describe("column collapsing")` block:

```typescript
describe("column collapsing", () => {
    it("collapsed column renders as strip instead of full column", () => {
        const { view, container, configStore } = makeView([
            makeGroup("Backlog", [makeEntry("A")]),
            makeGroup("Done", [makeEntry("B")]),
        ])
        configStore.collapsedSwimlanes = ["Done"]
        view.onDataUpdated()
        expect(container.querySelector(".swimlane-column-collapsed")).toBeTruthy()
        expect(container.querySelector(".swimlane-column-collapsed")!.dataset.groupKey).toBe("Done")
        // Full "Done" column should not exist
        const fullColumns = Array.from(container.querySelectorAll(".swimlane-column"))
        expect(fullColumns.every(c => (c as HTMLElement).dataset.groupKey !== "Done")).toBe(true)
    })

    it("collapsed strip shows card count", () => {
        const { view, container, configStore } = makeView([
            makeGroup("Done", [makeEntry("A"), makeEntry("B"), makeEntry("C")]),
        ])
        configStore.collapsedSwimlanes = ["Done"]
        view.onDataUpdated()
        const count = container.querySelector(".swimlane-column-collapsed-count")
        expect(count!.textContent).toBe("3")
    })

    it("clicking collapsed strip expands the column", () => {
        const { view, container, configStore } = makeView([
            makeGroup("Done", [makeEntry("A")]),
        ])
        configStore.collapsedSwimlanes = ["Done"]
        view.onDataUpdated()
        const strip = container.querySelector(".swimlane-column-collapsed")!
        ;(strip as HTMLElement).click()
        // After click, config should no longer have "Done" as collapsed
        expect(configStore.collapsedSwimlanes).not.toContain("Done")
    })
})
```

Adapt test setup to match existing patterns — check how `configStore` works in the existing tests and how config values are set/read.

- [ ] **Step 2: Add context menu suppression test**

```typescript
describe("context menu in selection mode", () => {
    it("suppresses card context menu when selection mode is active", () => {
        const { view, container } = makeView([
            makeGroup("Backlog", [makeEntry("A")]),
        ])
        ;(view as any).selectionManager.enter()
        view.onDataUpdated()
        const card = container.querySelector(".swimlane-card")!
        const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
        card.dispatchEvent(event)
        // Menu should not have been shown — we can check that preventDefault was called
        expect(event.defaultPrevented).toBe(true)
        // No menu in DOM (Obsidian Menu adds to document.body)
    })
})
```

- [ ] **Step 3: Run all tests**

Run: `npx jest --no-coverage`
Expected: All tests pass.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Success.

- [ ] **Step 6: Commit**

```bash
git add src/swimlane-view.test.ts
git commit -m "test: add tests for column collapsing and context menu suppression"
```
