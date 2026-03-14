# Automations: Rule-Based Workflows for Swimlanes

## Overview

Automations let users define rules that fire when cards move between swimlanes or are created. Rules perform frontmatter mutations — setting or clearing properties — so users can build workflows like "when a card enters Done, set completed_at to the current date."

## Data Model

Rules are stored at the top level of the `.base` file (alongside `filters`, `properties`, `views`) under the key `automations`. This makes them per-base and view-independent.

```yaml
automations:
    - trigger:
          type: "enters"
          swimlane: "Done"
      actions:
          - type: "set"
            property: "completed_at"
            value: "{{now:YYYY-MM-DD}}"
          - type: "clear"
            property: "assigned_to"
    - trigger:
          type: "leaves"
          swimlane: "In Progress"
      actions:
          - type: "set"
            property: "left_at"
            value: "{{now:YYYY-MM-DDTHH:mm}}"
```

### Trigger types

| Type         | Fires when                    | Matched against  |
| ------------ | ----------------------------- | ---------------- |
| `enters`     | Card moves into a swimlane    | `targetSwimlane` |
| `leaves`     | Card moves out of a swimlane  | `sourceSwimlane` |
| `created_in` | Card is created in a swimlane | `targetSwimlane` |

The `swimlane` field matches a specific swimlane value, or `"*"` for any swimlane.

### Action types

| Type    | Fields              | Effect                                            |
| ------- | ------------------- | ------------------------------------------------- |
| `set`   | `property`, `value` | Sets a frontmatter property to the resolved value |
| `clear` | `property`          | Removes a frontmatter property                    |

### Dynamic value tokens

Tokens in `value` strings are resolved at execution time:

| Token                 | Resolves to                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `{{now:FORMAT}}`      | Current date/time formatted with the given format string (e.g., `YYYY-MM-DD`, `YYYY-MM-DDTHH:mm`, `HH:mm`) |
| `{{source.swimlane}}` | The swimlane the card is leaving (empty string when null, e.g., for `created_in`)                          |
| `{{target.swimlane}}` | The swimlane the card is entering (empty string when null, e.g., for `leaves`)                             |

Any string without tokens is treated as a static value. The format string uses moment.js-style tokens (`YYYY`, `MM`, `DD`, `HH`, `mm`, `ss`), implemented with a lightweight built-in formatter (no external dependency). All timestamps use local time.

## TypeScript Types

```typescript
interface AutomationContext {
    type: "enters" | "leaves" | "created_in"
    sourceSwimlane: string | null // null for "created_in"
    targetSwimlane: string | null // null for "leaves"
}

interface AutomationRule {
    trigger: {
        type: "enters" | "leaves" | "created_in"
        swimlane: string // specific value or "*"
    }
    actions: AutomationAction[]
}

type AutomationAction =
    | { type: "set"; property: string; value: string }
    | { type: "clear"; property: string }

interface FrontmatterMutation {
    type: "set" | "clear"
    property: string
    value?: unknown // resolved — tokens already replaced
}
```

## Rule Engine

The engine is a set of pure functions with no Obsidian dependencies.

### Matching

`matchRules(rules: AutomationRule[], context: AutomationContext, swimlaneProp: string): FrontmatterMutation[]`

A rule fires when:

- `trigger.type` matches `context.type`
- `trigger.swimlane` equals the relevant swimlane value, or is `"*"`
    - For `enters` and `created_in`: matched against `context.targetSwimlane`
    - For `leaves`: matched against `context.sourceSwimlane`

All matching rules fire. Actions are collected in order. If two rules set the same property, last one wins. For cross-column moves, `leaves` mutations are collected first, then `enters` mutations — so if both set the same property, the `enters` value takes precedence.

Before applying mutations, any mutation targeting the swimlane property is filtered out (runtime guard against loops, in addition to the editor validation).

### Token resolution

`resolveValue(template: string, context: AutomationContext): string`

Replaces `{{now:FORMAT}}`, `{{source.swimlane}}`, and `{{target.swimlane}}` with their resolved values. Unknown tokens are left as-is.

### Date formatting

`formatNow(format: string): string`

A lightweight formatter supporting: `YYYY`, `YY`, `MM`, `DD`, `HH`, `mm`, `ss`. No external dependencies.

## Integration Points

The engine is called from existing mutation sites in `swimlane-view.ts`. Mutations from automations are folded into the same `processFrontMatter` callback — no extra file write.

### handleCardDrop (cross-column move)

When `context.groupKey !== dragState.groupKey`:

