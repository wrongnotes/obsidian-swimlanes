import { AbstractInputSuggest, type App, TFile } from "obsidian"

export class PropertyValueSuggest extends AbstractInputSuggest<string> {
    private readonly textInputEl: HTMLInputElement
    private getFolder: () => string
    private getProperty: () => string
    private onValueChange: Array<(value: string) => void>

    constructor(
        app: App,
        inputEl: HTMLInputElement,
        getFolder: () => string,
        getProperty: () => string,
        onValueChange: Array<(value: string) => void> = [],
    ) {
        super(app, inputEl)
        this.textInputEl = inputEl
        this.getFolder = getFolder
        this.getProperty = getProperty
        this.onValueChange = onValueChange
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
        return [...values].filter(v => v.toLowerCase().includes(lowerQuery)).sort()
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.setText(value)
    }

    selectSuggestion(value: string): void {
        this.setValue(value)
        this.textInputEl.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        )
        for (const cb of this.onValueChange) {
            cb(value)
        }
        this.close()
    }

    private getFilesInFolder(folder: string): TFile[] {
        const prefix = folder ? folder + "/" : ""
        return this.app.vault.getMarkdownFiles().filter((f: TFile) => f.path.startsWith(prefix))
    }
}
