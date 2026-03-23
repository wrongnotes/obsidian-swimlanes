# Tag Color Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Color tags by name" toggle with user-defined tag-to-color mapping rules (with glob patterns) in plugin settings.

**Architecture:** A `TagColorResolver` class handles pattern matching and caching. The settings tab renders a reorderable rule list with color picker popovers. Card rendering uses a `resolveTagColor` callback instead of the old `tagColorScheme` approach.

**Tech Stack:** TypeScript, Obsidian API (`PluginSettingTab`, `Setting`), vanilla DOM, Jest.

**Spec:** `docs/superpowers/specs/2026-03-23-tag-color-rules-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/tag-colors.ts` | `TagColorRule` interface, `TagColorResolver` class, `contrastingText` helper, `PRESET_PALETTE` constant |
| `src/tag-colors.test.ts` | Tests for resolver, glob matching, contrasting text |
| `src/main.ts` | Settings data model (`tagColorRules`), `tagColorResolver` on plugin, settings UI |
| `src/swimlane-card.ts` | Use `resolveTagColor` callback, remove `tagHue`/`tagColorScheme` |
| `src/swimlane-card.test.ts` | Update tests |
| `src/swimlane-view.ts` | Wire `resolveTagColor`, pass to `renderTagEditor` |
| `src/swimlane-view.test.ts` | Update mock plugin |
| `styles.css` | Remove `--colored` styles, add settings UI styles |

---

### Task 1: Create `TagColorResolver` with glob matching and caching

**Files:**
- Create: `src/tag-colors.ts`
- Create: `src/tag-colors.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/tag-colors.test.ts`:

```ts
import { TagColorResolver, contrastingText } from "./tag-colors"
import type { TagColorRule } from "./tag-colors"

describe("TagColorResolver", () => {
    it("returns null when no rules", () => {
        const resolver = new TagColorResolver([])
        expect(resolver.resolve("bug")).toBeNull()
    })

    it("matches exact tag", () => {
        const resolver = new TagColorResolver([{ pattern: "bug", color: "#e05252" }])
        expect(resolver.resolve("bug")).toBe("#e05252")
        expect(resolver.resolve("feature")).toBeNull()
    })

    it("matches case-insensitively", () => {
        const resolver = new TagColorResolver([{ pattern: "Bug", color: "#e05252" }])
        expect(resolver.resolve("bug")).toBe("#e05252")
        expect(resolver.resolve("BUG")).toBe("#e05252")
    })

    it("matches wildcard suffix", () => {
        const resolver = new TagColorResolver([{ pattern: "project/*", color: "#5094e4" }])
        expect(resolver.resolve("project/alpha")).toBe("#5094e4")
        expect(resolver.resolve("project/beta")).toBe("#5094e4")
        expect(resolver.resolve("other")).toBeNull()
    })

    it("matches wildcard prefix", () => {
        const resolver = new TagColorResolver([{ pattern: "*bug", color: "#e05252" }])
        expect(resolver.resolve("showstopper-bug")).toBe("#e05252")
        expect(resolver.resolve("bug")).toBe("#e05252")
        expect(resolver.resolve("bugfix")).toBeNull()
    })

    it("matches wildcard contains", () => {
        const resolver = new TagColorResolver([{ pattern: "*bug*", color: "#e05252" }])
        expect(resolver.resolve("bugfix")).toBe("#e05252")
        expect(resolver.resolve("showstopper-bug")).toBe("#e05252")
    })

    it("matches catch-all wildcard", () => {
        const resolver = new TagColorResolver([{ pattern: "*", color: "#888888" }])
        expect(resolver.resolve("anything")).toBe("#888888")
    })

    it("last match wins", () => {
        const resolver = new TagColorResolver([
            { pattern: "*", color: "#888888" },
            { pattern: "project/*", color: "#5094e4" },
            { pattern: "project/urgent", color: "#e05252" },
        ])
        expect(resolver.resolve("random")).toBe("#888888")
        expect(resolver.resolve("project/alpha")).toBe("#5094e4")
        expect(resolver.resolve("project/urgent")).toBe("#e05252")
    })

    it("caches results", () => {
        const resolver = new TagColorResolver([{ pattern: "bug", color: "#e05252" }])
        const first = resolver.resolve("bug")
        const second = resolver.resolve("bug")
        expect(first).toBe(second)
    })

    it("skips empty patterns", () => {
        const resolver = new TagColorResolver([{ pattern: "", color: "#e05252" }])
        expect(resolver.resolve("bug")).toBeNull()
    })

    it("strips # from patterns", () => {
        const resolver = new TagColorResolver([{ pattern: "#bug", color: "#e05252" }])
        expect(resolver.resolve("bug")).toBe("#e05252")
    })
})

describe("contrastingText", () => {
    it("returns black for light backgrounds", () => {
        expect(contrastingText("#ffffff")).toBe("#000")
        expect(contrastingText("#c4a82b")).toBe("#000")
    })

    it("returns white for dark backgrounds", () => {
        expect(contrastingText("#000000")).toBe("#fff")
        expect(contrastingText("#e05252")).toBe("#fff")
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes && npx jest src/tag-colors.test.ts --no-coverage 2>&1 | tail -5`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `tag-colors.ts`**

