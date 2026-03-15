import { AbstractInputSuggest } from "obsidian"
import type { App } from "obsidian"

export class AutomationPropertySuggest extends AbstractInputSuggest<string> {
    private getProperties: () => string[]
    private exclude: string
    private onChange: (value: string) => void

    constructor(
        app: App,
        inputEl: HTMLInputElement,
        getProperties: () => string[],
        exclude: string,
        onChange: (value: string) => void,
    ) {
        super(app, inputEl)
        this.getProperties = getProperties
        this.exclude = exclude
        this.onChange = onChange
    }

    getSuggestions(query: string): string[] {
        const lower = query.toLowerCase()
        return this.getProperties()
            .filter(p => p !== this.exclude && p !== "position")
            .filter(p => p.toLowerCase().includes(lower))
            .sort()
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.setText(value)
    }

    selectSuggestion(value: string): void {
        this.setValue(value)
        this.onChange(value)
        this.close()
    }
}
