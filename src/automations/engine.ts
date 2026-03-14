import type { AutomationContext, AutomationRule, FrontmatterMutation } from "./types"

/**
 * Lightweight date formatter using moment-style tokens.
 * Supported tokens: YYYY, YY, MM, DD, HH, mm, ss
 */
export function formatNow(format: string, now?: Date): string {
    const d = now ?? new Date()
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const day = d.getDate()
    const hours = d.getHours()
    const minutes = d.getMinutes()
    const seconds = d.getSeconds()

    const pad = (n: number): string => String(n).padStart(2, "0")

    return format
        .replace("YYYY", String(year))
        .replace("YY", String(year).slice(-2))
        .replace("MM", pad(month))
        .replace("DD", pad(day))
        .replace("HH", pad(hours))
        .replace("mm", pad(minutes))
        .replace("ss", pad(seconds))
}

/**
 * Replaces template tokens in a string:
 *   {{now:FORMAT}}         — formats the current date/time
 *   {{source.swimlane}}    — the swimlane the card moved from (empty string if null)
 *   {{target.swimlane}}    — the swimlane the card moved to (empty string if null)
 * Unknown tokens are left as-is.
 */
export function resolveValue(template: string, context: AutomationContext, now?: Date): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, token: string) => {
        if (token.startsWith("now:")) {
            const fmt = token.slice(4)
            return formatNow(fmt, now)
        }
        if (token === "source.swimlane") {
            return context.sourceSwimlane ?? ""
        }
        if (token === "target.swimlane") {
            return context.targetSwimlane ?? ""
        }
        return match
    })
}

/**
 * Returns all frontmatter mutations produced by rules that match the given context.
 * - "enters" / "created_in" match on targetSwimlane
 * - "leaves" matches on sourceSwimlane
 * - trigger.swimlane "*" is a wildcard matching any value
 * Mutations that would set/clear swimlaneProp are filtered out (loop prevention).
 */
export function matchRules(
    rules: AutomationRule[],
    context: AutomationContext,
    swimlaneProp: string,
    now?: Date,
): FrontmatterMutation[] {
    const mutations: FrontmatterMutation[] = []

    for (const rule of rules) {
        if (rule.trigger.type !== context.type) {
            continue
        }

        const relevantValue =
            context.type === "leaves" ? context.sourceSwimlane : context.targetSwimlane

        const swimlane = rule.trigger.swimlane
        if (swimlane !== "*" && swimlane !== relevantValue) {
            continue
        }

        for (const action of rule.actions) {
            if (action.property === swimlaneProp) {
                continue
            }
            if (action.type === "clear") {
                mutations.push({ type: "clear", property: action.property })
            } else {
                mutations.push({
                    type: action.type,
                    property: action.property,
                    value: resolveValue(action.value, context, now),
                })
            }
        }
    }

    return mutations
}

/**
 * Applies an array of frontmatter mutations to a frontmatter object in-place.
 * - "set": assigns the value
 * - "add": appends to an array (creates if absent, no-ops if already present)
 * - "remove": removes from an array (no-ops if absent)
 * - "clear": deletes the property
 */
export function applyMutations(
    fm: Record<string, unknown>,
    mutations: FrontmatterMutation[],
): void {
    for (const mutation of mutations) {
        switch (mutation.type) {
            case "set":
                fm[mutation.property] = mutation.value
                break
            case "add": {
                const arr = Array.isArray(fm[mutation.property])
                    ? (fm[mutation.property] as unknown[])
                    : []
                if (!arr.includes(mutation.value)) {
                    arr.push(mutation.value)
                }
                fm[mutation.property] = arr
                break
            }
            case "remove": {
                if (Array.isArray(fm[mutation.property])) {
                    fm[mutation.property] = (fm[mutation.property] as unknown[]).filter(
                        v => v !== mutation.value,
                    )
                }
                break
            }
            case "clear":
                delete fm[mutation.property]
                break
        }
    }
}
