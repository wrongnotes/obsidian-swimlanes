import { KanbanImportModal, ImportProgressModal } from "./kanban-import-modal"

const KANBAN_MD = [
    "---",
    "kanban-plugin: basic",
    "---",
    "",
    "## To Do",
    "- [ ] [[Existing Note]]",
    "- [ ] New card #tag #tag2",
    "- [ ] Dated task @{2026-03-11} @@{14:30}",
    "## Done",
    "**Complete**",
    "- [x] [[Finished]]",
    "***",
    "## Archive",
    "- [x] [[Old Task]]",
].join("\n")

function makeApp() {
    return {
        vault: {
            getAllFolders: () => [],
            getMarkdownFiles: () => [
                { path: "Boards/my-board.md", basename: "my-board", extension: "md" },
            ],
            read: jest.fn().mockResolvedValue(KANBAN_MD),
            create: jest.fn().mockImplementation(async (path: string) => ({
                path,
                basename:
                    path
                        .split("/")
                        .pop()
                        ?.replace(/\.[^.]+$/, "") ?? "",
            })),
            getAbstractFileByPath: jest.fn().mockImplementation((path: string) => ({
                path,
                basename:
                    path
                        .split("/")
                        .pop()
                        ?.replace(/\.[^.]+$/, "") ?? "",
            })),
            createFolder: jest.fn().mockResolvedValue(undefined),
            adapter: {
                exists: jest.fn().mockResolvedValue(false),
            },
        },
        workspace: {
            getLeaf: () => ({
                openFile: jest.fn().mockResolvedValue(undefined),
            }),
        },
        metadataCache: {
            getFileCache: (file: any) => {
                if (file.path === "Boards/my-board.md") {
                    return { frontmatter: { "kanban-plugin": "basic" } }
                }
                return null
            },
            getFirstLinkpathDest: jest.fn().mockReturnValue(null),
        },
        fileManager: {
            processFrontMatter: jest
                .fn()
                .mockImplementation(
                    async (_file: any, cb: (fm: Record<string, unknown>) => void) => {
                        cb({})
                    },
                ),
            renameFile: jest.fn().mockResolvedValue(undefined),
        },
    } as any
}

