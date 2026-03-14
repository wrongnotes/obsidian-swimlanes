# Automations Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rule-based workflow automations that fire when cards move between swimlanes or are created, setting or clearing frontmatter properties.

**Architecture:** Pure rule engine (`src/automations/engine.ts`) with no Obsidian deps, I/O layer for reading/writing rules from `.base` files, modal UI for managing rules, and integration hooks at existing `processFrontMatter` call sites in `swimlane-view.ts`.

**Tech Stack:** TypeScript, Obsidian API (`parseYaml`/`stringifyYaml`, `vault.process`, `Modal`), jest for testing.

**Spec:** `docs/superpowers/specs/2026-03-14-automations-design.md`

---

## Chunk 1: Types, Engine, and Engine Tests

### Task 1: Types

**Files:**

- Create: `src/automations/types.ts`

- [ ] **Step 1: Create types file**

```typescript
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
    | { type: "clear"; property: string }

export interface FrontmatterMutation {
    type: "set" | "clear"
    property: string
    value?: unknown
}
```

- [ ] **Step 2: Commit**

```bash
git add src/automations/types.ts
git commit -m "feat(automations): add type definitions"
```

---

### Task 2: Date Formatter

**Files:**

- Create: `src/automations/engine.ts`
- Create: `src/automations/engine.test.ts`

- [ ] **Step 1: Write formatNow tests**

```typescript
import { formatNow } from "./engine"

describe("formatNow", () => {
    // Pin time for deterministic tests.
    const fixed = new Date(2026, 2, 14, 9, 5, 7) // March 14, 2026 09:05:07

    it("formats YYYY", () => {
        expect(formatNow("YYYY", fixed)).toBe("2026")
    })

    it("formats YY", () => {
        expect(formatNow("YY", fixed)).toBe("26")
    })

    it("formats MM with zero-pad", () => {
        expect(formatNow("MM", fixed)).toBe("03")
    })

    it("formats DD with zero-pad", () => {
        expect(formatNow("DD", fixed)).toBe("14")
    })

    it("formats HH with zero-pad", () => {
        expect(formatNow("HH", fixed)).toBe("09")
    })

    it("formats mm with zero-pad", () => {
        expect(formatNow("mm", fixed)).toBe("05")
    })

    it("formats ss with zero-pad", () => {
        expect(formatNow("ss", fixed)).toBe("07")
    })

    it("formats full date string", () => {
        expect(formatNow("YYYY-MM-DD", fixed)).toBe("2026-03-14")
    })

    it("formats datetime string", () => {
        expect(formatNow("YYYY-MM-DDTHH:mm", fixed)).toBe("2026-03-14T09:05")
    })

    it("preserves static text between tokens", () => {
        expect(formatNow("Date: YYYY/MM/DD", fixed)).toBe("Date: 2026/03/14")
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/automations/engine.test.ts --no-coverage`
Expected: FAIL — `formatNow` not found

- [ ] **Step 3: Implement formatNow**

In `src/automations/engine.ts`:

```typescript
/**
 * Format a date using moment.js-style tokens. Uses local time.
 * Supports: YYYY, YY, MM, DD, HH, mm, ss.
 */
export function formatNow(format: string, now: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, "0")
    return format
        .replace(/YYYY/g, String(now.getFullYear()))
        .replace(/YY/g, String(now.getFullYear()).slice(-2))
        .replace(/MM/g, pad(now.getMonth() + 1))
        .replace(/DD/g, pad(now.getDate()))
        .replace(/HH/g, pad(now.getHours()))
        .replace(/mm/g, pad(now.getMinutes()))
        .replace(/ss/g, pad(now.getSeconds()))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/automations/engine.test.ts --no-coverage`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/automations/engine.ts src/automations/engine.test.ts
git commit -m "feat(automations): add formatNow date formatter"
```

---

### Task 3: Token Resolution

**Files:**

- Modify: `src/automations/engine.ts`
- Modify: `src/automations/engine.test.ts`

- [ ] **Step 1: Write resolveValue tests**

Append to `src/automations/engine.test.ts`:

```typescript
import { resolveValue } from "./engine"
import type { AutomationContext } from "./types"

