import type { TFolder } from "obsidian"
import { FolderSuggest } from "./folder-suggest"

function makeApp(folders: TFolder[]) {
    return {
        vault: {
            getAllFolders: () => folders,
        },
    } as any
}

function makeFolder(path: string) {
    return { path, children: [], isRoot: () => path === "" } as any
}

describe("FolderSuggest", () => {
    it("returns folders matching the query", () => {
        const folders = [
            makeFolder("Projects"),
            makeFolder("Archive"),
            makeFolder("Projects/Tasks"),
        ]
        const app = makeApp(folders)
        const input = document.createElement("input")
        const suggest = new FolderSuggest(app, input)

        const results = suggest.getSuggestions("proj")
        expect(results).toHaveLength(2)
        expect(results.map(f => f.path)).toEqual(["Projects", "Projects/Tasks"])
    })

    it("returns all folders for empty query", () => {
        const folders = [makeFolder("A"), makeFolder("B")]
        const app = makeApp(folders)
        const input = document.createElement("input")
        const suggest = new FolderSuggest(app, input)

        const results = suggest.getSuggestions("")
        expect(results).toHaveLength(2)
    })

    it("is case-insensitive", () => {
        const folders = [makeFolder("MyFolder")]
        const app = makeApp(folders)
        const input = document.createElement("input")
        const suggest = new FolderSuggest(app, input)

        const results = suggest.getSuggestions("myfolder")
        expect(results).toHaveLength(1)
    })

    it("renders folder path as suggestion text", () => {
        const app = makeApp([])
        const input = document.createElement("input")
        const suggest = new FolderSuggest(app, input)

        const el = document.createElement("div")
        suggest.renderSuggestion(makeFolder("Projects/Tasks"), el)
        expect(el.textContent).toBe("Projects/Tasks")
    })

    it("renders root folder as /", () => {
        const app = makeApp([])
        const input = document.createElement("input")
        const suggest = new FolderSuggest(app, input)

        const el = document.createElement("div")
        suggest.renderSuggestion(makeFolder(""), el)
        expect(el.textContent).toBe("/")
    })
})
