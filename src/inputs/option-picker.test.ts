import { OptionPicker } from "./option-picker"
import type { OptionDef, OptionPickerConfig } from "./option-picker"

function makePicker(config?: Partial<OptionPickerConfig>): OptionPicker {
    const parent = document.createElement("div")
    const options: OptionDef[] = config?.options ?? [
        { id: "a", icon: "lucide-star", label: "Option A" },
        { id: "b", icon: "lucide-heart", label: "Option B" },
        { id: "c", icon: "lucide-trash", label: "Option C", danger: true },
    ]
    return new OptionPicker(parent, { options, ...config })
}

function getOptions(picker: OptionPicker): HTMLElement[] {
    return Array.from(picker.containerEl.querySelectorAll(".swimlane-modal-option"))
}

describe("OptionPicker", () => {
    it("renders all options", () => {
        const picker = makePicker()
        expect(getOptions(picker)).toHaveLength(3)
    })

    it("starts with no selection when no default given", () => {
        const picker = makePicker()
        expect(picker.selected).toBeNull()
    })

    it("selects the default option when defaultId is given", () => {
        const picker = makePicker({ defaultId: "b" })
        expect(picker.selected).toBe("b")
        const options = getOptions(picker)
        expect(options[0]?.classList.contains("swimlane-modal-option--selected")).toBe(false)
        expect(options[1]?.classList.contains("swimlane-modal-option--selected")).toBe(true)
    })

    it("fires onSelect callbacks for the default", () => {
        const cb = jest.fn()
        makePicker({ defaultId: "a", onSelect: [cb] })
        expect(cb).toHaveBeenCalledWith("a")
    })

    it("select() updates selected value", () => {
        const picker = makePicker()
        picker.select("b")
        expect(picker.selected).toBe("b")
    })

    it("select() adds selected class to the right option", () => {
        const picker = makePicker()
        picker.select("a")
        const options = getOptions(picker)
        expect(options[0]?.classList.contains("swimlane-modal-option--selected")).toBe(true)
        expect(options[1]?.classList.contains("swimlane-modal-option--selected")).toBe(false)
    })

    it("select() removes selected class from previously selected option", () => {
        const picker = makePicker()
        picker.select("a")
        picker.select("b")
        const options = getOptions(picker)
        expect(options[0]?.classList.contains("swimlane-modal-option--selected")).toBe(false)
        expect(options[1]?.classList.contains("swimlane-modal-option--selected")).toBe(true)
    })

    it("clicking an option selects it", () => {
        const picker = makePicker()
        getOptions(picker)[1]?.click()
        expect(picker.selected).toBe("b")
    })

    it("fires onSelect callbacks on select()", () => {
        const cb1 = jest.fn()
        const cb2 = jest.fn()
        const picker = makePicker({ onSelect: [cb1, cb2] })
        picker.select("c")
        expect(cb1).toHaveBeenCalledWith("c")
        expect(cb2).toHaveBeenCalledWith("c")
    })

    it("fires onSelect callbacks on click", () => {
        const cb = jest.fn()
        const picker = makePicker({ onSelect: [cb] })
        getOptions(picker)[0]?.click()
        expect(cb).toHaveBeenCalledWith("a")
    })

    it("renders danger class on danger options", () => {
        const picker = makePicker()
        const options = getOptions(picker)
        expect(options[2]?.classList.contains("swimlane-modal-option--danger")).toBe(true)
        expect(options[0]?.classList.contains("swimlane-modal-option--danger")).toBe(false)
    })

    it("renders hint text when provided", () => {
        const picker = makePicker({
            options: [{ id: "x", icon: "lucide-star", label: "X", hint: "Some hint" }],
        })
        const hint = picker.containerEl.querySelector(".swimlane-modal-option-hint")
        expect(hint?.textContent).toBe("Some hint")
    })

    it("does not render hint when not provided", () => {
        const picker = makePicker({
            options: [{ id: "x", icon: "lucide-star", label: "X" }],
        })
        const hint = picker.containerEl.querySelector(".swimlane-modal-option-hint")
        expect(hint).toBeNull()
    })

    it("renders icon and label elements", () => {
        const picker = makePicker()
        const icons = picker.containerEl.querySelectorAll(".swimlane-modal-option-icon")
        const labels = picker.containerEl.querySelectorAll(".swimlane-modal-option-label")
        expect(icons).toHaveLength(3)
        expect(labels).toHaveLength(3)
    })

    it("calls onRender with the label element", () => {
        const onRender = jest.fn()
        const picker = makePicker({
            options: [{ id: "x", icon: "lucide-star", label: "X", onRender }],
        })
        expect(onRender).toHaveBeenCalledTimes(1)
        expect(onRender.mock.calls[0][0]).toBeInstanceOf(HTMLElement)
        expect(onRender.mock.calls[0][0].classList.contains("swimlane-modal-option-label")).toBe(
            true,
        )
    })
})