Create `src/tag-colors.ts`:

```ts
export interface TagColorRule {
    pattern: string
    color: string
}

export const PRESET_PALETTE = [
    { name: "Red", color: "#e05252" },
    { name: "Orange", color: "#d97a2b" },
    { name: "Yellow", color: "#c4a82b" },
    { name: "Green", color: "#4fad5b" },
    { name: "Teal", color: "#2da8a8" },
    { name: "Blue", color: "#5094e4" },
    { name: "Purple", color: "#9b6cd1" },
    { name: "Pink", color: "#d15fa6" },
    { name: "Gray", color: "#888888" },
] as const

/** Convert a glob pattern (with `*` wildcards) to a case-insensitive RegExp. */
function globToRegex(pattern: string): RegExp {
    const stripped = pattern.startsWith("#") ? pattern.slice(1) : pattern
    const escaped = stripped.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    const regexStr = escaped.replace(/\*/g, ".*")
    return new RegExp(`^${regexStr}$`, "i")
}

export class TagColorResolver {
    private compiled: { regex: RegExp; color: string }[]
    private cache = new Map<string, string | null>()

    constructor(rules: TagColorRule[]) {
        this.compiled = rules
            .filter(r => r.pattern.replace(/^#/, "").length > 0)
            .map(r => ({ regex: globToRegex(r.pattern), color: r.color }))
    }

    resolve(tag: string): string | null {
        const cached = this.cache.get(tag)
        if (cached !== undefined) {
            return cached
        }
        const result = this.evaluate(tag)
        this.cache.set(tag, result)
        return result
    }

    private evaluate(tag: string): string | null {
        let match: string | null = null
        for (const rule of this.compiled) {
            if (rule.regex.test(tag)) {
                match = rule.color
            }
        }
        return match
    }
}

/** Return "#000" or "#fff" for best contrast against the given hex background. */
export function contrastingText(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
    return luminance > 0.179 ? "#000" : "#fff"
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes && npx jest src/tag-colors.test.ts --no-coverage 2>&1 | tail -10`

Expected: PASS

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes && npx tsc --noEmit 2>&1 | head -5`

- [ ] **Step 6: Commit**

```bash
git add src/tag-colors.ts src/tag-colors.test.ts
git commit -m "feat: add TagColorResolver with glob matching and caching"
```

---

### Task 2: Update settings data model and wire resolver to plugin

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Update `SwimlaneSettings` interface and defaults**

In `src/main.ts`, replace the settings interface and defaults:

```ts
import { TagColorResolver } from "./tag-colors"
import type { TagColorRule } from "./tag-colors"
```

Replace:
```ts
export interface SwimlaneSettings {
    colorTagsByName: boolean
}

const DEFAULT_SETTINGS: SwimlaneSettings = {
    colorTagsByName: false,
}
```

With:
```ts
export interface SwimlaneSettings {
    tagColorRules: TagColorRule[]
}

