import { MultiValueText } from "./multi-value-text"

function addValue(container: HTMLElement, value: string): void {
    const input = container.querySelector("input")!
    input.value = value
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
}

describe("MultiValueText", () => {
    let containerEl: HTMLElement

    beforeEach(() => {
        containerEl = document.createElement("div")
    })

    it("renders a setting with the given name and description", () => {
        new MultiValueText({
            name: "Tags",
            desc: "Add tags",
            containerEl,
        })
        expect(containerEl.querySelector(".setting-item-name")?.textContent).toBe("Tags")
        expect(containerEl.querySelector(".setting-item-description")?.textContent).toBe("Add tags")
    })

    it("adds values via Enter key", () => {
        const mvt = new MultiValueText({ name: "Tags", desc: "Add tags", containerEl })
        addValue(containerEl, "alpha")
        expect(mvt.getValues()).toEqual(["alpha"])
        const tags = containerEl.querySelectorAll(".swimlane-multi-value-text-tag")
        expect(tags).toHaveLength(1)
        expect(tags[0]?.textContent).toContain("alpha")
    })

    it("prevents duplicate values", () => {
        const mvt = new MultiValueText({ name: "Tags", desc: "Add tags", containerEl })
        addValue(containerEl, "alpha")
        addValue(containerEl, "alpha")
        expect(mvt.getValues()).toEqual(["alpha"])
    })

    it("ignores empty input", () => {
        const mvt = new MultiValueText({ name: "Tags", desc: "Add tags", containerEl })
        addValue(containerEl, "  ")
        expect(mvt.getValues()).toEqual([])
    })

    it("removes values when clicking remove button", () => {
        const mvt = new MultiValueText({ name: "Tags", desc: "Add tags", containerEl })
        addValue(containerEl, "alpha")
        addValue(containerEl, "beta")
        const removeBtns = containerEl.querySelectorAll(".swimlane-multi-value-text-tag-remove")
        ;(removeBtns[0] as HTMLElement).click()
        expect(mvt.getValues()).toEqual(["beta"])
    })

    it("calls onChange when values change", () => {
        const onChange = jest.fn()
        new MultiValueText({ name: "Tags", desc: "Add tags", containerEl, onChange })
        addValue(containerEl, "alpha")
        expect(onChange).toHaveBeenCalledWith(["alpha"])
    })

    it("calls onChange when values are removed", () => {
        const onChange = jest.fn()
        new MultiValueText({ name: "Tags", desc: "Add tags", containerEl, onChange })
        addValue(containerEl, "alpha")
        onChange.mockClear()
        const removeBtn = containerEl.querySelector(".swimlane-multi-value-text-tag-remove")!
        ;(removeBtn as HTMLElement).click()
        expect(onChange).toHaveBeenCalledWith([])
    })

    it("sets placeholder on the input", () => {
        new MultiValueText({
            name: "Tags",
            desc: "Add tags",
            placeholder: "Type here",
            containerEl,
        })
        const input = containerEl.querySelector("input")!
        expect(input.placeholder).toBe("Type here")
    })

    it("clears the input after adding a value", () => {
        new MultiValueText({ name: "Tags", desc: "Add tags", containerEl })
        const input = containerEl.querySelector("input")!
        input.value = "alpha"
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
        // setValue("") is called by the Setting text component mock
        expect(input.value).toBe("")
    })

    it("does not add on non-Enter keys", () => {
        const mvt = new MultiValueText({ name: "Tags", desc: "Add tags", containerEl })
        const input = containerEl.querySelector("input")!
        input.value = "alpha"
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }))
        expect(mvt.getValues()).toEqual([])
    })

    it("adds values via the plus button", () => {
        const mvt = new MultiValueText({ name: "Tags", desc: "Add tags", containerEl })
        const input = containerEl.querySelector("input")!
        input.value = "alpha"
        const plusBtn = containerEl.querySelector(".clickable-icon") as HTMLElement
        plusBtn.click()
        expect(mvt.getValues()).toEqual(["alpha"])
        expect(input.value).toBe("")
    })

    it("ignores empty input via the plus button", () => {
        const mvt = new MultiValueText({ name: "Tags", desc: "Add tags", containerEl })
        const plusBtn = containerEl.querySelector(".clickable-icon") as HTMLElement
        plusBtn.click()
        expect(mvt.getValues()).toEqual([])
    })
})
