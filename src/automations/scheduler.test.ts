import { addScheduledActions, cancelScheduledActions, getDueActions } from "./scheduler"
import type { ScheduledAction, MatchedMutation } from "./types"

describe("addScheduledActions", () => {
    it("creates scheduled action entries from delayed mutations", () => {
        const existing: ScheduledAction[] = []
        const mutations: MatchedMutation[] = [
            { type: "set", property: "status", value: "Archived", delay: "2w" },
        ]
        const now = new Date("2026-03-15T12:00:00Z").getTime()
        const result = addScheduledActions(existing, "notes/task.md", "Done", mutations, now)
        expect(result).toHaveLength(1)
        expect(result[0]!.file).toBe("notes/task.md")
        expect(result[0]!.whileInSwimlane).toBe("Done")
        expect(result[0]!.due).toBe(new Date(now + 2 * 7 * 24 * 60 * 60 * 1000).toISOString())
        expect(result[0]!.actions).toEqual([{ type: "set", property: "status", value: "Archived" }])
    })

    it("filters out mutations without delay", () => {
        const mutations: MatchedMutation[] = [
            { type: "set", property: "startedAt", value: "yes" },
            { type: "set", property: "status", value: "Archived", delay: "2w" },
        ]
        const result = addScheduledActions([], "notes/task.md", "Done", mutations, Date.now())
        expect(result).toHaveLength(1)
        expect(result[0]!.actions[0]!.property).toBe("status")
    })

    it("deduplicates: removes existing entries for same file + swimlane", () => {
        const existing: ScheduledAction[] = [
            {
                file: "notes/task.md",
                due: "2026-03-20T12:00:00Z",
                whileInSwimlane: "Done",
                actions: [{ type: "set", property: "old", value: "value" }],
            },
            {
                file: "notes/other.md",
                due: "2026-03-20T12:00:00Z",
                whileInSwimlane: "Done",
                actions: [{ type: "clear", property: "x" }],
            },
        ]
        const mutations: MatchedMutation[] = [
            { type: "set", property: "status", value: "Archived", delay: "2w" },
        ]
        const result = addScheduledActions(existing, "notes/task.md", "Done", mutations, Date.now())
        expect(result).toHaveLength(2)
        expect(result.find(a => a.file === "notes/other.md")).toBeTruthy()
        expect(result.find(a => a.file === "notes/task.md")!.actions[0]!.property).toBe("status")
    })

    it("returns existing unchanged if no delayed mutations", () => {
        const existing: ScheduledAction[] = [
            { file: "a.md", due: "2026-03-20T12:00:00Z", whileInSwimlane: "X", actions: [{ type: "clear", property: "y" }] },
        ]
        const mutations: MatchedMutation[] = [
            { type: "set", property: "startedAt", value: "yes" },
        ]
        const result = addScheduledActions(existing, "a.md", "X", mutations, Date.now())
        expect(result).toEqual(existing)
    })

    it("groups multiple delayed mutations with same delay into one entry", () => {
        const mutations: MatchedMutation[] = [
            { type: "set", property: "status", value: "Archived", delay: "2w" },
            { type: "add", property: "tags", value: "archived", delay: "2w" },
        ]
        const result = addScheduledActions([], "notes/task.md", "Done", mutations, Date.now())
        expect(result).toHaveLength(1)
        expect(result[0]!.actions).toHaveLength(2)
    })

    it("creates separate entries for different delays", () => {
        const mutations: MatchedMutation[] = [
            { type: "set", property: "reminder", value: "true", delay: "1d" },
            { type: "set", property: "status", value: "Archived", delay: "2w" },
        ]
        const result = addScheduledActions([], "notes/task.md", "Done", mutations, Date.now())
        expect(result).toHaveLength(2)
    })
})

describe("cancelScheduledActions", () => {
    it("removes entries for file + whileInSwimlane match", () => {
        const existing: ScheduledAction[] = [
            { file: "a.md", due: "2026-03-29T00:00:00Z", whileInSwimlane: "Done", actions: [{ type: "clear", property: "x" }] },
            { file: "b.md", due: "2026-03-29T00:00:00Z", whileInSwimlane: "Done", actions: [{ type: "clear", property: "y" }] },
        ]
        const result = cancelScheduledActions(existing, "a.md", "Done")
        expect(result).toHaveLength(1)
        expect(result[0]!.file).toBe("b.md")
    })

    it("returns same array if no matches", () => {
        const existing: ScheduledAction[] = [
            { file: "a.md", due: "2026-03-29T00:00:00Z", whileInSwimlane: "Done", actions: [{ type: "clear", property: "x" }] },
        ]
        const result = cancelScheduledActions(existing, "a.md", "InProgress")
        expect(result).toEqual(existing)
    })

    it("returns empty array from empty input", () => {
        expect(cancelScheduledActions([], "a.md", "Done")).toEqual([])
    })
})

describe("getDueActions", () => {
    it("returns actions where due <= now", () => {
        const now = new Date("2026-03-30T00:00:00Z").getTime()
        const actions: ScheduledAction[] = [
            { file: "a.md", due: "2026-03-29T00:00:00Z", whileInSwimlane: "Done", actions: [{ type: "clear", property: "x" }] },
            { file: "b.md", due: "2026-03-31T00:00:00Z", whileInSwimlane: "Done", actions: [{ type: "clear", property: "y" }] },
        ]
        const { due, remaining } = getDueActions(actions, now)
        expect(due).toHaveLength(1)
        expect(due[0]!.file).toBe("a.md")
        expect(remaining).toHaveLength(1)
        expect(remaining[0]!.file).toBe("b.md")
    })

    it("returns empty due when nothing is overdue", () => {
        const now = new Date("2026-03-01T00:00:00Z").getTime()
        const actions: ScheduledAction[] = [
            { file: "a.md", due: "2026-03-29T00:00:00Z", whileInSwimlane: "Done", actions: [{ type: "clear", property: "x" }] },
        ]
        const { due, remaining } = getDueActions(actions, now)
        expect(due).toHaveLength(0)
        expect(remaining).toHaveLength(1)
    })

    it("handles empty input", () => {
        const { due, remaining } = getDueActions([], Date.now())
        expect(due).toEqual([])
        expect(remaining).toEqual([])
    })

    it("includes actions due exactly at now", () => {
        const now = new Date("2026-03-29T00:00:00Z").getTime()
        const actions: ScheduledAction[] = [
            { file: "a.md", due: "2026-03-29T00:00:00Z", whileInSwimlane: "Done", actions: [{ type: "clear", property: "x" }] },
        ]
        const { due, remaining } = getDueActions(actions, now)
        expect(due).toHaveLength(1)
        expect(remaining).toHaveLength(0)
    })
})