const DEFAULT_SETTINGS: SwimlaneSettings = {
    tagColorRules: [],
}
```

- [ ] **Step 2: Add `tagColorResolver` to `SwimlanePlugin`**

Add a public field after `settings`:

```ts
tagColorResolver: TagColorResolver = new TagColorResolver([])
```

Update `loadSettings` to rebuild the resolver:

```ts
async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
    this.tagColorResolver = new TagColorResolver(this.settings.tagColorRules)
}
```

Update `saveSettings` to rebuild the resolver:

```ts
async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
    this.tagColorResolver = new TagColorResolver(this.settings.tagColorRules)
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes && npx tsc --noEmit 2>&1 | head -10`

Expected: Errors in `swimlane-view.ts` referencing old `colorTagsByName` — expected, fixed in Task 4.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: replace colorTagsByName with tagColorRules settings and resolver"
```

---

### Task 3: Replace `tagHue`/`tagColorScheme` with `resolveTagColor` in card rendering

**Files:**
- Modify: `src/swimlane-card.ts`
- Modify: `src/swimlane-card.test.ts`

- [ ] **Step 1: Update tests**

In `src/swimlane-card.test.ts`:

Replace the `makeOptions` helper to remove `tagColorScheme` default (it's no longer in the interface — no change needed unless tests explicitly pass it).

Replace the test "applies colored class and hue CSS variable when tagColorScheme is colored" with:

```ts
it("applies inline color from resolveTagColor", () => {
    const container = document.createElement("div")
    const card = renderCard(
        container,
        makeEntry("Note"),
        makeApp(),
        makeOptions({
            tags: ["bug"],
            resolveTagColor: (tag: string) => (tag === "bug" ? "#e05252" : null),
        }),
    )
    const chip = card.querySelector(".swimlane-card-tag") as HTMLElement
    expect(chip).not.toBeNull()
    expect(chip.style.backgroundColor).toBeTruthy()
})

it("uses default styling when resolveTagColor returns null", () => {
    const container = document.createElement("div")
    const card = renderCard(
        container,
        makeEntry("Note"),
        makeApp(),
        makeOptions({
            tags: ["unmatched"],
            resolveTagColor: () => null,
        }),
    )
    const chip = card.querySelector(".swimlane-card-tag") as HTMLElement
    expect(chip.style.backgroundColor).toBe("")
})

it("uses default styling when resolveTagColor is not provided", () => {
    const container = document.createElement("div")
    const card = renderCard(
        container,
        makeEntry("Note"),
        makeApp(),
        makeOptions({ tags: ["test"] }),
    )
    const chip = card.querySelector(".swimlane-card-tag") as HTMLElement
    expect(chip.style.backgroundColor).toBe("")
})
```

In the `renderTagEditor` tests, update any tests that reference chip appearance for colored tags if needed. The `renderTagEditor` tests mostly don't test colors — they should still pass. Add one test:

```ts
it("applies color from resolveTagColor to editable chips", () => {
    const card = document.createElement("div")
    card.classList.add("swimlane-card")
    renderTagEditor(card, makeFile(), ["bug"], makeApp(), jest.fn(), tag =>
        tag === "bug" ? "#e05252" : null,
    )
    const chip = card.querySelector(".swimlane-card-tag--editable") as HTMLElement
    expect(chip.style.backgroundColor).toBeTruthy()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes && npx jest src/swimlane-card.test.ts --no-coverage 2>&1 | tail -20`

Expected: FAIL

- [ ] **Step 3: Update `CardRenderOptions` in `swimlane-card.ts`**

Remove `tagColorScheme` and add `resolveTagColor`:

Replace:
```ts
/** Tag color scheme — "default" uses Obsidian native colors, "colored" uses deterministic hue. */
tagColorScheme?: "default" | "colored"
```

With:
```ts
/** Resolve a tag to a hex color, or null for default Obsidian styling. */
resolveTagColor?: (tag: string) => string | null
```

- [ ] **Step 4: Remove `tagHue` function**

Delete the `tagHue` function (lines 51-56 approximately):

```ts
/** Simple string hash → hue (0-360) for deterministic tag coloring. */
function tagHue(tag: string): number { ... }
```

- [ ] **Step 5: Add `contrastingText` import and update read-only chip rendering**

Add import at top:
```ts
import { contrastingText } from "./tag-colors"
```

Replace the tag chip rendering block (inside `renderCard`, the `if (options.tags && options.tags.length > 0)` block):

```ts
if (options.tags && options.tags.length > 0) {
    const tagRow = content.createDiv({ cls: "swimlane-card-tags" })
    for (const tag of options.tags) {
        const chip = tagRow.createSpan({ cls: "swimlane-card-tag", text: tag })
        const color = options.resolveTagColor?.(tag) ?? null
        if (color) {
            chip.style.backgroundColor = color
            chip.style.color = contrastingText(color)
        }
    }
}
```

- [ ] **Step 6: Update `renderTagEditor` to accept and use `resolveTagColor`**

Update the function signature — add `resolveTagColor` as the last parameter:

```ts
export function renderTagEditor(
    cardEl: HTMLElement,
    file: TFile,
    currentTags: string[],
    app: App,
    onDone: () => void,
    resolveTagColor?: (tag: string) => string | null,
): void {
```

In `renderChips()`, after creating each chip and setting `chip.textContent = tag`, add:

```ts
const color = resolveTagColor?.(tag) ?? null
if (color) {
    chip.style.backgroundColor = color
    chip.style.color = contrastingText(color)
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes && npx jest src/swimlane-card.test.ts --no-coverage 2>&1 | tail -10`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/swimlane-card.ts src/swimlane-card.test.ts
git commit -m "feat(cards): replace tagHue/tagColorScheme with resolveTagColor"
```

---

### Task 4: Wire `resolveTagColor` in the view and update view tests

**Files:**
- Modify: `src/swimlane-view.ts`
- Modify: `src/swimlane-view.test.ts`

- [ ] **Step 1: Update `swimlane-view.ts`**

Remove the `tagColorScheme` line from `cardOptions` (around line 922):
```ts
tagColorScheme: this.plugin.settings.colorTagsByName ? "colored" : "default",
```

Replace with:
```ts
resolveTagColor: (tag: string) => this.plugin.tagColorResolver.resolve(tag),
```

Find the `renderTagEditor` call inside the `onEditTags` callback. It currently looks like:
```ts
renderTagEditor(cardEl, file, previousTags, this.app, () => { ... })
```

Add the resolver as the last argument:
```ts
renderTagEditor(cardEl, file, previousTags, this.app, () => { ... }, (tag: string) => this.plugin.tagColorResolver.resolve(tag))
```

Note: The `onDone` callback is a multi-line function. The `resolveTagColor` argument goes after the closing `)` of the callback — be careful with the placement.

- [ ] **Step 2: Update the mock plugin in `swimlane-view.test.ts`**

Find the line:
```ts
const view = new SwimlaneView({} as any, container, { settings: { colorTagsByName: false } } as any)
```

Replace with:
```ts
const view = new SwimlaneView({} as any, container, { settings: { tagColorRules: [] }, tagColorResolver: { resolve: () => null } } as any)
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes && npx tsc --noEmit 2>&1 | head -5`

Expected: No errors.

- [ ] **Step 4: Run all tests**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes && npx jest --no-coverage 2>&1 | tail -10`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/swimlane-view.ts src/swimlane-view.test.ts
git commit -m "feat(view): wire resolveTagColor from plugin, remove tagColorScheme"
```

---

### Task 5: Update CSS — remove old colored styles

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Remove the `--colored` selectors**

Remove these blocks from `styles.css` (around lines 291-299):

```css
.swimlane-card-tag--colored {
    background-color: hsl(var(--tag-hue), 40%, 90%);
    color: hsl(var(--tag-hue), 60%, 30%);
}

