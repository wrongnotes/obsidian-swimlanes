import { AbstractInputSuggest, type App, TFolder } from "obsidian"

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
    private onValueChange: Array<(value: string) => void>

    constructor(
        app: App,
        inputEl: HTMLInputElement,
        onValueChange: Array<(value: string) => void> = [],
    ) {
        super(app, inputEl)
        this.onValueChange = onValueChange
    }

    getSuggestions(query: string): TFolder[] {
        const lowerQuery = query.toLowerCase()
        return this.app.vault.getAllFolders(true).filter(folder => {
            return folder.path.toLowerCase().includes(lowerQuery)
        })
    }

    renderSuggestion(folder: TFolder, el: HTMLElement): void {
        el.setText(folder.path || "/")
    }

    selectSuggestion(folder: TFolder): void {
        this.setValue(folder.path)
        for (const cb of this.onValueChange) {
            cb(folder.path)
        }
        this.close()
    }
}
