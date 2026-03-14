import { formatNow, resolveValue, matchRules, applyMutations } from "./engine"
import type { AutomationContext, AutomationRule, FrontmatterMutation } from "./types"

// Fixed date: March 14, 2026 09:05:07
const FIXED_DATE = new Date(2026, 2, 14, 9, 5, 7)

// ---------------------------------------------------------------------------
// formatNow
// ---------------------------------------------------------------------------

describe("formatNow", () => {
    it("formats YYYY", () => {
        expect(formatNow("YYYY", FIXED_DATE)).toBe("2026")
    })

    it("formats YY", () => {
        expect(formatNow("YY", FIXED_DATE)).toBe("26")
    })

    it("formats MM with zero-padding", () => {
        expect(formatNow("MM", FIXED_DATE)).toBe("03")
    })

    it("formats DD with zero-padding", () => {
        expect(formatNow("DD", FIXED_DATE)).toBe("14")
    })

    it("formats HH with zero-padding", () => {
        expect(formatNow("HH", FIXED_DATE)).toBe("09")
    })

    it("formats mm with zero-padding", () => {
        expect(formatNow("mm", FIXED_DATE)).toBe("05")
    })

    it("formats ss with zero-padding", () => {
        expect(formatNow("ss", FIXED_DATE)).toBe("07")
    })

    it("formats full date string YYYY-MM-DD", () => {
        expect(formatNow("YYYY-MM-DD", FIXED_DATE)).toBe("2026-03-14")
    })

    it("formats datetime YYYY-MM-DDTHH:mm", () => {
        expect(formatNow("YYYY-MM-DDTHH:mm", FIXED_DATE)).toBe("2026-03-14T09:05")
    })

    it("preserves static text between tokens", () => {
        expect(formatNow("Date: DD/MM/YYYY", FIXED_DATE)).toBe("Date: 14/03/2026")
    })

    it("defaults to current date when now is omitted", () => {
        // Just verify it returns a string without throwing
        const result = formatNow("YYYY")
        expect(typeof result).toBe("string")
        expect(result).toMatch(/^\d{4}$/)
    })
})

// ---------------------------------------------------------------------------
// resolveValue
// ---------------------------------------------------------------------------

describe("resolveValue", () => {
    const ctx: AutomationContext = {
        type: "enters",
        sourceSwimlane: "Todo",
        targetSwimlane: "In Progress",
    }

    it("resolves {{now:YYYY-MM-DD}}", () => {
        expect(resolveValue("{{now:YYYY-MM-DD}}", ctx, FIXED_DATE)).toBe("2026-03-14")
    })

    it("resolves {{now:YYYY-MM-DDTHH:mm}}", () => {
        expect(resolveValue("{{now:YYYY-MM-DDTHH:mm}}", ctx, FIXED_DATE)).toBe("2026-03-14T09:05")
    })

    it("resolves {{now:HH:mm}}", () => {
        expect(resolveValue("{{now:HH:mm}}", ctx, FIXED_DATE)).toBe("09:05")
    })

    it("resolves {{source.swimlane}}", () => {
        expect(resolveValue("{{source.swimlane}}", ctx, FIXED_DATE)).toBe("Todo")
    })

    it("resolves {{target.swimlane}}", () => {
        expect(resolveValue("{{target.swimlane}}", ctx, FIXED_DATE)).toBe("In Progress")
    })

    it("resolves null sourceSwimlane to empty string", () => {
        const nullCtx: AutomationContext = { ...ctx, sourceSwimlane: null }
        expect(resolveValue("{{source.swimlane}}", nullCtx, FIXED_DATE)).toBe("")
    })

    it("resolves null targetSwimlane to empty string", () => {
        const nullCtx: AutomationContext = { ...ctx, targetSwimlane: null }
        expect(resolveValue("{{target.swimlane}}", nullCtx, FIXED_DATE)).toBe("")
    })

    it("returns static string unchanged", () => {
        expect(resolveValue("no tokens here", ctx, FIXED_DATE)).toBe("no tokens here")
    })

    it("handles mixed tokens and static text", () => {
        const result = resolveValue(
            "Moved from {{source.swimlane}} on {{now:YYYY-MM-DD}}",
            ctx,
            FIXED_DATE,
        )
        expect(result).toBe("Moved from Todo on 2026-03-14")
    })

    it("leaves unknown token as-is", () => {
        expect(resolveValue("{{unknown.token}}", ctx, FIXED_DATE)).toBe("{{unknown.token}}")
    })
})

// ---------------------------------------------------------------------------
// matchRules
// ---------------------------------------------------------------------------

