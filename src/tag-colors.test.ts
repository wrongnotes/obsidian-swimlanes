import { TagColorResolver, contrastingText } from "./tag-colors"
import type { TagColorRule } from "./tag-colors"

describe("TagColorResolver", () => {
    it("returns null when no rules", () => {
        const resolver = new TagColorResolver([])
        expect(resolver.resolve("bug")).toBeNull()
    })

    it("matches exact tag", () => {
        const resolver = new TagColorResolver([{ pattern: "bug", color: "#e05252" }])
        expect(resolver.resolve("bug")).toBe("#e05252")
        expect(resolver.resolve("feature")).toBeNull()
    })

    it("matches case-insensitively", () => {
        const resolver = new TagColorResolver([{ pattern: "Bug", color: "#e05252" }])
        expect(resolver.resolve("bug")).toBe("#e05252")
        expect(resolver.resolve("BUG")).toBe("#e05252")
    })

    it("matches wildcard suffix", () => {
        const resolver = new TagColorResolver([{ pattern: "project/*", color: "#5094e4" }])
        expect(resolver.resolve("project/alpha")).toBe("#5094e4")
        expect(resolver.resolve("project/beta")).toBe("#5094e4")
        expect(resolver.resolve("other")).toBeNull()
    })

    it("matches wildcard prefix", () => {
        const resolver = new TagColorResolver([{ pattern: "*bug", color: "#e05252" }])
        expect(resolver.resolve("showstopper-bug")).toBe("#e05252")
        expect(resolver.resolve("bug")).toBe("#e05252")
        expect(resolver.resolve("bugfix")).toBeNull()
    })

    it("matches wildcard contains", () => {
        const resolver = new TagColorResolver([{ pattern: "*bug*", color: "#e05252" }])
        expect(resolver.resolve("bugfix")).toBe("#e05252")
        expect(resolver.resolve("showstopper-bug")).toBe("#e05252")
    })

    it("matches catch-all wildcard", () => {
        const resolver = new TagColorResolver([{ pattern: "*", color: "#888888" }])
        expect(resolver.resolve("anything")).toBe("#888888")
    })

    it("last match wins", () => {
        const resolver = new TagColorResolver([
            { pattern: "*", color: "#888888" },
            { pattern: "project/*", color: "#5094e4" },
            { pattern: "project/urgent", color: "#e05252" },
        ])
        expect(resolver.resolve("random")).toBe("#888888")
        expect(resolver.resolve("project/alpha")).toBe("#5094e4")
        expect(resolver.resolve("project/urgent")).toBe("#e05252")
    })

    it("caches results", () => {
        const resolver = new TagColorResolver([{ pattern: "bug", color: "#e05252" }])
        const first = resolver.resolve("bug")
        const second = resolver.resolve("bug")
        expect(first).toBe(second)
    })

    it("skips empty patterns", () => {
        const resolver = new TagColorResolver([{ pattern: "", color: "#e05252" }])
        expect(resolver.resolve("bug")).toBeNull()
    })

    it("strips # from patterns", () => {
        const resolver = new TagColorResolver([{ pattern: "#bug", color: "#e05252" }])
        expect(resolver.resolve("bug")).toBe("#e05252")
    })
})

describe("contrastingText", () => {
    it("returns black for light backgrounds", () => {
        expect(contrastingText("#ffffff")).toBe("#000")
        expect(contrastingText("#c4a82b")).toBe("#000")
    })

    it("returns white for dark backgrounds", () => {
        expect(contrastingText("#000000")).toBe("#fff")
        expect(contrastingText("#333333")).toBe("#fff")
    })
})
