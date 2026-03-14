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
    | { type: "set"; property: string; value: string }
    | { type: "add"; property: string; value: string }
    | { type: "remove"; property: string; value: string }
    | { type: "clear"; property: string }

export interface FrontmatterMutation {
    type: "set" | "add" | "remove" | "clear"
    property: string
    value?: unknown
}
