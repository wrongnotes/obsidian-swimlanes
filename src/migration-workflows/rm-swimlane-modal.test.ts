import { RmSwimlaneModal, RmSwimlaneContext } from "./rm-swimlane-modal"
import type { RmSwimlaneOp } from "./operations"

function makeCtx(overrides?: Partial<RmSwimlaneContext>): RmSwimlaneContext {
    return {
        app: {} as any,
        columnName: "Backlog",
        files: [{ path: "a.md" }, { path: "b.md" }] as any,
        swimlaneProp: "status",
        otherColumns: ["In Progress", "Done"],
        onConfirm: jest.fn(),
        ...overrides,
    }
}

function openModal(ctx: RmSwimlaneContext) {
    const modal = new RmSwimlaneModal(ctx)
    modal.onOpen()
    return modal
}

function getOptions(modal: RmSwimlaneModal): HTMLElement[] {
    return Array.from(modal.contentEl.querySelectorAll(".swimlane-migration-option"))
}

function getSelect(modal: RmSwimlaneModal): HTMLSelectElement {
    return modal.contentEl.querySelector("select")!
}

function getInput(modal: RmSwimlaneModal): HTMLInputElement {
    return modal.contentEl.querySelector(".swimlane-migration-input")!
}

describe("RmSwimlaneModal", () => {
    it("renders title with column name", () => {
        const modal = openModal(makeCtx({ columnName: "Archive" }))
        // setTitle is a no-op in mock, but description should reference card count
        const desc = modal.contentEl.querySelector(".swimlane-migration-description")
        expect(desc?.textContent).toContain("2 cards")
    })

    it("renders singular 'card' for 1 file", () => {
        const modal = openModal(makeCtx({ files: [{ path: "a.md" }] as any }))
        const desc = modal.contentEl.querySelector(".swimlane-migration-description")
        expect(desc?.textContent).toContain("1 card.")
        expect(desc?.textContent).not.toContain("1 cards")
    })

    it("renders four options", () => {
        const modal = openModal(makeCtx())
        expect(getOptions(modal)).toHaveLength(4)
    })

    it("defaults to 'move' selected", () => {
        const modal = openModal(makeCtx())
        const options = getOptions(modal)
        expect(options[0]?.classList.contains("swimlane-migration-option--selected")).toBe(true)
    })

    it("clicking hide row selects it and deselects move", () => {
        const modal = openModal(makeCtx())
        const options = getOptions(modal)
        options[1]?.click() // hide row
        expect(options[0]?.classList.contains("swimlane-migration-option--selected")).toBe(false)
        expect(options[1]?.classList.contains("swimlane-migration-option--selected")).toBe(true)
    })

    it("clicking clear row selects it", () => {
        const modal = openModal(makeCtx())
        const options = getOptions(modal)
        options[2]?.click() // clear row
        expect(options[2]?.classList.contains("swimlane-migration-option--selected")).toBe(true)
    })

    it("clicking delete row selects it", () => {
        const modal = openModal(makeCtx())
        const options = getOptions(modal)
        options[3]?.click() // delete row
        expect(options[3]?.classList.contains("swimlane-migration-option--selected")).toBe(true)
    })

    it("delete option has danger class", () => {
        const modal = openModal(makeCtx())
        const options = getOptions(modal)
        expect(options[3]?.classList.contains("swimlane-migration-option--danger")).toBe(true)
    })

    it("renders select with other columns", () => {
        const modal = openModal(makeCtx({ otherColumns: ["Done", "Archive"] }))
        const select = getSelect(modal)
        const optionTexts = Array.from(select.options).map(o => o.text)
        expect(optionTexts).toContain("Done")
        expect(optionTexts).toContain("Archive")
    })

    it("renders 'New value…' option in select", () => {
        const modal = openModal(makeCtx())
        const select = getSelect(modal)
        const optionTexts = Array.from(select.options).map(o => o.text)
        expect(optionTexts).toContain("New value…")
    })

    it("shows text input when 'New value…' is selected", () => {
        const modal = openModal(makeCtx())
        const select = getSelect(modal)
        select.value = "__swimlane_new_value__"
        select.dispatchEvent(new Event("change"))
        const input = getInput(modal)
        expect(input.classList.contains("swimlane-migration-input--hidden")).toBe(false)
    })

    it("hides text input when an existing column is selected", () => {
        const modal = openModal(makeCtx({ otherColumns: ["Done"] }))
        const select = getSelect(modal)
        // Default should be "Done" which hides the input
        const input = getInput(modal)
        expect(input.classList.contains("swimlane-migration-input--hidden")).toBe(true)
    })

    it("onClose empties contentEl", () => {
        const modal = openModal(makeCtx())
        modal.onClose()
        expect(modal.contentEl.innerHTML).toBe("")
    })

    it("renders option labels with icons", () => {
        const modal = openModal(makeCtx())
        const icons = modal.contentEl.querySelectorAll(".swimlane-migration-option-icon")
        expect(icons.length).toBeGreaterThanOrEqual(4)
    })

    it("renders hint text on hide option", () => {
        const modal = openModal(makeCtx())
        const hints = modal.contentEl.querySelectorAll(".swimlane-migration-option-hint")
        const hintTexts = Array.from(hints).map(h => h.textContent)
        expect(hintTexts).toContain("Cards are unchanged; swimlane is hidden from this view")
    })

    it("renders hint text on clear option", () => {
        const modal = openModal(makeCtx())
        const hints = modal.contentEl.querySelectorAll(".swimlane-migration-option-hint")
        const hintTexts = Array.from(hints).map(h => h.textContent)
        expect(hintTexts).toContain("Cards will no longer appear on the board")
    })

    it("renders hint text on delete option", () => {
        const modal = openModal(makeCtx())
        const hints = modal.contentEl.querySelectorAll(".swimlane-migration-option-hint")
        const hintTexts = Array.from(hints).map(h => h.textContent)
        expect(hintTexts).toContain("Moves note files to trash")
    })

    it("select change sets selection to move", () => {
        const modal = openModal(makeCtx())
        const options = getOptions(modal)
        options[1]?.click() // select hide first
        expect(options[1]?.classList.contains("swimlane-migration-option--selected")).toBe(true)
        const select = getSelect(modal)
        select.dispatchEvent(new Event("change"))
        // Should be back to move selected
        expect(options[0]?.classList.contains("swimlane-migration-option--selected")).toBe(true)
    })

    it("input typing sets selection to move", () => {
        const modal = openModal(makeCtx())
        const options = getOptions(modal)
        options[1]?.click() // select hide first
        const select = getSelect(modal)
        select.value = "__swimlane_new_value__"
        select.dispatchEvent(new Event("change"))
        // Now type in the input
        const input = getInput(modal)
        input.value = "New Column"
        input.dispatchEvent(new Event("input"))
        expect(options[0]?.classList.contains("swimlane-migration-option--selected")).toBe(true)
    })

    it("select click stops propagation to prevent row selection", () => {
        const modal = openModal(makeCtx())
        const select = getSelect(modal)
        const evt = new MouseEvent("click", { bubbles: true })
        const spy = jest.spyOn(evt, "stopPropagation")
        select.dispatchEvent(evt)
        expect(spy).toHaveBeenCalled()
    })

    it("input click stops propagation", () => {
        const modal = openModal(makeCtx())
        const input = getInput(modal)
        const evt = new MouseEvent("click", { bubbles: true })
        const spy = jest.spyOn(evt, "stopPropagation")
        input.dispatchEvent(evt)
        expect(spy).toHaveBeenCalled()
    })
})
