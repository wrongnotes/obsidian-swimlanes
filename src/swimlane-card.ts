import type { App, BasesPropertyId, Value } from "obsidian"
import type { BasesEntry } from "obsidian"
import {
    BooleanValue,
    DateValue,
    LinkValue,
    ListValue,
    Menu,
    NullValue,
    NumberValue,
    StringValue,
    TagValue,
    setIcon,
} from "obsidian"

export interface CardPropertyAlias {
    /** The BasesPropertyId to read (e.g. "note.priority", "file.mtime"). */
    propId: BasesPropertyId
    /**
     * Label shown on the card.
     * Empty string → derive from propId (strips the type prefix: "note.priority" → "priority").
     */
    alias: string
}

export interface CardRenderOptions {
    rankPropId: BasesPropertyId
    rank: string
    properties: CardPropertyAlias[]
    showIcons: boolean
    imagePropId?: BasesPropertyId
    /** Width of the card image in pixels. Defaults to 64. */
    imageWidth?: number
    /** The frontmatter property used for swimlane grouping (e.g. "status"). */
    swimlaneProp: string
    /** Returns the current swimlane columns and this card's group key at call time. */
    getSwimlaneContext: () => { columns: string[]; currentSwimlane: string }
    /** Highlight a swimlane column on the board (scroll into view + flash). */
    highlightColumn: (column: string) => void
    /** When true, renders an inline menu button instead of relying on contextmenu. */
    mobile?: boolean
    /** Whether this card has pending scheduled automation actions. */
    hasScheduledActions?: boolean
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

function resolveImageUrl(app: App, rawValue: string, sourcePath: string): string | null {
    if (rawValue.startsWith("http://") || rawValue.startsWith("https://")) {
        return rawValue
    }
    const direct = app.vault.getFileByPath(rawValue)
    if (direct) {
        return app.vault.getResourcePath(direct)
    }
    const linked = app.metadataCache.getFirstLinkpathDest(rawValue, sourcePath)
    if (linked) {
        return app.vault.getResourcePath(linked)
    }
    return null
}

function formatValue(value: Value): string {
    if (value instanceof BooleanValue) {
        return value.isTruthy() ? "Yes" : "No"
    }
    return value.toString()
}

/** Render a swimlane card into `container` and return the created element. */
export function renderCard(
    container: HTMLElement,
    entry: BasesEntry,
    app: App,
    options: CardRenderOptions,
): HTMLElement {
    const { rankPropId, rank, properties, showIcons, imagePropId } = options
    // Dataset keys can't contain dots, so extract the raw property name from the BasesPropertyId.
    const rawRankProp = propLabel(rankPropId, "")

    const card = container.createDiv({ cls: "swimlane-card" })
    card.dataset.path = entry.file.path
    card.dataset[rawRankProp] = rank

    let imageUrl: string | null = null
    if (imagePropId) {
        const imageValue = entry.getValue(imagePropId)
        if (imageValue !== null && !(imageValue instanceof NullValue)) {
            imageUrl = resolveImageUrl(app, imageValue.toString(), entry.file.path)
        }
    }

    if (imageUrl) {
        const width = options.imageWidth ?? 64
        card.addClass("swimlane-card--has-image")
        const imageWrapper = card.createDiv({ cls: "swimlane-card-image-wrapper" })
        imageWrapper.setCssStyles({ width: `${width}px`, minWidth: `${width}px` })
        imageWrapper.createEl("img", { cls: "swimlane-card-image", attr: { src: imageUrl } })
    }

    const content = imageUrl ? card.createDiv({ cls: "swimlane-card-content" }) : card
    content.createDiv({ cls: "swimlane-card-title", text: entry.file.basename })

    if (options.hasScheduledActions) {
        const clockEl = content.createSpan({ cls: "swimlane-card-scheduled-icon" })
        setIcon(clockEl, "clock")
    }

    if (properties.length > 0) {
        const rows: { icon: string; label: string; value: string }[] = []
        for (const cfg of properties) {
            const value = entry.getValue(cfg.propId)
            if (value === null || !value.isTruthy()) {
                continue
            }
            rows.push({
                icon: getIconForValue(cfg.propId, value),
                label: propLabel(cfg.propId, cfg.alias),
                value: formatValue(value),
            })
        }
        if (rows.length > 0) {
            const table = content.createEl("table", { cls: "swimlane-card-props" })
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

    if (options.mobile) {
        const menuBtn = card.createDiv({
            cls: "swimlane-card-menu-btn",
            attr: { "data-no-drag": "" },
        })
        setIcon(menuBtn, "more-vertical")
        let openMenu: Menu | null = null
        let wasOpenOnPointerDown = false
        menuBtn.addEventListener("pointerdown", () => {
            wasOpenOnPointerDown = openMenu !== null
        })
        menuBtn.addEventListener("click", e => {
            e.stopPropagation()
            // The menu's outside-click handler fires between pointerdown
            // and click, clearing openMenu. Use the state captured at
            // pointerdown to know if this click should toggle closed.
            if (wasOpenOnPointerDown) {
                openMenu?.hide()
                openMenu = null
                return
            }
            const rect = menuBtn.getBoundingClientRect()
            openMenu = showCardMenu({ x: rect.right, y: rect.bottom }, entry, app, options)
            openMenu.register(() => {
                openMenu = null
            })
        })
    }

    card.addEventListener("contextmenu", e => {
        e.preventDefault()
        showCardMenu({ x: e.clientX, y: e.clientY }, entry, app, options)
    })

    return card
}

function showCardMenu(
    position: { x: number; y: number },
    entry: BasesEntry,
    app: App,
    options: CardRenderOptions,
): Menu {
    const menu = new Menu()

    menu.addItem(item => {
        item.setTitle("Open note")
            .setIcon("lucide-file-text")
            .onClick(() => {
                app.workspace.openLinkText(entry.file.path, "")
            })
    })

    const { columns, currentSwimlane } = options.getSwimlaneContext()

    menu.addItem(item => {
        item.setTitle("Move to").setIcon("lucide-arrow-right")
        // setSubmenu is undocumented but stable — returns a Menu to populate.
        const submenu: Menu = (item as any).setSubmenu()
        for (const col of columns) {
            submenu.addItem(sub => {
                sub.setTitle(col)
                    .setChecked(col === currentSwimlane)
                    .onClick(() => {
                        if (col !== currentSwimlane) {
                            app.fileManager.processFrontMatter(entry.file, fm => {
                                fm[options.swimlaneProp] = col
                            })
                        }
                        options.highlightColumn(col)
                    })
            })
        }
    })

    menu.addSeparator()

    menu.addItem(item => {
        item.setTitle("Delete card")
            .setIcon("lucide-trash-2")
            .setWarning(true)
            .onClick(() => {
                app.fileManager.trashFile(entry.file)
            })
    })

    menu.showAtPosition(position)
    return menu
}
