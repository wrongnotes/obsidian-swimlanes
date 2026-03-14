import type { App } from "obsidian"
import { WrongNotesModal } from "../inputs/wrong-notes-modal"
import type { AutomationRule, AutomationAction, TriggerType } from "./types"
import { AutomationPropertySuggest } from "./property-suggest"
import { AutomationValueSuggest } from "./value-suggest"

export interface AutomationsModalContext {
    app: App
    rules: AutomationRule[]
    swimlanes: string[]
    swimlaneProp: string
    properties: string[]
    onSave: (rules: AutomationRule[]) => void
}

const TRIGGER_LABELS: Record<TriggerType, string> = {
    enters: "Card enters",
    leaves: "Card leaves",
    created_in: "Card is created in",
}

function triggerText(trigger: { type: TriggerType; swimlane: string }): string {
    const label = TRIGGER_LABELS[trigger.type]
    const swimlane = trigger.swimlane === "*" ? "any swimlane" : `"${trigger.swimlane}"`
    return `When card ${label.toLowerCase().replace("card ", "")} ${swimlane}`
}

function actionText(action: AutomationAction): string {
    if (action.type === "set") {
        return `→ Set ${action.property} to ${action.value}`
    }
    return `→ Clear ${action.property}`
}

export class AutomationsModal extends WrongNotesModal {
    private ctx: AutomationsModalContext
    private rules: AutomationRule[]

    constructor(ctx: AutomationsModalContext) {
        super(ctx.app)
        this.ctx = ctx
        this.rules = ctx.rules.map(r => ({
            trigger: { ...r.trigger },
            actions: r.actions.map(a => ({ ...a })),
        }))
    }

    onOpen(): void {
        this.setTitle("Automations")
        this.renderRules()
    }

    onClose(): void {
        this.contentEl.empty()
    }

    private renderRules(): void {
        this.contentEl.empty()

        for (let i = 0; i < this.rules.length; i++) {
            this.renderRuleCard(i)
        }

        const addBtn = this.contentEl.createEl("button", {
            cls: "swimlane-automation-add-btn",
            text: "Add rule",
        })
        addBtn.addEventListener("click", () => {
            // Remove the add button, append editor for new rule
            addBtn.remove()
            this.renderNewRuleEditor()
        })
    }

    private renderRuleCard(index: number): HTMLElement {
        const rule = this.rules[index]!
        const card = this.contentEl.createDiv({ cls: "swimlane-automation-rule" })

        const triggerEl = card.createDiv({ cls: "swimlane-automation-trigger" })
        triggerEl.textContent = triggerText(rule.trigger)

        for (const action of rule.actions) {
            const actionEl = card.createDiv({ cls: "swimlane-automation-action-summary" })
            actionEl.textContent = actionText(action)
        }

        const btnsEl = card.createDiv({ cls: "swimlane-automation-card-buttons" })

        const editBtn = btnsEl.createEl("button", {
            cls: "swimlane-automation-edit-btn",
            text: "Edit",
        })
        editBtn.addEventListener("click", () => {
            card.replaceWith(this.buildRuleEditor(index, card))
        })

        const deleteBtn = btnsEl.createEl("button", {
            cls: "swimlane-automation-delete-btn",
            text: "Delete",
        })
        deleteBtn.addEventListener("click", () => {
            this.rules.splice(index, 1)
            this.ctx.onSave(this.rules)
            this.renderRules()
        })

        return card
    }

    private renderNewRuleEditor(): void {
        const newIndex = this.rules.length
        this.rules.push({
            trigger: { type: "enters", swimlane: this.ctx.swimlanes[0] ?? "*" },
            actions: [{ type: "set", property: "", value: "" }],
        })
        const editor = this.buildRuleEditor(newIndex, null)
        // Insert before the add button (which was removed, so just append)
        this.contentEl.appendChild(editor)
    }

