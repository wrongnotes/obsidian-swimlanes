import type { App } from "obsidian"
import { AbstractInputSuggest } from "obsidian"

/**
 * Autocomplete suggestions for Obsidian tags.
 * Reads all tags from the vault's metadata cache.
 */
export class TagSuggest extends AbstractInputSuggest<string> {
    private onSelectTag: (tag: string) => void

    constructor(app: App, inputEl: HTMLInputElement, onSelectTag: (tag: string) => void) {
        super(app, inputEl)
        this.onSelectTag = onSelectTag
    }

    getSuggestions(query: string): string[] {
        const cache = this.app.metadataCache as { getTags?: () => Record<string, number> }
        const allTags = Object.keys(cache.getTags?.() ?? {})
            .map(t => (t.startsWith("#") ? t.slice(1) : t))
            .sort()
        if (!query) return allTags.slice(0, 20)
        const lower = query.toLowerCase().replace(/^#/, "")
        return allTags.filter(t => t.toLowerCase().includes(lower)).slice(0, 20)
    }

    renderSuggestion(tag: string, el: HTMLElement): void {
        el.setText(`#${tag}`)
    }

    selectSuggestion(tag: string): void {
        this.onSelectTag(tag)
        this.setValue("")
        this.close()
    }
}
