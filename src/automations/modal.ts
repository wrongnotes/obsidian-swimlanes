import type { App } from "obsidian"
import { WrongNotesModal } from "../inputs/wrong-notes-modal"
import type { AutomationRule, AutomationAction, TriggerType } from "./types"
import { AutomationPropertySuggest } from "../inputs/automation-property-suggest"
import { AutomationValueSuggest, TEMPLATE_SUGGESTIONS } from "../inputs/automation-value-suggest"
import { parseDelay } from "./delay"

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
    remains_in: "remains in",
}

const ACTION_TYPE_LABELS: Record<string, string> = {
    set: "Set",
    add: "Add to",
    remove: "Remove from",
    clear: "Clear",
    delete: "Delete card",
}

const VALUE_LABELS: Record<string, string> = {
    set: "to",
    add: "value",
    remove: "value",
}

const hasValue = (type: string) => type !== "clear" && type !== "delete"
const needsProperty = (type: string) => type !== "delete"

/** Converts "2w" → "2 weeks", "3d" → "3 days", etc. */
function formatDelayHuman(delay: string): string | null {
    const match = delay.match(/^(\d+(?:\.\d+)?)\s*([mhdw])$/i)
    if (!match) return null
    const value = parseFloat(match[1]!)
    const unit = match[2]!.toLowerCase()
    const unitNames: Record<string, [string, string]> = {
        m: ["minute", "minutes"],
        h: ["hour", "hours"],
        d: ["day", "days"],
        w: ["week", "weeks"],
    }
    const names = unitNames[unit]
    if (!names) return null
    return `${value} ${value === 1 ? names[0] : names[1]}`
}

/** Look up a human-readable description for a template token, if known. */
function templateDescription(value: string): string | null {
    const match = TEMPLATE_SUGGESTIONS.find(s => s.token === value)
    return match?.description ?? null
}

function renderTrigger(
    container: HTMLElement,
    trigger: { type: TriggerType; swimlane: string; delay?: string },
): void {
    container.createSpan({ text: "When a card " })
    container.createSpan({ text: TRIGGER_LABELS[trigger.type] })
    container.createSpan({ text: " " })
    if (trigger.swimlane === "*") {
        container.createSpan({ text: "any swimlane" })
    } else {
        container.createEl("code", { cls: "swimlane-automation-code", text: trigger.swimlane })
    }
    if (trigger.type === "remains_in" && trigger.delay) {
        const delayText = formatDelayHuman(trigger.delay)
        if (delayText) {
            container.createSpan({ cls: "swimlane-automation-delay-text", text: ` for ${delayText}` })
        }
    }
}

function renderAction(container: HTMLElement, action: AutomationAction): void {
    container.createSpan({ text: "→ " })
    switch (action.type) {
        case "set":
            container.createSpan({ text: "Set " })
            container.createEl("code", { cls: "swimlane-automation-code", text: action.property })
            container.createSpan({ text: " to " })
            renderValue(container, action.value)
            break
        case "add":
            container.createSpan({ text: "Add " })
            renderValue(container, action.value)
            container.createSpan({ text: " to " })
            container.createEl("code", { cls: "swimlane-automation-code", text: action.property })
            break
        case "remove":
            container.createSpan({ text: "Remove " })
            renderValue(container, action.value)
            container.createSpan({ text: " from " })
            container.createEl("code", { cls: "swimlane-automation-code", text: action.property })
            break
        case "clear":
            container.createSpan({ text: "Clear " })
            container.createEl("code", { cls: "swimlane-automation-code", text: action.property })
            break
        case "delete":
            container.createSpan({ text: "Delete card" })
            break
    }
}

