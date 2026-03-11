export class InputSection {
    readonly containerEl: HTMLElement

    constructor(parentEl: HTMLElement) {
        this.containerEl = parentEl.createDiv({ cls: "swimlane-input-section" })
    }
}
