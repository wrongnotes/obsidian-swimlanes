import { readAutomations, writeAutomations, readScheduledActions, writeScheduledActions } from "./io"
import type { AutomationRule } from "./types"

// Helper to create test input — mock parseYaml uses JSON.parse
function cfg(obj: unknown): string {
    return JSON.stringify(obj)
}

const validRule: AutomationRule = {
    trigger: { type: "enters", swimlane: "Done" },
    actions: [{ type: "set", property: "status", value: "done" }],
}

const validRule2: AutomationRule = {
    trigger: { type: "leaves", swimlane: "In Progress" },
    actions: [{ type: "clear", property: "assignee" }],
}

describe("readAutomations", () => {
    it("returns rules from valid config", () => {
        const content = cfg({ automations: [validRule] })
        expect(readAutomations(content)).toEqual([validRule])
    })

    it("returns [] when no automations key", () => {
        const content = cfg({ someOtherKey: 42 })
        expect(readAutomations(content)).toEqual([])
    })

    it("returns [] for non-object content", () => {
        expect(readAutomations("null")).toEqual([])
        expect(readAutomations("")).toEqual([])
        expect(readAutomations("[]")).toEqual([])
    })

    it("returns [] for unparseable content", () => {
        expect(readAutomations("not valid json {{{")).toEqual([])
    })

    it("drops rules with missing trigger", () => {
        const rule = { actions: [{ type: "set", property: "x", value: "y" }] }
        expect(readAutomations(cfg({ automations: [rule] }))).toEqual([])
    })

    it("drops rules with invalid trigger type", () => {
        const rule = {
            trigger: { type: "invalid_type", swimlane: "Done" },
            actions: [{ type: "set", property: "x", value: "y" }],
        }
        expect(readAutomations(cfg({ automations: [rule] }))).toEqual([])
    })

    it("drops rules with missing trigger swimlane", () => {
        const rule = {
            trigger: { type: "enters" },
            actions: [{ type: "set", property: "x", value: "y" }],
        }
        expect(readAutomations(cfg({ automations: [rule] }))).toEqual([])
    })

    it("drops rules with empty trigger swimlane", () => {
        const rule = {
            trigger: { type: "enters", swimlane: "" },
            actions: [{ type: "set", property: "x", value: "y" }],
        }
        expect(readAutomations(cfg({ automations: [rule] }))).toEqual([])
    })

    it("drops rules with missing actions", () => {
        const rule = { trigger: { type: "enters", swimlane: "Done" } }
        expect(readAutomations(cfg({ automations: [rule] }))).toEqual([])
    })

    it("drops rules with empty actions array", () => {
        const rule = { trigger: { type: "enters", swimlane: "Done" }, actions: [] }
        expect(readAutomations(cfg({ automations: [rule] }))).toEqual([])
    })

    it("drops actions missing type", () => {
        const rule = {
            trigger: { type: "enters", swimlane: "Done" },
            actions: [{ property: "x", value: "y" }],
        }
        expect(readAutomations(cfg({ automations: [rule] }))).toEqual([])
    })

    it("drops actions missing property", () => {
        const rule = {
            trigger: { type: "enters", swimlane: "Done" },
            actions: [{ type: "set", value: "y" }],
        }
        expect(readAutomations(cfg({ automations: [rule] }))).toEqual([])
    })

    it("drops set actions missing value", () => {
        const rule = {
            trigger: { type: "enters", swimlane: "Done" },
            actions: [{ type: "set", property: "x" }],
        }
        expect(readAutomations(cfg({ automations: [rule] }))).toEqual([])
    })

    it("keeps valid rules when mixed with malformed ones", () => {
        const malformed = { trigger: { type: "bad", swimlane: "X" }, actions: [] }
        const content = cfg({ automations: [malformed, validRule, malformed, validRule2] })
        expect(readAutomations(content)).toEqual([validRule, validRule2])
    })

    it("accepts all four valid trigger types", () => {
        const types = ["enters", "leaves", "created_in"] as const
        for (const type of types) {
            const rule: AutomationRule = {
                trigger: { type, swimlane: "Col" },
                actions: [{ type: "clear", property: "p" }],
            }
            expect(readAutomations(cfg({ automations: [rule] }))).toEqual([rule])
        }
    })

    it("accepts delete action type", () => {
        const content = JSON.stringify({
            automations: [
                {
                    trigger: { type: "enters", swimlane: "Done" },
                    actions: [{ type: "delete" }],
                },
            ],
        })
        const rules = readAutomations(content)
        expect(rules).toHaveLength(1)
        expect(rules[0]!.actions[0]!.type).toBe("delete")
    })

    it("accepts move action type", () => {
        const content = JSON.stringify({
            automations: [
                {
                    trigger: { type: "enters", swimlane: "Done" },
                    actions: [{ type: "move", value: "Archived" }],
                },
            ],
        })
        const rules = readAutomations(content)
        expect(rules).toHaveLength(1)
        expect(rules[0]!.actions[0]!.type).toBe("move")
    })

    it("accepts remains_in rule with delay", () => {
        const content = JSON.stringify({
            automations: [
                {
                    trigger: { type: "remains_in", swimlane: "Done", delay: "2w" },
                    actions: [{ type: "set", property: "archived", value: "true" }],
                },
            ],
        })
        const rules = readAutomations(content)
        expect(rules).toHaveLength(1)
        expect(rules[0]!.trigger.type).toBe("remains_in")
        expect(rules[0]!.trigger.delay).toBe("2w")
    })

    it("rejects remains_in rule without delay", () => {
        const content = JSON.stringify({
            automations: [
                {
                    trigger: { type: "remains_in", swimlane: "Done" },
                    actions: [{ type: "set", property: "archived", value: "true" }],
                },
            ],
        })
        const rules = readAutomations(content)
        expect(rules).toHaveLength(0)
    })
})