1. Build context: `{ type: "leaves", sourceSwimlane: dragState.groupKey, targetSwimlane: null }`
2. Build context: `{ type: "enters", sourceSwimlane: dragState.groupKey, targetSwimlane: context.groupKey }`
3. Collect mutations from both, apply inside the existing `processFrontMatter` call

Note: `handleCardDrop` dispatches to either a direct `processFrontMatter` call or `reRankColumn` depending on whether a re-rank is needed. When `reRankColumn` is invoked, automations are handled there instead (see below).

### createCard

When a new card is created:

1. Build context: `{ type: "created_in", sourceSwimlane: null, targetSwimlane: groupKey }`
2. Apply mutations inside the existing `processFrontMatter` call

### handleCardDropOnNewColumn

Same as `handleCardDrop` — fires `leaves` for source and `enters` for the new column. Note: the column name is not known until the user confirms in `AddSwimlaneViaDropModal`, so automation rules are evaluated inside the modal's `onConfirm` callback using the user-supplied column name as `targetSwimlane`.

### reRankColumn (cross-column variant)

`reRankColumn` calls `processFrontMatter` in a loop for every card in the column. Automation mutations must only be applied inside the branch where `path === dragState.path && context.groupKey !== dragState.groupKey` — not for every card in the loop. Only the dragged card is changing swimlanes; the others are just getting new ranks.

### executeRmSwimlane (batch move)

When cards are moved to a different swimlane via the remove-swimlane modal, fire `leaves`/`enters` rules for each card whose swimlane property changes. Since `executeRmSwimlane` lives in `src/migration-workflows/operations.ts` and has no access to automations config, it accepts an optional callback parameter:

```typescript
onMutate?: (file: TFile, fm: Record<string, unknown>) => void
```

The caller in `swimlane-view.ts` closes over the cached automations rules and builds per-card `AutomationContext` values inside the callback. This approach works for both "move" (all cards enter the same target) and "clear" (cards leave but have no target).

## File I/O

### readAutomations(app: App, file: TFile): AutomationRule[]

1. Read file content, parse with `parseYaml`
2. Return `config.automations` array, or `[]` if absent
3. Validate structure — drop malformed rules silently

A rule is malformed if it is missing `trigger`, has an invalid `trigger.type`, is missing `trigger.swimlane`, is missing `actions`, has an empty `actions` array, or has an action missing `type`/`property` (or missing `value` for `set` actions).

**Caching:** The view reads automations once and caches the result. The cache is invalidated on `onDataUpdated` (which fires when the `.base` file changes). This avoids parsing YAML on every card drop.

### writeAutomations(app: App, file: TFile, rules: AutomationRule[]): void

1. `app.vault.process(file, content => { ... })` — parse YAML, set `config.automations`, stringify back

Same pattern as `setSortByRank`.

### Obtaining the `.base` file reference

Both functions accept a `TFile` parameter rather than relying on `app.workspace.getActiveFile()` (which is fragile — the active file may be a note in another pane during DnD). The `SwimlaneView` obtains its `.base` file reference at initialization and stores it. If no reliable reference is available from the Bases API, fall back to `getActiveFile()` with a `.base` extension check, but cache the result.

## UI

### Automations button

Rendered above the board, next to the sort-hint button area. Always visible. Shows a count when rules exist.

```
[⚡ Automations (2)]
```

Clicking opens the `AutomationsModal`.

### Command palette

`Manage automations` command registered in `main.ts`. Opens the same modal for the active `.base` file.

### AutomationsModal

A modal listing all rules with inline editing.

**Read mode** — each rule is a card showing a human-readable summary:

```
┌──────────────────────────────────────────┐
│ When card enters "Done"                  │
│ → Set completed_at to {{now:YYYY-MM-DD}} │
│ → Clear assigned_to                      │
│                              [Edit] [✕]  │
└──────────────────────────────────────────┘
```

**Edit/Add mode** — the rule card expands inline with form controls:

```
┌──────────────────────────────────────────────┐
│ When [Card enters     ▼] [Done            ▼] │
│                                              │
│  [Set   ▼] [completed_at ] to [{{now:YY...}] │
│  [Clear ▼] [assigned_to  ]                   │
│  [+ Add action]                              │
│                                              │
│                        [Cancel]  [Save]       │
└──────────────────────────────────────────────┘
```

**Form controls:**

- **Trigger type dropdown:** `Card enters` / `Card leaves` / `Card is created in`
- **Swimlane dropdown:** populated from current swimlane order + "Any swimlane" (`*`)
- **Action type dropdown:** `Set` / `Clear`
- **Property name:** text input (free text — the property may not exist yet)
- **Value field** (Set only): text input with a dropdown/suggestions for tokens (`{{now:YYYY-MM-DD}}`, `{{source.swimlane}}`, `{{target.swimlane}}`)

