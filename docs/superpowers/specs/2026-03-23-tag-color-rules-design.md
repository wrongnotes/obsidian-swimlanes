# Tag Color Rules

## Overview

Replace the "Color tags by name" toggle with a user-defined ordered list of tag-to-color mapping rules in plugin settings. Each rule maps a tag pattern (with `*` wildcard support) to a specific color. Last matching rule wins. Unmatched tags use Obsidian's default tag styling.

## Data Model

```ts
interface TagColorRule {
    pattern: string  // exact tag or glob, e.g., "bug", "project/*"
    color: string    // hex color, e.g., "#e05252"
}

interface SwimlaneSettings {
    tagColorRules: TagColorRule[]  // default: []
}
```

Stored via `plugin.saveData()` / `plugin.loadData()`. The `colorTagsByName` setting is removed.

### Migration

On `loadSettings()`, if `colorTagsByName === true` and `tagColorRules` is absent/empty, populate `tagColorRules` with a single catch-all rule `{ pattern: "*", color: "#888888" }` so existing users don't silently lose their coloring. Delete the `colorTagsByName` key from saved data.

## Pattern Matching

Simple glob matching. `*` matches any sequence of characters (including empty). No other wildcards (`?`, etc.). `/` has no special meaning — it's a literal character. Matching is case-insensitive.

Implementation: convert pattern to regex — escape all regex metacharacters, replace `*` with `.*`, wrap in `^...$`, use `RegExp` with `i` flag.

Patterns entered with a leading `#` are automatically stripped (users may type `#bug` instinctively).

Examples:
- `bug` — matches only `bug`
- `project/*` — matches `project/alpha`, `project/beta`
- `*bug*` — matches `bugfix`, `showstopper-bug`, `bug`
- `*` — matches everything (catch-all)

### Rule Evaluation

Rules are evaluated in order, **last match wins**. This lets users put general rules first and specific overrides later:

```
*         → gray    (catch-all)
project/* → blue    (override for project tags)
project/urgent → red (specific override)
```

## TagColorResolver

A class that caches resolved tag → color mappings. Lives on `SwimlanePlugin` so all views share it.

```ts
class TagColorResolver {
    private rules: TagColorRule[]
    private cache: Map<string, string | null>

    constructor(rules: TagColorRule[])

    /** Returns hex color or null (use default). Map lookup in common case. */
    resolve(tag: string): string | null

    /** Evaluate rules for a tag (last match wins). Called on cache miss. */
    private evaluate(tag: string): string | null
}
```

- **Cache lifetime:** Persistent across board rebuilds. Only rebuilt when rules change (settings saved → `plugin.tagColorResolver = new TagColorResolver(newRules)`).
- **Lazy population:** Tags not in the cache are evaluated on first encounter and cached.
- **Cache growth:** Unbounded, but acceptable — users won't have thousands of distinct tags.
- **Access:** Views call `this.plugin.tagColorResolver.resolve(tag)`.

## Settings UI

The settings tab displays the tag color rules as a reorderable list.

### Rule Row

Each rule is rendered as a custom DOM row (not Obsidian's `Setting` class, since Setting doesn't support sortable lists). Each row contains:
1. **Up/down arrow buttons** for reordering (simpler and more reliable than drag handles in a settings tab)
2. **Pattern input** — text field for the tag pattern, auto-strips leading `#`
3. **Color swatch** — small colored square showing the current color, clickable to open color picker
4. **Delete button** — removes the rule

### Color Picker Popover

Clicking a color swatch opens a popover (a positioned `div` appended to the settings container):
- **Positioning:** Below the swatch, left-aligned.
- **Dismissal:** Clicking outside the popover or pressing Escape closes it. Only one popover open at a time (opening a new one closes the previous).
- **Contents:**
  1. **Preset palette** — fixed color swatches in a grid. Clicking one selects it, updates the rule, and closes the popover.
  2. **Custom color picker** — `<input type="color">` below the palette. Changing it updates the rule immediately (on `input` event). Popover stays open while the system color picker is active.

### Preset Palette Colors

