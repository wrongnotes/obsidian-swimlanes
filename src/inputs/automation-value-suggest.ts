import { AbstractInputSuggest } from "obsidian"
import type { App } from "obsidian"

export interface TemplateSuggestion {
    token: string
    description: string
}

export const TEMPLATE_SUGGESTIONS: TemplateSuggestion[] = [
    { token: "{{now:YYYY-MM-DD}}", description: "Current date" },
    { token: "{{now:YYYY-MM-DDTHH:mm}}", description: "Current date and time" },
    { token: "{{now:HH:mm}}", description: "Current time" },
    { token: "{{source.swimlane}}", description: "Swimlane the card is leaving" },
    { token: "{{target.swimlane}}", description: "Swimlane the card is entering" },
]

export class AutomationValueSuggest extends AbstractInputSuggest<TemplateSuggestion> {
    private onChange: (value: string) => void

    constructor(app: App, inputEl: HTMLInputElement, onChange: (value: string) => void) {
        super(app, inputEl)
        this.onChange = onChange
    }

    getSuggestions(query: string): TemplateSuggestion[] {
        if (!query) {
            return TEMPLATE_SUGGESTIONS
        }
        const lower = query.toLowerCase()
        return TEMPLATE_SUGGESTIONS.filter(
            s =>
                s.token.toLowerCase().includes(lower) ||
                s.description.toLowerCase().includes(lower),
        )
    }

    renderSuggestion(suggestion: TemplateSuggestion, el: HTMLElement): void {
        el.createDiv({ text: suggestion.token, cls: "swimlane-suggest-token" })
        el.createDiv({ text: suggestion.description, cls: "swimlane-suggest-description" })
    }

    selectSuggestion(suggestion: TemplateSuggestion): void {
        this.setValue(suggestion.token)
        this.onChange(suggestion.token)
        this.close()
    }
}
