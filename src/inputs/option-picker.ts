import { setIcon } from "obsidian"

export interface OptionDef {
    id: string
    icon: string
    label: string
    hint?: string
    danger?: boolean
    /** Called after icon and label are rendered. Receives the label row for adding custom controls. */
    onRender?: (labelEl: HTMLElement) => void
}

export interface OptionPickerConfig {
    options: OptionDef[]
    defaultId?: string
    onSelect?: Array<(id: string) => void>
}

export class OptionPicker {
    readonly containerEl: HTMLElement
    private optionEls = new Map<string, HTMLElement>()
    private _selected: string | null = null
    private onSelectCallbacks: Array<(id: string) => void>

    constructor(parentEl: HTMLElement, config: OptionPickerConfig) {
        this.onSelectCallbacks = config.onSelect ?? []
        this.containerEl = parentEl.createDiv({ cls: "swimlane-modal-options" })

        for (const opt of config.options) {
            const row = this.containerEl.createDiv({
                cls: `swimlane-modal-option${opt.danger ? " swimlane-modal-option--danger" : ""}`,
            })
            this.optionEls.set(opt.id, row)

            const labelEl = row.createDiv({ cls: "swimlane-modal-option-label" })
            const iconEl = labelEl.createSpan({ cls: "swimlane-modal-option-icon" })
            setIcon(iconEl, opt.icon)
            labelEl.createSpan({ text: opt.label })

            opt.onRender?.(labelEl)

            if (opt.hint) {
                row.createDiv({ cls: "swimlane-modal-option-hint", text: opt.hint })
            }

            row.addEventListener("click", () => this.select(opt.id))
        }

        if (config.defaultId !== undefined) {
            this.select(config.defaultId)
        }
    }

    get selected(): string | null {
        return this._selected
    }

    select(id: string): void {
        this._selected = id
        for (const [k, el] of this.optionEls) {
            el.toggleClass("swimlane-modal-option--selected", k === id)
        }
        for (const cb of this.onSelectCallbacks) {
            cb(id)
        }
    }
}
