import { PropertyValueSuggest } from "./property-value-suggest"

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

describe("PropertyValueSuggest", () => {
    it("returns values for the given property", () => {
        const app = makeApp([
            { path: "tasks/a.md", frontmatter: { status: "done" } },
            { path: "tasks/b.md", frontmatter: { status: "todo" } },
        ])
        const input = document.createElement("input")
        const suggest = new PropertyValueSuggest(
            app,
            input,
            () => "tasks",
            () => "status",
        )

        const results = suggest.getSuggestions("")
        expect(results).toEqual(["done", "todo"])
    })

    it("handles array values", () => {
        const app = makeApp([{ path: "a.md", frontmatter: { tags: ["alpha", "beta"] } }])
        const input = document.createElement("input")
        const suggest = new PropertyValueSuggest(
            app,
            input,
            () => "",
            () => "tags",
        )

        expect(suggest.getSuggestions("")).toEqual(["alpha", "beta"])
    })

    it("filters by query", () => {
        const app = makeApp([
            { path: "a.md", frontmatter: { status: "done" } },
            { path: "b.md", frontmatter: { status: "todo" } },
        ])
        const input = document.createElement("input")
        const suggest = new PropertyValueSuggest(
            app,
            input,
            () => "",
            () => "status",
        )

        expect(suggest.getSuggestions("to")).toEqual(["todo"])
    })

    it("deduplicates values", () => {
        const app = makeApp([
            { path: "a.md", frontmatter: { status: "done" } },
            { path: "b.md", frontmatter: { status: "done" } },
        ])
        const input = document.createElement("input")
        const suggest = new PropertyValueSuggest(
            app,
            input,
            () => "",
            () => "status",
        )

        expect(suggest.getSuggestions("")).toEqual(["done"])
    })

    it("returns empty when property is empty", () => {
        const app = makeApp([{ path: "a.md", frontmatter: { status: "done" } }])
        const input = document.createElement("input")
        const suggest = new PropertyValueSuggest(
            app,
            input,
            () => "",
            () => "",
        )

        expect(suggest.getSuggestions("")).toEqual([])
    })

    it("skips non-string values", () => {
        const app = makeApp([{ path: "a.md", frontmatter: { count: 42 } }])
        const input = document.createElement("input")
        const suggest = new PropertyValueSuggest(
            app,
            input,
            () => "",
            () => "count",
        )

        expect(suggest.getSuggestions("")).toEqual([])
    })

    it("only includes files from the specified folder", () => {
        const app = makeApp([
            { path: "tasks/a.md", frontmatter: { status: "done" } },
            { path: "notes/b.md", frontmatter: { status: "todo" } },
        ])
        const input = document.createElement("input")
        const suggest = new PropertyValueSuggest(
            app,
            input,
            () => "tasks",
            () => "status",
        )

        expect(suggest.getSuggestions("")).toEqual(["done"])
    })
})
