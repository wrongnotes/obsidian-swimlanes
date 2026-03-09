import type { App, TFile } from "obsidian"
import { getFrontmatter } from "./utils"

function makeApp(frontmatter: Record<string, unknown> | undefined): App {
    return {
        metadataCache: {
            getFileCache: () => (frontmatter !== undefined ? { frontmatter } : null),
        },
    } as unknown as App
}

// eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast
const file = {} as TFile

describe("getFrontmatter", () => {
    it("returns the value for a present key", () => {
        const app = makeApp({ status: "Done" })
        expect(getFrontmatter<string>(app, file, "status")).toBe("Done")
    })

    it("returns undefined for a missing key", () => {
        const app = makeApp({ status: "Done" })
        expect(getFrontmatter<string>(app, file, "rank")).toBeUndefined()
    })

    it("returns undefined when there is no frontmatter", () => {
        const app = makeApp(undefined)
        expect(getFrontmatter<string>(app, file, "status")).toBeUndefined()
    })

    it("returns undefined when getFileCache returns null", () => {
        const app = {
            metadataCache: { getFileCache: () => null },
        } as unknown as App
        expect(getFrontmatter<string>(app, file, "status")).toBeUndefined()
    })

    it("preserves non-string value types", () => {
        const app = makeApp({ count: 42 })
        expect(getFrontmatter<number>(app, file, "count")).toBe(42)
    })
})
