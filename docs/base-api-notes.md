# Base Plugin API — Spike Notes

_Research completed 2026-03-08. Source: Obsidian official API types (`obsidian.d.ts`), official dev docs, and community plugin source code reviewed during the spike._

---

## Key Architectural Finding

**The swimlane is NOT a standalone workspace tab.** It registers as a custom _view type_ inside the Bases system. The user opens any `.base` file, then selects "Swimlane" from the view-type switcher in the Bases toolbar. Obsidian hands our plugin the data and calls us when it changes.

This changes the product plan in a few important ways — see the [Architecture Impact](#architecture-impact) section.

---

## API Surface (public since Obsidian 1.10.0)

### 1. Registration

```typescript
// In Plugin.onload():
this.registerBasesView("swimlane", {
    name: "Swimlane",
    icon: "lucide-kanban",
    factory: (controller, containerEl) => new SwimlaneView(controller, containerEl, this),
    options: () => SwimlaneView.getViewOptions(), // exposes config fields to Bases toolbar
})
```

- `viewId` must be globally unique across all plugins.
- Returns `true` if registration succeeded (fails if the id is already taken).

---

### 2. `BasesView` — the class to extend

```typescript
abstract class BasesView extends Component {
    abstract type: string // must match the viewId above
    app: App // full Obsidian App
    config: BasesViewConfig // per-view persistent config
    allProperties: BasesPropertyId[] // all properties in the dataset
    data: BasesQueryResult // current result set (replaced on each update)

    protected constructor(controller: QueryController)

    abstract onDataUpdated(): void // called by Obsidian whenever data changes
}
```

**`onDataUpdated()`** is the reactive hook. Obsidian calls this whenever:

- A file in the Base's scope is created, modified, or deleted
- The Base configuration (filters, sort, groupBy) changes

No polling needed. ✓

---

### 3. `BasesQueryResult` — the data object

```typescript
class BasesQueryResult {
  data: BasesEntry[];              // flat, sorted list
  get groupedData(): BasesEntryGroup[]; // grouped by user's "Group by" config
  get properties(): BasesPropertyId[]; // user-visible property IDs (from Properties toolbar)
  getSummaryValue(...): Value;
}
```

**Use `groupedData` for columns.** Each group is one Kanban column. If the user hasn't set a "Group by", `groupedData` returns a single group with an empty key — we should detect this and prompt the user to configure it.

`this.data` is replaced with a new object on each `onDataUpdated()` call. **Do not hold references to old data or entries across renders.**

---

### 4. `BasesEntryGroup` — one column's data

```typescript
class BasesEntryGroup {
    key?: Value // the group-by value (e.g. StringValue("In Progress"))
    entries: BasesEntry[] // cards in this column
    hasKey(): boolean // false when key is NullValue (the "no value" group)
}
```

---

### 5. `BasesEntry` — one card

```typescript
class BasesEntry implements FormulaContext {
    file: TFile // the underlying note
    getValue(propertyId: BasesPropertyId): Value | null // evaluated property value
}
```

`getValue` evaluates formulas too (not just raw frontmatter). Returns `null` if the property doesn't exist in this entry's context.

---

### 6. `BasesPropertyId` — property identity

```typescript
type BasesPropertyType = "note" | "formula" | "file"
type BasesPropertyId = `${BasesPropertyType}.${string}`
```

Examples:
| ID | Meaning |
|---|---|
| `note.status` | `status:` frontmatter field |
| `note.rank` | `rank:` frontmatter field |
| `file.name` | note filename (no extension) |
| `file.mtime` | last modified time |
| `formula.priority` | a formula defined in the `.base` file |

---

### 7. `BasesViewConfig` — per-view persistent storage

```typescript
class BasesViewConfig {
    name: string // user-editable view name
    get(key: string): unknown // read a stored value
    set(key: string, value: any | null): void // write a value (stored in .base file)
    getOrder(): BasesPropertyId[] // user-configured visible property order
    getSort(): Array<{ property: BasesPropertyId; direction: "ASC" | "DESC" }> // sort config
    getAsPropertyId(key: string): BasesPropertyId | null
    getEvaluatedFormula(view: BasesView, key: string): Value
}
```

`set` / `get` store arbitrary data **inside the `.base` file** alongside the view definition. This is how per-view config (like our column order and LexoRank property name) persists.

---

### 8. `ViewOption` — config fields surfaced in the Bases toolbar

```typescript
type ViewOption =
    | BasesTextOption // { type: 'text', key, displayName, default, placeholder, shouldHide? }
    | BasesDropdownOption // { type: 'dropdown', key, displayName, options: Record<string,string> }
    | BasesPropertyOption // { type: 'property', key, displayName, filter? }
    | BasesCheckboxOption
    | BasesSliderOption
    | BasesFileOption
    | BasesFolderOption
    | BasesFormulaOption
```

Options returned from `BasesViewRegistration.options()` appear as controls in the Bases view config panel. Values are read via `this.config.get(key)`.

---

### 9. Write-back (updating frontmatter)

No special Bases API for writes — use the standard Obsidian file manager:

```typescript
await this.app.fileManager.processFrontMatter(entry.file, fm => {
    fm["status"] = "In Progress" // move card to column
    fm["rank"] = "0|hzzzzz:" // update LexoRank
})
```

`processFrontMatter` is atomic and handles YAML encoding. Obsidian's file watcher then triggers `onDataUpdated()` automatically, so the board re-renders.

---

### 10. Creating a new note from the board

```typescript
// Detect status property name by matching group key to frontmatter values
const content = `---\n${statusPropName}: ${columnValue}\nrank: ${initialRank}\n---\n\n`
const file = await this.app.vault.create(folderPath + "/" + noteName + ".md", content)
await this.app.workspace.getLeaf().openFile(file)
```

For our inline-create UX, we skip the modal: the user types a title inline and presses Enter.

---

### 11. Detecting the "groupBy" property name

Bases exposes grouped data but does **not** directly tell the plugin which property was used as the groupBy key. The ewerx reference impl detects it by:

1. Finding a group with a known key value
2. Scanning the file's frontmatter (via `app.metadataCache.getFileCache(entry.file)?.frontmatter`) to find a field whose string value matches the key

```typescript
private detectGroupByProperty(groups: BasesEntryGroup[]): string | null {
  const groupWithKey = groups.find(g => g.hasKey() && g.entries.length > 0);
  if (!groupWithKey?.key) return null;
  const keyStr = groupWithKey.key.toString();
  const entry = groupWithKey.entries[0];
  const fm = this.app.metadataCache.getFileCache(entry.file)?.frontmatter;
  if (!fm) return null;
  for (const [propName, propValue] of Object.entries(fm)) {
    if (propName === 'position') continue;
    if (String(propValue) === keyStr) return propName;
  }
  return null;
}
```

Limitation: fails if the first matching entry has no frontmatter or if two fields happen to have the same value. Edge case; acceptable for v1.

---

## Value Types

```typescript
// Import from 'obsidian'
;(StringValue,
    NumberValue,
    BooleanValue,
    DateValue,
    ListValue,
    LinkValue,
    TagValue,
    NullValue,
    ErrorValue)
```

Usage:

```typescript
const value = entry.getValue("note.status")
if (value === null || value instanceof NullValue) {
    /* no value */
}
value.toString() // string representation
value.isEmpty() // boolean
Value.renderTo(value, containerEl) // render with Obsidian's built-in renderer
```

---

## Architecture Impact on Product Plan

| Product Plan Decision                        | Revised Understanding                                                                                                                                                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Dedicated workspace leaf (command palette)" | **Changed**: swimlane is a view _within_ a `.base` file, not a standalone tab. User opens a `.base` file and selects "Swimlane" view type.                                                                                               |
| "Column definition in plugin settings panel" | **Changed**: columns = Base's "Group by" configuration. The user sets "Group by: status" in the Bases toolbar. We persist column _order_ via `config.set('columnOrder', ...)`. No separate settings panel needed for column definitions. |
| "Per-database config stored in plugin data"  | **Changed**: config is stored by `BasesViewConfig.set/get` inside the `.base` file itself. This is actually better — per-base-file config, not per-database.                                                                             |
| "Reactive updates — does Base emit events?"  | **Confirmed**: yes. `onDataUpdated()` is called automatically. No polling.                                                                                                                                                               |
| "Can we write property values back?"         | **Confirmed**: yes, via `app.fileManager.processFrontMatter`.                                                                                                                                                                            |
| Add new card "inline"                        | Still valid. We create a note with the column's status value pre-filled in frontmatter.                                                                                                                                                  |
| Ribbon icon + command palette                | We can still add a command "Open Base file as Swimlane" as a convenience.                                                                                                                                                                |

---

## LexoRank Implementation Notes

The ewerx reference plugin uses simple integer renumbering (1, 2, 3, ...) rather than LexoRank. We want true LexoRank for efficient single-card reorders.

**Storage**: A `rank` property in the note's frontmatter (e.g. `rank: "0|hzzzzz:"`). This is a visible property in Base — we should prefix or name it clearly (e.g. `_swimlane_rank`) to signal it's plugin-managed, or expose a `BasesPropertyOption` view option letting the user pick which property to use as the rank field.

**LexoRank string format**: `<bucket>|<rank>:` where bucket is 0/1/2 (for rebalancing). A minimal implementation:

- Ranks are base-36 strings padded to a fixed length
- Insert between two ranks: find the midpoint string
- When gap is exhausted, rebalance the bucket

The `lexorank` npm package provides this out of the box. At ~3KB minified it's acceptable for our bundle.

---

## Existing Community Plugins

Several community plugins already use the Bases view API. Reviewing their source code during the spike confirmed the patterns documented above. See `memory/references.md` for details.

---

## Open Questions — Resolved vs Outstanding

| Question                                | Status                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| How to read records from Base?          | ✅ `this.data.groupedData` / `entry.getValue()`                                                                                            |
| Can we write property values back?      | ✅ `app.fileManager.processFrontMatter`                                                                                                    |
| Does Base emit change events?           | ✅ `onDataUpdated()` is the reactive callback                                                                                              |
| How is config stored?                   | ✅ `BasesViewConfig.set/get` → stored in `.base` file                                                                                      |
| How to enumerate all Base files?        | ✅ `app.vault.getFiles().filter(f => f.extension === 'base')`                                                                              |
| LexoRank storage field name             | ⚠️ Needs UX decision: auto-detect (`rank`), user-configurable, or fixed `_rank`                                                            |
| GroupBy property detection robustness   | ⚠️ Current heuristic can fail on edge cases — consider exposing a `BasesPropertyOption` for the user to explicitly set the status property |
| Filter/search UI (not in Bases toolbar) | ⚠️ We must build our own filter/search bar within the view container; Bases only manages its own toolbar                                   |
| Saved filter presets storage            | ⚠️ Store via `config.set` in the `.base` file, or in plugin `data.json`?                                                                   |
