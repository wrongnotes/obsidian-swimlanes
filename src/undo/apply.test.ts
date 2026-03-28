import { applyUndo, applyRedo } from "./apply"
import type { UndoRedoContext } from "./apply"
import type { UndoTransaction } from "./types"

// ─── mocks ────────────────────────────────────────────────────────────────────

function makeMockApp() {
    return {
        vault: {
            getFileByPath: jest.fn((path: string) => ({ path })),
            trash: jest.fn(),
            create: jest.fn(async (path: string) => ({ path })),
            process: jest.fn(async (_file: any, fn: (s: string) => string) => fn("{}")),
            getAbstractFileByPath: jest.fn(() => null),
        },
        fileManager: {
            processFrontMatter: jest.fn(
                async (_file: any, fn: (fm: Record<string, unknown>) => void) => {
                    const fm: Record<string, unknown> = {}
                    fn(fm)
                    return fm
                },
            ),
            trashFile: jest.fn(),
        },
    } as any
}

function makeMockConfig() {
    const store: Record<string, unknown> = {}
    return {
        get: (key: string) => store[key] ?? null,
        set: (key: string, value: unknown) => {
            store[key] = value
        },
        name: "Swimlane",
        _store: store,
    }
}

function makeCtx(app: ReturnType<typeof makeMockApp>): UndoRedoContext {
    return {
        app,
        config: makeMockConfig(),
        swimlaneProp: "status",
        rankProp: "rank",
        baseFile: { path: "board.base" } as any,
    }
}

const mockFile = { path: "notes/card.md" } as any

// ─── applyUndo ────────────────────────────────────────────────────────────────

