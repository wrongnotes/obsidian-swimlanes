import { Modal } from "obsidian"
import type { App } from "obsidian"
import { OptionPicker } from "./option-picker"
import type { OptionPickerConfig } from "./option-picker"

export class WrongNotesModal extends Modal {
    constructor(app: App) {
        super(app)
        this.modalEl.classList.add("swimlane-modal")
    }

    protected setDescription(text: string): HTMLElement {
        return this.contentEl.createEl("p", {
            cls: "swimlane-modal-description",
            text,
        })
    }

    protected addOptionPicker(config: OptionPickerConfig): OptionPicker {
        return new OptionPicker(this.contentEl, config)
    }

    protected showValidationError(message: string): void {
        const existing = this.contentEl.querySelector(".swimlane-modal-error")
        if (existing) {
            existing.remove()
        }

        const errorEl = this.contentEl.createDiv({
            cls: "swimlane-modal-error",
            text: message,
        })

        setTimeout(() => errorEl.remove(), 4000)
    }
}