describe("matchRules", () => {
    const swimlaneProp = "status"

    const entersInProgress: AutomationContext = {
        type: "enters",
        sourceSwimlane: "Todo",
        targetSwimlane: "In Progress",
    }

    const leavesTodo: AutomationContext = {
        type: "leaves",
        sourceSwimlane: "Todo",
        targetSwimlane: "In Progress",
    }

    const createdInDone: AutomationContext = {
        type: "created_in",
        sourceSwimlane: null,
        targetSwimlane: "Done",
    }

    it("enters trigger matches targetSwimlane", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "enters", swimlane: "In Progress" },
                actions: [{ type: "set", property: "startedAt", value: "{{now:YYYY-MM-DD}}" }],
            },
        ]
        const mutations = matchRules(rules, entersInProgress, swimlaneProp, FIXED_DATE)
        expect(mutations).toHaveLength(1)
        expect(mutations[0]).toEqual({ type: "set", property: "startedAt", value: "2026-03-14" })
    })

    it("leaves trigger matches sourceSwimlane", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "leaves", swimlane: "Todo" },
                actions: [{ type: "set", property: "leftTodoAt", value: "{{now:YYYY-MM-DD}}" }],
            },
        ]
        const mutations = matchRules(rules, leavesTodo, swimlaneProp, FIXED_DATE)
        expect(mutations).toHaveLength(1)
        expect(mutations[0]).toEqual({ type: "set", property: "leftTodoAt", value: "2026-03-14" })
    })

    it("created_in trigger matches targetSwimlane", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "created_in", swimlane: "Done" },
                actions: [{ type: "set", property: "createdDone", value: "yes" }],
            },
        ]
        const mutations = matchRules(rules, createdInDone, swimlaneProp, FIXED_DATE)
        expect(mutations).toHaveLength(1)
        expect(mutations[0]).toEqual({ type: "set", property: "createdDone", value: "yes" })
    })

    it('wildcard "*" matches any swimlane for enters', () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "enters", swimlane: "*" },
                actions: [{ type: "set", property: "movedAt", value: "{{now:YYYY-MM-DD}}" }],
            },
        ]
        const mutations = matchRules(rules, entersInProgress, swimlaneProp, FIXED_DATE)
        expect(mutations).toHaveLength(1)
    })

    it('wildcard "*" matches any swimlane for leaves', () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "leaves", swimlane: "*" },
                actions: [{ type: "clear", property: "assignee" }],
            },
        ]
        const mutations = matchRules(rules, leavesTodo, swimlaneProp, FIXED_DATE)
        expect(mutations).toHaveLength(1)
    })

    it("non-matching trigger type does not fire", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "leaves", swimlane: "In Progress" },
                actions: [{ type: "set", property: "movedAt", value: "today" }],
            },
        ]
        const mutations = matchRules(rules, entersInProgress, swimlaneProp, FIXED_DATE)
        expect(mutations).toHaveLength(0)
    })

    it("non-matching swimlane does not fire", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "enters", swimlane: "Done" },
                actions: [{ type: "set", property: "completedAt", value: "today" }],
            },
        ]
        const mutations = matchRules(rules, entersInProgress, swimlaneProp, FIXED_DATE)
        expect(mutations).toHaveLength(0)
    })

    it("multiple matching rules are collected in order", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "enters", swimlane: "In Progress" },
                actions: [{ type: "set", property: "startedAt", value: "2026-03-14" }],
            },
            {
                trigger: { type: "enters", swimlane: "*" },
                actions: [{ type: "set", property: "movedAt", value: "2026-03-14" }],
            },
        ]
        const mutations = matchRules(rules, entersInProgress, swimlaneProp, FIXED_DATE)
        expect(mutations).toHaveLength(2)
        expect(mutations[0]!.property).toBe("startedAt")
        expect(mutations[1]!.property).toBe("movedAt")
    })

    it("last write wins for duplicate properties across rules", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "enters", swimlane: "In Progress" },
                actions: [{ type: "set", property: "note", value: "first" }],
            },
            {
                trigger: { type: "enters", swimlane: "*" },
                actions: [{ type: "set", property: "note", value: "second" }],
            },
        ]
        const mutations = matchRules(rules, entersInProgress, swimlaneProp, FIXED_DATE)
        // Both mutations present; applyMutations will apply last-write-wins
        expect(mutations).toHaveLength(2)
        const fm: Record<string, unknown> = {}
        applyMutations(fm, mutations)
        expect(fm["note"]).toBe("second")
    })

    it("empty rules returns empty array", () => {
        expect(matchRules([], entersInProgress, swimlaneProp, FIXED_DATE)).toEqual([])
    })

    it("multiple actions in a rule produce multiple mutations", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "enters", swimlane: "In Progress" },
                actions: [
                    { type: "set", property: "startedAt", value: "2026-03-14" },
                    { type: "clear", property: "blockedBy" },
                ],
            },
        ]
        const mutations = matchRules(rules, entersInProgress, swimlaneProp, FIXED_DATE)
        expect(mutations).toHaveLength(2)
        expect(mutations[0]).toEqual({ type: "set", property: "startedAt", value: "2026-03-14" })
        expect(mutations[1]).toEqual({ type: "clear", property: "blockedBy" })
    })

    it("mutations targeting swimlaneProp are filtered out (loop guard)", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "enters", swimlane: "In Progress" },
                actions: [
                    { type: "set", property: "status", value: "active" },
                    { type: "set", property: "startedAt", value: "2026-03-14" },
                ],
            },
        ]
        const mutations = matchRules(rules, entersInProgress, swimlaneProp, FIXED_DATE)
        expect(mutations).toHaveLength(1)
        expect(mutations[0]!.property).toBe("startedAt")
    })

    it("handles add and remove action types", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "enters", swimlane: "In Progress" },
                actions: [
                    { type: "add", property: "tags", value: "wip" },
                    { type: "remove", property: "tags", value: "backlog" },
                ],
            },
        ]
        const mutations = matchRules(rules, entersInProgress, swimlaneProp, FIXED_DATE)
        expect(mutations).toHaveLength(2)
        expect(mutations[0]).toEqual({ type: "add", property: "tags", value: "wip" })
        expect(mutations[1]).toEqual({ type: "remove", property: "tags", value: "backlog" })
    })
})