Fixed set, optimized for readability in both themes:

| Name | Hex |
|------|-----|
| Red | `#e05252` |
| Orange | `#d97a2b` |
| Yellow | `#c4a82b` |
| Green | `#4fad5b` |
| Teal | `#2da8a8` |
| Blue | `#5094e4` |
| Purple | `#9b6cd1` |
| Pink | `#d15fa6` |
| Gray | `#888888` |

### Add Rule Button

An "Add rule" button at the bottom of the list. Creates a new rule with empty pattern and the first preset color.

### Persistence

Every change (add, delete, reorder, edit pattern, change color) saves immediately via `plugin.saveSettings()` and rebuilds `plugin.tagColorResolver`.

## Card Rendering

### Changes to `swimlane-card.ts`

- Remove `tagHue()` function.
- Remove `tagColorScheme` from `CardRenderOptions`.
- Add `resolveTagColor: (tag: string) => string | null` to `CardRenderOptions`.
- In read-only tag chip rendering: call `resolveTagColor(tag)`. If it returns a hex string, set inline `background-color` and `color` (via `contrastingText`). If null, use default Obsidian tag styling (no inline styles).
- Remove `.swimlane-card-tag--colored` class usage.

### `renderTagEditor()` Integration

`renderTagEditor` needs access to the color resolver to style editable chips consistently. Add `resolveTagColor` as a parameter:

```ts
export function renderTagEditor(
    cardEl: HTMLElement,
    file: TFile,
    currentTags: string[],
    app: App,
    onDone: () => void,
    resolveTagColor: (tag: string) => string | null,
): void
```

The view passes `this.plugin.tagColorResolver.resolve` when calling `renderTagEditor` in the `onEditTags` callback.

### Contrasting Text Color

Given a background hex color, compute whether black or white text has better contrast using relative luminance:

```ts
function contrastingText(hex: string): string {
    // Parse hex → r, g, b
    // Compute relative luminance per WCAG
    // Return "#000" if luminance > 0.179, else "#fff"
}
```

### Changes to `swimlane-view.ts`

- Remove `tagColorScheme` getter and its usage in `cardOptions`.
- Add `resolveTagColor: (tag: string) => this.plugin.tagColorResolver.resolve(tag)` to `cardOptions`.
- Pass `resolveTagColor` to `renderTagEditor` call in `onEditTags`.

## CSS Changes

- Remove `.swimlane-card-tag--colored` and `.theme-dark .swimlane-card-tag--colored` selectors.
- Add `.swimlane-tag-color-rules` container styles for the settings UI.
- Add `.swimlane-tag-color-rule` row styles (flex, alignment, spacing).
- Add `.swimlane-tag-color-swatch` styles (fixed size, border, cursor).
- Add `.swimlane-tag-palette` styles for the preset color grid.
- Add `.swimlane-tag-color-popover` styles (positioned, z-index, shadow).

## Files Modified

| File | Changes |
|------|---------|
| `src/main.ts` | Remove `colorTagsByName`, add `tagColorRules` to settings, `TagColorResolver` class, migration, settings UI with rule list/color picker/reordering |
| `src/swimlane-card.ts` | Remove `tagHue`, `tagColorScheme`, add `resolveTagColor` usage, `contrastingText` helper |
| `src/swimlane-card.test.ts` | Update tests for new color resolution |
| `src/swimlane-view.ts` | Wire `resolveTagColor` from plugin, remove `tagColorScheme`, pass resolver to `renderTagEditor` |
| `src/swimlane-view.test.ts` | Update mock plugin |
| `styles.css` | Remove `--colored` styles, add settings UI styles |

## Edge Cases

- **Empty rules list:** All tags use Obsidian default styling.
- **Empty pattern:** Matches nothing (ignored during evaluation).
- **Duplicate patterns:** Both kept; last one wins per the ordering rule.
- **Invalid hex color:** Shouldn't happen (color picker constrains input), but if encountered, treat as no match.
- **Pattern with leading `#`:** Silently stripped on input.
- **Migration:** `colorTagsByName: true` → single catch-all gray rule.
