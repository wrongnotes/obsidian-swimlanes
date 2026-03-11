import { AddSwimlaneViaDropModal, AddSwimlaneViaDropContext } from "./add-swimlane-via-drop-modal"

function makeCtx(overrides?: Partial<AddSwimlaneViaDropContext>): AddSwimlaneViaDropContext {
    return {
        app: {} as any,
        swimlaneProp: "status",
        existingColumns: ["Backlog", "Done"],
        onConfirm: jest.fn(),
        ...overrides,
    }
}

function openModal(ctx: AddSwimlaneViaDropContext) {
    const modal = new AddSwimlaneViaDropModal(ctx)
    modal.onOpen()
    return modal
}

function getInput(modal: AddSwimlaneViaDropModal): HTMLInputElement {
    return modal.contentEl.querySelector("input")!
}

function getErrorEl(modal: AddSwimlaneViaDropModal): HTMLElement | null {
    return modal.contentEl.querySelector(".swimlane-modal-error")
}

function type(input: HTMLInputElement, value: string) {
    input.value = value
    input.dispatchEvent(new Event("input"))
}

function pressEnter(input: HTMLInputElement) {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))
}

describe("AddSwimlaneViaDropModal", () => {
    it("renders title and description", () => {
        const modal = openModal(makeCtx())
        expect(modal.contentEl.querySelector(".setting-item-description")?.textContent).toContain(
            'Enter a new "status" value',
        )
    })

    it("renders an input field", () => {
        const modal = openModal(makeCtx())
        expect(getInput(modal)).not.toBeNull()
    })

    it("confirm button starts disabled", () => {
        const ctx = makeCtx()
        const modal = openModal(ctx)
        const input = getInput(modal)
        pressEnter(input)
        expect(ctx.onConfirm).not.toHaveBeenCalled()
    })

    it("does not call onConfirm when value is empty", () => {
        const ctx = makeCtx()
        const modal = openModal(ctx)
        const input = getInput(modal)
        type(input, "")
        pressEnter(input)
        expect(ctx.onConfirm).not.toHaveBeenCalled()
    })

    it("does not call onConfirm when value matches an existing column", () => {
        const ctx = makeCtx({ existingColumns: ["Backlog", "Done"] })
        const modal = openModal(ctx)
        const input = getInput(modal)
        type(input, "Done")
        pressEnter(input)
        expect(ctx.onConfirm).not.toHaveBeenCalled()
    })

    it("shows error when trying to confirm a duplicate value", () => {
        const modal = openModal(makeCtx({ existingColumns: ["Backlog", "Done"] }))
        const input = getInput(modal)
        type(input, "Done")
        pressEnter(input)
        expect(getErrorEl(modal)?.textContent).toContain('Swimlane "Done" already exists')
    })

    it("calls onConfirm with trimmed value on Enter", () => {
        const ctx = makeCtx({ existingColumns: [] })
        const modal = openModal(ctx)
        const input = getInput(modal)
        type(input, "  In Progress  ")
        pressEnter(input)
        expect(ctx.onConfirm).toHaveBeenCalledWith("In Progress")
    })

    it("onClose empties contentEl", () => {
        const modal = openModal(makeCtx())
        modal.onClose()
        expect(modal.contentEl.innerHTML).toBe("")
    })
})
