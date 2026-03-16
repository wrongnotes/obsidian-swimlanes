export type TriggerType = "enters" | "leaves" | "created_in"

export interface AutomationContext {
    type: TriggerType
    sourceSwimlane: string | null
    targetSwimlane: string | null
}

export interface AutomationRule {
    trigger: {
        type: TriggerType
        swimlane: string
    }
    actions: AutomationAction[]
}

export type AutomationAction =
    | { type: "set"; property: string; value: string; delay?: string }
    | { type: "add"; property: string; value: string; delay?: string }
    | { type: "remove"; property: string; value: string; delay?: string }
    | { type: "clear"; property: string; delay?: string }

export interface FrontmatterMutation {
    type: "set" | "add" | "remove" | "clear"
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