describe("readScheduledActions", () => {
    it("parses valid scheduled actions", () => {
        const content = JSON.stringify({
            scheduledActions: [
                {
                    file: "notes/task.md",
                    due: "2026-03-29T14:30:00",
                    whileInSwimlane: "Done",
                    actions: [{ type: "set", property: "status", value: "Archived" }],
                },
            ],
        })
        const result = readScheduledActions(content)
        expect(result).toHaveLength(1)
        expect(result[0]!.file).toBe("notes/task.md")
        expect(result[0]!.due).toBe("2026-03-29T14:30:00")
        expect(result[0]!.whileInSwimlane).toBe("Done")
        expect(result[0]!.actions).toHaveLength(1)
    })

    it("returns empty array for missing scheduledActions key", () => {
        expect(readScheduledActions(JSON.stringify({}))).toEqual([])
    })

    it("returns empty array for empty string", () => {
        expect(readScheduledActions("")).toEqual([])
    })

    it("drops entries with missing file", () => {
        const content = JSON.stringify({
            scheduledActions: [
                { due: "2026-03-29T14:30:00", whileInSwimlane: "Done", actions: [{ type: "clear", property: "x" }] },
            ],
        })
        expect(readScheduledActions(content)).toEqual([])
    })

    it("drops entries with empty actions array", () => {
        const content = JSON.stringify({
            scheduledActions: [
                { file: "a.md", due: "2026-03-29T14:30:00", whileInSwimlane: "Done", actions: [] },
            ],
        })
        expect(readScheduledActions(content)).toEqual([])
    })

    it("drops entries with invalid action", () => {
        const content = JSON.stringify({
            scheduledActions: [
                { file: "a.md", due: "2026-03-29T14:30:00", whileInSwimlane: "Done", actions: [{ type: "invalid" }] },
            ],
        })
        expect(readScheduledActions(content)).toEqual([])
    })

    it("drops entries with invalid due date", () => {
        const content = JSON.stringify({
            scheduledActions: [
                { file: "a.md", due: "not-a-date", whileInSwimlane: "Done", actions: [{ type: "clear", property: "x" }] },
            ],
        })
        expect(readScheduledActions(content)).toEqual([])
    })
})

describe("writeScheduledActions", () => {
    it("writes scheduled actions preserving other keys", () => {
        const content = JSON.stringify({ automations: [], otherKey: 42 })
        const actions = [
            {
                file: "notes/task.md",
                due: "2026-03-29T14:30:00",
                whileInSwimlane: "Done",
                actions: [{ type: "set" as const, property: "status", value: "Archived" }],
            },
        ]
        const result = JSON.parse(writeScheduledActions(content, actions))
        expect(result.scheduledActions).toEqual(actions)
        expect(result.automations).toEqual([])
        expect(result.otherKey).toBe(42)
    })

    it("writes empty array when no actions", () => {
        const result = JSON.parse(writeScheduledActions(JSON.stringify({}), []))
        expect(result.scheduledActions).toEqual([])
    })
})

describe("writeAutomations", () => {
    it("writes rules preserving other config keys", () => {
        const original = cfg({ version: 2, someKey: "hello" })
        const result = writeAutomations(original, [validRule])
        const parsed = JSON.parse(result)
        expect(parsed.version).toBe(2)
        expect(parsed.someKey).toBe("hello")
        expect(parsed.automations).toEqual([validRule])
    })

    it("creates automations key if absent", () => {
        const original = cfg({})
        const result = writeAutomations(original, [validRule])
        const parsed = JSON.parse(result)
        expect(parsed.automations).toEqual([validRule])
    })

    it("overwrites existing automations", () => {
        const original = cfg({ automations: [validRule] })
        const result = writeAutomations(original, [validRule2])
        const parsed = JSON.parse(result)
        expect(parsed.automations).toEqual([validRule2])
    })

    it("writes empty array", () => {
        const original = cfg({ automations: [validRule] })
        const result = writeAutomations(original, [])
        const parsed = JSON.parse(result)
        expect(parsed.automations).toEqual([])
    })

    it("handles empty/invalid input content gracefully", () => {
        const result = writeAutomations("", [validRule])
        const parsed = JSON.parse(result)
        expect(parsed.automations).toEqual([validRule])
    })
})
