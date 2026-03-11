import { Setting } from "obsidian"
import type { App } from "obsidian"
import { WrongNotesModal } from "../inputs/wrong-notes-modal"

export interface AddSwimlaneViaDropContext {
    app: App
    swimlaneProp: string
    existingColumns: string[]
    onConfirm: (columnName: string) => void
}

export class AddSwimlaneViaDropModal extends WrongNotesModal {
    private ctx: AddSwimlaneViaDropContext
    private value = ""
    private confirmBtn: HTMLButtonElement | null = null

    constructor(ctx: AddSwimlaneViaDropContext) {
        super(ctx.app)
        this.ctx = ctx
    }

    onOpen(): void {
        const { contentEl, ctx } = this

        this.setTitle("Move to new swimlane")

        let inputEl: HTMLInputElement

        new Setting(contentEl)
            .setName("Swimlane name")
            .setDesc(`Enter a new "${ctx.swimlaneProp}" value for this swimlane.`)
            .addText(text => {
                text.setPlaceholder("Swimlane name…")
                text.onChange(v => {
                    this.value = v.trim()
                    this.updateConfirmState()
                })
                inputEl = text.inputEl
                inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
                    if (e.key === "Enter") {
                        e.preventDefault()
                        this.confirm()
                    }
                })
            })

        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText("Cancel").onClick(() => this.close())
            })
            .addButton(btn => {
                btn.setButtonText("Move card")
                    .setCta()
                    .onClick(() => this.confirm())
                this.confirmBtn = btn.buttonEl
                this.confirmBtn.disabled = true
            })

        inputEl!.focus()
    }

    onClose(): void {
        this.contentEl.empty()
    }

    private updateConfirmState(): void {
        if (!this.confirmBtn) {
            return
        }
        this.confirmBtn.disabled = !this.value || this.ctx.existingColumns.includes(this.value)
    }

    private confirm(): void {
        if (!this.value) {
            return
        }
        if (this.ctx.existingColumns.includes(this.value)) {
            this.showValidationError(`Swimlane "${this.value}" already exists.`)
            return
        }

        this.close()
        this.ctx.onConfirm(this.value)
    }
}
