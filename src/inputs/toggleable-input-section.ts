import { Setting } from "obsidian"

export class ToggleableInputSection {
    readonly containerEl: HTMLElement
    readonly bodyEl: HTMLElement
    private _enabled = false

    constructor(
        parentEl: HTMLElement,
        name: string,
        desc: string,
        onChange?: (enabled: boolean) => void,
    ) {
        this.containerEl = parentEl.createDiv({ cls: "swimlane-toggleable-section" })

        new Setting(this.containerEl)
            .setName(name)
            .setDesc(desc)
            .addToggle(toggle => {
                toggle.setValue(false)
                toggle.onChange(value => {
                    this._enabled = value
                    this.bodyEl.setCssStyles({ display: value ? "" : "none" })
                    onChange?.(value)
                })
            })

        this.bodyEl = this.containerEl.createDiv({
            cls: "swimlane-toggleable-section-body",
        })
        this.bodyEl.setCssStyles({ display: "none" })
    }

    get enabled(): boolean {
        return this._enabled
    }
}
