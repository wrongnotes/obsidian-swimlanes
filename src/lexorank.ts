/**
 * Returns a string lexicographically between lo and hi using lowercase a–z.
 * Either bound may be null (meaning "no bound in that direction").
 *
 * Edge case: if all characters in hi are 'a', there is no lowercase string
 * that precedes it — midRank returns hi unchanged as a fallback.
 */
export function midRank(lo: string | null, hi: string | null): string {
    if (lo === null && hi === null) {
        return "m"
    }

    // No upper bound: append 'm' to extend below any existing suffix.
    if (hi === null) {
        return (lo ?? "") + "m"
    }

    // No lower bound: decrement hi toward 'a'.
    if (lo === null) {
        for (let i = hi.length - 1; i >= 0; i--) {
            const c = hi.charCodeAt(i)
            if (c > FIRST) {
                return hi.slice(0, i) + String.fromCharCode(Math.floor((FIRST + c) / 2))
            }
        }
        return hi // all chars are 'a' — can't go lower, return hi as fallback
    }

    // Both bounds provided: find first differing position and bisect.
    for (let i = 0; i <= Math.max(lo.length, hi.length); i++) {
        const lc = i < lo.length ? lo.charCodeAt(i) : FIRST
        const hc = i < hi.length ? hi.charCodeAt(i) : LAST + 1

        if (hc - lc > 1) {
            return lo.slice(0, i) + String.fromCharCode(Math.floor((lc + hc) / 2))
        }

        if (hc > lc) {
            // Adjacent chars: extend into lo's remaining suffix.
            const loSuffix = i + 1 < lo.length ? lo.slice(i + 1) : null
            return lo.slice(0, i + 1) + midRank(loSuffix, null)
        }
        // Equal chars — continue to next position.
    }

    return lo + "m" // strings are identical — shouldn't happen in practice
}

export interface LexorankPosition {
    beforeRank: string | null
    afterRank: string | null
}

const FIRST = "a".charCodeAt(0) // 97
const LAST = "z".charCodeAt(0) // 122
