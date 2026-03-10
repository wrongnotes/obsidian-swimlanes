import { Modal, Setting } from "obsidian"
import type { App } from "obsidian"

export interface AddSwimlaneViaDropContext {
    app: App
    swimlaneProp: string
    existingColumns: string[]
    onConfirm: (columnName: string) => void
}

export class AddSwimlaneViaDropModal extends Modal {
    private ctx: AddSwimlaneViaDropContext
    private value = ""
    private confirmBtn: HTMLButtonElement | null = null
    private errorEl: HTMLElement | null = null

    constructor(ctx: AddSwimlaneViaDropContext) {
        super(ctx.app)
        this.ctx = ctx
    }

    onOpen(): void {
        const { contentEl, ctx } = this

        this.setTitle("Move to new swimlane")

        contentEl.createEl("p", {
            cls: "swimlane-migration-description",
            text: `Enter a new "${ctx.swimlaneProp}" value for this swimlane.`,
        })

        const input = contentEl.createEl("input", {
            cls: "swimlane-migration-input swimlane-migration-input--block",
            attr: { type: "text", placeholder: "Swimlane name…" },
        })

        this.errorEl = contentEl.createDiv({ cls: "swimlane-migration-error" })

        input.addEventListener("input", () => {
            this.value = input.value.trim()
            this.validate()
        })

        input.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault()
                this.confirm()
            }
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

        input.focus()
    }

    onClose(): void {
        this.contentEl.empty()
    }

    private validate(): void {
        if (!this.errorEl || !this.confirmBtn) {
            return
        }

        if (this.value && this.ctx.existingColumns.includes(this.value)) {
            this.errorEl.setText(`Swimlane "${this.value}" already exists.`)
            this.errorEl.show()
            this.confirmBtn.disabled = true
        } else {
            this.errorEl.hide()
            this.confirmBtn.disabled = !this.value
        }
    }

    private confirm(): void {
        if (!this.value) {
            return
        }
        if (this.ctx.existingColumns.includes(this.value)) {
            return
        }

        this.close()
        this.ctx.onConfirm(this.value)
    }
}