describe("applyUndo", () => {
    test("MoveCard: processFrontMatter restores swimlane, rank and automation previous values", async () => {
        const app = makeMockApp()
        const ctx = makeCtx(app)

        const transaction: UndoTransaction = {
            label: "Move",
            operations: [
                {
                    type: "MoveCard",
                    file: mockFile,
                    fromSwimlane: "Todo",
                    toSwimlane: "Done",
                    fromRank: "aaa",
                    toRank: "bbb",
                    resolvedAutomationMutations: [],
                    automationPreviousValues: { completedAt: undefined, tags: ["work"] },
                },
            ],
        }

        await applyUndo(transaction, ctx)

        expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1)
        // Inspect the fm callback
        const callback = app.fileManager.processFrontMatter.mock.calls[0][1]
        const fm: Record<string, unknown> = { completedAt: "2024-01-01", tags: ["work"] }
        callback(fm)
        expect(fm.status).toBe("Todo")
        expect(fm.rank).toBe("aaa")
        expect(fm.completedAt).toBeUndefined()
        expect(fm.tags).toEqual(["work"])
    })

    test("ReorderCard: processFrontMatter restores fromRank", async () => {
        const app = makeMockApp()
        const ctx = makeCtx(app)

        const transaction: UndoTransaction = {
            label: "Reorder",
            operations: [
                {
                    type: "ReorderCard",
                    file: mockFile,
                    fromRank: "aaa",
                    toRank: "bbb",
                },
            ],
        }

        await applyUndo(transaction, ctx)

        const callback = app.fileManager.processFrontMatter.mock.calls[0][1]
        const fm: Record<string, unknown> = {}
        callback(fm)
        expect(fm.rank).toBe("aaa")
    })

    test("CreateCard: vault.trash is called", async () => {
        const app = makeMockApp()
        const ctx = makeCtx(app)

        const transaction: UndoTransaction = {
            label: "Create",
            operations: [
                {
                    type: "CreateCard",
                    file: mockFile,
                    path: mockFile.path,
                    swimlane: "Todo",
                    rank: "aaa",
                    resolvedAutomationMutations: [],
                    automationPreviousValues: {},
                },
            ],
        }

        await applyUndo(transaction, ctx)

        expect(app.fileManager.trashFile).toHaveBeenCalledWith(
            expect.objectContaining({ path: mockFile.path }),
        )
    })

    test("ReorderSwimlane: config.set called with previousOrder", async () => {
        const app = makeMockApp()
        const ctx = makeCtx(app)
        const setSpy = jest.spyOn(ctx.config, "set")

        const transaction: UndoTransaction = {
            label: "Reorder Swimlane",
            operations: [
                {
                    type: "ReorderSwimlane",
                    previousOrder: ["Todo", "In Progress", "Done"],
                    newOrder: ["In Progress", "Todo", "Done"],
                },
            ],
        }

        await applyUndo(transaction, ctx)

        expect(setSpy).toHaveBeenCalledWith("swimlaneOrder", ["Todo", "In Progress", "Done"])
    })

    test("AddSwimlane: swimlane removed from order", async () => {
        const app = makeMockApp()
        const ctx = makeCtx(app)
        ctx.config.set("swimlaneOrder", ["Todo", "Review", "Done"])
        const setSpy = jest.spyOn(ctx.config, "set")

        const transaction: UndoTransaction = {
            label: "Add Swimlane",
            operations: [
                {
                    type: "AddSwimlane",
                    swimlane: "Review",
                },
            ],
        }

        await applyUndo(transaction, ctx)

        expect(setSpy).toHaveBeenCalledWith("swimlaneOrder", ["Todo", "Done"])
    })

    test("RemoveSwimlane: order restored, cards restored", async () => {
        const app = makeMockApp()
        const ctx = makeCtx(app)
        const setSpy = jest.spyOn(ctx.config, "set")

        const cardFile = { path: "notes/card1.md" } as any

        const transaction: UndoTransaction = {
            label: "Remove Swimlane",
            operations: [
                {
                    type: "RemoveSwimlane",
                    swimlane: "Archive",
                    op: { kind: "move", targetValue: "Done" },
                    previousOrder: ["Todo", "Archive", "Done"],
                    cardStates: [
                        {
                            file: cardFile,
                            previousValue: "Archive",
                            resolvedAutomationMutations: [],
                            automationPreviousValues: {},
                        },
                    ],
                },
            ],
        }

        await applyUndo(transaction, ctx)

        expect(setSpy).toHaveBeenCalledWith("swimlaneOrder", ["Todo", "Archive", "Done"])
        expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1)
        const callback = app.fileManager.processFrontMatter.mock.calls[0][1]
        const fm: Record<string, unknown> = { status: "Done" }
        callback(fm)
        expect(fm.status).toBe("Archive")
    })

    test("RemoveSwimlane: card with undefined previousValue deletes property", async () => {
        const app = makeMockApp()
        const ctx = makeCtx(app)

        const cardFile = { path: "notes/card2.md" } as any

        const transaction: UndoTransaction = {
            label: "Remove Swimlane",
            operations: [
                {
                    type: "RemoveSwimlane",
                    swimlane: "Archive",
                    op: { kind: "clear" },
                    previousOrder: ["Todo", "Done"],
                    cardStates: [
                        {
                            file: cardFile,
                            previousValue: undefined,
                            resolvedAutomationMutations: [],
                            automationPreviousValues: {},
                        },
                    ],
                },
            ],
        }

        await applyUndo(transaction, ctx)

        const callback = app.fileManager.processFrontMatter.mock.calls[0][1]
        const fm: Record<string, unknown> = { status: "Archive" }
        callback(fm)
        expect(fm.status).toBeUndefined()
    })

    test("HideSwimlane: swimlane removed from hidden set", async () => {
        const app = makeMockApp()
        const ctx = makeCtx(app)
        ctx.config.set("hiddenSwimlanes", ["Archive", "Done"])
        const setSpy = jest.spyOn(ctx.config, "set")

        const transaction: UndoTransaction = {
            label: "Hide Swimlane",
            operations: [{ type: "HideSwimlane", swimlane: "Archive" }],
        }

        await applyUndo(transaction, ctx)

        expect(setSpy).toHaveBeenCalledWith("hiddenSwimlanes", ["Done"])
    })

    test("ShowSwimlane: swimlane added back to hidden set", async () => {
        const app = makeMockApp()
        const ctx = makeCtx(app)
        ctx.config.set("hiddenSwimlanes", ["Done"])
        const setSpy = jest.spyOn(ctx.config, "set")

        const transaction: UndoTransaction = {
            label: "Show Swimlane",
            operations: [{ type: "ShowSwimlane", swimlane: "Archive" }],
        }

        await applyUndo(transaction, ctx)

        expect(setSpy).toHaveBeenCalledWith("hiddenSwimlanes", ["Done", "Archive"])
    })

    test("SetSort: vault.process called to write previousSort", async () => {
        const app = makeMockApp()
        // Provide a base file content with a matching view
        app.vault.process = jest.fn(async (_file: any, fn: (s: string) => string) => {
            const input = JSON.stringify({
                views: [{ name: "Swimlane", type: "swimlane", sort: [] }],
            })
            return fn(input)
        })
        const ctx = makeCtx(app)

        const previousSort = [{ property: "name", direction: "asc" }]
        const transaction: UndoTransaction = {
            label: "Set Sort",
            operations: [
                {
                    type: "SetSort",
                    previousSort,
                    newSort: [{ property: "rank", direction: "asc" }],
                },
            ],
        }

        await applyUndo(transaction, ctx)

        expect(app.vault.process).toHaveBeenCalledTimes(1)
        const transformFn = app.vault.process.mock.calls[0][1]
        const input = JSON.stringify({ views: [{ name: "Swimlane", type: "swimlane" }] })
        const output = JSON.parse(transformFn(input))
        expect(output.views[0].sort).toEqual(previousSort)
    })

    test("multi-op transaction: operations processed in reverse order", async () => {
        const app = makeMockApp()
        const ctx = makeCtx(app)
        const order: string[] = []

        // Override processFrontMatter to track call order
        app.fileManager.processFrontMatter = jest.fn(async (file: any, _fn: any) => {
            order.push(file.path)
        })

        const file1 = { path: "notes/card1.md" } as any
        const file2 = { path: "notes/card2.md" } as any

        const transaction: UndoTransaction = {
            label: "Multi",
            operations: [
                {
                    type: "ReorderCard",
                    file: file1,
                    fromRank: "aaa",
                    toRank: "bbb",
                },
                {
                    type: "ReorderCard",
                    file: file2,
                    fromRank: "ccc",
                    toRank: "ddd",
                },
            ],
        }

        await applyUndo(transaction, ctx)

        // second operation should be undone first
        expect(order).toEqual(["notes/card2.md", "notes/card1.md"])
    })

    test("missing file: skips operation with no crash", async () => {
        const app = makeMockApp()
        app.vault.getFileByPath = jest.fn(() => null)
        const ctx = makeCtx(app)

        const transaction: UndoTransaction = {
            label: "Move",
            operations: [
                {
                    type: "MoveCard",
                    file: mockFile,
                    fromSwimlane: "Todo",
                    toSwimlane: "Done",
                    fromRank: "aaa",
                    toRank: "bbb",
                    resolvedAutomationMutations: [],
                    automationPreviousValues: {},
                },
            ],
        }

        await expect(applyUndo(transaction, ctx)).resolves.toBeUndefined()
        expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled()
    })

    test("EditTags: restores previous tags", async () => {
        const app = makeMockApp()
        const ctx = makeCtx(app)

        const transaction: UndoTransaction = {
            label: "Edit tags",
            operations: [
                {
                    type: "EditTags",
                    file: mockFile,
                    previousTags: ["bug", "urgent"],
                    newTags: ["bug"],
                },
            ],
        }

        await applyUndo(transaction, ctx)

        const callback = app.fileManager.processFrontMatter.mock.calls[0][1]
        const fm: Record<string, unknown> = {}
        callback(fm)
        expect(fm.tags).toEqual(["bug", "urgent"])
    })

    test("EditTags: deletes tags when previousTags is empty", async () => {
        const app = makeMockApp()
        const ctx = makeCtx(app)

        const transaction: UndoTransaction = {
            label: "Edit tags",
            operations: [{ type: "EditTags", file: mockFile, previousTags: [], newTags: ["new"] }],
        }

        await applyUndo(transaction, ctx)

        const callback = app.fileManager.processFrontMatter.mock.calls[0][1]
        const fm: Record<string, unknown> = { tags: ["old"] }
        callback(fm)
        expect(fm.tags).toBeUndefined()
    })
})

