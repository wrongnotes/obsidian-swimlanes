import { AbstractInputSuggest, type App, TFile } from "obsidian"

export class FileSuggest extends AbstractInputSuggest<TFile> {
    private filter: (file: TFile) => boolean
    private onValueChange: Array<(file: TFile) => void>

    constructor(
        app: App,
        inputEl: HTMLInputElement,
        filter: (file: TFile) => boolean,
        onValueChange: Array<(file: TFile) => void> = [],
    ) {
        super(app, inputEl)
        this.filter = filter
        this.onValueChange = onValueChange
    }

    getSuggestions(query: string): TFile[] {
        const lowerQuery = query.toLowerCase()
        return this.app.vault
            .getMarkdownFiles()
            .filter(file => this.filter(file) && file.path.toLowerCase().includes(lowerQuery))
    }

    renderSuggestion(file: TFile, el: HTMLElement): void {
        el.setText(file.path)
    }

    selectSuggestion(file: TFile): void {
        this.setValue(file.path)
        for (const cb of this.onValueChange) {
            cb(file)
        }
        this.close()
    }
}
