import { CreateBaseModal } from "./create-base-modal"

function makeApp() {
    return {
        vault: {
            getAllFolders: () => [],
            getMarkdownFiles: () => [],
            create: jest.fn().mockResolvedValue({ path: "test.base" }),
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
            getFileCache: () => null,
        },
    } as any
}

describe("CreateBaseModal", () => {
    let modal: CreateBaseModal
    let app: ReturnType<typeof makeApp>

    beforeEach(() => {
        app = makeApp()
        modal = new CreateBaseModal(app)
    })

    it("sets the modal title", () => {
        modal.open()
        expect(modal.titleEl.textContent).toBe("Create swimlanes")
    })

    it("renders name, folder, and swimlanes settings", () => {
        modal.open()
        const names = modal.contentEl.querySelectorAll(".setting-item-name")
        const labels = Array.from(names).map(n => n.textContent)
        expect(labels).toContain("Name")
        expect(labels).toContain("Folder")
        expect(labels).toContain("Swimlanes")
        expect(labels).toContain("Property")
        expect(labels).toContain("Values")
    })

    it("renders name as the first field", () => {
        modal.open()
        const names = modal.contentEl.querySelectorAll(".setting-item-name")
        expect(names[0]?.textContent).toBe("Name")
    })

    it("defaults group property to swimlane", () => {
        modal.open()
        const inputs = modal.contentEl.querySelectorAll("input")
        // name=0, folder=1, group key=2
        expect(inputs[2]?.value).toBe("swimlane")
    })

    it("renders a create button", () => {
        modal.open()
        const button = modal.contentEl.querySelector("button")
        expect(button).not.toBeNull()
        expect(button?.textContent).toBe("Create")
    })

    it("shows validation error when name is empty", async () => {
        modal.open()
        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()
        const error = modal.contentEl.querySelector(".swimlane-modal-error")
        expect(error).not.toBeNull()
        expect(error?.textContent).toBe("Name is required.")
    })

    it("shows validation error when group key is empty", async () => {
        modal.open()
        setInputValue(modal.contentEl, 0, "My Base")
        setInputValue(modal.contentEl, 2, "")
        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()
        const error = modal.contentEl.querySelector(".swimlane-modal-error")
        expect(error?.textContent).toBe("Grouping property is required.")
    })

    it("shows validation error when no group values are added", async () => {
        modal.open()
        setInputValue(modal.contentEl, 0, "My Base")
        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()
        const error = modal.contentEl.querySelector(".swimlane-modal-error")
        expect(error?.textContent).toBe("Add at least one swimlane.")
    })

    it("adds group values via Enter key", () => {
        modal.open()
        addGroupValue(modal.contentEl, "To Do")
        const tags = modal.contentEl.querySelectorAll(".swimlane-multi-value-text-tag")
        expect(tags.length).toBe(1)
        expect(tags[0]?.textContent).toContain("To Do")
    })

    it("prevents duplicate group values", () => {
        modal.open()
        addGroupValue(modal.contentEl, "To Do")
        addGroupValue(modal.contentEl, "To Do")
        const tags = modal.contentEl.querySelectorAll(".swimlane-multi-value-text-tag")
        expect(tags.length).toBe(1)
    })

    it("removes group values when clicking remove button", () => {
        modal.open()
        addGroupValue(modal.contentEl, "To Do")
        const removeBtn = modal.contentEl.querySelector(".swimlane-multi-value-text-tag-remove")!
        ;(removeBtn as HTMLElement).click()
        const tags = modal.contentEl.querySelectorAll(".swimlane-multi-value-text-tag")
        expect(tags.length).toBe(0)
    })

    it("creates the base file on submit", async () => {
        modal.open()
        setInputValue(modal.contentEl, 0, "Task board")
        setInputValue(modal.contentEl, 1, "Projects")
        addGroupValue(modal.contentEl, "To Do")
        addGroupValue(modal.contentEl, "Done")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        expect(app.vault.create).toHaveBeenCalledWith(
            "Projects/Task board.base",
            expect.any(String),
        )
    })

    it("shows error when file already exists", async () => {
        app.vault.adapter.exists.mockResolvedValue(true)
        modal.open()
        setInputValue(modal.contentEl, 0, "Existing")
        addGroupValue(modal.contentEl, "To Do")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        expect(app.vault.create).not.toHaveBeenCalled()
        const error = modal.contentEl.querySelector(".swimlane-modal-error")
        expect(error?.textContent).toContain("already exists")
    })

    describe("buildBaseConfig", () => {
        beforeEach(() => {
            modal.open()
        })

        it("creates config with folder filter", () => {
            addGroupValue(modal.contentEl, "To Do")
            addGroupValue(modal.contentEl, "Done")

            const config = modal.buildBaseConfig("Projects")
            expect(config.filters).toBe("Projects")
            expect(config.views).toHaveLength(1)
            expect(config.views![0]!.type).toBe("sheet")
            expect(config.views![0]!.name).toBe("Sheet")
            expect(config.views![0]!.order).toContain("note.swimlane")
        })

        it("omits filter when folder is empty", () => {
            addGroupValue(modal.contentEl, "To Do")

            const config = modal.buildBaseConfig("")
            expect(config.filters).toBeUndefined()
        })

        it("includes property config for the group key", () => {
            setInputValue(modal.contentEl, 2, "priority")
            addGroupValue(modal.contentEl, "High")

            const config = modal.buildBaseConfig("Notes")
            expect(config.properties).toHaveProperty("priority")
        })
    })
})

function setInputValue(container: HTMLElement, index: number, value: string): void {
    const inputs = container.querySelectorAll("input")
    const input = inputs[index]!
    input.value = value
    input.dispatchEvent(new Event("input", { bubbles: true }))
}

function addGroupValue(container: HTMLElement, value: string): void {
    const inputs = container.querySelectorAll("input")
    const groupValueInput = inputs[3]! // name, folder, group key, group values
    groupValueInput.value = value
    groupValueInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
}

function flush(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0))
}
