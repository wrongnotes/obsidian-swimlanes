import { midRank, generateSpacedRanks } from "./lexorank"

describe("midRank", () => {
    describe("both bounds null", () => {
        it("returns 'm' as the initial rank", () => {
            expect(midRank(null, null)).toBe("m")
        })
    })

    describe("no upper bound (inserting after lo)", () => {
        it("appends 'm' to extend below lo", () => {
            expect(midRank("m", null)).toBe("mm")
        })

        it("appends 'm' recursively for deeper suffixes", () => {
            expect(midRank("mm", null)).toBe("mmm")
        })

        it("works with a single-char lo", () => {
            expect(midRank("a", null)).toBe("am")
        })
    })

    describe("no lower bound (inserting before hi)", () => {
        it("returns a rank before hi", () => {
            const result = midRank(null, "m")
            expect(result < "m").toBe(true)
        })

        it("bisects between 'a' and the first char of hi", () => {
            expect(midRank(null, "m")).toBe("g") // floor((97+109)/2) = 103 = 'g'
        })

        it("decrements from the last decrementable character", () => {
            expect(midRank(null, "am")).toBe("ag") // last char 'm' → floor((97+109)/2)='g'
        })

        it("falls back to hi when all chars are 'a' (cannot go lower)", () => {
            expect(midRank(null, "a")).toBe("a")
            expect(midRank(null, "aa")).toBe("aa")
        })
    })

    describe("both bounds provided", () => {
        it("returns the midpoint character when there is room", () => {
            expect(midRank("a", "c")).toBe("b")
        })

        it("handles non-adjacent chars with a direct midpoint", () => {
            expect(midRank("a", "z")).toBe("m") // floor((97+122)/2) = 109 = 'm'
        })

        it("extends into a suffix when chars are adjacent", () => {
            const result = midRank("a", "b")
            expect(result > "a").toBe(true)
            expect(result < "b").toBe(true)
        })

        it("handles adjacent chars with a longer lo suffix", () => {
            const result = midRank("am", "b")
            expect(result > "am").toBe(true)
            expect(result < "b").toBe(true)
        })

        it("handles multi-level adjacent char chains", () => {
            const result = midRank("amm", "b")
            expect(result > "amm").toBe(true)
            expect(result < "b").toBe(true)
        })

        it("handles equal prefix, differing later", () => {
            const result = midRank("ma", "mz")
            expect(result > "ma").toBe(true)
            expect(result < "mz").toBe(true)
        })

        it("result is always strictly between lo and hi", () => {
            const pairs: [string, string][] = [
                ["a", "z"],
                ["g", "m"],
                ["m", "mm"],
                ["am", "b"],
                ["mg", "mm"],
            ]
            for (const [lo, hi] of pairs) {
                const result = midRank(lo, hi)
                expect(result > lo).toBe(true)
                expect(result < hi).toBe(true)
            }
        })
    })

    describe("repeated insertion stays ordered", () => {
        it("inserting at the end repeatedly produces ascending ranks", () => {
            const ranks: string[] = []
            let last: string | null = null
            for (let i = 0; i < 10; i++) {
                last = midRank(last, null)
                ranks.push(last)
            }
            for (let i = 1; i < ranks.length; i++) {
                expect(ranks[i]! > ranks[i - 1]!).toBe(true)
            }
        })

        it("inserting at the beginning repeatedly produces descending ranks", () => {
            const ranks: string[] = []
            let first: string | null = "m"
            for (let i = 0; i < 10; i++) {
                const r = midRank(null, first)
                if (r === first) {
                    break
                } // hit the 'a' fallback — stop
                ranks.push(r)
                first = r
            }
            for (let i = 1; i < ranks.length; i++) {
                expect(ranks[i]! < ranks[i - 1]!).toBe(true)
            }
        })

        it("bisecting the same slot many times stays ordered until the floor", () => {
            let lo: string | null = "a"
            let hi: string | null = "z"
            for (let i = 0; i < 20; i++) {
                const mid = midRank(lo, hi)
                if (mid <= lo! || mid >= hi!) {
                    break
                } // hit the 'a' fallback floor — stop
                expect(mid > lo!).toBe(true)
                expect(mid < hi!).toBe(true)
                hi = mid // keep bisecting the lower half
            }
        })
    })
})

describe("generateSpacedRanks", () => {
    it("returns empty array for 0", () => {
        expect(generateSpacedRanks(0)).toEqual([])
    })

    it("returns a single rank for 1", () => {
        const ranks = generateSpacedRanks(1)
        expect(ranks).toHaveLength(1)
        expect(ranks[0]!.length).toBeGreaterThan(0)
    })

    it("returns strictly increasing ranks for 5 cards", () => {
        const ranks = generateSpacedRanks(5)
        expect(ranks).toHaveLength(5)
        for (let i = 1; i < ranks.length; i++) {
            expect(ranks[i]! > ranks[i - 1]!).toBe(true)
        }
    })

    it("returns strictly increasing ranks for 50 cards", () => {
        const ranks = generateSpacedRanks(50)
        expect(ranks).toHaveLength(50)
        for (let i = 1; i < ranks.length; i++) {
            expect(ranks[i]! > ranks[i - 1]!).toBe(true)
        }
    })

    it("returns strictly increasing ranks for 100 cards", () => {
        const ranks = generateSpacedRanks(100)
        expect(ranks).toHaveLength(100)
        for (let i = 1; i < ranks.length; i++) {
            expect(ranks[i]! > ranks[i - 1]!).toBe(true)
        }
    })

    it("all ranks are non-empty strings", () => {
        const ranks = generateSpacedRanks(100)
        for (const r of ranks) {
            expect(typeof r).toBe("string")
            expect(r.length).toBeGreaterThan(0)
        }
    })
})
