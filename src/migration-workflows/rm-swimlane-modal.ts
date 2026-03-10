import { Modal, Setting, setIcon } from "obsidian"
import type { App, TFile } from "obsidian"
import type { RmSwimlaneOp } from "./operations"

export interface RmSwimlaneContext {
    app: App
    columnName: string
    files: TFile[]
    swimlaneProp: string
    otherColumns: string[]
    onConfirm: (op: RmSwimlaneOp) => void
}

const NEW_VALUE_SENTINEL = "__swimlane_new_value__"

type SelectionKind = "move" | "hide" | "clear" | "delete"

export class RmSwimlaneModal extends Modal {
    private ctx: RmSwimlaneContext
    private selection: SelectionKind | null = null
    private moveTarget: string
    private confirmBtn: HTMLButtonElement | null = null
    private optionEls: Map<SelectionKind, HTMLElement> = new Map()

    constructor(ctx: RmSwimlaneContext) {
        super(ctx.app)
        this.ctx = ctx
        this.moveTarget = ctx.otherColumns[0] ?? ""
    }

    onOpen(): void {
        const { contentEl } = this
        const { columnName, files, swimlaneProp, otherColumns } = this.ctx

        this.setTitle(`Remove swimlane "${columnName}"`)

        contentEl.createEl("p", {
            cls: "swimlane-migration-description",
            text: `This swimlane has ${files.length} card${files.length === 1 ? "" : "s"}. What should happen to them?`,
        })

        const options = contentEl.createDiv({ cls: "swimlane-migration-options" })

        // Move / set value option
        const moveRow = options.createDiv({ cls: "swimlane-migration-option" })
        this.optionEls.set("move", moveRow)
        const moveLabel = moveRow.createDiv({ cls: "swimlane-migration-option-label" })
        const moveIcon = moveLabel.createSpan({ cls: "swimlane-migration-option-icon" })
        setIcon(moveIcon, "lucide-arrow-right")
        moveLabel.createSpan({ text: `Set "${swimlaneProp}" to` })

        const controlsEl = moveLabel.createDiv({ cls: "swimlane-migration-move-controls" })

        const select = controlsEl.createEl("select", { cls: "swimlane-migration-select dropdown" })
        for (const col of otherColumns) {
            select.createEl("option", { text: col, attr: { value: col } })
        }
        select.createEl("option", { text: "New value…", attr: { value: NEW_VALUE_SENTINEL } })

        const input = controlsEl.createEl("input", {
            cls: "swimlane-migration-input swimlane-migration-input--hidden",
            attr: { type: "text", placeholder: "New value…" },
        })

        const showingInput = () => select.value === NEW_VALUE_SENTINEL

        const updateMoveTarget = () => {
            if (showingInput()) {
                this.moveTarget = input.value.trim()
            } else {
                this.moveTarget = select.value
            }
            this.updateConfirmState()
        }

        const firstCol = otherColumns[0] ?? ""
        select.value = firstCol || NEW_VALUE_SENTINEL
        this.moveTarget = firstCol

        const syncInputVisibility = () => {
            input.toggleClass("swimlane-migration-input--hidden", !showingInput())
            select.toggleClass("swimlane-migration-select--has-input", showingInput())
            if (showingInput()) {
                input.focus()
            }
        }
        syncInputVisibility()

        select.addEventListener("change", () => {
            syncInputVisibility()
            updateMoveTarget()
            this.setSelection("move")
        })
        select.addEventListener("click", e => e.stopPropagation())

        input.addEventListener("input", () => {
            updateMoveTarget()
            this.setSelection("move")
        })
        input.addEventListener("click", e => e.stopPropagation())

        moveRow.addEventListener("click", () => this.setSelection("move"))

        // Hide option
        const hideRow = options.createDiv({ cls: "swimlane-migration-option" })
        this.optionEls.set("hide", hideRow)
        const hideLabel = hideRow.createDiv({ cls: "swimlane-migration-option-label" })
        const hideIcon = hideLabel.createSpan({ cls: "swimlane-migration-option-icon" })
        setIcon(hideIcon, "lucide-eye-off")
        hideLabel.createSpan({ text: "Hide swimlane" })
        hideRow.createDiv({
            cls: "swimlane-migration-option-hint",
            text: "Cards are unchanged; swimlane is hidden from this view",
        })
        hideRow.addEventListener("click", () => this.setSelection("hide"))

        // Clear option
        const clearRow = options.createDiv({ cls: "swimlane-migration-option" })
        this.optionEls.set("clear", clearRow)
        const clearLabel = clearRow.createDiv({ cls: "swimlane-migration-option-label" })
        const clearIcon = clearLabel.createSpan({ cls: "swimlane-migration-option-icon" })
        setIcon(clearIcon, "lucide-eraser")
        clearLabel.createSpan({ text: `Clear "${swimlaneProp}" property` })
        clearRow.createDiv({
            cls: "swimlane-migration-option-hint",
            text: "Cards will no longer appear on the board",
        })
        clearRow.addEventListener("click", () => this.setSelection("clear"))

        // Delete option
        const deleteRow = options.createDiv({
            cls: "swimlane-migration-option swimlane-migration-option--danger",
        })
        this.optionEls.set("delete", deleteRow)
        const deleteLabel = deleteRow.createDiv({ cls: "swimlane-migration-option-label" })
        const deleteIcon = deleteLabel.createSpan({ cls: "swimlane-migration-option-icon" })
        setIcon(deleteIcon, "lucide-trash-2")
        deleteLabel.createSpan({ text: "Delete cards" })
        deleteRow.createDiv({
            cls: "swimlane-migration-option-hint",
            text: "Moves note files to trash",
        })
        deleteRow.addEventListener("click", () => this.setSelection("delete"))

        // Buttons
        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText("Cancel").onClick(() => this.close())
            })
            .addButton(btn => {
                btn.setButtonText("Confirm")
                    .setCta()
                    .onClick(() => this.confirm())
                this.confirmBtn = btn.buttonEl
            })

        // Default to "move" selected
        this.setSelection("move")
    }

    onClose(): void {
        this.contentEl.empty()
    }

    private setSelection(kind: SelectionKind): void {
        this.selection = kind
        for (const [k, el] of this.optionEls) {
            el.toggleClass("swimlane-migration-option--selected", k === kind)
        }
        this.updateConfirmState()
    }

    private updateConfirmState(): void {
        if (!this.confirmBtn) {
            return
        }
        const canConfirm =
            this.selection !== null && (this.selection !== "move" || !!this.moveTarget)
        this.confirmBtn.disabled = !canConfirm
        this.confirmBtn.toggleClass("mod-warning", this.selection === "delete")
    }

    private confirm(): void {
        if (!this.selection) {
            return
        }

        let op: RmSwimlaneOp
        switch (this.selection) {
            case "move":
                if (!this.moveTarget) {
                    return
                }
                op = { kind: "move", targetValue: this.moveTarget }
                break
            case "hide":
                op = { kind: "hide" }
                break
            case "clear":
                op = { kind: "clear" }
                break
            case "delete":
                op = { kind: "delete" }
                break
        }

        this.close()
        this.ctx.onConfirm(op)
    }
}