.theme-dark .swimlane-card-tag--colored {
    background-color: hsl(var(--tag-hue), 30%, 25%);
    color: hsl(var(--tag-hue), 50%, 75%);
}
```

- [ ] **Step 2: Build to verify**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes && npm run build 2>&1 | tail -3`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style: remove old deterministic tag color CSS"
```

---

### Task 6: Build the settings UI — rule list with color picker

**Files:**
- Modify: `src/main.ts`
- Modify: `styles.css`

This is the largest task. The settings tab renders a reorderable list of tag color rules with color picker popovers.

- [ ] **Step 1: Replace the `SwimlaneSettingTab.display()` method**

Replace the entire `display()` method in `SwimlaneSettingTab` and add supporting methods. The full implementation:

```ts
import { PRESET_PALETTE } from "./tag-colors"
import type { TagColorRule } from "./tag-colors"
```

(Add these imports at the top of `main.ts`, merging with the existing `TagColorResolver` import.)

Replace the `SwimlaneSettingTab` class:

```ts
class SwimlaneSettingTab extends PluginSettingTab {
    plugin: SwimlanePlugin
    private activePopover: HTMLElement | null = null

    constructor(app: ObsidianApp, plugin: SwimlanePlugin) {
        super(app, plugin)
        this.plugin = plugin
    }

