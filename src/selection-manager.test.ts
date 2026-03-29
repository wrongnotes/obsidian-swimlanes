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
