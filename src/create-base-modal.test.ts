import { CreateBaseModal } from "./create-base-modal"

function makeApp() {
    return {
        vault: {
            getAllFolders: () => [],
            getFileByPath: jest.fn().mockReturnValue({ path: "test.base" }),
            create: jest.fn().mockResolvedValue(undefined),
            adapter: {
                exists: jest.fn().mockResolvedValue(false),
            },
        },
        workspace: {
            getLeaf: () => ({
                openFile: jest.fn().mockResolvedValue(undefined),
            }),
        },
        metadataCache: {},
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
        expect(modal.titleEl.textContent).toBe("Create base")
    })

    it("renders folder, name, group key, and group values settings", () => {
        modal.open()
        const names = modal.contentEl.querySelectorAll(".setting-item-name")
        const labels = Array.from(names).map(n => n.textContent)
        expect(labels).toContain("Folder")
        expect(labels).toContain("Base name")
        expect(labels).toContain("Group property")
        expect(labels).toContain("Group values")
    })

    it("renders a create button", () => {
        modal.open()
        const button = modal.contentEl.querySelector("button")
        expect(button).not.toBeNull()
        expect(button?.textContent).toBe("Create")
    })

    it("shows validation error when base name is empty", async () => {
        modal.open()
        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()
        const error = modal.contentEl.querySelector(".create-base-error")
        expect(error).not.toBeNull()
        expect(error?.textContent).toBe("Base name is required.")
    })

    it("shows validation error when group key is empty", async () => {
        modal.open()
        setInputValue(modal.contentEl, 1, "My Base")
        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()
        const error = modal.contentEl.querySelector(".create-base-error")
        expect(error?.textContent).toBe("Group property is required.")
    })

    it("shows validation error when no group values are added", async () => {
        modal.open()
        setInputValue(modal.contentEl, 1, "My Base")
        setInputValue(modal.contentEl, 2, "status")
        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()
        const error = modal.contentEl.querySelector(".create-base-error")
        expect(error?.textContent).toBe("Add at least one group value.")
    })

    it("adds group values via Enter key", () => {
        modal.open()
        const inputs = modal.contentEl.querySelectorAll("input")
        const groupValueInput = inputs[3]! // folder, name, group key, group values
        groupValueInput.value = "To Do"
        groupValueInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
        const tags = modal.contentEl.querySelectorAll(".create-base-tag")
        expect(tags.length).toBe(1)
        expect(tags[0]?.textContent).toContain("To Do")
    })

    it("prevents duplicate group values", () => {
        modal.open()
        const inputs = modal.contentEl.querySelectorAll("input")
        const groupValueInput = inputs[3]!
        groupValueInput.value = "To Do"
        groupValueInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
        groupValueInput.value = "To Do"
        groupValueInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
        const tags = modal.contentEl.querySelectorAll(".create-base-tag")
        expect(tags.length).toBe(1)
    })

    it("removes group values when clicking remove button", () => {
        modal.open()
        const inputs = modal.contentEl.querySelectorAll("input")
        const groupValueInput = inputs[3]!
        groupValueInput.value = "To Do"
        groupValueInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
        const removeBtn = modal.contentEl.querySelector(".create-base-tag-remove")!
        ;(removeBtn as HTMLElement).click()
        const tags = modal.contentEl.querySelectorAll(".create-base-tag")
        expect(tags.length).toBe(0)
    })

    it("creates the base file on submit", async () => {
        modal.open()
        setInputValue(modal.contentEl, 0, "Projects")
        setInputValue(modal.contentEl, 1, "Task board")
        setInputValue(modal.contentEl, 2, "status")
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
        setInputValue(modal.contentEl, 1, "Existing")
        setInputValue(modal.contentEl, 2, "status")
        addGroupValue(modal.contentEl, "To Do")

        const button = modal.contentEl.querySelector("button")!
        button.click()
        await flush()

        expect(app.vault.create).not.toHaveBeenCalled()
        const error = modal.contentEl.querySelector(".create-base-error")
        expect(error?.textContent).toContain("already exists")
    })

    describe("buildBaseConfig", () => {
        beforeEach(() => {
            modal.open()
        })

        it("creates config with folder filter", () => {
            setInputValue(modal.contentEl, 2, "status")
            addGroupValue(modal.contentEl, "To Do")
            addGroupValue(modal.contentEl, "Done")

            const config = modal.buildBaseConfig("Projects")
            expect(config.filters).toBe("Projects")
            expect(config.views).toHaveLength(1)
            expect(config.views![0]!.type).toBe("sheet")
            expect(config.views![0]!.name).toBe("Sheet")
            expect(config.views![0]!.order).toContain("note.status")
        })

        it("omits filter when folder is empty", () => {
            setInputValue(modal.contentEl, 2, "status")
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
    const groupValueInput = inputs[3]!
    groupValueInput.value = value
    groupValueInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
}

function flush(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0))
}
