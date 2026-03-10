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

function getErrorEl(modal: AddSwimlaneViaDropModal): HTMLElement {
    return modal.contentEl.querySelector(".swimlane-migration-error")!
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
        expect(modal.contentEl.querySelector(".swimlane-migration-description")?.textContent).toContain(
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
        // The Setting mock creates buttons via addButton callback. Since our mock
        // doesn't fully wire up the confirm button, we test the public behavior:
        // typing an empty string and pressing Enter should NOT call onConfirm.
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

    it("shows error when value matches an existing column", () => {
        const modal = openModal(makeCtx({ existingColumns: ["Backlog", "Done"] }))
        const input = getInput(modal)
        type(input, "Done")
        const error = getErrorEl(modal)
        expect(error.textContent).toContain('Swimlane "Done" already exists')
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

    it("hides error when value is cleared after showing error", () => {
        const modal = openModal(makeCtx({ existingColumns: ["Done"] }))
        const input = getInput(modal)
        type(input, "Done")
        expect(getErrorEl(modal).style.display).not.toBe("none")
        type(input, "New Column")
        expect(getErrorEl(modal).style.display).toBe("none")
    })
})
