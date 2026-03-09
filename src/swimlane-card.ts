import type { App, BasesPropertyId, Value } from "obsidian"
import type { BasesEntry } from "obsidian"
import {
    BooleanValue,
    DateValue,
    LinkValue,
    ListValue,
    NullValue,
    NumberValue,
    StringValue,
    TagValue,
    setIcon,
} from "obsidian"
import { getFrontmatter } from "./utils"

export interface CardPropertyAlias {
    /** The BasesPropertyId to read (e.g. "note.priority", "file.mtime"). */
    propId: BasesPropertyId
    /**
     * Label shown on the chip.
     * Empty string → derive from propId (strips the type prefix: "note.priority" → "priority").
     */
    alias: string
}

/** Derive a display label from a BasesPropertyId: "note.priority" → "priority". */
export function propLabel(propId: BasesPropertyId, alias: string): string {
    if (alias) {
        return alias
    }
    const dotIdx = propId.indexOf(".")
    return dotIdx === -1 ? propId : propId.slice(dotIdx + 1)
}

function getIconForValue(propId: BasesPropertyId, value: Value): string {
    if (propId.startsWith("file.")) {
        switch (propId.slice(5)) {
            case "name":
            case "path":
            case "folder":
                return "file"
            case "ext":
            case "extension":
                return "file-type"
            case "size":
                return "hard-drive"
            case "ctime":
            case "mtime":
                return "calendar"
            case "tags":
                return "tags"
            case "links":
            case "backlinks":
                return "link"
            default:
                return "file"
        }
    }
    if (value instanceof DateValue) {
        return "calendar"
    }
    if (value instanceof NumberValue) {
        return "hash"
    }
    if (value instanceof BooleanValue) {
        return "check-square"
    }
    if (value instanceof ListValue) {
        return "list"
    }
    if (value instanceof LinkValue) {
        return "link"
    }
    if (value instanceof TagValue) {
        return "tag"
    }
    if (value instanceof StringValue) {
        return "type"
    }
    return "text"
}

function formatValue(value: Value): string {
    if (value instanceof BooleanValue) {
        return value.isTruthy() ? "Yes" : "No"
    }
    return value.toString()
}

/**
 * Render a swimlane card into `container`.
 * Returns the created card element.
 * @param rankOverride - If provided, used for dataset[rankProp]; otherwise rank is read from frontmatter.
 */
export function renderCard(
    container: HTMLElement,
    entry: BasesEntry,
    rankProp: string,
    propertyConfigs: CardPropertyAlias[],
    app: App,
    rankOverride?: string,
    showIcons = true,
): HTMLElement {
    const rank =
        rankOverride !== undefined
            ? rankOverride
            : (getFrontmatter<string>(app, entry.file, rankProp) ?? "")

    const card = container.createDiv({ cls: "swimlane-card" })
    card.dataset.path = entry.file.path
    card.dataset[rankProp] = rank

    card.createDiv({ cls: "swimlane-card-title", text: entry.file.basename })

    if (propertyConfigs.length > 0) {
        const rows: { icon: string; label: string; value: string }[] = []
        for (const cfg of propertyConfigs) {
            const value = entry.getValue(cfg.propId)
            if (value === null || value instanceof NullValue) {
                continue
            }
            rows.push({
                icon: getIconForValue(cfg.propId, value),
                label: propLabel(cfg.propId, cfg.alias),
                value: formatValue(value),
            })
        }
        if (rows.length > 0) {
            const table = card.createEl("table", { cls: "swimlane-card-props" })
            const tbody = table.createEl("tbody")
            for (const { icon, label, value } of rows) {
                const tr = tbody.createEl("tr")
                const labelTd = tr.createEl("td", { cls: "swimlane-card-prop-label" })
                const labelInner = labelTd.createSpan({ cls: "swimlane-card-prop-label-inner" })
                if (showIcons) {
                    const iconSpan = labelInner.createSpan({ cls: "swimlane-card-prop-icon" })
                    setIcon(iconSpan, icon)
                }
                labelInner.createSpan({ text: label })
                tr.createEl("td", { cls: "swimlane-card-prop-value", text: value })
            }
        }
    }

    return card
}
