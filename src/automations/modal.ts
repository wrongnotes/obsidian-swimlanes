import type { App } from "obsidian"
import { WrongNotesModal } from "../inputs/wrong-notes-modal"
import type { AutomationRule, AutomationAction, TriggerType } from "./types"
import { AutomationPropertySuggest } from "./property-suggest"
import { AutomationValueSuggest } from "./value-suggest"

export interface PropertyInfo {
    name: string
    isArray: boolean
}

export interface AutomationsModalContext {
    app: App
    rules: AutomationRule[]
    swimlanes: string[]
    swimlaneProp: string
    properties: PropertyInfo[]
    onSave: (rules: AutomationRule[]) => void
}

const TRIGGER_LABELS: Record<TriggerType, string> = {
    enters: "enters",
    leaves: "leaves",
    created_in: "is created in",
}

function triggerText(trigger: { type: TriggerType; swimlane: string }): string {
    const label = TRIGGER_LABELS[trigger.type]
    const swimlane = trigger.swimlane === "*" ? "any swimlane" : `"${trigger.swimlane}"`
    return `When a card ${label} ${swimlane}`
}

function actionText(action: AutomationAction): string {
    switch (action.type) {
        case "set":
            return `→ Set ${action.property} to ${action.value}`
        case "add":
            return `→ Add ${action.value} to ${action.property}`
        case "remove":
            return `→ Remove ${action.value} from ${action.property}`
        case "clear":
            return `→ Clear ${action.property}`
    }
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
        triggerRow.createSpan({ cls: "swimlane-automation-label", text: "When a card" })

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

        const ACTION_TYPE_LABELS: Record<string, string> = {
            set: "Set",
            add: "Add to",
            remove: "Remove from",
            clear: "Clear",
        }
        const PROP_LABELS: Record<string, string> = {
            set: "property",
            add: "property",
            remove: "property",
            clear: "property",
        }
        const VALUE_LABELS: Record<string, string> = {
            set: "to",
            add: "value",
            remove: "value",
        }
        const hasValue = (type: string) => type !== "clear"
        const isArrayAction = (type: string) => type === "add" || type === "remove"

        const renderActionRow = (i: number) => {
            const action = draftActions[i]!
            const row = actionsContainer.createDiv({ cls: "swimlane-automation-action" })

            const typeSelect = row.createEl("select", {
                cls: "swimlane-automation-action-type-select",
            })
            for (const [value, label] of Object.entries(ACTION_TYPE_LABELS)) {
                typeSelect.createEl("option", { text: label, attr: { value } })
            }
            typeSelect.value = action.type

            const propLabel = row.createSpan({
                cls: "swimlane-automation-label",
                text: PROP_LABELS[action.type] ?? "property",
            })

            const propInput = row.createEl("input", {
                cls: "swimlane-automation-prop-input",
                attr: { type: "text", placeholder: "Property name", value: action.property },
            })

            const propSuggest = new AutomationPropertySuggest(
                this.ctx.app,
                propInput,
                () => this.getFilteredProperties(action.type),
                this.ctx.swimlaneProp,
                value => {
                    propInput.value = value
                    this.updateDraftAction(draftActions, i, { property: value })
                },
            )
            propSuggest.close()

            const valueLabel = row.createSpan({
                cls: "swimlane-automation-label",
                text: VALUE_LABELS[action.type] ?? "to",
            })
            valueLabel.toggleClass("swimlane-automation-hidden", !hasValue(action.type))

            const valueInput = row.createEl("input", {
                cls: "swimlane-automation-value-input",
                attr: {
                    type: "text",
                    placeholder: "value or {{template}}",
                    value: action.type !== "clear" ? action.value : "",
                },
            })
            valueInput.toggleClass("swimlane-automation-hidden", !hasValue(action.type))

            const valueSuggest = new AutomationValueSuggest(
                this.ctx.app,
                valueInput,
                value => {
                    valueInput.value = value
                    this.updateDraftAction(draftActions, i, { value })
                },
            )
            valueSuggest.close()

            typeSelect.addEventListener("change", () => {
                const newType = typeSelect.value as AutomationAction["type"]
                const prop = propInput.value
                const val = valueInput.value
                if (newType === "clear") {
                    draftActions[i] = { type: "clear", property: prop }
                } else {
                    draftActions[i] = { type: newType, property: prop, value: val }
                }
                // Re-render this row to update labels and visibility
                renderActions()
            })

            propInput.addEventListener("input", () => {
                this.updateDraftAction(draftActions, i, { property: propInput.value })
            })

            valueInput.addEventListener("input", () => {
                this.updateDraftAction(draftActions, i, { value: valueInput.value })
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
                if (action.type !== "clear" && !action.value.trim()) {
                    this.showValidationError("Actions must have a non-empty value.")
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

    /** Returns property names filtered for the action type (array vs scalar). */
    private getFilteredProperties(actionType: string): string[] {
        const wantArray = actionType === "add" || actionType === "remove"
        return this.ctx.properties
            .filter(p => (wantArray ? p.isArray : !p.isArray) || actionType === "clear")
            .map(p => p.name)
    }

    /** Updates a draft action in-place, preserving its type. */
    private updateDraftAction(
        draftActions: AutomationAction[],
        i: number,
        patch: { property?: string; value?: string },
    ): void {
        const cur = draftActions[i]!
        const prop = patch.property ?? cur.property
        const val = patch.value ?? (cur.type !== "clear" ? cur.value : "")
        if (cur.type === "clear") {
            draftActions[i] = { type: "clear", property: prop }
        } else {
            draftActions[i] = { type: cur.type, property: prop, value: val }
        }
    }
}
