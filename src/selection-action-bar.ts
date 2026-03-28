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
        text: "Move to\u2026",
        attr: { "data-action": "move" },
    })
    moveBtn.disabled = disabled
    moveBtn.addEventListener("click", (e) => callbacks.onMove(e))

    const tagBtn = actionGroup.createEl("button", {
        cls: "swimlane-action-bar-btn",
        text: "Tag\u2026",
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
