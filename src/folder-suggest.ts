import { AbstractInputSuggest, type App, TFolder } from "obsidian"

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl)
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
        this.close()
    }
}
