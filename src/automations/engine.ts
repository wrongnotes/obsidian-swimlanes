import { moment } from "obsidian"
import type { AutomationContext, AutomationRule, FrontmatterMutation, MatchedMutation } from "./types"

/**
 * Replaces template tokens in a string:
 *   {{now:FORMAT}}         — formats the current date/time using moment.js
 *   {{source.swimlane}}    — the swimlane the card moved from (empty string if null)
 *   {{target.swimlane}}    — the swimlane the card moved to (empty string if null)
 * Unknown tokens are left as-is.
 */
export function resolveValue(template: string, context: AutomationContext): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, token: string) => {
        if (token.startsWith("now:")) {
            const fmt = token.slice(4)
            return moment().format(fmt)
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
): MatchedMutation[] {
    const mutations: MatchedMutation[] = []

    for (const rule of rules) {
        const relevantValue =
            context.type === "leaves" ? context.sourceSwimlane : context.targetSwimlane

        // remains_in fires on "enters" context (card entering a swimlane)
        if (rule.trigger.type === "remains_in") {
            if (context.type !== "enters") continue
        } else {
            if (rule.trigger.type !== context.type) continue
        }

        const swimlane = rule.trigger.swimlane
        if (swimlane !== "*" && swimlane !== relevantValue) {
            continue
        }

        const delay = rule.trigger.type === "remains_in" ? rule.trigger.delay : undefined

        for (const action of rule.actions) {
            if (action.property === swimlaneProp) {
                continue
            }
            if (action.type === "clear") {
                mutations.push({ type: "clear", property: action.property, delay })
            } else {
                mutations.push({
                    type: action.type,
                    property: action.property,
                    value: resolveValue(action.value, context),
                    delay,
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
