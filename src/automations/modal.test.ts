import { AutomationsModal } from "./modal"
import type { AutomationRule } from "./types"

const rules: AutomationRule[] = [
    {
        trigger: { type: "enters", swimlane: "Done" },
        actions: [
            { type: "set", property: "completed_at", value: "{{now:YYYY-MM-DD}}" },
            { type: "clear", property: "assigned_to" },
        ],
    },
    {
        trigger: { type: "leaves", swimlane: "In Progress" },
        actions: [{ type: "set", property: "left_at", value: "{{now:YYYY-MM-DDTHH:mm}}" }],
    },
]

function openModal(
    existingRules: AutomationRule[] = [],
    swimlanes: string[] = ["Backlog", "In Progress", "Done"],
) {
    const onSave = jest.fn()
    const modal = new AutomationsModal({
        app: {} as any,
        rules: existingRules,
        swimlanes,
        swimlaneProp: "status",
        properties: [],
        onSave,
    })
    modal.onOpen()
    return { modal, onSave }
}

// ---------------------------------------------------------------------------
// Read mode
// ---------------------------------------------------------------------------

describe("AutomationsModal — read mode", () => {
    it("renders existing rules", () => {
        const { modal } = openModal(rules)
        const cards = modal.contentEl.querySelectorAll(".swimlane-automation-rule")
        expect(cards).toHaveLength(2)
    })

    it("shows trigger text containing trigger type and swimlane", () => {
        const { modal } = openModal(rules)
        const triggers = modal.contentEl.querySelectorAll(".swimlane-automation-trigger")
        expect(triggers[0]?.textContent).toContain("enters")
        expect(triggers[0]?.textContent).toContain("Done")
        expect(triggers[1]?.textContent).toContain("leaves")
        expect(triggers[1]?.textContent).toContain("In Progress")
    })

    it("shows action summaries with property names", () => {
        const { modal } = openModal(rules)
        const summaries = modal.contentEl.querySelectorAll(".swimlane-automation-action-summary")
        const texts = Array.from(summaries).map(el => el.textContent ?? "")
        expect(texts.some(t => t.includes("completed_at"))).toBe(true)
        expect(texts.some(t => t.includes("assigned_to"))).toBe(true)
        expect(texts.some(t => t.includes("left_at"))).toBe(true)
    })

    it("renders Add button", () => {
        const { modal } = openModal([])
        const addBtn = modal.contentEl.querySelector(".swimlane-automation-add-btn")
        expect(addBtn).not.toBeNull()
    })

    it("renders no rule cards when empty", () => {
        const { modal } = openModal([])
        const cards = modal.contentEl.querySelectorAll(".swimlane-automation-rule")
        expect(cards).toHaveLength(0)
    })

    it("shows 'any swimlane' text for wildcard swimlane", () => {
        const wildcardRule: AutomationRule[] = [
            {
                trigger: { type: "enters", swimlane: "*" },
                actions: [{ type: "set", property: "moved_at", value: "today" }],
            },
        ]
        const { modal } = openModal(wildcardRule)
        const trigger = modal.contentEl.querySelector(".swimlane-automation-trigger")
        expect(trigger?.textContent).toContain("any swimlane")
    })
})

// ---------------------------------------------------------------------------
// Edit mode
// ---------------------------------------------------------------------------