    display(): void {
        const { containerEl } = this
        containerEl.empty()

        containerEl.createEl("h3", { text: "Tag color rules" })
        containerEl.createEl("p", {
            text: "Map tag patterns to colors. Use * as a wildcard. Last matching rule wins.",
            cls: "setting-item-description",
        })

        const rulesContainer = containerEl.createDiv({ cls: "swimlane-tag-color-rules" })
        this.renderRules(rulesContainer)

        const addBtn = containerEl.createEl("button", { text: "Add rule" })
        addBtn.addEventListener("click", async () => {
            this.plugin.settings.tagColorRules.push({
                pattern: "",
                color: PRESET_PALETTE[0].color,
            })
            await this.plugin.saveSettings()
            this.display()
        })
    }

    private renderRules(container: HTMLElement): void {
        const rules = this.plugin.settings.tagColorRules
        for (let i = 0; i < rules.length; i++) {
            this.renderRuleRow(container, i)
        }
    }

    private renderRuleRow(container: HTMLElement, index: number): void {
        const rules = this.plugin.settings.tagColorRules
        const rule = rules[index]
        const row = container.createDiv({ cls: "swimlane-tag-color-rule" })

        // Up/down buttons
        const upBtn = row.createEl("button", { cls: "swimlane-tag-color-rule-btn", text: "↑" })
        upBtn.disabled = index === 0
        upBtn.addEventListener("click", async () => {
            ;[rules[index - 1], rules[index]] = [rules[index], rules[index - 1]]
            await this.plugin.saveSettings()
            this.display()
        })

        const downBtn = row.createEl("button", { cls: "swimlane-tag-color-rule-btn", text: "↓" })
        downBtn.disabled = index === rules.length - 1
        downBtn.addEventListener("click", async () => {
            ;[rules[index], rules[index + 1]] = [rules[index + 1], rules[index]]
            await this.plugin.saveSettings()
            this.display()
        })

        // Pattern input
        const input = row.createEl("input", {
            cls: "swimlane-tag-color-rule-input",
            attr: { type: "text", placeholder: "tag pattern", value: rule.pattern },
        })
        input.addEventListener("change", async () => {
            rule.pattern = input.value.trim().replace(/^#/, "")
            input.value = rule.pattern
            await this.plugin.saveSettings()
        })

        // Color swatch
        const swatch = row.createDiv({ cls: "swimlane-tag-color-swatch" })
        swatch.style.backgroundColor = rule.color
        swatch.addEventListener("click", () => {
            this.openColorPopover(swatch, rule)
        })

        // Delete button
        const deleteBtn = row.createEl("button", { cls: "swimlane-tag-color-rule-btn", text: "×" })
        deleteBtn.addEventListener("click", async () => {
            rules.splice(index, 1)
            await this.plugin.saveSettings()
            this.display()
        })
    }

    private openColorPopover(swatch: HTMLElement, rule: TagColorRule): void {
        // Close any existing popover
        this.closePopover()

        const popover = document.createElement("div")
        popover.classList.add("swimlane-tag-color-popover")
        swatch.parentElement!.appendChild(popover)
        // Position below the swatch
        popover.style.position = "absolute"

        // Preset palette
        const palette = popover.createDiv({ cls: "swimlane-tag-palette" })
        for (const preset of PRESET_PALETTE) {
            const presetSwatch = palette.createDiv({ cls: "swimlane-tag-palette-swatch" })
            presetSwatch.style.backgroundColor = preset.color
            presetSwatch.title = preset.name
            if (preset.color === rule.color) {
                presetSwatch.classList.add("swimlane-tag-palette-swatch--active")
            }
            presetSwatch.addEventListener("click", async () => {
                rule.color = preset.color
                swatch.style.backgroundColor = rule.color
                await this.plugin.saveSettings()
                this.closePopover()
            })
        }

        // Custom color picker
        const pickerRow = popover.createDiv({ cls: "swimlane-tag-color-picker-row" })
        pickerRow.createSpan({ text: "Custom: " })
        const picker = pickerRow.createEl("input", {
            attr: { type: "color", value: rule.color },
        })
        picker.addEventListener("input", async () => {
            rule.color = picker.value
            swatch.style.backgroundColor = rule.color
            await this.plugin.saveSettings()
        })

        this.activePopover = popover

        // Dismiss on outside click
        const onPointerDown = (e: PointerEvent) => {
            if (!popover.contains(e.target as Node) && e.target !== swatch) {
                this.closePopover()
                document.removeEventListener("pointerdown", onPointerDown, true)
            }
        }
        // Use setTimeout so the current click doesn't immediately close it
        setTimeout(() => {
            document.addEventListener("pointerdown", onPointerDown, true)
        }, 0)

        // Dismiss on Escape
        const onKeydown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                this.closePopover()
                document.removeEventListener("keydown", onKeydown)
            }
        }
        document.addEventListener("keydown", onKeydown)
    }

    private closePopover(): void {
        if (this.activePopover) {
            this.activePopover.remove()
            this.activePopover = null
        }
    }
}
```

- [ ] **Step 2: Add settings UI CSS**

Add to `styles.css` after the tag editor styles:

```css
/* ── Tag color rules (settings) ────────────────────────── */

