import { Setting } from "obsidian"

export interface MultiValueTextOptions {
    name: string
    desc: string
    placeholder?: string
    containerEl: HTMLElement
    onChange?: (values: string[]) => void
    setupInput?: (inputEl: HTMLInputElement) => void
}

export class MultiValueText {
    private values: string[] = []
    private tagsEl: HTMLElement | null = null
    private readonly container: HTMLElement
    private readonly opts: MultiValueTextOptions
    private textGetter: (() => string) | null = null
    private textClearer: (() => void) | null = null

    constructor(opts: MultiValueTextOptions) {
        this.opts = opts
        this.container = opts.containerEl.createDiv({ cls: "swimlane-multi-value-text" })
        this.build()
    }

    getValues(): string[] {
        return this.values
    }

    private build(): void {
        const setting = new Setting(this.container).setName(this.opts.name).setDesc(this.opts.desc)

        setting.addText(text => {
            if (this.opts.placeholder) {
                text.setPlaceholder(this.opts.placeholder)
            }
            this.opts.setupInput?.(text.inputEl)
            this.textGetter = () => text.getValue()
            this.textClearer = () => text.setValue("")
            text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
                if (e.key !== "Enter") {
                    return
                }
                e.preventDefault()
                this.addCurrentValue()
            })
        })

        setting.addExtraButton(btn => {
            btn.setIcon("plus")
            btn.setTooltip("Add")
            btn.onClick(() => this.addCurrentValue())
        })

        this.renderTags()
    }

    private addCurrentValue(): void {
        const value = this.textGetter?.()?.trim() ?? ""
        if (value && !this.values.includes(value)) {
            this.values.push(value)
            this.renderTags()
            this.opts.onChange?.(this.values)
        }
        this.textClearer?.()
    }

    private renderTags(): void {
        if (this.tagsEl) {
            this.tagsEl.remove()
            this.tagsEl = null
        }

        if (this.values.length === 0) {
            return
        }

        this.tagsEl = this.container.createDiv({ cls: "swimlane-multi-value-text-tags" })
        for (const value of this.values) {
            const tag = this.tagsEl.createSpan({
                cls: "swimlane-multi-value-text-tag",
                text: value,
            })
            const removeBtn = tag.createSpan({
                cls: "swimlane-multi-value-text-tag-remove",
                text: "\u00d7",
            })
            removeBtn.addEventListener("click", () => {
                this.values = this.values.filter(v => v !== value)
                this.renderTags()
                this.opts.onChange?.(this.values)
            })
        }
    }
}