function renderValue(container: HTMLElement, value: string): void {
    const desc = templateDescription(value)
    container.createEl("code", { cls: "swimlane-automation-code", text: value })
    if (desc) {
        container.createSpan({ cls: "swimlane-automation-value-desc", text: ` (${desc})` })
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

        const list = this.contentEl.createDiv({ cls: "swimlane-automation-list" })

        for (let i = 0; i < this.rules.length; i++) {
            this.renderRuleCard(list, i)
        }

        const addBtn = list.createEl("button", {
            cls: "swimlane-automation-add-btn mod-cta",
            text: "Add rule",
        })
        addBtn.addEventListener("click", () => {
            // Remove the add button, append editor for new rule
            addBtn.remove()
            this.renderNewRuleEditor()
        })
    }

    private renderRuleCard(container: HTMLElement, index: number): HTMLElement {
        const rule = this.rules[index]!
        const card = container.createDiv({ cls: "swimlane-automation-rule" })

        const triggerEl = card.createDiv({ cls: "swimlane-automation-trigger" })
        renderTrigger(triggerEl, rule.trigger)

        for (const action of rule.actions) {
            const actionEl = card.createDiv({ cls: "swimlane-automation-action-summary" })
            renderAction(actionEl, action)
        }

        const btnsEl = card.createDiv({ cls: "swimlane-automation-card-buttons" })

        const editBtn = btnsEl.createEl("button", {
            cls: "swimlane-automation-edit-btn mod-cta",
            text: "Edit",
        })
        editBtn.addEventListener("click", () => {
            card.replaceWith(this.buildRuleEditor(index, card))
        })

        const deleteBtn = btnsEl.createEl("button", {
            cls: "swimlane-automation-delete-btn mod-warning",
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
        // Append to the list container
        const list = this.contentEl.querySelector(".swimlane-automation-list")
        if (list) {
            list.appendChild(editor)
        } else {
            this.contentEl.appendChild(editor)
        }
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

        // --- Delay inputs (only for remains_in) ---
        const delayLabel = triggerRow.createSpan({ cls: "swimlane-automation-label", text: "for" })
        const delayNumber = triggerRow.createEl("input", {
            cls: "swimlane-automation-delay-input",
            attr: {
                type: "number",
                min: "0",
                placeholder: "0",
                value: draftTrigger.delay ? draftTrigger.delay.replace(/[mhdw]$/i, "") : "",
            },
        })
        const delayUnit = triggerRow.createEl("select", {
            cls: "swimlane-automation-delay-unit",
        })
        for (const [value, label] of [["m", "Minutes"], ["h", "Hours"], ["d", "Days"], ["w", "Weeks"]] as const) {
            delayUnit.createEl("option", { text: label, attr: { value } })
        }
        if (draftTrigger.delay) {
            const unitMatch = draftTrigger.delay.match(/[mhdw]$/i)
            if (unitMatch) delayUnit.value = unitMatch[0].toLowerCase()
        }

        const updateTriggerDelay = () => {
            const num = delayNumber.value.trim()
            const unit = delayUnit.value
            draftTrigger.delay = num && parseFloat(num) > 0 ? `${num}${unit}` : undefined
        }
        delayNumber.addEventListener("input", updateTriggerDelay)
        delayUnit.addEventListener("change", updateTriggerDelay)

        const updateDelayVisibility = () => {
            const show = draftTrigger.type === "remains_in"
            delayLabel.toggleClass("swimlane-automation-hidden", !show)
            delayNumber.toggleClass("swimlane-automation-hidden", !show)
            delayUnit.toggleClass("swimlane-automation-hidden", !show)
        }
        updateDelayVisibility()

        triggerSelect.addEventListener("change", () => {
            draftTrigger.type = triggerSelect.value as TriggerType
            if (draftTrigger.type !== "remains_in") {
                draftTrigger.delay = undefined
            }
            updateDelayVisibility()
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
            for (const [value, label] of Object.entries(ACTION_TYPE_LABELS)) {
                typeSelect.createEl("option", { text: label, attr: { value } })
            }
            typeSelect.value = action.type

            const propLabel = row.createSpan({ cls: "swimlane-automation-label", text: "property" })
            propLabel.toggleClass("swimlane-automation-hidden", !needsProperty(action.type))

            const propInput = row.createEl("input", {
                cls: "swimlane-automation-prop-input",
                attr: { type: "text", placeholder: "Property name", value: action.type !== "delete" ? action.property : "" },
            })
            propInput.toggleClass("swimlane-automation-hidden", !needsProperty(action.type))

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
                    value: hasValue(action.type) ? (action as { value?: string }).value ?? "" : "",
                },
            })
            valueInput.toggleClass("swimlane-automation-hidden", !hasValue(action.type))

            const valueSuggest = new AutomationValueSuggest(this.ctx.app, valueInput, value => {
                valueInput.value = value
                this.updateDraftAction(draftActions, i, { value })
            })
            valueSuggest.close()

            typeSelect.addEventListener("change", () => {
                const newType = typeSelect.value as AutomationAction["type"]
                const prop = propInput.value
                const val = valueInput.value
                if (newType === "delete") {
                    draftActions[i] = { type: "delete" }
                } else if (newType === "clear") {
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
                    cls: "swimlane-automation-remove-action-btn mod-warning",
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
            if (rule.actions.length === 1 && rule.actions[0]?.type !== "delete" && (rule.actions[0] as { property?: string }).property === "") {
                // Check if this was a newly added (empty) rule
                const orig = this.ctx.rules[index]
                if (!orig) {
                    this.rules.splice(index, 1)
                }
            }
            this.renderRules()
        })

        const saveBtn = buttonsRow.createEl("button", {
            cls: "swimlane-automation-save-btn mod-cta",
            text: "Save",
        })
        saveBtn.addEventListener("click", () => {
            // Validate
            if (draftActions.length === 0) {
                this.showValidationError("At least one action is required.")
                return
            }
            if (draftTrigger.type === "remains_in") {
                if (!draftTrigger.delay || !parseDelay(draftTrigger.delay)) {
                    this.showValidationError("remains in trigger requires a valid delay. Use a number followed by m, h, d, or w.")
                    return
                }
            }
            for (const action of draftActions) {
                if (action.type === "delete") continue  // No property/value needed
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
        if (cur.type === "delete") {
            draftActions[i] = { type: "delete" }
        } else if (cur.type === "clear") {
            const prop = patch.property ?? cur.property
            draftActions[i] = { type: "clear", property: prop }
        } else {
            const prop = patch.property ?? cur.property
            const val = patch.value ?? cur.value
            draftActions[i] = { type: cur.type, property: prop, value: val }
        }
    }
}
