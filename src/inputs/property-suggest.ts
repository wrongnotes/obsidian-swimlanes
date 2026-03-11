import { AbstractInputSuggest, type App, TFile } from "obsidian"

export class PropertySuggest extends AbstractInputSuggest<string> {
    private getFolder: () => string
    private onValueChange: Array<(value: string) => void>

    constructor(
        app: App,
        inputEl: HTMLInputElement,
        getFolder: () => string,
        onValueChange: Array<(value: string) => void> = [],
    ) {
        super(app, inputEl)
        this.getFolder = getFolder
        this.onValueChange = onValueChange
    }

    getSuggestions(query: string): string[] {
        const folder = this.getFolder()
        const keys = new Set<string>()

        for (const file of this.getFilesInFolder(folder)) {
            const cache = this.app.metadataCache.getFileCache(file)
            if (!cache?.frontmatter) {
                continue
            }
            for (const key of Object.keys(cache.frontmatter)) {
                if (key === "position") {
                    continue
                }
                keys.add(key)
            }
        }

        const lowerQuery = query.toLowerCase()
        return [...keys].filter(k => k.toLowerCase().includes(lowerQuery)).sort()
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.setText(value)
    }

    selectSuggestion(value: string): void {
        this.setValue(value)
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
