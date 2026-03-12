import { AbstractInputSuggest, type App, TFile } from "obsidian"
import type { MultiValueTextHooks } from "./multi-value-text"

export class PropertyValueSuggest extends AbstractInputSuggest<string> {
    private readonly textInputEl: HTMLInputElement
    private getFolder: () => string
    private getProperty: () => string
    private onValueChange: Array<(value: string) => void>
    private hooks: MultiValueTextHooks | null
    constructor(
        app: App,
        inputEl: HTMLInputElement,
        getFolder: () => string,
        getProperty: () => string,
        onValueChange: Array<(value: string) => void> = [],
        hooks: MultiValueTextHooks | null = null,
    ) {
        super(app, inputEl)
        this.textInputEl = inputEl
        this.getFolder = getFolder
        this.getProperty = getProperty
        this.onValueChange = onValueChange
        this.hooks = hooks

        if (hooks) {
            hooks.onFocusOrClick(() => {
                // Synthetic input event is necessary here. AbstractInputSuggest
                // caches its last suggestion results internally — calling open()
                // directly would show stale results (e.g. an empty list after a
                // commit cleared the input). Dispatching "input" forces the
                // internal listener to re-call getSuggestions with the current
                // query before opening the popover.
                this.textInputEl.dispatchEvent(new Event("input", { bubbles: true }))
            })
        }
    }

    getSuggestions(query: string): string[] {
        const folder = this.getFolder()
        const property = this.getProperty()
        if (!property) {
            return []
        }

        const values = new Set<string>()

        for (const file of this.getFilesInFolder(folder)) {
            const cache = this.app.metadataCache.getFileCache(file)
            const raw = cache?.frontmatter?.[property]
            if (raw == null) {
                continue
            }
            if (Array.isArray(raw)) {
                for (const item of raw) {
                    if (typeof item === "string" && item) {
                        values.add(item)
                    }
                }
            } else if (typeof raw === "string" && raw) {
                values.add(raw)
            }
        }

        const lowerQuery = query.toLowerCase()
        const excluded = new Set(this.hooks?.getValues() ?? [])
        return [...values]
            .filter(v => !excluded.has(v) && v.toLowerCase().includes(lowerQuery))
            .sort()
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.setText(value)
    }

    selectSuggestion(value: string): void {
        // Set the input value directly to avoid triggering the suggest's
        // internal input listener, which would race with commit+clear.
        this.textInputEl.value = value
        for (const cb of this.onValueChange) {
            cb(value)
        }
        this.hooks?.commit()
        this.close()
    }

    private getFilesInFolder(folder: string): TFile[] {
        const prefix = folder ? folder + "/" : ""
        return this.app.vault.getMarkdownFiles().filter((f: TFile) => f.path.startsWith(prefix))
    }
}
