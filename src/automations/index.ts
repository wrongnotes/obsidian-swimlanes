export type {
    AutomationRule,
    AutomationAction,
    AutomationContext,
    FrontmatterMutation,
    MatchedMutation,
    ScheduledAction,
    TriggerType,
} from "./types"
export { matchRules, applyMutations } from "./engine"
export { readAutomations, writeAutomations } from "./io"
export { AutomationsModal } from "./modal"
export type { AutomationsModalContext, PropertyInfo } from "./modal"
