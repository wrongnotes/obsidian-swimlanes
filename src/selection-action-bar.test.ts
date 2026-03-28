import { renderActionBar } from "./selection-action-bar"

describe("renderActionBar", () => {
    it("renders count label, action buttons, and close button", () => {
        const bar = renderActionBar({
            selectedCount: 3,
            onSelectAll: jest.fn(),
            onDeselectAll: jest.fn(),
            onMove: jest.fn(),
            onTag: jest.fn(),
            onDelete: jest.fn(),
            onClose: jest.fn(),
        })
        expect(bar.querySelector(".swimlane-action-bar-count")!.textContent).toBe("3 cards selected")
        expect(bar.querySelector("[data-action='select-all']")).toBeTruthy()
        expect(bar.querySelector("[data-action='deselect-all']")).toBeTruthy()
        expect(bar.querySelector("[data-action='move']")).toBeTruthy()
        expect(bar.querySelector("[data-action='tag']")).toBeTruthy()
        expect(bar.querySelector("[data-action='delete']")).toBeTruthy()
        expect(bar.querySelector("[data-action='close']")).toBeTruthy()
    })

    it("shows singular label for 1 card", () => {
        const bar = renderActionBar({
            selectedCount: 1,
            onSelectAll: jest.fn(),
            onDeselectAll: jest.fn(),
            onMove: jest.fn(),
            onTag: jest.fn(),
            onDelete: jest.fn(),
            onClose: jest.fn(),
        })
        expect(bar.querySelector(".swimlane-action-bar-count")!.textContent).toBe("1 card selected")
    })

    it("disables action buttons when selectedCount is 0", () => {
        const bar = renderActionBar({
            selectedCount: 0,
            onSelectAll: jest.fn(),
            onDeselectAll: jest.fn(),
            onMove: jest.fn(),
            onTag: jest.fn(),
            onDelete: jest.fn(),
            onClose: jest.fn(),
        })
        expect((bar.querySelector("[data-action='move']") as HTMLButtonElement).disabled).toBe(true)
        expect((bar.querySelector("[data-action='tag']") as HTMLButtonElement).disabled).toBe(true)
        expect((bar.querySelector("[data-action='delete']") as HTMLButtonElement).disabled).toBe(true)
    })

    it("calls callbacks when buttons are clicked", () => {
        const onMove = jest.fn()
        const onClose = jest.fn()
        const bar = renderActionBar({
            selectedCount: 2,
            onSelectAll: jest.fn(),
            onDeselectAll: jest.fn(),
            onMove,
            onTag: jest.fn(),
            onDelete: jest.fn(),
            onClose,
        })
        ;(bar.querySelector("[data-action='move']") as HTMLButtonElement).click()
        expect(onMove).toHaveBeenCalled()
        ;(bar.querySelector("[data-action='close']") as HTMLButtonElement).click()
        expect(onClose).toHaveBeenCalled()
    })
})