// ─── applyRedo ────────────────────────────────────────────────────────────────

describe("applyRedo", () => {
    test("MoveCard: sets toSwimlane, toRank, applies automation mutations", async () => {
        const app = makeMockApp()
        const ctx = makeCtx(app)

        const transaction: UndoTransaction = {
            label: "Move",
            operations: [
                {
                    type: "MoveCard",
                    file: mockFile,
                    fromSwimlane: "Todo",
                    toSwimlane: "Done",
                    fromRank: "aaa",
                    toRank: "bbb",
                    resolvedAutomationMutations: [
                        { type: "set", property: "completedAt", value: "2024-01-01" },
                    ],
                    automationPreviousValues: {},
                },
            ],
        }

        await applyRedo(transaction, ctx)

        const callback = app.fileManager.processFrontMatter.mock.calls[0][1]
        const fm: Record<string, unknown> = {}
        callback(fm)
        expect(fm.status).toBe("Done")
        expect(fm.rank).toBe("bbb")
        expect(fm.completedAt).toBe("2024-01-01")
    })

    test("ReorderCard: sets toRank", async () => {
        const app = makeMockApp()
        const ctx = makeCtx(app)

        const transaction: UndoTransaction = {
            label: "Reorder",
            operations: [
                {
                    type: "ReorderCard",
                    file: mockFile,
                    fromRank: "aaa",
                    toRank: "bbb",
                },
            ],
        }

        await applyRedo(transaction, ctx)

        const callback = app.fileManager.processFrontMatter.mock.calls[0][1]
        const fm: Record<string, unknown> = {}
        callback(fm)
        expect(fm.rank).toBe("bbb")
    })

    test("CreateCard: vault.create + processFrontMatter called", async () => {
        const app = makeMockApp()
        const ctx = makeCtx(app)

        const transaction: UndoTransaction = {
            label: "Create",
            operations: [
                {
                    type: "CreateCard",
                    file: mockFile,
                    path: "notes/new-card.md",
                    swimlane: "Todo",
                    rank: "aaa",
                    resolvedAutomationMutations: [],
                    automationPreviousValues: {},
                },
            ],
        }

        await applyRedo(transaction, ctx)

        expect(app.vault.create).toHaveBeenCalledWith("notes/new-card.md", "")
        expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1)
        const callback = app.fileManager.processFrontMatter.mock.calls[0][1]
        const fm: Record<string, unknown> = {}
        callback(fm)
        expect(fm.status).toBe("Todo")
        expect(fm.rank).toBe("aaa")
    })

    test("ReorderSwimlane: config.set with newOrder", async () => {
        const app = makeMockApp()
        const ctx = makeCtx(app)
        const setSpy = jest.spyOn(ctx.config, "set")

        const transaction: UndoTransaction = {
            label: "Reorder Swimlane",
            operations: [
                {
                    type: "ReorderSwimlane",
                    previousOrder: ["Todo", "In Progress", "Done"],
                    newOrder: ["In Progress", "Todo", "Done"],
                },
            ],
        }

        await applyRedo(transaction, ctx)

        expect(setSpy).toHaveBeenCalledWith("swimlaneOrder", ["In Progress", "Todo", "Done"])
    })

    test("RemoveSwimlane (move): cards get targetValue, swimlane removed from order", async () => {
        const app = makeMockApp()
        const ctx = makeCtx(app)
        ctx.config.set("swimlaneOrder", ["Todo", "Archive", "Done"])
        const setSpy = jest.spyOn(ctx.config, "set")

        const cardFile = { path: "notes/card1.md" } as any

        const transaction: UndoTransaction = {
            label: "Remove Swimlane",
            operations: [
                {
                    type: "RemoveSwimlane",
                    swimlane: "Archive",
                    op: { kind: "move", targetValue: "Done" },
                    previousOrder: ["Todo", "Archive", "Done"],
                    cardStates: [
                        {
                            file: cardFile,
                            previousValue: "Archive",
                            resolvedAutomationMutations: [
                                { type: "set", property: "movedAt", value: "2024-01-01" },
                            ],
                            automationPreviousValues: {},
                        },
                    ],
                },
            ],
        }

        await applyRedo(transaction, ctx)

        // processFrontMatter should set targetValue
        const callback = app.fileManager.processFrontMatter.mock.calls[0][1]
        const fm: Record<string, unknown> = { status: "Archive" }
        callback(fm)
        expect(fm.status).toBe("Done")
        expect(fm.movedAt).toBe("2024-01-01")

        // swimlane removed from order
        expect(setSpy).toHaveBeenCalledWith("swimlaneOrder", ["Todo", "Done"])
    })

    test("RemoveSwimlane (clear): deletes swimlane property", async () => {
        const app = makeMockApp()
        const ctx = makeCtx(app)
        ctx.config.set("swimlaneOrder", ["Todo", "Archive", "Done"])

        const cardFile = { path: "notes/card2.md" } as any

        const transaction: UndoTransaction = {
            label: "Remove Swimlane Clear",
            operations: [
                {
                    type: "RemoveSwimlane",
                    swimlane: "Archive",
                    op: { kind: "clear" },
                    previousOrder: ["Todo", "Archive", "Done"],
                    cardStates: [
                        {
                            file: cardFile,
                            previousValue: "Archive",
                            resolvedAutomationMutations: [],
                            automationPreviousValues: {},
                        },
                    ],
                },
            ],
        }

        await applyRedo(transaction, ctx)

        const callback = app.fileManager.processFrontMatter.mock.calls[0][1]
        const fm: Record<string, unknown> = { status: "Archive" }
        callback(fm)
        expect(fm.status).toBeUndefined()
    })

    test("missing file: skips operation with no crash", async () => {
        const app = makeMockApp()
        app.vault.getFileByPath = jest.fn(() => null)
        const ctx = makeCtx(app)

        const transaction: UndoTransaction = {
            label: "Move",
            operations: [
                {
                    type: "MoveCard",
                    file: mockFile,
                    fromSwimlane: "Todo",
                    toSwimlane: "Done",
                    fromRank: "aaa",
                    toRank: "bbb",
                    resolvedAutomationMutations: [],
                    automationPreviousValues: {},
                },
            ],
        }

        await expect(applyRedo(transaction, ctx)).resolves.toBeUndefined()
        expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled()
    })

    test("EditTags: applies new tags", async () => {
        const app = makeMockApp()
        const ctx = makeCtx(app)

        const transaction: UndoTransaction = {
            label: "Edit tags",
            operations: [
                {
                    type: "EditTags",
                    file: mockFile,
                    previousTags: ["bug"],
                    newTags: ["bug", "feature"],
                },
            ],
        }

        await applyRedo(transaction, ctx)

        const callback = app.fileManager.processFrontMatter.mock.calls[0][1]
        const fm: Record<string, unknown> = {}
        callback(fm)
        expect(fm.tags).toEqual(["bug", "feature"])
    })

    test("EditTags: deletes tags when newTags is empty", async () => {
        const app = makeMockApp()
        const ctx = makeCtx(app)

        const transaction: UndoTransaction = {
            label: "Edit tags",
            operations: [{ type: "EditTags", file: mockFile, previousTags: ["old"], newTags: [] }],
        }

        await applyRedo(transaction, ctx)

        const callback = app.fileManager.processFrontMatter.mock.calls[0][1]
        const fm: Record<string, unknown> = { tags: ["old"] }
        callback(fm)
        expect(fm.tags).toBeUndefined()
    })

    describe("SelectionChange", () => {
        it("undo restores previousSelection", async () => {
            const app = makeMockApp()
            const ctx = makeCtx(app)
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
            const app = makeMockApp()
            const ctx = makeCtx(app)
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

    test("CreateCard redo with occupied path uses deduplication", async () => {
        const app = makeMockApp()
        // First call: occupied; second call: free
        app.vault.getAbstractFileByPath = jest
            .fn()
            .mockReturnValueOnce({ path: "notes/new-card.md" }) // original path occupied
            .mockReturnValueOnce(null) // "notes/new-card 1.md" is free
        const ctx = makeCtx(app)

        const transaction: UndoTransaction = {
            label: "Create",
            operations: [
                {
                    type: "CreateCard",
                    file: mockFile,
                    path: "notes/new-card.md",
                    swimlane: "Todo",
                    rank: "aaa",
                    resolvedAutomationMutations: [],
                    automationPreviousValues: {},
                },
            ],
        }

        await applyRedo(transaction, ctx)

        expect(app.vault.create).toHaveBeenCalledWith("notes/new-card 1.md", "")
    })
})