    private buildRuleEditor(index: number, replacingEl: HTMLElement | null): HTMLElement {
        const rule = this.rules[index]!

        // Working copy for the editor
        const draftTrigger = { ...rule.trigger }
        const draftActions: AutomationAction[] = rule.actions.map(a => ({ ...a }))

        const editor = document.createElement("div")
        editor.className = "swimlane-automation-editor"

        // --- Trigger row ---
        const triggerRow = editor.createDiv({ cls: "swimlane-automation-trigger-row" })

        const triggerSelect = triggerRow.createEl("select", {
            cls: "swimlane-automation-trigger-select",
        })
        for (const [value, label] of Object.entries(TRIGGER_LABELS) as [TriggerType, string][]) {
            const opt = triggerSelect.createEl("option", { text: label, attr: { value } })
            if (value === draftTrigger.type) {
                opt.selected = true
            }
        }
        triggerSelect.addEventListener("change", () => {
            draftTrigger.type = triggerSelect.value as TriggerType
        })

        const swimlaneSelect = triggerRow.createEl("select", {
            cls: "swimlane-automation-swimlane-select",
        })
        swimlaneSelect.createEl("option", { text: "Any swimlane", attr: { value: "*" } })
        for (const lane of this.ctx.swimlanes) {
            const opt = swimlaneSelect.createEl("option", { text: lane, attr: { value: lane } })
            if (lane === draftTrigger.swimlane) {
                opt.selected = true
            }
        }
        if (draftTrigger.swimlane === "*") {
            swimlaneSelect.value = "*"
        }
        swimlaneSelect.addEventListener("change", () => {
            draftTrigger.swimlane = swimlaneSelect.value
        })

        // --- Actions list ---
        const actionsContainer = editor.createDiv({ cls: "swimlane-automation-actions" })

        const renderActions = () => {
            actionsContainer.empty()
            for (let i = 0; i < draftActions.length; i++) {
                renderActionRow(i)
            }
        }

        const renderActionRow = (i: number) => {
            const action = draftActions[i]!
            const row = actionsContainer.createDiv({ cls: "swimlane-automation-action" })

            const typeSelect = row.createEl("select", {
                cls: "swimlane-automation-action-type-select",
            })
            typeSelect.createEl("option", { text: "Set", attr: { value: "set" } })
            typeSelect.createEl("option", { text: "Clear", attr: { value: "clear" } })
            typeSelect.value = action.type

            const propInput = row.createEl("input", {
                cls: "swimlane-automation-prop-input",
                attr: { type: "text", placeholder: "Property", value: action.property },
            })

            const propSuggest = new AutomationPropertySuggest(
                this.ctx.app,
                propInput,
                () => this.ctx.properties,
                this.ctx.swimlaneProp,
                value => {
                    propInput.value = value
                    const cur = draftActions[i]!
                    if (cur.type === "set") {
                        draftActions[i] = { type: "set", property: value, value: cur.value }
                    } else {
                        draftActions[i] = { type: "clear", property: value }
                    }
                },
            )
            propSuggest.close()

            const valueInput = row.createEl("input", {
                cls: "swimlane-automation-value-input",
                attr: {
                    type: "text",
                    placeholder: "Value",
                    value: action.type === "set" ? action.value : "",
                },
            })
            valueInput.toggleClass("swimlane-automation-hidden", action.type !== "set")

            const valueSuggest = new AutomationValueSuggest(
                this.ctx.app,
                valueInput,
                value => {
                    valueInput.value = value
                    const cur = draftActions[i]!
                    if (cur.type === "set") {
                        draftActions[i] = { type: "set", property: cur.property, value }
                    }
                },
            )
            valueSuggest.close()

            typeSelect.addEventListener("change", () => {
                const newType = typeSelect.value as "set" | "clear"
                if (newType === "set") {
                    draftActions[i] = {
                        type: "set",
                        property: propInput.value,
                        value: valueInput.value,
                    }
                    valueInput.removeClass("swimlane-automation-hidden")
                } else {
                    draftActions[i] = { type: "clear", property: propInput.value }
                    valueInput.addClass("swimlane-automation-hidden")
                }
            })

            propInput.addEventListener("input", () => {
                const cur = draftActions[i]!
                if (cur.type === "set") {
                    draftActions[i] = { type: "set", property: propInput.value, value: cur.value }
                } else {
                    draftActions[i] = { type: "clear", property: propInput.value }
                }
            })

            valueInput.addEventListener("input", () => {
                const cur = draftActions[i]!
                if (cur.type === "set") {
                    draftActions[i] = {
                        type: "set",
                        property: cur.property,
                        value: valueInput.value,
                    }
                }
            })

            if (draftActions.length > 1) {
                const removeBtn = row.createEl("button", {
                    cls: "swimlane-automation-remove-action-btn",
                    text: "Remove",
                })
                removeBtn.addEventListener("click", () => {
                    draftActions.splice(i, 1)
                    renderActions()
                })
            }
        }

        renderActions()

        // --- Add action button ---
        const addActionBtn = editor.createEl("button", {
            cls: "swimlane-automation-add-action-btn",
            text: "Add action",
        })
        addActionBtn.addEventListener("click", () => {
            draftActions.push({ type: "set", property: "", value: "" })
            renderActions()
        })

        // --- Editor buttons ---
        const buttonsRow = editor.createDiv({ cls: "swimlane-automation-editor-buttons" })

        const cancelBtn = buttonsRow.createEl("button", {
            cls: "swimlane-automation-cancel-btn",
            text: "Cancel",
        })
        cancelBtn.addEventListener("click", () => {
            // Discard: if new rule (no prior state), remove it from rules array
            if (rule.actions[0]?.property === "" && rule.actions.length === 1) {
                // Check if this was a newly added (empty) rule
                const orig = this.ctx.rules[index]
                if (!orig) {
                    this.rules.splice(index, 1)
                }
            }
            this.renderRules()
        })

        const saveBtn = buttonsRow.createEl("button", {
            cls: "swimlane-automation-save-btn",
            text: "Save",
        })
        saveBtn.addEventListener("click", () => {
            // Validate
            if (draftActions.length === 0) {
                this.showValidationError("At least one action is required.")
                return
            }
            for (const action of draftActions) {
                if (!action.property.trim()) {
                    this.showValidationError("Every action must have a property name.")
                    return
                }
                if (action.type === "set" && !action.value.trim()) {
                    this.showValidationError("Set actions must have a non-empty value.")
                    return
                }
                if (action.property.trim() === this.ctx.swimlaneProp) {
                    this.showValidationError(
                        `Property "${action.property}" cannot be the swimlane property (${this.ctx.swimlaneProp}).`,
                    )
                    return
                }
            }

            this.rules[index] = {
                trigger: { ...draftTrigger },
                actions: draftActions.map(a => ({ ...a })),
            }
            this.ctx.onSave(this.rules)
            this.renderRules()
        })

        // If we're replacing an existing card element, wire it in now
        if (replacingEl) {
            replacingEl.replaceWith(editor)
        }

        return editor
    }
}
