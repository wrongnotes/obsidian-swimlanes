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
    tagColorRules: TagColorRule[]
}
```

Stored via `plugin.saveData()` / `plugin.loadData()`. The `colorTagsByName` setting is removed.

## Pattern Matching

Simple glob matching. `*` matches any sequence of characters (including empty). Matching is case-insensitive.

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
- **Access:** Views call `this.plugin.tagColorResolver.resolve(tag)`.

## Settings UI

The settings tab displays the tag color rules as a reorderable list.

### Rule Row

Each rule is a row containing:
1. **Drag handle** (or up/down buttons) for reordering
2. **Pattern input** — text field for the tag pattern
3. **Color swatch** — small colored square showing the current color, clickable
4. **Delete button** — removes the rule

### Color Picker Popover

Clicking a color swatch opens a popover with:
1. **Preset palette** — 8-10 fixed colors (chosen to look good in both light and dark themes) as clickable swatches. Clicking one selects it immediately.
2. **Custom color picker** — an `<input type="color">` for arbitrary hex colors.

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
- In tag chip rendering: call `resolveTagColor(tag)`. If it returns a hex string, set `background-color` and compute a contrasting text color. If null, use default Obsidian tag styling (no inline styles).
- Remove `.swimlane-card-tag--colored` class usage.
- Same logic applies in `renderTagEditor()` editable chips.

### Contrasting Text Color

Given a background hex color, compute whether black or white text has better contrast. Use relative luminance:

```ts
function contrastingText(hex: string): string {
    // Parse hex, compute luminance, return "#000" or "#fff"
}
```

### Changes to `swimlane-view.ts`

- Remove `tagColorScheme` from `cardOptions`.
- Add `resolveTagColor: (tag: string) => this.plugin.tagColorResolver.resolve(tag)` to `cardOptions`.

## CSS Changes

- Remove `.swimlane-card-tag--colored` and `.theme-dark .swimlane-card-tag--colored` selectors.
- Add `.swimlane-tag-color-rule` styles for the settings UI rows.
- Add `.swimlane-tag-palette` styles for the preset color swatches.

## Files Modified

| File | Changes |
|------|---------|
| `src/main.ts` | Remove `colorTagsByName`, add `tagColorRules` to settings, `TagColorResolver` class, settings UI with rule list/color picker/reordering |
| `src/swimlane-card.ts` | Remove `tagHue`, `tagColorScheme`, add `resolveTagColor` usage, `contrastingText` helper |
| `src/swimlane-card.test.ts` | Update tests for new color resolution |
| `src/swimlane-view.ts` | Wire `resolveTagColor` from plugin, remove `tagColorScheme` |
| `src/swimlane-view.test.ts` | Update mock plugin |
| `styles.css` | Remove `--colored` styles, add settings UI styles |

## Edge Cases

- **Empty rules list:** All tags use Obsidian default styling.
- **Empty pattern:** Matches nothing (ignored during evaluation).
- **Duplicate patterns:** Both kept; last one wins per the ordering rule.
- **Invalid hex color:** Shouldn't happen (color picker constrains input), but if encountered, treat as no match.
