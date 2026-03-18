import { parseYaml, stringifyYaml } from "obsidian"
import type { AutomationAction, AutomationRule, ScheduledAction } from "./types"
import { parseDelay } from "./delay"

const VALID_TRIGGER_TYPES = new Set(["enters", "leaves", "created_in", "remains_in"])

function isValidAction(action: unknown): action is AutomationAction {
    if (!action || typeof action !== "object") {
        return false
    }
    const a = action as Record<string, unknown>
    if (typeof a.type !== "string") {
        return false
    }
    if (a.type === "delete") {
        return true
    }
    if (a.type === "move") {
        return typeof a.value === "string" && a.value !== ""
    }
    if (typeof a.property !== "string" || a.property === "") {
        return false
    }
    if (a.type === "set" || a.type === "add" || a.type === "remove") {
        return typeof a.value === "string" && a.value !== ""
    }
    if (a.type === "clear") {
        return true
    }
    return false
}

function isValidRule(rule: unknown): rule is AutomationRule {
    if (!rule || typeof rule !== "object") {
        return false
    }
    const r = rule as Record<string, unknown>

    // Validate trigger
    const trigger = r.trigger
    if (!trigger || typeof trigger !== "object") {
        return false
    }
    const t = trigger as Record<string, unknown>
    if (!VALID_TRIGGER_TYPES.has(t.type as string)) {
        return false
    }
    if (typeof t.swimlane !== "string" || t.swimlane === "") {
        return false
    }
    if (t.type === "remains_in") {
        if (typeof t.delay !== "string" || t.delay === "" || !parseDelay(t.delay as string)) {
            return false
        }
    }

    // Validate actions
    if (!Array.isArray(r.actions) || r.actions.length === 0) {
        return false
    }
    for (const action of r.actions) {
        if (!isValidAction(action)) {
            return false
        }
    }

    return true
}

/**
 * Parses automation rules from a YAML config string.
 * Returns only valid rules; malformed ones are silently dropped.
 */
export function readAutomations(content: string): AutomationRule[] {
    if (!content || typeof content !== "string") {
        return []
    }

    const parsed = parseYaml(content)
    if (!parsed || typeof parsed !== "object") {
        return []
    }

    const config = parsed as Record<string, unknown>
    if (!Array.isArray(config.automations)) {
        return []
    }

    return config.automations.filter(isValidRule) as AutomationRule[]
}

function isValidMutationAction(action: unknown): boolean {
    if (!action || typeof action !== "object") {
        return false
    }
    const a = action as Record<string, unknown>
    if (typeof a.type !== "string") {
        return false
    }
    if (a.type === "delete") {
        return true
    }
    if (typeof a.property !== "string" || a.property === "") {
        return false
    }
    if (a.type === "set" || a.type === "add" || a.type === "remove") {
        return a.value !== undefined
    }
    if (a.type === "clear") {
        return true
    }
    return false
}

function isValidScheduledAction(entry: unknown): entry is ScheduledAction {
    if (!entry || typeof entry !== "object") {
        return false
    }
    const e = entry as Record<string, unknown>
    if (typeof e.file !== "string" || e.file === "") {
        return false
    }
    if (typeof e.due !== "string" || e.due === "") {
        return false
    }
    if (isNaN(new Date(e.due as string).getTime())) {
        return false
    }
    if (typeof e.whileInSwimlane !== "string" || e.whileInSwimlane === "") {
        return false
    }
    if (!Array.isArray(e.actions) || e.actions.length === 0) {
        return false
    }
    return e.actions.every(isValidMutationAction)
}

export function readScheduledActions(content: string): ScheduledAction[] {
    if (!content || typeof content !== "string") {
        return []
    }
    const parsed = parseYaml(content)
    if (!parsed || typeof parsed !== "object") {
        return []
    }
    const config = parsed as Record<string, unknown>
    if (!Array.isArray(config.scheduledActions)) {
        return []
    }
    return config.scheduledActions.filter(isValidScheduledAction)
}

export function writeScheduledActions(content: string, actions: ScheduledAction[]): string {
    let config: Record<string, unknown> = {}
    if (content && typeof content === "string") {
        const parsed = parseYaml(content)
        if (parsed && typeof parsed === "object") {
            config = parsed as Record<string, unknown>
        }
    }
    config.scheduledActions = actions
    return stringifyYaml(config)
}

/**
 * Writes automation rules into a YAML config string, preserving all other keys.
 */
export function writeAutomations(content: string, rules: AutomationRule[]): string {
    let config: Record<string, unknown> = {}
    if (content && typeof content === "string") {
        const parsed = parseYaml(content)
        if (parsed && typeof parsed === "object") {
            config = parsed as Record<string, unknown>
        }
    }
    config.automations = rules
    return stringifyYaml(config)
}
