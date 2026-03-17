export type TriggerType = "enters" | "leaves" | "created_in" | "remains_in"

export interface AutomationContext {
    type: TriggerType
    sourceSwimlane: string | null
    targetSwimlane: string | null
}

export interface AutomationRule {
    trigger: {
        type: TriggerType
        swimlane: string
        delay?: string  // required for remains_in, absent for others
    }
    actions: AutomationAction[]
}

export type AutomationAction =
    | { type: "set"; property: string; value: string }
    | { type: "add"; property: string; value: string }
    | { type: "remove"; property: string; value: string }
    | { type: "clear"; property: string }
    | { type: "delete" }

export interface FrontmatterMutation {
    type: "set" | "add" | "remove" | "clear" | "delete"
    property: string
    value?: unknown
}

/** A frontmatter mutation with an optional delay from matchRules(). */
export type MatchedMutation = FrontmatterMutation & { delay?: string }

/** A scheduled action stored in the .base file, pending future execution. */
export interface ScheduledAction {
    file: string
    due: string  // ISO 8601 timestamp
    whileInSwimlane: string
    actions: FrontmatterMutation[]
}
