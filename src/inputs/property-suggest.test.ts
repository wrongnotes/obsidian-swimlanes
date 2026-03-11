import { PropertySuggest } from "./property-suggest"

function makeApp(files: { path: string; frontmatter: Record<string, unknown> | null }[]) {
    return {
        vault: {
            getMarkdownFiles: () => files.map(f => ({ path: f.path })),
        },
        metadataCache: {
            getFileCache: (file: { path: string }) => {
                const match = files.find(f => f.path === file.path)
                return match?.frontmatter ? { frontmatter: match.frontmatter } : null
            },
        },
    } as any
}

describe("PropertySuggest", () => {
    it("returns property names from files in the folder", () => {
        const app = makeApp([
            { path: "tasks/a.md", frontmatter: { status: "done", priority: "high" } },
            { path: "tasks/b.md", frontmatter: { status: "todo" } },
        ])
        const input = document.createElement("input")
        const suggest = new PropertySuggest(app, input, () => "tasks")

        const results = suggest.getSuggestions("")
        expect(results).toContain("status")
        expect(results).toContain("priority")
    })

    it("filters by query", () => {
        const app = makeApp([{ path: "notes/a.md", frontmatter: { status: "done", tags: [] } }])
        const input = document.createElement("input")
        const suggest = new PropertySuggest(app, input, () => "notes")

        expect(suggest.getSuggestions("sta")).toEqual(["status"])
    })

    it("excludes the position key", () => {
        const app = makeApp([
            { path: "a.md", frontmatter: { status: "done", position: { start: 0 } } },
        ])
        const input = document.createElement("input")
        const suggest = new PropertySuggest(app, input, () => "")

        expect(suggest.getSuggestions("")).not.toContain("position")
    })

    it("deduplicates across files", () => {
        const app = makeApp([
            { path: "a.md", frontmatter: { status: "done" } },
            { path: "b.md", frontmatter: { status: "todo" } },
        ])
        const input = document.createElement("input")
        const suggest = new PropertySuggest(app, input, () => "")

        expect(suggest.getSuggestions("")).toEqual(["status"])
    })

    it("returns empty when no files have frontmatter", () => {
        const app = makeApp([{ path: "a.md", frontmatter: null }])
        const input = document.createElement("input")
        const suggest = new PropertySuggest(app, input, () => "")

        expect(suggest.getSuggestions("")).toEqual([])
    })
})