describe("AutomationsModal — edit/add mode", () => {
    it("Add button creates a new rule in edit mode", () => {
        const { modal } = openModal([])
        const addBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-add-btn",
        )!
        addBtn.click()
        const editor = modal.contentEl.querySelector(".swimlane-automation-editor")
        expect(editor).not.toBeNull()
    })

    it("Edit button expands rule into edit mode", () => {
        const { modal } = openModal(rules)
        const editBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-edit-btn",
        )!
        editBtn.click()
        const editor = modal.contentEl.querySelector(".swimlane-automation-editor")
        expect(editor).not.toBeNull()
    })

    it("Cancel discards changes and does not call onSave", () => {
        const { modal, onSave } = openModal(rules)
        const editBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-edit-btn",
        )!
        editBtn.click()
        const cancelBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-cancel-btn",
        )!
        cancelBtn.click()
        expect(onSave).not.toHaveBeenCalled()
        // Should be back to read mode
        expect(modal.contentEl.querySelector(".swimlane-automation-editor")).toBeNull()
    })

    it("Delete removes rule and calls onSave", () => {
        const { modal, onSave } = openModal(rules)
        const deleteBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-delete-btn",
        )!
        deleteBtn.click()
        expect(onSave).toHaveBeenCalledTimes(1)
        const savedRules = onSave.mock.calls[0][0] as AutomationRule[]
        expect(savedRules).toHaveLength(1)
    })

    it("Set action shows value field", () => {
        const { modal } = openModal(rules)
        const editBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-edit-btn",
        )!
        editBtn.click()
        const valueInputs = modal.contentEl.querySelectorAll<HTMLInputElement>(
            ".swimlane-automation-value-input",
        )
        // First action in first rule is "set completed_at" — value input should be visible
        expect(valueInputs[0]?.style.display).not.toBe("none")
    })

    it("Clear action hides value field", () => {
        const { modal } = openModal(rules)
        const editBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-edit-btn",
        )!
        editBtn.click()
        const valueInputs = modal.contentEl.querySelectorAll<HTMLInputElement>(
            ".swimlane-automation-value-input",
        )
        // Second action in first rule is "clear assigned_to" — value input should be hidden
        expect(valueInputs[1]?.classList.contains("swimlane-automation-hidden")).toBe(true)
    })

    it("switching action type to Clear hides value field", () => {
        const { modal } = openModal(rules)
        const editBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-edit-btn",
        )!
        editBtn.click()
        const typeSelects = modal.contentEl.querySelectorAll<HTMLSelectElement>(
            ".swimlane-automation-action-type-select",
        )
        // Change first action from "set" to "clear"
        typeSelects[0]!.value = "clear"
        typeSelects[0]!.dispatchEvent(new Event("change"))
        // Re-query after re-render
        const valueInputs = modal.contentEl.querySelectorAll<HTMLInputElement>(
            ".swimlane-automation-value-input",
        )
        expect(valueInputs[0]?.classList.contains("swimlane-automation-hidden")).toBe(true)
    })

    it("switching action type to Set shows value field", () => {
        const { modal } = openModal(rules)
        const editBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-edit-btn",
        )!
        editBtn.click()
        const typeSelects = modal.contentEl.querySelectorAll<HTMLSelectElement>(
            ".swimlane-automation-action-type-select",
        )
        const valueInputs = modal.contentEl.querySelectorAll<HTMLInputElement>(
            ".swimlane-automation-value-input",
        )
        // Second action is "clear" — switch to "set"
        typeSelects[1]!.value = "set"
        typeSelects[1]!.dispatchEvent(new Event("change"))
        expect(valueInputs[1]?.style.display).not.toBe("none")
    })

    it("Add action button appends an action row", () => {
        const { modal } = openModal([
            {
                trigger: { type: "enters", swimlane: "Done" },
                actions: [{ type: "set", property: "foo", value: "bar" }],
            },
        ])
        const editBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-edit-btn",
        )!
        editBtn.click()
        const addActionBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-add-action-btn",
        )!
        addActionBtn.click()
        const actionRows = modal.contentEl.querySelectorAll(".swimlane-automation-action")
        expect(actionRows).toHaveLength(2)
    })

    it("swimlane dropdown includes 'Any swimlane' option with value '*'", () => {
        const { modal } = openModal([])
        const addBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-add-btn",
        )!
        addBtn.click()
        const swimlaneSelect = modal.contentEl.querySelector<HTMLSelectElement>(
            ".swimlane-automation-swimlane-select",
        )!
        const options = Array.from(swimlaneSelect.options)
        const anyOption = options.find(o => o.value === "*")
        expect(anyOption).not.toBeUndefined()
        expect(anyOption?.text).toContain("Any swimlane")
    })

    it("swimlane dropdown includes all swimlanes", () => {
        const { modal } = openModal([], ["Backlog", "In Progress", "Done"])
        const addBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-add-btn",
        )!
        addBtn.click()
        const swimlaneSelect = modal.contentEl.querySelector<HTMLSelectElement>(
            ".swimlane-automation-swimlane-select",
        )!
        const values = Array.from(swimlaneSelect.options).map(o => o.value)
        expect(values).toContain("Backlog")
        expect(values).toContain("In Progress")
        expect(values).toContain("Done")
    })

    it("trigger type dropdown has all four options", () => {
        const { modal } = openModal([])
        const addBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-add-btn",
        )!
        addBtn.click()
        const triggerSelect = modal.contentEl.querySelector<HTMLSelectElement>(
            ".swimlane-automation-trigger-select",
        )!
        const values = Array.from(triggerSelect.options).map(o => o.value)
        expect(values).toContain("enters")
        expect(values).toContain("leaves")
        expect(values).toContain("created_in")
        expect(values).toContain("remains_in")
    })

    it("Save with valid data calls onSave", () => {
        const { modal, onSave } = openModal([])
        const addBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-add-btn",
        )!
        addBtn.click()

        const propInput = modal.contentEl.querySelector<HTMLInputElement>(
            ".swimlane-automation-prop-input",
        )!
        propInput.value = "completed_at"
        propInput.dispatchEvent(new Event("input"))

        const valueInput = modal.contentEl.querySelector<HTMLInputElement>(
            ".swimlane-automation-value-input",
        )!
        valueInput.value = "today"
        valueInput.dispatchEvent(new Event("input"))

        const saveBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-save-btn",
        )!
        saveBtn.click()

        expect(onSave).toHaveBeenCalledTimes(1)
        const saved = onSave.mock.calls[0][0] as AutomationRule[]
        expect(saved).toHaveLength(1)
        expect(saved[0]!.actions[0]).toMatchObject({
            type: "set",
            property: "completed_at",
            value: "today",
        })
    })

    it("Validation: empty property shows error, onSave not called", () => {
        const { modal, onSave } = openModal([])
        const addBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-add-btn",
        )!
        addBtn.click()

        // Leave prop empty
        const saveBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-save-btn",
        )!
        saveBtn.click()

        expect(onSave).not.toHaveBeenCalled()
        const error = modal.contentEl.querySelector(".swimlane-modal-error")
        expect(error).not.toBeNull()
    })

    it("Validation: empty value for Set action shows error", () => {
        const { modal, onSave } = openModal([])
        const addBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-add-btn",
        )!
        addBtn.click()

        const propInput = modal.contentEl.querySelector<HTMLInputElement>(
            ".swimlane-automation-prop-input",
        )!
        propInput.value = "my_prop"
        propInput.dispatchEvent(new Event("input"))
        // Leave value empty

        const saveBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-save-btn",
        )!
        saveBtn.click()

        expect(onSave).not.toHaveBeenCalled()
        const error = modal.contentEl.querySelector(".swimlane-modal-error")
        expect(error).not.toBeNull()
    })

    it("Validation: property equal to swimlaneProp shows error", () => {
        const { modal, onSave } = openModal([])
        const addBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-add-btn",
        )!
        addBtn.click()

        const propInput = modal.contentEl.querySelector<HTMLInputElement>(
            ".swimlane-automation-prop-input",
        )!
        propInput.value = "status" // same as swimlaneProp
        propInput.dispatchEvent(new Event("input"))

        const valueInput = modal.contentEl.querySelector<HTMLInputElement>(
            ".swimlane-automation-value-input",
        )!
        valueInput.value = "done"
        valueInput.dispatchEvent(new Event("input"))

        const saveBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-save-btn",
        )!
        saveBtn.click()

        expect(onSave).not.toHaveBeenCalled()
        const error = modal.contentEl.querySelector(".swimlane-modal-error")
        expect(error).not.toBeNull()
    })

    it("After save, returns to read mode", () => {
        const { modal } = openModal([])
        const addBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-add-btn",
        )!
        addBtn.click()

        const propInput = modal.contentEl.querySelector<HTMLInputElement>(
            ".swimlane-automation-prop-input",
        )!
        propInput.value = "done_at"
        propInput.dispatchEvent(new Event("input"))

        const valueInput = modal.contentEl.querySelector<HTMLInputElement>(
            ".swimlane-automation-value-input",
        )!
        valueInput.value = "today"
        valueInput.dispatchEvent(new Event("input"))

        const saveBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-save-btn",
        )!
        saveBtn.click()

        expect(modal.contentEl.querySelector(".swimlane-automation-editor")).toBeNull()
        expect(modal.contentEl.querySelectorAll(".swimlane-automation-rule")).toHaveLength(1)
    })

    it("Remove action button removes a row when multiple actions", () => {
        const { modal } = openModal(rules) // first rule has 2 actions
        const editBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-edit-btn",
        )!
        editBtn.click()

        const removeBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-remove-action-btn",
        )!
        removeBtn.click()

        const actionRows = modal.contentEl.querySelectorAll(".swimlane-automation-action")
        expect(actionRows).toHaveLength(1)
    })

    it("delete action hides property and value inputs in edit mode", () => {
        const { modal } = openModal([
            {
                trigger: { type: "remains_in", swimlane: "Done", delay: "4w" },
                actions: [{ type: "delete" }],
            },
        ])
        const editBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-edit-btn",
        )!
        editBtn.click()
        const propInput = modal.contentEl.querySelector<HTMLInputElement>(
            ".swimlane-automation-prop-input",
        )
        expect(propInput?.classList.contains("swimlane-automation-hidden")).toBe(true)
        const valueInput = modal.contentEl.querySelector<HTMLInputElement>(
            ".swimlane-automation-value-input",
        )
        expect(valueInput?.classList.contains("swimlane-automation-hidden")).toBe(true)
    })

    it("Save with delete action succeeds without property or value", () => {
        const { modal, onSave } = openModal([
            {
                trigger: { type: "remains_in", swimlane: "Done", delay: "4w" },
                actions: [{ type: "delete" }],
            },
        ])
        const editBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-edit-btn",
        )!
        editBtn.click()
        const saveBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-save-btn",
        )!
        saveBtn.click()
        expect(onSave).toHaveBeenCalledTimes(1)
        const saved = onSave.mock.calls[0][0] as AutomationRule[]
        expect(saved[0]!.actions[0]!.type).toBe("delete")
    })

    it("No Remove button when only one action", () => {
        const { modal } = openModal([
            {
                trigger: { type: "enters", swimlane: "Done" },
                actions: [{ type: "set", property: "foo", value: "bar" }],
            },
        ])
        const editBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-edit-btn",
        )!
        editBtn.click()
        const removeBtn = modal.contentEl.querySelector(".swimlane-automation-remove-action-btn")
        expect(removeBtn).toBeNull()
    })

    it("renders delay inputs in trigger row for remains_in", () => {
        const { modal } = openModal([
            {
                trigger: { type: "remains_in", swimlane: "Done", delay: "2w" },
                actions: [{ type: "set", property: "foo", value: "bar" }],
            },
        ])
        const editBtn = modal.contentEl.querySelector<HTMLButtonElement>(
            ".swimlane-automation-edit-btn",
        )!
        editBtn.click()
        const delayInput = modal.contentEl.querySelector<HTMLInputElement>(
            ".swimlane-automation-delay-input",
        )
        expect(delayInput).not.toBeNull()
        expect(delayInput?.value).toBe("2")
        expect(delayInput?.classList.contains("swimlane-automation-hidden")).toBe(false)
        const delayUnit = modal.contentEl.querySelector<HTMLSelectElement>(
            ".swimlane-automation-delay-unit",
        )
        expect(delayUnit).not.toBeNull()
        expect(delayUnit?.value).toBe("w")
    })

    it("read-only view shows delay text for remains_in trigger", () => {
        const { modal } = openModal([
            {
                trigger: { type: "remains_in", swimlane: "Done", delay: "2w" },
                actions: [{ type: "set", property: "foo", value: "bar" }],
            },
        ])
        const triggers = modal.contentEl.querySelectorAll(".swimlane-automation-trigger")
        const texts = Array.from(triggers).map(el => el.textContent ?? "")
        expect(texts.some(t => t.includes("for 2 weeks"))).toBe(true)
    })

    it("read-only view shows 'Delete card' for delete action", () => {
        const { modal } = openModal([
            {
                trigger: { type: "remains_in", swimlane: "Done", delay: "4w" },
                actions: [{ type: "delete" }],
            },
        ])
        const summaries = modal.contentEl.querySelectorAll(".swimlane-automation-action-summary")
        const texts = Array.from(summaries).map(el => el.textContent ?? "")
        expect(texts.some(t => t.includes("Delete card"))).toBe(true)
    })

    it("move action shows swimlane select in editor", () => {
        const { modal } = openModal([
            {
                trigger: { type: "enters", swimlane: "Done" },
                actions: [{ type: "move", value: "Backlog" }],
            },
        ])
        const editBtn = modal.contentEl.querySelector(
            ".swimlane-automation-edit-btn",
        ) as HTMLButtonElement
        editBtn.click()

        const moveSelect = modal.contentEl.querySelector(
            ".swimlane-automation-move-select",
        ) as HTMLSelectElement
        expect(moveSelect).toBeTruthy()
        expect(moveSelect.classList.contains("swimlane-automation-hidden")).toBe(false)
        expect(moveSelect.value).toBe("Backlog")
        expect(moveSelect.options.length).toBe(3) // Backlog, In Progress, Done

        // Value text input should be hidden
        const valueInput = modal.contentEl.querySelector(
            ".swimlane-automation-value-input",
        ) as HTMLInputElement
        expect(valueInput.classList.contains("swimlane-automation-hidden")).toBe(true)
    })

    it("read-only view shows 'Move card to' for move action", () => {
        const { modal } = openModal([
            {
                trigger: { type: "remains_in", swimlane: "Done", delay: "4w" },
                actions: [{ type: "move", value: "Archived" }],
            },
        ])
        const summaries = modal.contentEl.querySelectorAll(".swimlane-automation-action-summary")
        const texts = Array.from(summaries).map(el => el.textContent ?? "")
        expect(texts.some(t => t.includes("Move card to") && t.includes("Archived"))).toBe(true)
    })

    it("read-only view does not show delay text for enters trigger", () => {
        const { modal } = openModal([
            {
                trigger: { type: "enters", swimlane: "Done" },
                actions: [{ type: "set", property: "foo", value: "bar" }],
            },
        ])
        const triggers = modal.contentEl.querySelectorAll(".swimlane-automation-trigger")
        const texts = Array.from(triggers).map(el => el.textContent ?? "")
        expect(texts.some(t => t.includes("for"))).toBe(false)
    })
})
