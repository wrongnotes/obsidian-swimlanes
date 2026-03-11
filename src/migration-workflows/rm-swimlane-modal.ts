import { Setting } from "obsidian"
import type { App, TFile } from "obsidian"
import { WrongNotesModal } from "../inputs/wrong-notes-modal"
import type { OptionPicker } from "../inputs/option-picker"
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

export class RmSwimlaneModal extends WrongNotesModal {
    private ctx: RmSwimlaneContext
    private picker!: OptionPicker
    private moveTarget: string
    private confirmBtn: HTMLButtonElement | null = null

    constructor(ctx: RmSwimlaneContext) {
        super(ctx.app)
        this.ctx = ctx
        this.moveTarget = ctx.otherColumns[0] ?? ""
    }

    onOpen(): void {
        const { contentEl } = this
        const { columnName, files, swimlaneProp, otherColumns } = this.ctx

        this.setTitle(`Remove swimlane "${columnName}"`)

        this.setDescription(
            `This swimlane has ${files.length} card${files.length === 1 ? "" : "s"}. What should happen to them?`,
        )

        this.picker = this.addOptionPicker({
            options: [
                {
                    id: "move",
                    icon: "lucide-arrow-right",
                    label: `Set "${swimlaneProp}" to`,
                    onRender: labelEl => this.buildMoveControls(labelEl, otherColumns),
                },
                {
                    id: "hide",
                    icon: "lucide-eye-off",
                    label: "Hide swimlane",
                    hint: "Cards are unchanged; swimlane is hidden from this view",
                },
                {
                    id: "clear",
                    icon: "lucide-eraser",
                    label: `Clear "${swimlaneProp}" property`,
                    hint: "Cards will no longer appear on the board",
                },
                {
                    id: "delete",
                    icon: "lucide-trash-2",
                    label: "Delete cards",
                    hint: "Moves note files to trash",
                    danger: true,
                },
            ],
            defaultId: "move",
            onSelect: [() => this.updateConfirmState()],
        })

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
    }

    onClose(): void {
        this.contentEl.empty()
    }

    private buildMoveControls(labelEl: HTMLElement, otherColumns: string[]): void {
        const controlsEl = labelEl.createDiv({ cls: "swimlane-modal-move-controls" })

        const select = controlsEl.createEl("select", { cls: "swimlane-modal-move-select dropdown" })
        for (const col of otherColumns) {
            select.createEl("option", { text: col, attr: { value: col } })
        }
        select.createEl("option", { text: "New value…", attr: { value: NEW_VALUE_SENTINEL } })

        const input = controlsEl.createEl("input", {
            cls: "swimlane-modal-move-input swimlane-modal-move-input--hidden",
            attr: { type: "text", placeholder: "New value…" },
        })

        const showingInput = () => select.value === NEW_VALUE_SENTINEL

        const updateMoveTarget = () => {
            this.moveTarget = showingInput() ? input.value.trim() : select.value
            this.updateConfirmState()
        }

        const firstCol = otherColumns[0] ?? ""
        select.value = firstCol || NEW_VALUE_SENTINEL
        this.moveTarget = firstCol

        const syncInputVisibility = () => {
            input.toggleClass("swimlane-modal-move-input--hidden", !showingInput())
            select.toggleClass("swimlane-modal-move-select--has-input", showingInput())
            if (showingInput()) {
                input.focus()
            }
        }
        syncInputVisibility()

        select.addEventListener("change", () => {
            syncInputVisibility()
            updateMoveTarget()
            this.picker.select("move")
        })
        select.addEventListener("click", e => e.stopPropagation())

        input.addEventListener("input", () => {
            updateMoveTarget()
            this.picker.select("move")
        })
        input.addEventListener("click", e => e.stopPropagation())
    }

    private updateConfirmState(): void {
        if (!this.confirmBtn) {
            return
        }
        const selection = this.picker.selected as SelectionKind | null
        const canConfirm = selection !== null && (selection !== "move" || !!this.moveTarget)
        this.confirmBtn.disabled = !canConfirm
        this.confirmBtn.toggleClass("mod-warning", selection === "delete")
    }

    private confirm(): void {
        const selection = this.picker.selected as SelectionKind | null
        if (!selection) {
            return
        }

        let op: RmSwimlaneOp
        switch (selection) {
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
