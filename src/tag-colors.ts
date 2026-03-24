export interface TagColorRule {
    pattern: string
    color: string
    /** Optional custom text color. If omitted, auto-computed for contrast. */
    textColor?: string
    /** Background opacity 0–1. Defaults to 1. */
    opacity?: number
}

export interface ResolvedTagColor {
    bg: string
    fg: string
}

export const PRESET_PALETTE = [
    { name: "Red", color: "#e05252" },
    { name: "Orange", color: "#d97a2b" },
    { name: "Yellow", color: "#c4a82b" },
    { name: "Green", color: "#4fad5b" },
    { name: "Teal", color: "#2da8a8" },
    { name: "Blue", color: "#5094e4" },
    { name: "Purple", color: "#9b6cd1" },
    { name: "Pink", color: "#d15fa6" },
    { name: "Gray", color: "#888888" },
] as const

/** Convert a glob pattern (with `*` wildcards) to a case-insensitive RegExp. */
function globToRegex(pattern: string): RegExp {
    const stripped = pattern.startsWith("#") ? pattern.slice(1) : pattern
    const escaped = stripped.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    const regexStr = escaped.replace(/\*/g, ".*")
    return new RegExp(`^${regexStr}$`, "i")
}

export class TagColorResolver {
    private compiled: { regex: RegExp; color: string; textColor?: string; opacity: number }[]
    private cache = new Map<string, ResolvedTagColor | null>()

    constructor(rules: TagColorRule[]) {
        this.compiled = rules
            .filter(r => r.pattern.replace(/^#/, "").length > 0)
            .map(r => ({
                regex: globToRegex(r.pattern),
                color: r.color,
                textColor: r.textColor,
                opacity: r.opacity ?? 1,
            }))
    }

    resolve(tag: string): ResolvedTagColor | null {
        const cached = this.cache.get(tag)
        if (cached !== undefined) {
            return cached
        }
        const result = this.evaluate(tag)
        this.cache.set(tag, result)
        return result
    }

    private evaluate(tag: string): ResolvedTagColor | null {
        for (const rule of this.compiled) {
            if (rule.regex.test(tag)) {
                const bg = rule.opacity < 1 ? hexToRgba(rule.color, rule.opacity) : rule.color
                return {
                    bg,
                    fg: rule.textColor || contrastingText(rule.color),
                }
            }
        }
        return null
    }
}

/** Convert hex color + opacity (0–1) to an rgba() string. */
function hexToRgba(hex: string, opacity: number): string {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

/** Return "#000" or "#fff" for best contrast against the given hex background. */
export function contrastingText(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
    return luminance > 0.179 ? "#000" : "#fff"
}