describe("resolveValue", () => {
    const ctx: AutomationContext = {
        type: "enters",
        sourceSwimlane: "In Progress",
        targetSwimlane: "Done",
    }
    const fixed = new Date(2026, 2, 14, 9, 5, 7)

    it("resolves {{now:YYYY-MM-DD}}", () => {
        expect(resolveValue("{{now:YYYY-MM-DD}}", ctx, fixed)).toBe("2026-03-14")
    })

    it("resolves {{now:YYYY-MM-DDTHH:mm}}", () => {
        expect(resolveValue("{{now:YYYY-MM-DDTHH:mm}}", ctx, fixed)).toBe("2026-03-14T09:05")
    })

    it("resolves {{now:HH:mm}}", () => {
        expect(resolveValue("{{now:HH:mm}}", ctx, fixed)).toBe("09:05")
    })

    it("resolves {{source.swimlane}}", () => {
        expect(resolveValue("{{source.swimlane}}", ctx)).toBe("In Progress")
    })

    it("resolves {{target.swimlane}}", () => {
        expect(resolveValue("{{target.swimlane}}", ctx)).toBe("Done")
    })

    it("resolves {{source.swimlane}} to empty string when null", () => {
        const created: AutomationContext = {
            type: "created_in",
            sourceSwimlane: null,
            targetSwimlane: "Backlog",
        }
        expect(resolveValue("{{source.swimlane}}", created)).toBe("")
    })

    it("resolves {{target.swimlane}} to empty string when null", () => {
        const left: AutomationContext = {
            type: "leaves",
            sourceSwimlane: "Done",
            targetSwimlane: null,
        }
        expect(resolveValue("{{target.swimlane}}", left)).toBe("")
    })

    it("returns static string unchanged", () => {
        expect(resolveValue("hello world", ctx)).toBe("hello world")
    })

    it("resolves mixed tokens and static text", () => {
        expect(resolveValue("Moved to {{target.swimlane}} on {{now:YYYY-MM-DD}}", ctx, fixed)).toBe(
            "Moved to Done on 2026-03-14",
        )
    })

    it("leaves unknown tokens as-is", () => {
        expect(resolveValue("{{unknown.token}}", ctx)).toBe("{{unknown.token}}")
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/automations/engine.test.ts --no-coverage`
Expected: FAIL — `resolveValue` not found

- [ ] **Step 3: Implement resolveValue**

Add to `src/automations/engine.ts`:

```typescript
import type { AutomationContext } from "./types"

export function resolveValue(
    template: string,
    context: AutomationContext,
    now: Date = new Date(),
): string {
    return template
        .replace(/\{\{now:([^}]+)\}\}/g, (_, fmt) => formatNow(fmt, now))
        .replace(/\{\{source\.swimlane\}\}/g, context.sourceSwimlane ?? "")
        .replace(/\{\{target\.swimlane\}\}/g, context.targetSwimlane ?? "")
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/automations/engine.test.ts --no-coverage`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/automations/engine.ts src/automations/engine.test.ts
git commit -m "feat(automations): add resolveValue token resolution"
```

---

### Task 4: Rule Matching

**Files:**

- Modify: `src/automations/engine.ts`
- Modify: `src/automations/engine.test.ts`

- [ ] **Step 1: Write matchRules tests**

Append to `src/automations/engine.test.ts`:

```typescript
import { matchRules } from "./engine"
import type { AutomationRule } from "./types"

describe("matchRules", () => {
    const entersDone: AutomationRule = {
        trigger: { type: "enters", swimlane: "Done" },
        actions: [{ type: "set", property: "completed_at", value: "{{now:YYYY-MM-DD}}" }],
    }

    const leavesInProgress: AutomationRule = {
        trigger: { type: "leaves", swimlane: "In Progress" },
        actions: [{ type: "clear", property: "wip_started" }],
    }

    const createdInBacklog: AutomationRule = {
        trigger: { type: "created_in", swimlane: "Backlog" },
        actions: [{ type: "set", property: "created_at", value: "{{now:YYYY-MM-DD}}" }],
    }

    const wildcardEnters: AutomationRule = {
        trigger: { type: "enters", swimlane: "*" },
        actions: [{ type: "set", property: "last_moved", value: "{{now:YYYY-MM-DD}}" }],
    }

    it("matches enters trigger against targetSwimlane", () => {
        const ctx = { type: "enters" as const, sourceSwimlane: "Backlog", targetSwimlane: "Done" }
        const mutations = matchRules([entersDone], ctx, "status")
        expect(mutations).toHaveLength(1)
        expect(mutations[0]!.property).toBe("completed_at")
    })

    it("matches leaves trigger against sourceSwimlane", () => {
        const ctx = { type: "leaves" as const, sourceSwimlane: "In Progress", targetSwimlane: null }
        const mutations = matchRules([leavesInProgress], ctx, "status")
        expect(mutations).toHaveLength(1)
        expect(mutations[0]!.type).toBe("clear")
        expect(mutations[0]!.property).toBe("wip_started")
    })

    it("matches created_in trigger against targetSwimlane", () => {
        const ctx = { type: "created_in" as const, sourceSwimlane: null, targetSwimlane: "Backlog" }
        const mutations = matchRules([createdInBacklog], ctx, "status")
        expect(mutations).toHaveLength(1)
        expect(mutations[0]!.property).toBe("created_at")
    })

    it("wildcard swimlane matches any value", () => {
        const ctx = { type: "enters" as const, sourceSwimlane: "X", targetSwimlane: "Whatever" }
        const mutations = matchRules([wildcardEnters], ctx, "status")
        expect(mutations).toHaveLength(1)
    })

    it("does not fire on non-matching trigger type", () => {
        const ctx = { type: "leaves" as const, sourceSwimlane: "Done", targetSwimlane: null }
        expect(matchRules([entersDone], ctx, "status")).toHaveLength(0)
    })

    it("does not fire on non-matching swimlane", () => {
        const ctx = { type: "enters" as const, sourceSwimlane: "X", targetSwimlane: "Backlog" }
        expect(matchRules([entersDone], ctx, "status")).toHaveLength(0)
    })

    it("collects actions from multiple matching rules in order", () => {
        const ctx = { type: "enters" as const, sourceSwimlane: "X", targetSwimlane: "Done" }
        const mutations = matchRules([entersDone, wildcardEnters], ctx, "status")
        expect(mutations).toHaveLength(2)
        expect(mutations[0]!.property).toBe("completed_at")
        expect(mutations[1]!.property).toBe("last_moved")
    })

    it("last write wins for duplicate properties", () => {
        const rule1: AutomationRule = {
            trigger: { type: "enters", swimlane: "*" },
            actions: [{ type: "set", property: "x", value: "first" }],
        }
        const rule2: AutomationRule = {
            trigger: { type: "enters", swimlane: "Done" },
            actions: [{ type: "set", property: "x", value: "second" }],
        }
        const ctx = { type: "enters" as const, sourceSwimlane: null, targetSwimlane: "Done" }
        const mutations = matchRules([rule1, rule2], ctx, "status")
        // Both mutations are returned; caller applies in order so "second" wins.
        expect(mutations.filter(m => m.property === "x")).toHaveLength(2)
        expect(mutations[mutations.length - 1]!.value).toBe("second")
    })

    it("returns empty array for empty rules", () => {
        const ctx = { type: "enters" as const, sourceSwimlane: null, targetSwimlane: "Done" }
        expect(matchRules([], ctx, "status")).toHaveLength(0)
    })

    it("produces multiple mutations for rule with multiple actions", () => {
        const rule: AutomationRule = {
            trigger: { type: "enters", swimlane: "Done" },
            actions: [
                { type: "set", property: "a", value: "1" },
                { type: "set", property: "b", value: "2" },
                { type: "clear", property: "c" },
            ],
        }
        const ctx = { type: "enters" as const, sourceSwimlane: null, targetSwimlane: "Done" }
        expect(matchRules([rule], ctx, "status")).toHaveLength(3)
    })

    it("filters out mutations targeting the swimlane property", () => {
        const rule: AutomationRule = {
            trigger: { type: "enters", swimlane: "Done" },
            actions: [
                { type: "set", property: "status", value: "Complete" },
                { type: "set", property: "completed_at", value: "now" },
            ],
        }
        const ctx = { type: "enters" as const, sourceSwimlane: null, targetSwimlane: "Done" }
        const mutations = matchRules([rule], ctx, "status")
        expect(mutations).toHaveLength(1)
        expect(mutations[0]!.property).toBe("completed_at")
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/automations/engine.test.ts --no-coverage`
Expected: FAIL — `matchRules` not found

- [ ] **Step 3: Implement matchRules**

Add to `src/automations/engine.ts`:

```typescript
import type { AutomationRule, AutomationContext, FrontmatterMutation } from "./types"

export function matchRules(
    rules: AutomationRule[],
    context: AutomationContext,
    swimlaneProp: string,
): FrontmatterMutation[] {
    const mutations: FrontmatterMutation[] = []

    for (const rule of rules) {
        if (rule.trigger.type !== context.type) {
            continue
        }
        const relevant =
            rule.trigger.type === "leaves" ? context.sourceSwimlane : context.targetSwimlane
        if (rule.trigger.swimlane !== "*" && rule.trigger.swimlane !== relevant) {
            continue
        }
        for (const action of rule.actions) {
            if (action.property === swimlaneProp) {
                continue
            }
            if (action.type === "clear") {
                mutations.push({ type: "clear", property: action.property })
            } else {
                mutations.push({
                    type: "set",
                    property: action.property,
                    value: resolveValue(action.value, context),
                })
            }
        }
    }

    return mutations
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/automations/engine.test.ts --no-coverage`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/automations/engine.ts src/automations/engine.test.ts
git commit -m "feat(automations): add matchRules rule engine"
```

---

### Task 5: applyMutations Helper

**Files:**

- Modify: `src/automations/engine.ts`
- Modify: `src/automations/engine.test.ts`

A helper that applies a `FrontmatterMutation[]` to a frontmatter object. Used at every integration point.

- [ ] **Step 1: Write applyMutations tests**

Append to `src/automations/engine.test.ts`:

```typescript
import { applyMutations } from "./engine"
import type { FrontmatterMutation } from "./types"

describe("applyMutations", () => {
    it("sets a property", () => {
        const fm: Record<string, unknown> = {}
        applyMutations(fm, [{ type: "set", property: "x", value: "hello" }])
        expect(fm.x).toBe("hello")
    })

    it("clears a property", () => {
        const fm: Record<string, unknown> = { x: "hello" }
        applyMutations(fm, [{ type: "clear", property: "x" }])
        expect(fm).not.toHaveProperty("x")
    })

    it("applies multiple mutations in order", () => {
        const fm: Record<string, unknown> = { a: "old" }
        const mutations: FrontmatterMutation[] = [
            { type: "set", property: "a", value: "first" },
            { type: "set", property: "a", value: "second" },
        ]
        applyMutations(fm, mutations)
        expect(fm.a).toBe("second")
    })

    it("does nothing for empty mutations", () => {
        const fm: Record<string, unknown> = { x: 1 }
        applyMutations(fm, [])
        expect(fm).toEqual({ x: 1 })
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/automations/engine.test.ts --no-coverage`
Expected: FAIL — `applyMutations` not found

- [ ] **Step 3: Implement applyMutations**

Add to `src/automations/engine.ts`:

```typescript
import type { FrontmatterMutation } from "./types"

export function applyMutations(
    fm: Record<string, unknown>,
    mutations: FrontmatterMutation[],
): void {
    for (const m of mutations) {
        if (m.type === "set") {
            fm[m.property] = m.value
        } else {
            delete fm[m.property]
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/automations/engine.test.ts --no-coverage`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/automations/engine.ts src/automations/engine.test.ts
git commit -m "feat(automations): add applyMutations helper"
```

---

## Chunk 2: I/O Layer and Tests

### Task 6: I/O — readAutomations and writeAutomations

**Files:**

- Create: `src/automations/io.ts`
- Create: `src/automations/io.test.ts`

- [ ] **Step 1: Write I/O tests**

```typescript
import { readAutomations, writeAutomations } from "./io"
import type { AutomationRule } from "./types"

// Minimal mock for parseYaml/stringifyYaml — the obsidian mock should provide these.
// If not, add them to tests/__mocks__/obsidian.ts.

const validRule: AutomationRule = {
    trigger: { type: "enters", swimlane: "Done" },
    actions: [{ type: "set", property: "completed_at", value: "{{now:YYYY-MM-DD}}" }],
}

describe("readAutomations", () => {
    it("returns rules from valid config", () => {
        const content = JSON.stringify({ automations: [validRule] })
        expect(readAutomations(content)).toEqual([validRule])
    })

    it("returns [] when no automations key", () => {
        expect(readAutomations(JSON.stringify({ views: [] }))).toEqual([])
    })

    it("returns [] for non-object content", () => {
        expect(readAutomations("just a string")).toEqual([])
    })

    it("drops rules with missing trigger", () => {
        const content = JSON.stringify({
            automations: [{ actions: [{ type: "clear", property: "x" }] }],
        })
        expect(readAutomations(content)).toEqual([])
    })

    it("drops rules with invalid trigger type", () => {
        const content = JSON.stringify({
            automations: [
                {
                    trigger: { type: "invalid", swimlane: "X" },
                    actions: [{ type: "clear", property: "x" }],
                },
            ],
        })
        expect(readAutomations(content)).toEqual([])
    })

    it("drops rules with missing trigger swimlane", () => {
        const content = JSON.stringify({
            automations: [
                { trigger: { type: "enters" }, actions: [{ type: "clear", property: "x" }] },
            ],
        })
        expect(readAutomations(content)).toEqual([])
    })

    it("drops rules with missing actions", () => {
        const content = JSON.stringify({
            automations: [{ trigger: { type: "enters", swimlane: "Done" } }],
        })
        expect(readAutomations(content)).toEqual([])
    })

    it("drops rules with empty actions array", () => {
        const content = JSON.stringify({
            automations: [{ trigger: { type: "enters", swimlane: "Done" }, actions: [] }],
        })
        expect(readAutomations(content)).toEqual([])
    })

    it("drops actions missing type or property", () => {
        const content = JSON.stringify({
            automations: [
                {
                    trigger: { type: "enters", swimlane: "Done" },
                    actions: [{ type: "set" }],
                },
            ],
        })
        expect(readAutomations(content)).toEqual([])
    })

    it("drops set actions missing value", () => {
        const content = JSON.stringify({
            automations: [
                {
                    trigger: { type: "enters", swimlane: "Done" },
                    actions: [{ type: "set", property: "x" }],
                },
            ],
        })
        expect(readAutomations(content)).toEqual([])
    })

    it("keeps valid rules when mixed with malformed ones", () => {
        const content = JSON.stringify({
            automations: [{ trigger: { type: "bad" }, actions: [] }, validRule],
        })
        expect(readAutomations(content)).toEqual([validRule])
    })
})

describe("writeAutomations", () => {
    it("writes rules preserving other config", () => {
        const original = JSON.stringify({ filters: { and: [] }, views: [] })
        const result = writeAutomations(original, [validRule])
        const parsed = JSON.parse(result)
        expect(parsed.automations).toEqual([validRule])
        expect(parsed.filters).toEqual({ and: [] })
        expect(parsed.views).toEqual([])
    })

    it("creates automations key if absent", () => {
        const original = JSON.stringify({ views: [] })
        const result = writeAutomations(original, [validRule])
        const parsed = JSON.parse(result)
        expect(parsed.automations).toEqual([validRule])
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/automations/io.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Check that obsidian mock has parseYaml/stringifyYaml**

Read `tests/__mocks__/obsidian.ts` and verify `parseYaml` and `stringifyYaml` are exported. If not, add them:

```typescript
export function parseYaml(s: string) {
    return JSON.parse(s)
}
export function stringifyYaml(o: any) {
    return JSON.stringify(o)
}
```

Note: the mock uses JSON since YAML parsing isn't available in test env. The real Obsidian API handles YAML.

- [ ] **Step 4: Implement io.ts**

```typescript
import { parseYaml, stringifyYaml } from "obsidian"
import type { AutomationRule, AutomationAction, TriggerType } from "./types"

const VALID_TRIGGER_TYPES: Set<string> = new Set(["enters", "leaves", "created_in"])

function isValidAction(a: unknown): a is AutomationAction {
    if (!a || typeof a !== "object") return false
    const action = a as Record<string, unknown>
    if (typeof action.type !== "string" || typeof action.property !== "string") return false
    if (!action.property) return false
    if (action.type === "set" && (typeof action.value !== "string" || !action.value)) return false
    if (action.type !== "set" && action.type !== "clear") return false
    return true
}

function isValidRule(r: unknown): r is AutomationRule {
    if (!r || typeof r !== "object") return false
    const rule = r as Record<string, unknown>
    const trigger = rule.trigger as Record<string, unknown> | undefined
    if (!trigger || typeof trigger !== "object") return false
    if (!VALID_TRIGGER_TYPES.has(trigger.type as string)) return false
    if (typeof trigger.swimlane !== "string" || !trigger.swimlane) return false
    if (!Array.isArray(rule.actions) || rule.actions.length === 0) return false
    return rule.actions.every(isValidAction)
}

export function readAutomations(content: string): AutomationRule[] {
    let config: Record<string, unknown>
    try {
        config = parseYaml(content)
    } catch {
        return []
    }
    if (!config || typeof config !== "object") return []
    const raw = (config as Record<string, unknown>).automations
    if (!Array.isArray(raw)) return []
    return raw.filter(isValidRule)
}

export function writeAutomations(content: string, rules: AutomationRule[]): string {
    let config: Record<string, unknown>
    try {
        config = parseYaml(content) ?? {}
    } catch {
        config = {}
    }
    config.automations = rules
    return stringifyYaml(config)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/automations/io.test.ts --no-coverage`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/automations/io.ts src/automations/io.test.ts tests/__mocks__/obsidian.ts
git commit -m "feat(automations): add I/O layer for reading/writing rules"
```

---

### Task 7: Index Re-exports

**Files:**

- Create: `src/automations/index.ts`

- [ ] **Step 1: Create index.ts**

```typescript
export type {
    AutomationRule,
    AutomationAction,
    AutomationContext,
    FrontmatterMutation,
    TriggerType,
} from "./types"
export { matchRules, resolveValue, formatNow, applyMutations } from "./engine"
export { readAutomations, writeAutomations } from "./io"
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Success

- [ ] **Step 3: Commit**

```bash
git add src/automations/index.ts
git commit -m "feat(automations): add index re-exports"
```

---

## Chunk 3: Integration with swimlane-view.ts

### Task 8: Wire Automations into handleCardDrop

**Files:**

- Modify: `src/swimlane-view.ts`

The view needs to: cache automations rules, and apply them at each mutation site.

- [ ] **Step 1: Add imports and cached rules field**

Add import at top of `src/swimlane-view.ts` (after existing imports, ~line 25):

```typescript
import { matchRules, applyMutations, readAutomations } from "./automations"
import type { AutomationRule, FrontmatterMutation } from "./automations"
```

Add field to the class (near other private fields, ~line 85):

```typescript
private automationRules: AutomationRule[] = []
```

- [ ] **Step 2: Cache base file reference and load rules**

Add a field to store the `.base` file reference (~line 86):

```typescript
private baseFile: TFile | null = null
```

Add `TFile` to the `obsidian` type imports if not already present.

In `onDataUpdated()`, before the rebuild guard checks (~line 364), capture the base file on first call:

```typescript
if (!this.baseFile) {
    const f = this.app.workspace.getActiveFile()
    if (f?.extension === "base") {
        this.baseFile = f
    }
}
```

In `rebuildBoard()`, after `this.boardEl.empty()` (~line 445), load rules from the cached file reference:

```typescript
// Refresh cached automations from the .base file.
if (this.baseFile) {
    this.app.vault.read(this.baseFile).then(content => {
        this.automationRules = readAutomations(content)
    })
}
```

This avoids calling `getActiveFile()` during DnD (when the active file may be a note). The file reference is captured once on the first `onDataUpdated` and reused.

- [ ] **Step 3: Add automation helper method**

Add a private method to `SwimlaneView`:

```typescript
/** Collect automation mutations for a swimlane transition. */
private getAutomationMutations(
    sourceSwimlane: string | null,
    targetSwimlane: string | null,
    type: "enters" | "leaves" | "created_in",
): FrontmatterMutation[] {
    return matchRules(
        this.automationRules,
        { type, sourceSwimlane, targetSwimlane },
        this.swimlaneProp,
    )
}
```

- [ ] **Step 4: Wire into handleCardDrop (direct processFrontMatter path)**

In `handleCardDrop` (~line 1521), modify the `processFrontMatter` call for cross-column moves:

```typescript
this.app.fileManager.processFrontMatter(file, fm => {
    fm[this.rankProp] = newRank
    if (isCrossColumn) {
        fm[this.swimlaneProp] = context.groupKey
        const mutations = [
            ...this.getAutomationMutations(dragState.groupKey, null, "leaves"),
            ...this.getAutomationMutations(
                dragState.groupKey,
                context.groupKey as string,
                "enters",
            ),
        ]
        applyMutations(fm, mutations)
    }
})
```

- [ ] **Step 5: Wire into reRankColumn (cross-column branch)**

In `reRankColumn` (~line 1576), modify the `processFrontMatter` call inside the loop. The existing code already has the `if (path === dragState.path && context.groupKey !== dragState.groupKey)` branch. Add automation mutations there:

```typescript
this.app.fileManager.processFrontMatter(cardFile, fm => {
    fm[this.rankProp] = rank
    if (path === dragState.path && context.groupKey !== dragState.groupKey) {
        fm[this.swimlaneProp] = context.groupKey
        const mutations = [
            ...this.getAutomationMutations(dragState.groupKey, null, "leaves"),
            ...this.getAutomationMutations(
                dragState.groupKey,
                context.groupKey as string,
                "enters",
            ),
        ]
        applyMutations(fm, mutations)
    }
})
```

- [ ] **Step 6: Wire into createCard**

In `createCard` (~line 715), modify the `processFrontMatter` call:

```typescript
await this.app.fileManager.processFrontMatter(file, fm => {
    fm[swimlaneProp] = groupKey
    fm[rankProp] = newRank
    const mutations = this.getAutomationMutations(null, groupKey as string, "created_in")
    applyMutations(fm, mutations)
})
```

Note: `swimlaneProp` and `rankProp` are captured as local variables earlier in `createCard`. Use `this.swimlaneProp` for the `matchRules` call (via `getAutomationMutations`) since it accesses `this.swimlaneProp` internally.

- [ ] **Step 7: Wire into handleCardDropOnNewColumn**

In `handleCardDropOnNewColumn` (~line 1607), modify the `processFrontMatter` call inside `onConfirm`:

```typescript
this.app.fileManager.processFrontMatter(file, fm => {
    fm[this.swimlaneProp] = columnName
    fm[this.rankProp] = midRank(null, null)
    const mutations = [
        ...this.getAutomationMutations(dragState.groupKey, null, "leaves"),
        ...this.getAutomationMutations(dragState.groupKey, columnName, "enters"),
    ]
    applyMutations(fm, mutations)
})
```

- [ ] **Step 8: Verify build and existing tests**

Run: `npm run build && npm test`
Expected: Build succeeds, all existing tests pass

- [ ] **Step 9: Commit**

```bash
git add src/swimlane-view.ts
git commit -m "feat(automations): integrate rule engine into card mutations"
```

---

### Task 9: Wire into executeRmSwimlane

**Files:**

- Modify: `src/migration-workflows/operations.ts`
- Modify: `src/swimlane-view.ts` (the caller of executeRmSwimlane)

- [ ] **Step 1: Add onMutate callback to executeRmSwimlane**

In `src/migration-workflows/operations.ts`, add an optional callback parameter and call it inside the `processFrontMatter` callbacks:

```typescript
export async function executeRmSwimlane(
    app: App,
    files: TFile[],
    swimlaneProp: string,
    op: RmSwimlaneOp,
    onMutate?: (file: TFile, fm: Record<string, unknown>) => void,
): Promise<void> {
    switch (op.kind) {
        case "move":
            for (const file of files) {
                await app.fileManager.processFrontMatter(file, fm => {
                    fm[swimlaneProp] = op.targetValue
                    onMutate?.(file, fm)
                })
            }
            break
        case "clear":
            for (const file of files) {
                await app.fileManager.processFrontMatter(file, fm => {
                    delete fm[swimlaneProp]
                    onMutate?.(file, fm)
                })
            }
            break
        case "delete":
            for (const file of files) {
                await app.fileManager.trashFile(file)
            }
            break
    }
}
```

- [ ] **Step 2: Pass automation callback from the caller in swimlane-view.ts**

Find the call to `executeRmSwimlane` in `swimlane-view.ts` (in `showColumnMenu` or the rm-swimlane confirm handler). Pass an `onMutate` callback that applies automations:

```typescript
await executeRmSwimlane(this.app, files, this.swimlaneProp, op, (_file, fm) => {
    let mutations: FrontmatterMutation[] = []
    if (op.kind === "move") {
        mutations = [
            ...this.getAutomationMutations(groupKey as string, null, "leaves"),
            ...this.getAutomationMutations(groupKey as string, op.targetValue, "enters"),
        ]
    } else if (op.kind === "clear") {
        mutations = this.getAutomationMutations(groupKey as string, null, "leaves")
    }
    applyMutations(fm, mutations)
})
```

`groupKey` is the parameter of `removeColumn` (line 791 of `swimlane-view.ts`).

- [ ] **Step 3: Verify build and existing tests**

Run: `npm run build && npm test`
Expected: Build succeeds, all existing tests pass

- [ ] **Step 4: Commit**

```bash
git add src/migration-workflows/operations.ts src/swimlane-view.ts
git commit -m "feat(automations): wire automations into executeRmSwimlane"
```

---

## Chunk 4: Automations Modal

### Task 10: AutomationsModal — Read Mode

**Files:**

- Create: `src/automations/modal.ts`
- Create: `src/automations/modal.test.ts`

- [ ] **Step 1: Write read-mode tests**

```typescript
import { AutomationsModal } from "./modal"
import type { AutomationRule } from "./types"

const rules: AutomationRule[] = [
    {
        trigger: { type: "enters", swimlane: "Done" },
        actions: [
            { type: "set", property: "completed_at", value: "{{now:YYYY-MM-DD}}" },
            { type: "clear", property: "assigned_to" },
        ],
    },
    {
        trigger: { type: "leaves", swimlane: "In Progress" },
        actions: [{ type: "set", property: "left_at", value: "{{now:YYYY-MM-DDTHH:mm}}" }],
    },
]

function openModal(
    existingRules: AutomationRule[] = [],
    swimlanes: string[] = ["Backlog", "In Progress", "Done"],
) {
    const onSave = jest.fn()
    const modal = new AutomationsModal({
        app: {} as any,
        rules: existingRules,
        swimlanes,
        swimlaneProp: "status",
        onSave,
    })
    modal.onOpen()
    return { modal, onSave }
}

describe("AutomationsModal read mode", () => {
    it("renders existing rules", () => {
        const { modal } = openModal(rules)
        const cards = modal.contentEl.querySelectorAll(".swimlane-automation-rule")
        expect(cards).toHaveLength(2)
    })

    it("shows human-readable trigger summary", () => {
        const { modal } = openModal(rules)
        const text = modal.contentEl.textContent
        expect(text).toContain("enters")
        expect(text).toContain("Done")
    })

    it("shows action summaries", () => {
        const { modal } = openModal(rules)
        const text = modal.contentEl.textContent
        expect(text).toContain("completed_at")
        expect(text).toContain("assigned_to")
    })

    it("renders Add button", () => {
        const { modal } = openModal([])
        const addBtn = modal.contentEl.querySelector(".swimlane-automation-add-btn")
        expect(addBtn).not.toBeNull()
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/automations/modal.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement AutomationsModal read mode**

Create `src/automations/modal.ts`. The modal extends `WrongNotesModal`, renders rule cards in read mode, and has an Add button. Each rule card has Edit and Delete buttons.

Key structure:

- Constructor takes `{ app, rules, swimlanes, swimlaneProp, onSave }`
- `onOpen()` renders the list
- Each rule card shows: trigger summary line, action summary lines, Edit/Delete buttons
- Delete calls `onSave` with the rule removed

Implement the modal following the existing `RmSwimlaneModal` pattern from `src/migration-workflows/rm-swimlane-modal.ts`. Use `WrongNotesModal` as the base class and Obsidian `Setting` for form controls.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/automations/modal.test.ts --no-coverage`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/automations/modal.ts src/automations/modal.test.ts
git commit -m "feat(automations): add modal read mode"
```

---

### Task 11: AutomationsModal — Edit/Add Mode

**Files:**

- Modify: `src/automations/modal.ts`
- Modify: `src/automations/modal.test.ts`

- [ ] **Step 1: Write edit-mode tests**

Append to `src/automations/modal.test.ts`:

```typescript
describe("AutomationsModal edit mode", () => {
    it("Add button creates new rule in edit mode", () => {
        const { modal } = openModal([])
        const addBtn = modal.contentEl.querySelector(".swimlane-automation-add-btn") as HTMLElement
        addBtn.click()
        expect(modal.contentEl.querySelector(".swimlane-automation-editor")).not.toBeNull()
    })

    it("Edit button expands rule into edit mode", () => {
        const { modal } = openModal(rules)
        const editBtn = modal.contentEl.querySelector(
            ".swimlane-automation-edit-btn",
        ) as HTMLElement
        editBtn.click()
        expect(modal.contentEl.querySelector(".swimlane-automation-editor")).not.toBeNull()
    })

    it("Cancel discards changes", () => {
        const { modal, onSave } = openModal(rules)
        const editBtn = modal.contentEl.querySelector(
            ".swimlane-automation-edit-btn",
        ) as HTMLElement
        editBtn.click()
        const cancelBtn = modal.contentEl.querySelector(
            ".swimlane-automation-cancel-btn",
        ) as HTMLElement
        cancelBtn.click()
        expect(onSave).not.toHaveBeenCalled()
    })

    it("Save calls onSave with updated rules", () => {
        const { modal, onSave } = openModal([])
        const addBtn = modal.contentEl.querySelector(".swimlane-automation-add-btn") as HTMLElement
        addBtn.click()
        // The editor should have default values. Fill in minimum required fields.
        // (Exact selector depends on implementation — update after Step 3)
        const saveBtn = modal.contentEl.querySelector(
            ".swimlane-automation-save-btn",
        ) as HTMLElement
        // Need to set property name before save will validate
        const propInput = modal.contentEl.querySelector(
            ".swimlane-automation-prop-input",
        ) as HTMLInputElement
        if (propInput) propInput.value = "test_prop"
        propInput?.dispatchEvent(new Event("input"))
        const valInput = modal.contentEl.querySelector(
            ".swimlane-automation-value-input",
        ) as HTMLInputElement
        if (valInput) valInput.value = "test_val"
        valInput?.dispatchEvent(new Event("input"))
        saveBtn?.click()
        expect(onSave).toHaveBeenCalled()
    })

    it("Delete removes rule and calls onSave", () => {
        const { modal, onSave } = openModal(rules)
        const delBtn = modal.contentEl.querySelector(
            ".swimlane-automation-delete-btn",
        ) as HTMLElement
        delBtn.click()
        expect(onSave).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ trigger: { type: "leaves", swimlane: "In Progress" } }),
            ]),
        )
    })

    it("Set action shows value field, Clear hides it", () => {
        const { modal } = openModal([])
        const addBtn = modal.contentEl.querySelector(".swimlane-automation-add-btn") as HTMLElement
        addBtn.click()
        // Default action type is "set" — value field should be visible
        expect(modal.contentEl.querySelector(".swimlane-automation-value-input")).not.toBeNull()
    })

    it("Add action button appends action to rule", () => {
        const { modal } = openModal([])
        const addBtn = modal.contentEl.querySelector(".swimlane-automation-add-btn") as HTMLElement
        addBtn.click()
        const addActionBtn = modal.contentEl.querySelector(
            ".swimlane-automation-add-action-btn",
        ) as HTMLElement
        addActionBtn?.click()
        const actions = modal.contentEl.querySelectorAll(".swimlane-automation-action")
        expect(actions.length).toBeGreaterThanOrEqual(2)
    })

    it("validates empty property name", () => {
        const { modal, onSave } = openModal([])
        const addBtn = modal.contentEl.querySelector(".swimlane-automation-add-btn") as HTMLElement
        addBtn.click()
        const saveBtn = modal.contentEl.querySelector(
            ".swimlane-automation-save-btn",
        ) as HTMLElement
        saveBtn?.click()
        expect(onSave).not.toHaveBeenCalled()
    })

    it("swimlane dropdown includes 'Any swimlane' option", () => {
        const { modal } = openModal([], ["Backlog", "Done"])
        const addBtn = modal.contentEl.querySelector(".swimlane-automation-add-btn") as HTMLElement
        addBtn.click()
        const select = modal.contentEl.querySelector(
            ".swimlane-automation-swimlane-select",
        ) as HTMLSelectElement
        const options = Array.from(select?.options ?? []).map(o => o.value)
        expect(options).toContain("*")
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/automations/modal.test.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: Implement edit/add mode**

Extend `AutomationsModal` with:

- `renderEditor(rule, index)` — replaces the rule card with an inline editor
- Trigger type dropdown (`select`): options `enters`, `leaves`, `created_in`
- Swimlane dropdown (`select`): populated from `this.ctx.swimlanes` + `*` ("Any swimlane")
- Actions list: each action has type dropdown (`set`/`clear`), property input, value input (hidden for `clear`)
- Add action button
- Save button: validates, calls `onSave` with updated rules array
- Cancel button: re-renders the rule in read mode

Validation on save:

- Every action must have a non-empty `property`
- `set` actions must have a non-empty `value`
- At least one action required
- Property must not equal `swimlaneProp`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/automations/modal.test.ts --no-coverage`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/automations/modal.ts src/automations/modal.test.ts
git commit -m "feat(automations): add modal edit/add mode with validation"
```

---

### Task 12: Update index.ts and add modal export

**Files:**

- Modify: `src/automations/index.ts`

- [ ] **Step 1: Add modal export**

```typescript
export { AutomationsModal } from "./modal"
```

- [ ] **Step 2: Commit**

```bash
git add src/automations/index.ts
git commit -m "feat(automations): export modal from index"
```

---

## Chunk 5: UI Integration and Command

### Task 13: Automations Button in Board

**Files:**

- Modify: `src/swimlane-view.ts`
- Add CSS to: `styles.css`

- [ ] **Step 1: Render automations button in rebuildBoard**

In `rebuildBoard()`, after the sort-hint button block (~line 529) and before `const cardOptions`, add:

```typescript
const automationsBtn = this.boardEl.createEl("button", { cls: "swimlane-automations-btn" })
setIcon(automationsBtn.createSpan({ cls: "swimlane-automations-btn-icon" }), "zap")
const count = this.automationRules.length
automationsBtn.createSpan({
    text: count > 0 ? `Automations (${count})` : "Automations",
})
automationsBtn.addEventListener("click", () => this.openAutomationsModal())
this.boardEl.insertBefore(automationsBtn, board)
```

- [ ] **Step 2: Add openAutomationsModal method**

```typescript
private openAutomationsModal(): void {
    if (!this.baseFile) {
        return
    }
    const baseFile = this.baseFile
    const modal = new AutomationsModal({
        app: this.app,
        rules: [...this.automationRules],
        swimlanes: this.swimlaneOrder as string[],
        swimlaneProp: this.swimlaneProp,
        onSave: rules => {
            this.automationRules = rules
            this.app.vault.process(baseFile, content => writeAutomations(content, rules))
        },
    })
    modal.open()
}
```

Add `writeAutomations` to the import from `"./automations"` and `AutomationsModal`.

- [ ] **Step 3: Add CSS for the button**

Append to `styles.css` (near `.swimlane-sort-hint`):

```css
.swimlane-automations-btn {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
    padding: var(--size-4-1) var(--size-4-3);
    margin: var(--size-4-2) var(--size-4-4) 0;
    color: var(--text-muted);
    font-size: var(--font-ui-smaller);
    background: none;
    border: var(--border-width) solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    cursor: pointer;
}

.swimlane-automations-btn:hover {
    color: var(--text-normal);
    background-color: var(--background-modifier-hover);
}

.swimlane-automations-btn-icon {
    display: flex;
    flex-shrink: 0;
}

.swimlane-automations-btn-icon svg {
    width: 14px;
    height: 14px;
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Success

- [ ] **Step 5: Commit**

```bash
git add src/swimlane-view.ts styles.css
git commit -m "feat(automations): add automations button to board"
```

---

### Task 14: Command Palette Action

**Files:**

- Modify: `src/main.ts`

- [ ] **Step 1: Register command**

In `main.ts`, add a command inside `onload()`:

```typescript
this.addCommand({
    id: "manage-automations",
    name: "Manage automations",
    callback: () => {
        const file = this.app.workspace.getActiveFile()
        if (!file || file.extension !== "base") {
            new Notice("Open a .base file to manage automations.")
            return
        }
        this.app.vault.read(file).then(content => {
            const config = parseYaml(content) ?? {}
            const rules = readAutomations(content)
            // Extract swimlane context from the first swimlane view in the .base file.
            const swimView = config.views?.find(
                (v: Record<string, unknown>) => v.type === "swimlane",
            )
            const swimlaneProp = swimView?.swimlaneProperty
                ? String(swimView.swimlaneProperty).replace(/^note\./, "")
                : "status"
            const swimlanes = Array.isArray(swimView?.swimlaneOrder)
                ? swimView.swimlaneOrder.filter((s: unknown) => typeof s === "string")
                : []
            const modal = new AutomationsModal({
                app: this.app,
                rules,
                swimlanes,
                swimlaneProp,
                onSave: newRules => {
                    this.app.vault.process(file, c => writeAutomations(c, newRules))
                },
            })
            modal.open()
        })
    },
})
```

Add imports at top of `main.ts`:

```typescript
import { AutomationsModal, readAutomations, writeAutomations } from "./automations"
import { Notice, parseYaml } from "obsidian"
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Success

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(automations): add command palette action"
```

---

## Chunk 6: Integration Tests and Modal CSS

### Task 15: Integration Tests

**Files:**

- Modify: `src/swimlane-view.test.ts`

- [ ] **Step 1: Write integration tests**

Append to `src/swimlane-view.test.ts`. These tests verify that the automations button renders with the correct count. Full end-to-end testing of mutation integration requires the DnD flow which is harder to simulate in unit tests — the engine tests in `engine.test.ts` cover the core logic.

```typescript
describe("automations button", () => {
    it("renders automations button", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()
        const btn = container.querySelector(".swimlane-automations-btn")
        expect(btn).not.toBeNull()
        expect(btn?.textContent).toContain("Automations")
    })
})
```

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/swimlane-view.test.ts
git commit -m "test(automations): add integration tests for automations button"
```

---

### Task 16: Modal CSS

**Files:**

- Modify: `styles.css`

- [ ] **Step 1: Add modal styles**

Append to `styles.css`:

```css
/* Automations modal */
.swimlane-automation-rule {
    border: var(--border-width) solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    padding: var(--size-4-3);
    margin-bottom: var(--size-4-2);
}

.swimlane-automation-rule-trigger {
    font-weight: var(--font-semibold);
    font-size: var(--font-ui-small);
    margin-bottom: var(--size-4-1);
}

.swimlane-automation-rule-action {
    color: var(--text-muted);
    font-size: var(--font-ui-smaller);
    padding-left: var(--size-4-3);
}

.swimlane-automation-rule-action::before {
    content: "→ ";
}

.swimlane-automation-rule-buttons {
    display: flex;
    justify-content: flex-end;
    gap: var(--size-4-2);
    margin-top: var(--size-4-2);
}

.swimlane-automation-editor {
    border: var(--border-width) solid var(--interactive-accent);
    border-radius: var(--radius-s);
    padding: var(--size-4-3);
    margin-bottom: var(--size-4-2);
}

.swimlane-automation-action {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
    margin-bottom: var(--size-4-2);
}

.swimlane-automation-action select,
.swimlane-automation-action input {
    font-size: var(--font-ui-smaller);
}

.swimlane-automation-add-btn {
    margin-top: var(--size-4-2);
}

.swimlane-automation-editor-buttons {
    display: flex;
    justify-content: flex-end;
    gap: var(--size-4-2);
    margin-top: var(--size-4-3);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Success

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style(automations): add modal CSS"
```

---

### Task 17: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All PASS

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: Clean

- [ ] **Step 3: Build production**

Run: `npm run build`
Expected: Success

- [ ] **Step 4: Manual smoke test checklist**

If testing in Obsidian:

1. Open a `.base` file with a swimlane view
2. Click "Automations" button — modal opens with empty list
3. Add a rule: "When card enters Done → Set completed_at to {{now:YYYY-MM-DD}}"
4. Save — button shows "Automations (1)"
5. Drag a card to "Done" column — check that `completed_at` is set in frontmatter
6. Add another rule with "Clear" action — verify it removes the property
7. Test "Card is created in" trigger — create a card and verify frontmatter
8. Command palette: "Manage automations" — modal opens
