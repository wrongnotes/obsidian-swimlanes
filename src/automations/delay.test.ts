import { parseDelay, formatDelay } from "./delay"

describe("parseDelay", () => {
    it("parses minutes", () => {
        expect(parseDelay("30m")).toBe(30 * 60 * 1000)
    })

    it("parses hours", () => {
        expect(parseDelay("2h")).toBe(2 * 60 * 60 * 1000)
    })

    it("parses days", () => {
        expect(parseDelay("3d")).toBe(3 * 24 * 60 * 60 * 1000)
    })

    it("parses weeks", () => {
        expect(parseDelay("2w")).toBe(2 * 7 * 24 * 60 * 60 * 1000)
    })

    it("returns null for empty string", () => {
        expect(parseDelay("")).toBeNull()
    })

    it("returns null for invalid unit", () => {
        expect(parseDelay("5x")).toBeNull()
    })

    it("returns null for non-numeric value", () => {
        expect(parseDelay("abcm")).toBeNull()
    })

    it("returns null for zero", () => {
        expect(parseDelay("0d")).toBeNull()
    })

    it("returns null for negative", () => {
        expect(parseDelay("-1d")).toBeNull()
    })

    it("handles decimal numbers", () => {
        expect(parseDelay("1.5h")).toBe(1.5 * 60 * 60 * 1000)
    })
})

describe("formatDelay", () => {
    it("formats weeks", () => {
        expect(formatDelay(2 * 7 * 24 * 60 * 60 * 1000)).toBe("2w")
    })

    it("formats days", () => {
        expect(formatDelay(3 * 24 * 60 * 60 * 1000)).toBe("3d")
    })

    it("formats hours", () => {
        expect(formatDelay(12 * 60 * 60 * 1000)).toBe("12h")
    })

    it("formats minutes", () => {
        expect(formatDelay(30 * 60 * 1000)).toBe("30m")
    })

    it("prefers largest whole unit", () => {
        expect(formatDelay(7 * 24 * 60 * 60 * 1000)).toBe("1w")
    })

    it("falls back to smaller unit when not evenly divisible", () => {
        expect(formatDelay(36 * 60 * 60 * 1000)).toBe("36h")
    })

    it("returns '1m' for less than a minute", () => {
        expect(formatDelay(1000)).toBe("1m")
    })
})