**Validation:**

- At least one action required
- Property names must be non-empty
- Set actions must have a non-empty value
- The swimlane property itself is excluded from the property picker (prevents loops)

## Edge Cases

- **Rule references a swimlane that no longer exists** — rule still fires if a card's frontmatter matches that value. No cleanup needed.
- **Multiple rules match the same transition** — all fire. Actions collected in order. Last write wins for duplicate properties.
- **Bulk operations** — each card whose swimlane property changes gets its rules evaluated independently.
- **No infinite loops** — rules cannot set the swimlane property (enforced in editor validation and at execution time). Rules only produce frontmatter mutations on non-swimlane properties.
- **`created_in` scope** — only fires from `createCard` (inline card creation in the board), not from imports or external edits.
- **Inline card edits** — editing a property inline on a card (`swimlane-card.ts`) does not trigger automations. Automations only fire on swimlane transitions and card creation.
- **No `.base` file reference** — button and command gracefully no-op if no `.base` file is available.

## Module Structure

```
src/
├── automations/
│   ├── types.ts        # AutomationRule, AutomationAction,
│   │                   #   AutomationContext, FrontmatterMutation
│   ├── engine.ts       # matchRules(), resolveValue(), formatNow()
│   │                   #   — pure functions, no Obsidian deps
│   ├── io.ts           # readAutomations(), writeAutomations()
│   │                   #   — .base file I/O
│   ├── modal.ts        # AutomationsModal
│   └── index.ts        # re-exports
```

## Testing Strategy

### engine.test.ts — Rule Engine (pure functions, bulk of test coverage)

**matchRules:**

- Rule with `enters` trigger matches context with matching `targetSwimlane`
- Rule with `leaves` trigger matches context with matching `sourceSwimlane`
- Rule with `created_in` trigger matches context with matching `targetSwimlane`
- Wildcard `"*"` swimlane matches any value
- Non-matching trigger type does not fire
- Non-matching swimlane does not fire
- Multiple matching rules all fire, actions collected in order
- Duplicate property across rules: last write wins
- Empty rules array returns empty mutations
- Rule with multiple actions produces multiple mutations
- Cross-column move: `leaves` mutations collected before `enters`, so `enters` wins for same property
- Mutation targeting the swimlane property is filtered out (runtime loop guard)

**resolveValue:**

- `{{now:YYYY-MM-DD}}` resolves to current date
- `{{now:YYYY-MM-DDTHH:mm}}` resolves to current datetime
- `{{now:HH:mm}}` resolves to current time
- `{{source.swimlane}}` resolves to source swimlane from context
- `{{target.swimlane}}` resolves to target swimlane from context
- `{{source.swimlane}}` with null source resolves to empty string
- Static string with no tokens returned as-is
- Mixed tokens and static text resolved correctly
- Unknown token left as-is

**formatNow:**

- Each supported token (`YYYY`, `YY`, `MM`, `DD`, `HH`, `mm`, `ss`) resolves correctly
- Multiple tokens in one format string
- Static text between tokens preserved

### io.test.ts — File I/O

- `readAutomations` returns rules from valid `.base` YAML
- `readAutomations` returns `[]` when no automations key exists
- `readAutomations` drops rules with missing trigger
- `readAutomations` drops rules with invalid trigger type
- `readAutomations` drops rules with missing trigger swimlane
- `readAutomations` drops rules with missing or empty actions
- `readAutomations` drops actions missing type or property
- `readAutomations` drops set actions missing value
- `readAutomations` keeps valid rules when mixed with malformed ones
- `writeAutomations` writes rules into existing `.base` file preserving other config
- `writeAutomations` creates automations key if absent

### modal.test.ts — AutomationsModal

- Modal renders existing rules in read mode
- Add button creates a new rule in edit mode
- Edit button expands rule into edit mode
- Delete button removes rule and writes to file
- Save validates and writes updated rules
- Cancel discards changes
- Swimlane dropdown populated from current swimlane order plus "Any swimlane"
- Swimlane property excluded from property name input
- Set action shows value field; Clear action hides it
- Add action button appends action to rule
- Validation: empty property name shows error
- Validation: set with empty value shows error
- Validation: at least one action required

### swimlane-view integration tests

- Cross-column card drop triggers matching `enters`/`leaves` automations
- Same-column card drop does not trigger automations
- Card creation triggers `created_in` automations
- Automation mutations applied in same `processFrontMatter` call as swimlane/rank changes
- Automations button renders with correct count
- Automations button opens modal
