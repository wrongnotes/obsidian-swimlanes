import type { UndoOperation, UndoTransaction } from "./types"

const MAX_STACK_SIZE = 50

export class UndoManager {
    private undoStack: UndoTransaction[] = []
    private redoStack: UndoTransaction[] = []
    private activeTransaction: { label: string; operations: UndoOperation[] } | null = null

    beginTransaction(label: string): void {
        if (this.activeTransaction !== null) {
            throw new Error("A transaction is already active")
        }
        this.activeTransaction = { label, operations: [] }
    }

    pushOperation(op: UndoOperation): void {
        if (this.activeTransaction === null) {
            throw new Error("No active transaction")
        }
        this.activeTransaction.operations.push(op)
    }

    endTransaction(): void {
        if (this.activeTransaction === null) {
            throw new Error("No active transaction")
        }
        const tx = this.activeTransaction
        this.activeTransaction = null

        if (tx.operations.length === 0) {
            return
        }

        this.undoStack.push({ label: tx.label, operations: tx.operations })
        if (this.undoStack.length > MAX_STACK_SIZE) {
            this.undoStack.shift()
        }
        this.redoStack = []
    }

    undo(): UndoTransaction | null {
        const tx = this.undoStack.pop()
        if (tx === undefined) {
            return null
        }
        this.redoStack.push(tx)
        return tx
    }

    redo(): UndoTransaction | null {
        const tx = this.redoStack.pop()
        if (tx === undefined) {
            return null
        }
        this.undoStack.push(tx)
        return tx
    }

    get canUndo(): boolean {
        return this.undoStack.length > 0
    }

    get canRedo(): boolean {
        return this.redoStack.length > 0
    }

    get undoLabel(): string | null {
        return this.undoStack.at(-1)?.label ?? null
    }

    get redoLabel(): string | null {
        return this.redoStack.at(-1)?.label ?? null
    }

    get hasActiveTransaction(): boolean {
        return this.activeTransaction !== null
    }

    clear(): void {
        this.undoStack = []
        this.redoStack = []
        this.activeTransaction = null
    }
}
