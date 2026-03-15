import { readAutomations, writeAutomations } from "./io"
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

    it("accepts all three valid trigger types", () => {
        const types = ["enters", "leaves", "created_in"] as const
        for (const type of types) {
            const rule: AutomationRule = {
                trigger: { type, swimlane: "Col" },
                actions: [{ type: "clear", property: "p" }],
            }
            expect(readAutomations(cfg({ automations: [rule] }))).toEqual([rule])
        }
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
