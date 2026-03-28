import { batchMove } from "./batch-actions"
import { UndoManager } from "./undo/undo-manager"

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
            app: mockApp, cards, targetSwimlane: "done",
            swimlaneProp: "status", rankProp: "rank", lastRankInTarget: "p",
            undoManager, getAutomationMutations: () => ({ mutations: [], previousValues: {} }),
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
            app: mockApp, cards, targetSwimlane: "done",
            swimlaneProp: "status", rankProp: "rank", lastRankInTarget: "p",
            undoManager, getAutomationMutations: () => ({ mutations: [], previousValues: {} }),
        })
        expect(mockProcessFrontMatter).toHaveBeenCalledTimes(1)
    })

    it("does not create transaction when all cards are already in target", async () => {
        const cards = [
            { file: { path: "a.md" } as any, currentSwimlane: "done", currentRank: "m" },
        ]
        await batchMove({
            app: mockApp, cards, targetSwimlane: "done",
            swimlaneProp: "status", rankProp: "rank", lastRankInTarget: "p",
            undoManager, getAutomationMutations: () => ({ mutations: [], previousValues: {} }),
        })
        expect(undoManager.canUndo).toBe(false)
    })
})
