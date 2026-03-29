import { UndoManager } from "./undo/undo-manager"

export class SelectionManager {
    active = false
    selected = new Set<string>()

    constructor(
        private undoManager: UndoManager,
        private onChanged: () => void,
    ) {}

    enter(): void {
        if (this.active) {
            return
        }
        this.active = true
        this.onChanged()
    }

    exit(): void {
        if (!this.active) {
            return
        }
        this.active = false
        this.selected.clear()
        this.undoManager.purge(tx => tx.operations.every(op => op.type === "SelectionChange"))
        this.onChanged()
    }

    toggle(path: string): void {
        if (!this.active) {
            return
        }
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
        if (!this.active) {
            return
        }
        const prev = new Set(this.selected)
        this.selected = new Set(allPaths)
        this.pushSelectionChange(prev, new Set(this.selected), "Select all")
        this.onChanged()
    }

    deselectAll(): void {
        if (!this.active) {
            return
        }
        const prev = new Set(this.selected)
        this.selected.clear()
        this.pushSelectionChange(prev, new Set(this.selected), "Deselect all")
        this.onChanged()
    }

    selectColumn(columnPaths: string[]): void {
        if (!this.active) {
            this.enter()
        }
        const prev = new Set(this.selected)
        for (const p of columnPaths) {
            this.selected.add(p)
        }
        this.pushSelectionChange(prev, new Set(this.selected), "Select column")
        this.onChanged()
    }

    deselectColumn(columnPaths: string[]): void {
        if (!this.active) {
            return
        }
        const prev = new Set(this.selected)
        for (const p of columnPaths) {
            this.selected.delete(p)
        }
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
        if (changed) {
            this.onChanged()
        }
    }

    private pushSelectionChange(prev: Set<string>, next: Set<string>, label: string): void {
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
