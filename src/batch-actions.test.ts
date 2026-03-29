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
        const cards = [{ file: { path: "a.md" } as any, currentSwimlane: "done", currentRank: "m" }]
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

import { batchAddTag, batchRemoveTag } from "./batch-actions"

describe("batchAddTag", () => {
    it("adds tag to all files via processFrontMatter", () => {
        const fmState: Record<string, { tags?: string[] }> = {
            "a.md": { tags: ["existing"] },
            "b.md": { tags: [] },
        }
        const app = {
            fileManager: {
                processFrontMatter: jest.fn((file: any, cb: any) => {
                    cb(fmState[file.path]!)
                }),
            },
        } as any
        batchAddTag({ app, files: [{ path: "a.md" } as any, { path: "b.md" } as any], tag: "new" })
        expect(fmState["a.md"]!.tags).toEqual(["existing", "new"])
        expect(fmState["b.md"]!.tags).toEqual(["new"])
    })

    it("skips files that already have the tag", () => {
        const fmState: Record<string, { tags?: string[] }> = { "a.md": { tags: ["urgent"] } }
        const app = {
            fileManager: {
                processFrontMatter: jest.fn((file: any, cb: any) => {
                    cb(fmState[file.path]!)
                }),
            },
        } as any
        batchAddTag({ app, files: [{ path: "a.md" } as any], tag: "urgent" })
        expect(fmState["a.md"]!.tags).toEqual(["urgent"])
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
        batchRemoveTag({
            app,
            files: [{ path: "a.md" } as any, { path: "b.md" } as any],
            tag: "remove",
        })
        expect(fmState["a.md"]!.tags).toEqual(["keep"])
        expect(fmState["b.md"]!.tags).toEqual([])
    })

    it("is a no-op for files without the tag", () => {
        const fmState: Record<string, { tags?: string[] }> = { "a.md": { tags: ["other"] } }
        const app = {
            fileManager: {
                processFrontMatter: jest.fn((file: any, cb: any) => {
                    cb(fmState[file.path]!)
                }),
            },
        } as any
        batchRemoveTag({ app, files: [{ path: "a.md" } as any], tag: "missing" })
        expect(fmState["a.md"]!.tags).toEqual(["other"])
    })
})
