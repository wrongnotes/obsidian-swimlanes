import { resolveValue, matchRules, applyMutations } from "./engine"
import type { AutomationContext, AutomationRule, FrontmatterMutation } from "./types"

// ---------------------------------------------------------------------------
// resolveValue
// ---------------------------------------------------------------------------

describe("resolveValue", () => {
    const ctx: AutomationContext = {
        type: "enters",
        sourceSwimlane: "Todo",
        targetSwimlane: "In Progress",
    }

    it("resolves {{now:YYYY-MM-DD}} to a date string", () => {
        expect(resolveValue("{{now:YYYY-MM-DD}}", ctx)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it("resolves {{now:YYYY-MM-DDTHH:mm}} to a datetime string", () => {
        expect(resolveValue("{{now:YYYY-MM-DDTHH:mm}}", ctx)).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
        )
    })

    it("resolves {{now:HH:mm}} to a time string", () => {
        expect(resolveValue("{{now:HH:mm}}", ctx)).toMatch(/^\d{2}:\d{2}$/)
    })

    it("resolves {{source.swimlane}}", () => {
        expect(resolveValue("{{source.swimlane}}", ctx)).toBe("Todo")
    })

    it("resolves {{target.swimlane}}", () => {
        expect(resolveValue("{{target.swimlane}}", ctx)).toBe("In Progress")
    })

    it("resolves null sourceSwimlane to empty string", () => {
        const nullCtx: AutomationContext = { ...ctx, sourceSwimlane: null }
        expect(resolveValue("{{source.swimlane}}", nullCtx)).toBe("")
    })

    it("resolves null targetSwimlane to empty string", () => {
        const nullCtx: AutomationContext = { ...ctx, targetSwimlane: null }
        expect(resolveValue("{{target.swimlane}}", nullCtx)).toBe("")
    })

    it("returns static string unchanged", () => {
        expect(resolveValue("no tokens here", ctx)).toBe("no tokens here")
    })

    it("handles mixed tokens and static text", () => {
        const result = resolveValue("Moved from {{source.swimlane}} to {{target.swimlane}}", ctx)
        expect(result).toBe("Moved from Todo to In Progress")
    })

    it("leaves unknown token as-is", () => {
        expect(resolveValue("{{unknown.token}}", ctx)).toBe("{{unknown.token}}")
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
                actions: [{ type: "set", property: "startedAt", value: "yes" }],
            },
        ]
        const mutations = matchRules(rules, entersInProgress, swimlaneProp)
        expect(mutations).toHaveLength(1)
        expect(mutations[0]).toEqual({ type: "set", property: "startedAt", value: "yes" })
    })

    it("leaves trigger matches sourceSwimlane", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "leaves", swimlane: "Todo" },
                actions: [{ type: "set", property: "leftTodoAt", value: "yes" }],
            },
        ]
        const mutations = matchRules(rules, leavesTodo, swimlaneProp)
        expect(mutations).toHaveLength(1)
        expect(mutations[0]).toEqual({ type: "set", property: "leftTodoAt", value: "yes" })
    })

    it("created_in trigger matches targetSwimlane", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "created_in", swimlane: "Done" },
                actions: [{ type: "set", property: "createdDone", value: "yes" }],
            },
        ]
        const mutations = matchRules(rules, createdInDone, swimlaneProp)
        expect(mutations).toHaveLength(1)
        expect(mutations[0]).toEqual({ type: "set", property: "createdDone", value: "yes" })
    })

    it('wildcard "*" matches any swimlane for enters', () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "enters", swimlane: "*" },
                actions: [{ type: "set", property: "movedAt", value: "yes" }],
            },
        ]
        const mutations = matchRules(rules, entersInProgress, swimlaneProp)
        expect(mutations).toHaveLength(1)
    })

    it('wildcard "*" matches any swimlane for leaves', () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "leaves", swimlane: "*" },
                actions: [{ type: "clear", property: "assignee" }],
            },
        ]
        const mutations = matchRules(rules, leavesTodo, swimlaneProp)
        expect(mutations).toHaveLength(1)
    })

    it("non-matching trigger type does not fire", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "leaves", swimlane: "In Progress" },
                actions: [{ type: "set", property: "movedAt", value: "today" }],
            },
        ]
        const mutations = matchRules(rules, entersInProgress, swimlaneProp)
        expect(mutations).toHaveLength(0)
    })

    it("non-matching swimlane does not fire", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "enters", swimlane: "Done" },
                actions: [{ type: "set", property: "completedAt", value: "today" }],
            },
        ]
        const mutations = matchRules(rules, entersInProgress, swimlaneProp)
        expect(mutations).toHaveLength(0)
    })

    it("multiple matching rules are collected in order", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "enters", swimlane: "In Progress" },
                actions: [{ type: "set", property: "startedAt", value: "a" }],
            },
            {
                trigger: { type: "enters", swimlane: "*" },
                actions: [{ type: "set", property: "movedAt", value: "b" }],
            },
        ]
        const mutations = matchRules(rules, entersInProgress, swimlaneProp)
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
        const mutations = matchRules(rules, entersInProgress, swimlaneProp)
        expect(mutations).toHaveLength(2)
        const fm: Record<string, unknown> = {}
        applyMutations(fm, mutations)
        expect(fm["note"]).toBe("second")
    })

    it("empty rules returns empty array", () => {
        expect(matchRules([], entersInProgress, swimlaneProp)).toEqual([])
    })

    it("multiple actions in a rule produce multiple mutations", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "enters", swimlane: "In Progress" },
                actions: [
                    { type: "set", property: "startedAt", value: "yes" },
                    { type: "clear", property: "blockedBy" },
                ],
            },
        ]
        const mutations = matchRules(rules, entersInProgress, swimlaneProp)
        expect(mutations).toHaveLength(2)
        expect(mutations[0]).toEqual({ type: "set", property: "startedAt", value: "yes" })
        expect(mutations[1]).toEqual({ type: "clear", property: "blockedBy" })
    })

    it("mutations targeting swimlaneProp are filtered out (loop guard)", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "enters", swimlane: "In Progress" },
                actions: [
                    { type: "set", property: "status", value: "active" },
                    { type: "set", property: "startedAt", value: "yes" },
                ],
            },
        ]
        const mutations = matchRules(rules, entersInProgress, swimlaneProp)
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
        const mutations = matchRules(rules, entersInProgress, swimlaneProp)
        expect(mutations).toHaveLength(2)
        expect(mutations[0]).toEqual({ type: "add", property: "tags", value: "wip" })
        expect(mutations[1]).toEqual({ type: "remove", property: "tags", value: "backlog" })
    })

    it("resolves {{now:...}} tokens in set values", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "enters", swimlane: "In Progress" },
                actions: [{ type: "set", property: "startedAt", value: "{{now:YYYY-MM-DD}}" }],
            },
        ]
        const mutations = matchRules(rules, entersInProgress, swimlaneProp)
        expect(mutations).toHaveLength(1)
        expect(mutations[0]!.value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it("remains_in trigger matches on enters context", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "remains_in", swimlane: "Done", delay: "2w" },
                actions: [{ type: "set", property: "archived", value: "true" }],
            },
        ]
        const ctx: AutomationContext = {
            type: "enters",
            sourceSwimlane: "In Progress",
            targetSwimlane: "Done",
        }
        const mutations = matchRules(rules, ctx, "column")
        expect(mutations).toHaveLength(1)
        expect(mutations[0]).toEqual({ type: "set", property: "archived", value: "true", delay: "2w" })
    })

    it("remains_in trigger does not match on leaves context", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "remains_in", swimlane: "Done", delay: "2w" },
                actions: [{ type: "set", property: "archived", value: "true" }],
            },
        ]
        const ctx: AutomationContext = {
            type: "leaves",
            sourceSwimlane: "Done",
            targetSwimlane: "In Progress",
        }
        const mutations = matchRules(rules, ctx, "column")
        expect(mutations).toHaveLength(0)
    })

    it("remains_in sets delay from trigger on all actions", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "remains_in", swimlane: "Done", delay: "1d" },
                actions: [
                    { type: "set", property: "archived", value: "true" },
                    { type: "clear", property: "assignee" },
                ],
            },
        ]
        const ctx: AutomationContext = {
            type: "enters",
            sourceSwimlane: "In Progress",
            targetSwimlane: "Done",
        }
        const mutations = matchRules(rules, ctx, "column")
        expect(mutations).toHaveLength(2)
        expect(mutations[0]!.delay).toBe("1d")
        expect(mutations[1]!.delay).toBe("1d")
    })

    it("does not include delay on instant actions", () => {
        const rules: AutomationRule[] = [
            {
                trigger: { type: "enters", swimlane: "In Progress" },
                actions: [{ type: "set", property: "startedAt", value: "yes" }],
            },
        ]
        const mutations = matchRules(rules, entersInProgress, swimlaneProp)
        expect(mutations[0]!.delay).toBeUndefined()
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