// ---------------------------------------------------------------------------
// applyMutations
// ---------------------------------------------------------------------------

describe("applyMutations", () => {
    it("sets a property", () => {
        const fm: Record<string, unknown> = {}
        applyMutations(fm, [{ type: "set", property: "foo", value: "bar" }])
        expect(fm["foo"]).toBe("bar")
    })

    it("clears a property", () => {
        const fm: Record<string, unknown> = { foo: "bar" }
        applyMutations(fm, [{ type: "clear", property: "foo" }])
        expect("foo" in fm).toBe(false)
    })

    it("applies multiple mutations in order (last wins)", () => {
        const fm: Record<string, unknown> = {}
        const mutations: FrontmatterMutation[] = [
            { type: "set", property: "x", value: "first" },
            { type: "set", property: "x", value: "second" },
        ]
        applyMutations(fm, mutations)
        expect(fm["x"]).toBe("second")
    })

    it("set then clear leaves property absent", () => {
        const fm: Record<string, unknown> = {}
        const mutations: FrontmatterMutation[] = [
            { type: "set", property: "x", value: "hello" },
            { type: "clear", property: "x" },
        ]
        applyMutations(fm, mutations)
        expect("x" in fm).toBe(false)
    })

    it("empty mutations is a no-op", () => {
        const fm: Record<string, unknown> = { existing: "value" }
        applyMutations(fm, [])
        expect(fm).toEqual({ existing: "value" })
    })

    it("add appends to existing array", () => {
        const fm: Record<string, unknown> = { tags: ["a", "b"] }
        applyMutations(fm, [{ type: "add", property: "tags", value: "c" }])
        expect(fm.tags).toEqual(["a", "b", "c"])
    })

    it("add creates array if property absent", () => {
        const fm: Record<string, unknown> = {}
        applyMutations(fm, [{ type: "add", property: "tags", value: "first" }])
        expect(fm.tags).toEqual(["first"])
    })

    it("add no-ops if value already present", () => {
        const fm: Record<string, unknown> = { tags: ["a", "b"] }
        applyMutations(fm, [{ type: "add", property: "tags", value: "a" }])
        expect(fm.tags).toEqual(["a", "b"])
    })

    it("add creates array if property is non-array", () => {
        const fm: Record<string, unknown> = { tags: "not an array" }
        applyMutations(fm, [{ type: "add", property: "tags", value: "x" }])
        expect(fm.tags).toEqual(["x"])
    })

    it("remove filters value from array", () => {
        const fm: Record<string, unknown> = { tags: ["a", "b", "c"] }
        applyMutations(fm, [{ type: "remove", property: "tags", value: "b" }])
        expect(fm.tags).toEqual(["a", "c"])
    })

    it("remove no-ops if value not in array", () => {
        const fm: Record<string, unknown> = { tags: ["a", "b"] }
        applyMutations(fm, [{ type: "remove", property: "tags", value: "z" }])
        expect(fm.tags).toEqual(["a", "b"])
    })

    it("remove no-ops if property is not an array", () => {
        const fm: Record<string, unknown> = { tags: "string" }
        applyMutations(fm, [{ type: "remove", property: "tags", value: "string" }])
        expect(fm.tags).toBe("string")
    })

    it("remove no-ops if property absent", () => {
        const fm: Record<string, unknown> = {}
        applyMutations(fm, [{ type: "remove", property: "tags", value: "x" }])
        expect(fm).toEqual({})
    })
})
