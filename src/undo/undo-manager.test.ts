import { UndoManager } from "./undo-manager"
import type { UndoOperation } from "./types"

function makeReorderOp(from: string, to: string): UndoOperation {
    return {
        type: "ReorderSwimlane",
        previousOrder: [from],
        newOrder: [to],
    }
}

describe("UndoManager", () => {
    let mgr: UndoManager

    beforeEach(() => {
        mgr = new UndoManager()
    })

    describe("transaction lifecycle", () => {
        it("groups operations into a transaction", () => {
            mgr.beginTransaction("Reorder")
            mgr.pushOperation(makeReorderOp("A", "B"))
            mgr.endTransaction()

            expect(mgr.canUndo).toBe(true)
            const tx = mgr.undo()
            expect(tx).not.toBeNull()
            expect(tx!.label).toBe("Reorder")
            expect(tx!.operations).toHaveLength(1)
        })

        it("discards transaction when endTransaction is called with no operations", () => {
            mgr.beginTransaction("Empty")
            mgr.endTransaction()

            expect(mgr.canUndo).toBe(false)
        })

        it("throws when pushOperation is called outside a transaction", () => {
            expect(() => mgr.pushOperation(makeReorderOp("A", "B"))).toThrow()
        })

        it("throws when beginTransaction is called while one is already active", () => {
            mgr.beginTransaction("First")
            expect(() => mgr.beginTransaction("Second")).toThrow()
        })

        it("clears the redo stack when a new transaction is committed", () => {
            // Build up a redo entry
            mgr.beginTransaction("Op1")
            mgr.pushOperation(makeReorderOp("A", "B"))
            mgr.endTransaction()

            mgr.undo()
            expect(mgr.canRedo).toBe(true)

            // New transaction should wipe redo
            mgr.beginTransaction("Op2")
            mgr.pushOperation(makeReorderOp("B", "C"))
            mgr.endTransaction()

            expect(mgr.canRedo).toBe(false)
        })
    })

    describe("hasActiveTransaction", () => {
        it("returns false initially", () => {
            expect(mgr.hasActiveTransaction).toBe(false)
        })

        it("returns true after beginTransaction", () => {
            mgr.beginTransaction("T")
            expect(mgr.hasActiveTransaction).toBe(true)
        })

        it("returns false after endTransaction", () => {
            mgr.beginTransaction("T")
            mgr.pushOperation(makeReorderOp("A", "B"))
            mgr.endTransaction()
            expect(mgr.hasActiveTransaction).toBe(false)
        })

        it("returns false after endTransaction with empty ops", () => {
            mgr.beginTransaction("T")
            mgr.endTransaction()
            expect(mgr.hasActiveTransaction).toBe(false)
        })
    })

    describe("undo/redo behavior", () => {
        it("undo() pops from undo stack and pushes to redo stack", () => {
            mgr.beginTransaction("Op")
            mgr.pushOperation(makeReorderOp("A", "B"))
            mgr.endTransaction()

            const tx = mgr.undo()
            expect(tx).not.toBeNull()
            expect(mgr.canUndo).toBe(false)
            expect(mgr.canRedo).toBe(true)
        })

        it("redo() pops from redo stack and pushes to undo stack", () => {
            mgr.beginTransaction("Op")
            mgr.pushOperation(makeReorderOp("A", "B"))
            mgr.endTransaction()

            mgr.undo()
            const tx = mgr.redo()
            expect(tx).not.toBeNull()
            expect(mgr.canUndo).toBe(true)
            expect(mgr.canRedo).toBe(false)
        })

        it("undo() returns null when stack is empty", () => {
            expect(mgr.undo()).toBeNull()
        })

        it("redo() returns null when stack is empty", () => {
            expect(mgr.redo()).toBeNull()
        })

        it("canUndo reflects undo stack state", () => {
            expect(mgr.canUndo).toBe(false)

            mgr.beginTransaction("Op")
            mgr.pushOperation(makeReorderOp("A", "B"))
            mgr.endTransaction()

            expect(mgr.canUndo).toBe(true)
            mgr.undo()
            expect(mgr.canUndo).toBe(false)
        })

        it("canRedo reflects redo stack state", () => {
            expect(mgr.canRedo).toBe(false)

            mgr.beginTransaction("Op")
            mgr.pushOperation(makeReorderOp("A", "B"))
            mgr.endTransaction()

            mgr.undo()
            expect(mgr.canRedo).toBe(true)
            mgr.redo()
            expect(mgr.canRedo).toBe(false)
        })

        it("undoLabel returns the label of the top undo entry or null", () => {
            expect(mgr.undoLabel).toBeNull()

            mgr.beginTransaction("First")
            mgr.pushOperation(makeReorderOp("A", "B"))
            mgr.endTransaction()

            mgr.beginTransaction("Second")
            mgr.pushOperation(makeReorderOp("B", "C"))
            mgr.endTransaction()

            expect(mgr.undoLabel).toBe("Second")
            mgr.undo()
            expect(mgr.undoLabel).toBe("First")
            mgr.undo()
            expect(mgr.undoLabel).toBeNull()
        })

        it("redoLabel returns the label of the top redo entry or null", () => {
            expect(mgr.redoLabel).toBeNull()

            mgr.beginTransaction("First")
            mgr.pushOperation(makeReorderOp("A", "B"))
            mgr.endTransaction()

            mgr.beginTransaction("Second")
            mgr.pushOperation(makeReorderOp("B", "C"))
            mgr.endTransaction()

            mgr.undo()
            expect(mgr.redoLabel).toBe("Second")
            mgr.undo()
            expect(mgr.redoLabel).toBe("First")
        })

        it("multiple undo then redo restores correct order", () => {
            for (const label of ["Op1", "Op2", "Op3"]) {
                mgr.beginTransaction(label)
                mgr.pushOperation(makeReorderOp("X", "Y"))
                mgr.endTransaction()
            }

            const tx3 = mgr.undo()
            const tx2 = mgr.undo()
            const tx1 = mgr.undo()

            expect(tx3!.label).toBe("Op3")
            expect(tx2!.label).toBe("Op2")
            expect(tx1!.label).toBe("Op1")
            expect(mgr.canUndo).toBe(false)

            const r1 = mgr.redo()
            const r2 = mgr.redo()
            const r3 = mgr.redo()

            expect(r1!.label).toBe("Op1")
            expect(r2!.label).toBe("Op2")
            expect(r3!.label).toBe("Op3")
            expect(mgr.canRedo).toBe(false)
        })

        it("undo() returns the transaction with all its operations", () => {
            mgr.beginTransaction("Multi")
            mgr.pushOperation(makeReorderOp("A", "B"))
            mgr.pushOperation(makeReorderOp("B", "C"))
            mgr.endTransaction()

            const tx = mgr.undo()
            expect(tx!.operations).toHaveLength(2)
        })
    })

    describe("stack size limit", () => {
        it("caps the undo stack at 50 entries, dropping the oldest", () => {
            for (let i = 0; i < 55; i++) {
                mgr.beginTransaction(`Op${i}`)
                mgr.pushOperation(makeReorderOp("A", "B"))
                mgr.endTransaction()
            }

            // Drain the stack and collect labels
            const labels: string[] = []
            let tx = mgr.undo()
            while (tx !== null) {
                labels.push(tx.label)
                tx = mgr.undo()
            }

            expect(labels).toHaveLength(50)
            // Oldest 5 (Op0–Op4) should be gone; newest is Op54
            expect(labels[0]).toBe("Op54")
            expect(labels[49]).toBe("Op5")
        })
    })

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

    describe("clear()", () => {
        it("empties both stacks and resets active transaction", () => {
            mgr.beginTransaction("Op")
            mgr.pushOperation(makeReorderOp("A", "B"))
            mgr.endTransaction()

            mgr.undo() // move to redo

            mgr.beginTransaction("Pending")
            // don't end it — clear should handle mid-transaction state

            mgr.clear()

            expect(mgr.canUndo).toBe(false)
            expect(mgr.canRedo).toBe(false)
            expect(mgr.hasActiveTransaction).toBe(false)
            expect(mgr.undoLabel).toBeNull()
            expect(mgr.redoLabel).toBeNull()
        })
    })
})