.swimlane-tag-color-rules {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
}

.swimlane-tag-color-rule {
    display: flex;
    align-items: center;
    gap: 6px;
    position: relative;
}

.swimlane-tag-color-rule-btn {
    padding: 2px 8px;
    cursor: pointer;
    font-size: var(--font-ui-small);
}

.swimlane-tag-color-rule-input {
    flex: 1;
    min-width: 80px;
}

.swimlane-tag-color-swatch {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-s);
    border: 1px solid var(--background-modifier-border);
    cursor: pointer;
    flex-shrink: 0;
}

.swimlane-tag-color-popover {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: var(--layer-popover);
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    padding: 8px;
    box-shadow: var(--shadow-s);
    margin-top: 4px;
}

.swimlane-tag-palette {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 4px;
    margin-bottom: 8px;
}

.swimlane-tag-palette-swatch {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-s);
    cursor: pointer;
    border: 2px solid transparent;
}

.swimlane-tag-palette-swatch:hover {
    border-color: var(--text-muted);
}

.swimlane-tag-palette-swatch--active {
    border-color: var(--interactive-accent);
}

.swimlane-tag-color-picker-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-ui-small);
    color: var(--text-muted);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes && npx tsc --noEmit 2>&1 | head -5`

Expected: No errors.

- [ ] **Step 4: Build**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes && npm run build 2>&1 | tail -3`

Expected: Build succeeds.

- [ ] **Step 5: Run all tests**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes && npx jest --no-coverage 2>&1 | tail -10`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main.ts styles.css
git commit -m "feat: add tag color rules settings UI with palette and color picker"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run all tests**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes && npx jest --no-coverage 2>&1 | tail -10`

Expected: All tests PASS.

- [ ] **Step 2: TypeScript check**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes && npx tsc --noEmit 2>&1 | head -5`

Expected: No errors.

- [ ] **Step 3: Full build**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes && npm run build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 4: Lint**

Run: `cd C:/Users/andre/Code/WrongNotes/obsidian-swimlanes && npx eslint src/tag-colors.ts src/main.ts src/swimlane-card.ts src/swimlane-view.ts 2>&1 | tail -10`

Expected: No errors (warnings OK).
