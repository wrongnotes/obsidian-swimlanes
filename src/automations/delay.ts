const UNIT_MS: Record<string, number> = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
}

/**
 * Parses a delay string like "2w", "3d", "12h", "30m" into milliseconds.
 * Returns null for invalid input or non-positive values.
 */
export function parseDelay(s: string): number | null {
    if (!s) return null
    const match = s.match(/^(\d+(?:\.\d+)?)\s*([mhdw])$/i)
    if (!match) return null
    const value = parseFloat(match[1]!)
    if (value <= 0 || !isFinite(value)) return null
    const unit = match[2]!.toLowerCase()
    const multiplier = UNIT_MS[unit]
    if (!multiplier) return null
    return value * multiplier
}

/**
 * Formats milliseconds back to a human-readable delay string.
 * Uses the largest unit that divides evenly, falling back to minutes.
 */
export function formatDelay(ms: number): string {
    const units: [string, number][] = [
        ["w", UNIT_MS.w!],
        ["d", UNIT_MS.d!],
        ["h", UNIT_MS.h!],
        ["m", UNIT_MS.m!],
    ]
    for (const [unit, factor] of units) {
        if (ms >= factor && ms % factor === 0) {
            return `${ms / factor}${unit}`
        }
    }
    return `${Math.max(1, Math.round(ms / UNIT_MS.m!))}m`
}
