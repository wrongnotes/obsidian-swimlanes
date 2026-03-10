import { executeRmSwimlane } from "./operations"
import type { RmSwimlaneOp } from "./operations"

function makeApp() {
    const frontmatters = new Map<string, Record<string, any>>()
    return {
        fileManager: {
            processFrontMatter: jest.fn(async (file: any, cb: (fm: any) => void) => {
                const fm = frontmatters.get(file.path) ?? {}
                frontmatters.set(file.path, fm)
                cb(fm)
            }),
            trashFile: jest.fn(),
        },
        frontmatters,
    }
}

function makeFiles(count: number) {
    return Array.from({ length: count }, (_, i) => ({
        path: `note-${i}.md`,
        basename: `note-${i}`,
    }))
}

describe("executeRmSwimlane", () => {
    it("move: sets swimlane prop to target value on all files", async () => {
        const app = makeApp()
        const files = makeFiles(3)
        const op: RmSwimlaneOp = { kind: "move", targetValue: "Done" }

        await executeRmSwimlane(app as any, files as any, "status", op)

        expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(3)
        for (const file of files) {
            expect(app.frontmatters.get(file.path)?.status).toBe("Done")
        }
    })

    it("clear: deletes the swimlane prop from all files", async () => {
        const app = makeApp()
        const files = makeFiles(2)
        // Pre-fill frontmatter
        for (const file of files) {
            app.frontmatters.set(file.path, { status: "Backlog", other: "keep" })
        }
        const op: RmSwimlaneOp = { kind: "clear" }

        await executeRmSwimlane(app as any, files as any, "status", op)

        for (const file of files) {
            const fm = app.frontmatters.get(file.path)!
            expect(fm.status).toBeUndefined()
            expect(fm.other).toBe("keep")
        }
    })

    it("delete: trashes all files", async () => {
        const app = makeApp()
        const files = makeFiles(3)
        const op: RmSwimlaneOp = { kind: "delete" }

        await executeRmSwimlane(app as any, files as any, "status", op)

        expect(app.fileManager.trashFile).toHaveBeenCalledTimes(3)
        for (const file of files) {
            expect(app.fileManager.trashFile).toHaveBeenCalledWith(file)
        }
    })

    it("hide: does nothing (handled by view)", async () => {
        const app = makeApp()
        const files = makeFiles(1)
        const op: RmSwimlaneOp = { kind: "hide" }

        // hide is not handled by executeRmSwimlane — it falls through the switch
        await executeRmSwimlane(app as any, files as any, "status", op)

        expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled()
        expect(app.fileManager.trashFile).not.toHaveBeenCalled()
    })
})