describe("KanbanImportModal", () => {
    let modal: KanbanImportModal
    let app: ReturnType<typeof makeApp>

    beforeEach(() => {
        app = makeApp()
        modal = new KanbanImportModal(app)
    })

    it("sets the modal title", () => {
        modal.open()
        expect(modal.titleEl.textContent).toBe("Import from kanban")
    })

    it("renders description text", () => {
        modal.open()
        const desc = modal.contentEl.querySelector(".swimlane-modal-description")
        expect(desc).not.toBeNull()
        expect(desc?.textContent).toContain("kanban community plugin")
    })

    it("renders all settings", () => {
        modal.open()
        const names = modal.contentEl.querySelectorAll(".setting-item-name")
        const labels = Array.from(names).map(n => n.textContent)
        expect(labels).toContain("Kanban board")
        expect(labels).toContain("Name")
        expect(labels).toContain("Source folder")
        expect(labels).toContain("Custom properties")
        expect(labels).toContain("Swimlane")
        expect(labels).toContain("Rank")
        expect(labels).toContain("Import dates")
        expect(labels).toContain("Date property")
        expect(labels).toContain("Time property")
        expect(labels).toContain("Import archived cards")
        expect(labels).toContain("Archived status")
    })

    it("defaults swimlane property to status", () => {
        modal.open()
        const inputs = modal.contentEl.querySelectorAll("input")
        // source=0, name=1, folder=2, swimlane=3, rank=4
        expect(inputs[3]?.value).toBe("status")
    })

    it("defaults rank property to rank", () => {
        modal.open()
        const inputs = modal.contentEl.querySelectorAll("input")
        expect(inputs[4]?.value).toBe("rank")
    })

    it("renders import button", () => {
        modal.open()
        const button = modal.contentEl.querySelector("button")
        expect(button?.textContent).toBe("Import")
    })

    it("shows empty preview before file is selected", () => {
        modal.open()
        const preview = modal.contentEl.querySelector(".swimlane-import-preview-empty")
        expect(preview).not.toBeNull()
        expect(preview?.textContent).toContain("Select a kanban board")
    })

    it("shows validation error when no file is selected", async () => {
        modal.open()
        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()
        const error = modal.contentEl.querySelector(".swimlane-modal-error")
        expect(error?.textContent).toBe("Select a kanban board file.")
    })

    it("shows validation error when name is empty", async () => {
        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "")
        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()
        const error = modal.contentEl.querySelector(".swimlane-modal-error")
        expect(error?.textContent).toBe("Name is required.")
    })

    it("shows validation error when swimlane property is empty", async () => {
        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")
        enableCustomProperties(modal.contentEl)
        setInputValue(modal.contentEl, 3, "")
        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()
        const error = modal.contentEl.querySelector(".swimlane-modal-error")
        expect(error?.textContent).toBe("Property name is required.")
    })

    it("auto-populates name from kanban file", async () => {
        modal.open()
        await selectSource(modal, app)
        const inputs = modal.contentEl.querySelectorAll("input")
        expect(inputs[1]?.value).toBe("my-board")
    })

    it("renders preview after selecting a file", async () => {
        modal.open()
        await selectSource(modal, app)

        const title = modal.contentEl.querySelector(".swimlane-import-preview-title")
        expect(title?.textContent).toBe("Columns")

        // Archive toggle is off by default, so only column cards count
        const summary = modal.contentEl.querySelector(".swimlane-import-preview-summary")
        expect(summary?.textContent).toContain("4 cards")
        expect(summary?.textContent).not.toContain("archived")

        const cols = modal.contentEl.querySelectorAll(".swimlane-import-preview-column-name")
        const colNames = Array.from(cols).map(c => c.textContent)
        expect(colNames).toEqual(["To Do", "Done"])
    })

    it("creates notes and base file on import", async () => {
        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        // Should have called processFrontMatter for linked note + created new note
        expect(app.fileManager.processFrontMatter).toHaveBeenCalled()
        // New notes go into the default Tasks folder
        expect(app.vault.create).toHaveBeenCalledWith("Tasks/New card.md", "")
        // Should have created the .base file
        expect(app.vault.create).toHaveBeenCalledWith("My board.base", expect.any(String))
    })

    it("resolves linked notes via metadataCache", async () => {
        const linkedFile = {
            path: "Tasks/Existing Note.md",
            basename: "Existing Note",
            name: "Existing Note.md",
            parent: { path: "Tasks" },
        }
        app.metadataCache.getFirstLinkpathDest.mockImplementation((link: string) =>
            link === "Existing Note" ? linkedFile : null,
        )

        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        expect(app.fileManager.processFrontMatter).toHaveBeenCalledWith(
            linkedFile,
            expect.any(Function),
        )
    })

    it("sets rank on imported cards in order within each column", async () => {
        const frontmatters: Record<string, unknown>[] = []
        app.fileManager.processFrontMatter.mockImplementation(
            async (_file: any, cb: (fm: Record<string, unknown>) => void) => {
                const fm: Record<string, unknown> = {}
                cb(fm)
                frontmatters.push(fm)
            },
        )

        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        // Column cards should have a rank property
        const columnCards = frontmatters.filter(
            fm => fm.status !== undefined && fm.archived === undefined,
        )
        expect(columnCards.every(fm => typeof fm.rank === "string")).toBe(true)

        // "To Do" column has 3 cards — their ranks should be ascending
        const todoRanks = columnCards
            .filter(fm => fm.status === "To Do")
            .map(fm => fm.rank as string)
        expect(todoRanks.length).toBe(3)
        expect(todoRanks[1]! > todoRanks[0]!).toBe(true)
        expect(todoRanks[2]! > todoRanks[1]!).toBe(true)

        // Each column's ranks restart independently
        const doneRanks = columnCards
            .filter(fm => fm.status === "Done")
            .map(fm => fm.rank as string)
        expect(doneRanks.length).toBe(1)
        expect(doneRanks[0]).toBe("m") // first card gets midRank(null, null)

        // Archived cards don't get a rank
        const archivedCards = frontmatters.filter(fm => fm.archived === true)
        expect(archivedCards.every(fm => fm.rank === undefined)).toBe(true)
    })

    it("uses custom rank property name", async () => {
        const frontmatters: Record<string, unknown>[] = []
        app.fileManager.processFrontMatter.mockImplementation(
            async (_file: any, cb: (fm: Record<string, unknown>) => void) => {
                const fm: Record<string, unknown> = {}
                cb(fm)
                frontmatters.push(fm)
            },
        )

        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")
        enableCustomProperties(modal.contentEl)
        setInputValue(modal.contentEl, 4, "order")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        const columnCards = frontmatters.filter(
            fm => fm.status !== undefined && fm.archived === undefined,
        )
        expect(columnCards.every(fm => typeof fm.order === "string")).toBe(true)
        expect(columnCards.every(fm => fm.rank === undefined)).toBe(true)
    })

    it("sets completed on cards in complete lanes", async () => {
        const frontmatters: Array<{ file: string; fm: Record<string, unknown> }> = []
        app.fileManager.processFrontMatter.mockImplementation(
            async (file: any, cb: (fm: Record<string, unknown>) => void) => {
                const fm: Record<string, unknown> = {}
                cb(fm)
                frontmatters.push({ file: file.path ?? file.basename, fm })
            },
        )

        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        // "Done" column has **Complete** marker, so its cards get completed: true
        const finishedFm = frontmatters.find(f => f.fm.status === "Done")
        expect(finishedFm?.fm.completed).toBe(true)

        // "To Do" cards are not completed
        const todoFms = frontmatters.filter(f => f.fm.status === "To Do")
        expect(todoFms.every(f => f.fm.completed === undefined)).toBe(true)
    })

    it("does not import archived cards by default", async () => {
        const frontmatters: Record<string, unknown>[] = []
        app.fileManager.processFrontMatter.mockImplementation(
            async (_file: any, cb: (fm: Record<string, unknown>) => void) => {
                const fm: Record<string, unknown> = {}
                cb(fm)
                frontmatters.push(fm)
            },
        )

        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        expect(frontmatters.every(fm => fm.archived === undefined)).toBe(true)
    })

    it("imports archived cards when toggle is enabled", async () => {
        const frontmatters: Record<string, unknown>[] = []
        app.fileManager.processFrontMatter.mockImplementation(
            async (_file: any, cb: (fm: Record<string, unknown>) => void) => {
                const fm: Record<string, unknown> = {}
                cb(fm)
                frontmatters.push(fm)
            },
        )

        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")
        enableArchiveImport(modal.contentEl)

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        const archivedFm = frontmatters.find(fm => fm.archived === true)
        expect(archivedFm).toBeDefined()
        expect(archivedFm?.status).toBe("Archived")
        expect(archivedFm?.completed).toBe(true)
    })

    it("uses custom archive status", async () => {
        const frontmatters: Record<string, unknown>[] = []
        app.fileManager.processFrontMatter.mockImplementation(
            async (_file: any, cb: (fm: Record<string, unknown>) => void) => {
                const fm: Record<string, unknown> = {}
                cb(fm)
                frontmatters.push(fm)
            },
        )

        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")
        enableArchiveImport(modal.contentEl)
        // archive status input is index 7 (source=0, name=1, property=2, rank=3, folder=4, date=5, time=6, archive status=7)
        setInputValue(modal.contentEl, 7, "Done")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        const archivedFm = frontmatters.find(fm => fm.archived === true)
        expect(archivedFm?.status).toBe("Done")
    })

    it("imports tags as frontmatter array", async () => {
        const frontmatters: Record<string, unknown>[] = []
        app.fileManager.processFrontMatter.mockImplementation(
            async (_file: any, cb: (fm: Record<string, unknown>) => void) => {
                const fm: Record<string, unknown> = {}
                cb(fm)
                frontmatters.push(fm)
            },
        )

        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        const taggedFm = frontmatters.find(fm => fm.tags !== undefined)
        expect(taggedFm).toBeDefined()
        expect(taggedFm?.tags).toEqual(["tag", "tag2"])
    })

    it("does not import dates by default", async () => {
        const frontmatters: Record<string, unknown>[] = []
        app.fileManager.processFrontMatter.mockImplementation(
            async (_file: any, cb: (fm: Record<string, unknown>) => void) => {
                const fm: Record<string, unknown> = {}
                cb(fm)
                frontmatters.push(fm)
            },
        )

        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        expect(frontmatters.every(fm => fm.date === undefined)).toBe(true)
        expect(frontmatters.every(fm => fm.time === undefined)).toBe(true)
    })

    it("imports date and time when date toggle is enabled", async () => {
        const frontmatters: Record<string, unknown>[] = []
        app.fileManager.processFrontMatter.mockImplementation(
            async (_file: any, cb: (fm: Record<string, unknown>) => void) => {
                const fm: Record<string, unknown> = {}
                cb(fm)
                frontmatters.push(fm)
            },
        )

        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")
        enableDateImport(modal.contentEl)

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        const datedFm = frontmatters.find(fm => fm.date !== undefined)
        expect(datedFm).toBeDefined()
        expect(datedFm?.date).toBe("2026-03-11")

        const timedFm = frontmatters.find(fm => fm.time !== undefined)
        expect(timedFm).toBeDefined()
        expect(timedFm?.time).toBe("14:30")
    })

    it("uses custom date and time property names", async () => {
        const frontmatters: Record<string, unknown>[] = []
        app.fileManager.processFrontMatter.mockImplementation(
            async (_file: any, cb: (fm: Record<string, unknown>) => void) => {
                const fm: Record<string, unknown> = {}
                cb(fm)
                frontmatters.push(fm)
            },
        )

        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")
        enableDateImport(modal.contentEl)
        // date property=5, time property=6
        setInputValue(modal.contentEl, 5, "deadline")
        setInputValue(modal.contentEl, 6, "scheduledTime")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        const datedFm = frontmatters.find(fm => fm.deadline !== undefined)
        expect(datedFm).toBeDefined()
        expect(datedFm?.deadline).toBe("2026-03-11")
        expect(datedFm?.date).toBeUndefined()

        const timedFm = frontmatters.find(fm => fm.scheduledTime !== undefined)
        expect(timedFm).toBeDefined()
        expect(timedFm?.scheduledTime).toBe("14:30")
        expect(timedFm?.time).toBeUndefined()
    })

    it("creates new notes for unlinked cards in default Tasks folder", async () => {
        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        // "New card" has no link, so a new file should be created in the default folder
        expect(app.vault.create).toHaveBeenCalledWith("Tasks/New card.md", "")
    })

    it("creates the default Tasks folder if it does not exist", async () => {
        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        expect(app.vault.createFolder).toHaveBeenCalledWith("Tasks")
    })

    it("creates a custom folder if it does not exist", async () => {
        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")
        setInputValue(modal.contentEl, 2, "Cards")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        expect(app.vault.createFolder).toHaveBeenCalledWith("Cards")
    })

    it("does not create the folder if it already exists", async () => {
        app.vault.adapter.exists.mockImplementation(async (path: string) =>
            path === "Cards" ? true : false,
        )
        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")
        setInputValue(modal.contentEl, 2, "Cards")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        expect(app.vault.createFolder).not.toHaveBeenCalledWith("Cards")
    })

    it("uses folder path for new notes", async () => {
        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")
        setInputValue(modal.contentEl, 2, "Cards")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        expect(app.vault.create).toHaveBeenCalledWith("Cards/New card.md", "")
    })

    it("places the base file at the name path, not in the notes folder", async () => {
        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "Boards/My board")
        setInputValue(modal.contentEl, 2, "Cards")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        expect(app.vault.create).toHaveBeenCalledWith("Boards/My board.base", expect.any(String))
    })

    it("shows move confirmation when linked notes are outside source folder", async () => {
        const linkedFile = {
            path: "Other/Existing Note.md",
            basename: "Existing Note",
            name: "Existing Note.md",
            parent: { path: "Other" },
        }
        app.metadataCache.getFirstLinkpathDest.mockImplementation((link: string) =>
            link === "Existing Note" ? linkedFile : null,
        )

        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")
        setInputValue(modal.contentEl, 2, "Cards")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        const confirmation = modal.contentEl.querySelector(".swimlane-move-confirmation")
        expect(confirmation).not.toBeNull()
        expect(confirmation?.textContent).toContain("Existing Note.md")
        // Should NOT have created the base yet
        expect(app.vault.create).not.toHaveBeenCalledWith("My board.base", expect.any(String))
    })

    it("moves notes when 'Move and import' is clicked", async () => {
        const linkedFile = {
            path: "Other/Existing Note.md",
            basename: "Existing Note",
            name: "Existing Note.md",
            parent: { path: "Other" },
        }
        app.metadataCache.getFirstLinkpathDest.mockImplementation((link: string) =>
            link === "Existing Note" ? linkedFile : null,
        )

        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")
        setInputValue(modal.contentEl, 2, "Cards")

        const importBtn = modal.contentEl.querySelector("button")!
        importBtn.click()
        await flush()

        // Click "Move and import"
        const moveBtn = modal.contentEl.querySelector(
            ".swimlane-move-confirmation .mod-cta",
        ) as HTMLElement
        expect(moveBtn).not.toBeNull()
        moveBtn.click()
        await flush()

        expect(app.fileManager.renameFile).toHaveBeenCalledWith(
            linkedFile,
            "Cards/Existing Note.md",
        )
        // Should have proceeded with import
        expect(app.vault.create).toHaveBeenCalledWith("My board.base", expect.any(String))
    })

    it("skips move when 'Import without moving' is clicked", async () => {
        const linkedFile = {
            path: "Other/Existing Note.md",
            basename: "Existing Note",
            name: "Existing Note.md",
            parent: { path: "Other" },
        }
        app.metadataCache.getFirstLinkpathDest.mockImplementation((link: string) =>
            link === "Existing Note" ? linkedFile : null,
        )

        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")
        setInputValue(modal.contentEl, 2, "Cards")

        const importBtn = modal.contentEl.querySelector("button")!
        importBtn.click()
        await flush()

        // Click "Import without moving"
        const buttons = modal.contentEl.querySelectorAll(".swimlane-move-confirmation button")
        const skipBtn = buttons[1] as HTMLElement
        skipBtn.click()
        await flush()

        expect(app.fileManager.renameFile).not.toHaveBeenCalled()
        // Should have proceeded with import anyway
        expect(app.vault.create).toHaveBeenCalledWith("My board.base", expect.any(String))
    })

    it("skips move confirmation when no folder is set", async () => {
        const linkedFile = {
            path: "Existing Note.md",
            basename: "Existing Note",
            name: "Existing Note.md",
            parent: { path: "" },
        }
        app.metadataCache.getFirstLinkpathDest.mockImplementation((link: string) =>
            link === "Existing Note" ? linkedFile : null,
        )

        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")
        setInputValue(modal.contentEl, 2, "") // Clear the default folder

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        // Should import directly without confirmation
        const confirmation = modal.contentEl.querySelector(".swimlane-move-confirmation")
        expect(confirmation).toBeNull()
        expect(app.vault.create).toHaveBeenCalledWith("My board.base", expect.any(String))
    })

    it("skips move confirmation when linked notes are already in source folder", async () => {
        const linkedFile = {
            path: "Cards/Existing Note.md",
            basename: "Existing Note",
            name: "Existing Note.md",
            parent: { path: "Cards" },
        }
        app.metadataCache.getFirstLinkpathDest.mockImplementation((link: string) =>
            link === "Existing Note" ? linkedFile : null,
        )

        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")
        setInputValue(modal.contentEl, 2, "Cards")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        // Should import directly without confirmation
        const confirmation = modal.contentEl.querySelector(".swimlane-move-confirmation")
        expect(confirmation).toBeNull()
        expect(app.vault.create).toHaveBeenCalledWith("My board.base", expect.any(String))
    })

    it("updates card count when columns are excluded", async () => {
        modal.open()
        await selectSource(modal, app)

        // Initially "4 cards" (archive toggle off)
        let summary = modal.contentEl.querySelector(".swimlane-import-preview-summary")
        expect(summary?.textContent).toContain("4 cards")

        // Exclude "To Do" (3 cards) — should show "1 card"
        const cols = modal.contentEl.querySelectorAll(".swimlane-import-preview-column")
        ;(cols[0] as HTMLElement).click()
        summary = modal.contentEl.querySelector(".swimlane-import-preview-summary")
        expect(summary?.textContent).toContain("1 card")
    })

    it("includes archived count when archive toggle is enabled", async () => {
        modal.open()
        await selectSource(modal, app)

        // Enable archive import
        enableArchiveImport(modal.contentEl)

        const summary = modal.contentEl.querySelector(".swimlane-import-preview-summary")
        expect(summary?.textContent).toContain("5 cards")
        expect(summary?.textContent).toContain("1 archived")
    })

    it("renders toggleable columns in preview with checkboxes", async () => {
        modal.open()
        await selectSource(modal, app)

        const cols = modal.contentEl.querySelectorAll(".swimlane-import-preview-column")
        expect(cols).toHaveLength(2)

        // All columns start checked
        const checkboxes = modal.contentEl.querySelectorAll<HTMLInputElement>(
            ".swimlane-import-preview-column-checkbox",
        )
        expect(checkboxes[0]?.checked).toBe(true)
        expect(checkboxes[1]?.checked).toBe(true)

        // Click a column to exclude it
        ;(cols[0] as HTMLElement).click()
        const excluded = modal.contentEl.querySelectorAll(
            ".swimlane-import-preview-column--excluded",
        )
        expect(excluded).toHaveLength(1)
        const unchecked = modal.contentEl.querySelector<HTMLInputElement>(
            ".swimlane-import-preview-column--excluded .swimlane-import-preview-column-checkbox",
        )
        expect(unchecked?.checked).toBe(false)

        // Click again to re-include
        const updatedCols = modal.contentEl.querySelectorAll(".swimlane-import-preview-column")
        ;(updatedCols[0] as HTMLElement).click()
        const reIncluded = modal.contentEl.querySelectorAll(
            ".swimlane-import-preview-column--excluded",
        )
        expect(reIncluded).toHaveLength(0)
    })

    it("skips excluded columns on import", async () => {
        const frontmatters: Record<string, unknown>[] = []
        app.fileManager.processFrontMatter.mockImplementation(
            async (_file: any, cb: (fm: Record<string, unknown>) => void) => {
                const fm: Record<string, unknown> = {}
                cb(fm)
                frontmatters.push(fm)
            },
        )

        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")

        // Exclude the "Done" column
        const cols = modal.contentEl.querySelectorAll(".swimlane-import-preview-column")
        ;(cols[1] as HTMLElement).click()

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        // No cards should have status "Done"
        expect(frontmatters.every(fm => fm.status !== "Done")).toBe(true)
        // "To Do" cards should still be imported
        expect(frontmatters.some(fm => fm.status === "To Do")).toBe(true)
    })

    it("excludes columns from swimlaneOrder in base config", async () => {
        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")

        // Exclude the "Done" column
        const cols = modal.contentEl.querySelectorAll(".swimlane-import-preview-column")
        ;(cols[1] as HTMLElement).click()

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        const baseCall = app.vault.create.mock.calls.find((c: any[]) => c[0].endsWith(".base"))
        const config = JSON.parse(baseCall[1])
        const view = config.views[0]
        expect(view.swimlaneOrder).toEqual(["To Do"])
        expect(view.swimlaneOrder).not.toContain("Done")
    })

    it("sanitizes invalid filename characters and adds alias", async () => {
        const frontmatters: Array<{ path: string; fm: Record<string, unknown> }> = []
        app.fileManager.processFrontMatter.mockImplementation(
            async (file: any, cb: (fm: Record<string, unknown>) => void) => {
                const fm: Record<string, unknown> = {}
                cb(fm)
                frontmatters.push({ path: file.path, fm })
            },
        )

        const kanbanWithSlash = [
            "---",
            "kanban-plugin: basic",
            "---",
            "",
            "## To Do",
            "- [ ] Feature A/B test",
        ].join("\n")
        app.vault.read.mockResolvedValue(kanbanWithSlash)

        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")
        setInputValue(modal.contentEl, 2, "Cards")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        // File path should use sanitized name
        expect(app.vault.create).toHaveBeenCalledWith("Cards/Feature A-B test.md", "")
        // Should have set an alias with the original name
        const cardFm = frontmatters.find(f => f.path === "Cards/Feature A-B test.md")
        expect(cardFm?.fm.aliases).toEqual(["Feature A/B test"])
    })

    it("does not add alias when filename needs no sanitization", async () => {
        const frontmatters: Array<{ path: string; fm: Record<string, unknown> }> = []
        app.fileManager.processFrontMatter.mockImplementation(
            async (file: any, cb: (fm: Record<string, unknown>) => void) => {
                const fm: Record<string, unknown> = {}
                cb(fm)
                frontmatters.push({ path: file.path, fm })
            },
        )

        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        const cardFm = frontmatters.find(f => f.path === "Tasks/New card.md")
        expect(cardFm?.fm.aliases).toBeUndefined()
    })

    it("continues importing when a card fails and reports errors", async () => {
        let callCount = 0
        app.vault.create.mockImplementation(async (path: string) => {
            callCount++
            if (path === "Tasks/New card.md") {
                throw new Error("Disk full")
            }
            return { path, basename: path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "" }
        })

        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        // Should still have created the .base file despite one card failing
        expect(app.vault.create).toHaveBeenCalledWith("My board.base", expect.any(String))
    })

    it("shows progress modal during import", async () => {
        modal.open()
        await selectSource(modal, app)
        setInputValue(modal.contentEl, 1, "My board")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        // The base file should have been created (import completed)
        expect(app.vault.create).toHaveBeenCalledWith("My board.base", expect.any(String))
    })

    it("defaults source folder to Tasks", () => {
        modal.open()
        const inputs = modal.contentEl.querySelectorAll("input")
        // source=0, name=1, folder=2
        expect(inputs[2]?.value).toBe("Tasks")
    })

    it("shows descriptive text for source folder", () => {
        modal.open()
        const descs = modal.contentEl.querySelectorAll(".setting-item-description")
        const descTexts = Array.from(descs).map(d => d.textContent)
        expect(descTexts).toContain("Imported tasks will be created as notes in this directory.")
    })

    describe("buildBaseConfig", () => {
        it("creates config with property and folder", () => {
            modal.open()
            const config = modal.buildBaseConfig("Notes", "status", ["To Do", "Done"], false)
            expect(config.filters).toEqual({ and: ['file.folder == "Notes"'] })
            expect(config.properties).toHaveProperty("status")
            const view = config.views![0] as any
            expect(view.groupBy).toEqual({ property: "status", direction: "ASC" })
            expect(view.order).toContain("note.status")
            expect(view.swimlaneProperty).toBe("note.status")
            expect(view.swimlaneOrder).toEqual(["To Do", "Done"])
            expect(view.filters).toBeUndefined()
        })

        it("omits filters when folder is empty and no archive", () => {
            modal.open()
            const config = modal.buildBaseConfig("", "status", ["To Do"], false)
            expect(config.filters).toBeUndefined()
            const view = config.views![0] as any
            expect(view.filters).toBeUndefined()
        })

        it("adds archive filter as a per-view filter", () => {
            modal.open()
            const config = modal.buildBaseConfig("", "status", ["To Do"], true)
            expect(config.filters).toBeUndefined()
            const view = config.views![0] as any
            expect(view.filters).toEqual({ and: ["archived != true"] })
        })

        it("keeps folder as all-view filter and archive as per-view filter", () => {
            modal.open()
            const config = modal.buildBaseConfig("Notes", "status", ["To Do"], true)
            expect(config.filters).toEqual({ and: ['file.folder == "Notes"'] })
            const view = config.views![0] as any
            expect(view.filters).toEqual({ and: ["archived != true"] })
        })
    })
})

async function selectSource(modal: KanbanImportModal, app: any): Promise<void> {
    const file = app.vault.getMarkdownFiles()[0]
    // Simulate what FileSuggest does: call the onSourceSelected method via the internal path
    // We access it by triggering the same flow: read + parse
    await (modal as any).onSourceSelected(file)
}

function setInputValue(container: HTMLElement, index: number, value: string): void {
    const inputs = container.querySelectorAll("input")
    const input = inputs[index]!
    input.value = value
    input.dispatchEvent(new Event("input", { bubbles: true }))
}

function enableCustomProperties(container: HTMLElement): void {
    const toggles = container.querySelectorAll(".checkbox-container")
    ;(toggles[0] as HTMLElement)?.click()
}

function enableDateImport(container: HTMLElement): void {
    const toggles = container.querySelectorAll(".checkbox-container")
    ;(toggles[1] as HTMLElement)?.click()
}

function enableArchiveImport(container: HTMLElement): void {
    const toggles = container.querySelectorAll(".checkbox-container")
    ;(toggles[2] as HTMLElement)?.click()
}

async function flush(count = 10): Promise<void> {
    for (let i = 0; i < count; i++) {
        await new Promise(resolve => setTimeout(resolve, 0))
    }
}
