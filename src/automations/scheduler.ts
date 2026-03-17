import { parseDelay } from "./delay"
import type { FrontmatterMutation, MatchedMutation, ScheduledAction } from "./types"

/**
 * Adds new scheduled actions from delayed mutations.
 * - Filters out mutations without a delay.
 * - Groups mutations with the same delay into a single ScheduledAction entry.
 * - Deduplicates: removes existing entries for the same file + whileInSwimlane.
 * - Returns the updated scheduledActions array (does not mutate the input).
 */
export function addScheduledActions(
    existing: ScheduledAction[],
    filePath: string,
    targetSwimlane: string,
    mutations: MatchedMutation[],
    now: number,
): ScheduledAction[] {
    const delayed = mutations.filter(m => m.delay)
    if (delayed.length === 0) {
        return existing
    }

    // Group by delay value
    const byDelay = new Map<string, FrontmatterMutation[]>()
    for (const m of delayed) {
        const key = m.delay!
        const group = byDelay.get(key) ?? []
        // Strip delay from the mutation stored in the scheduled action
        const { delay: _, ...mutation } = m
        group.push(mutation)
        byDelay.set(key, group)
    }

    // Create new entries
    const newEntries: ScheduledAction[] = []
    for (const [delayStr, actions] of byDelay) {
        const delayMs = parseDelay(delayStr)
        if (!delayMs) {
            continue
        }
        newEntries.push({
            file: filePath,
            due: new Date(now + delayMs).toISOString(),
            whileInSwimlane: targetSwimlane,
            actions,
        })
    }

    if (newEntries.length === 0) {
        return existing
    }

    // Remove existing entries for same file + swimlane (dedup)
    const filtered = existing.filter(
        a => !(a.file === filePath && a.whileInSwimlane === targetSwimlane),
    )

    return [...filtered, ...newEntries]
}

/**
 * Removes all scheduled actions for a given file that were gated on
 * the specified swimlane. Called when a card leaves a swimlane.
 */
export function cancelScheduledActions(
    existing: ScheduledAction[],
    filePath: string,
    swimlane: string,
): ScheduledAction[] {
    return existing.filter(a => !(a.file === filePath && a.whileInSwimlane === swimlane))
}

/**
 * Partitions scheduled actions into those that are due (due <= now)
 * and those still pending.
 */
export function getDueActions(
    actions: ScheduledAction[],
    now: number,
): { due: ScheduledAction[]; remaining: ScheduledAction[] } {
    const due: ScheduledAction[] = []
    const remaining: ScheduledAction[] = []
    for (const action of actions) {
        if (new Date(action.due).getTime() <= now) {
            due.push(action)
        } else {
            remaining.push(action)
        }
    }
    return { due, remaining }
}
