import { BasesEntry, BasesEntryGroup, BasesView, Notice, QueryController, setIcon } from "obsidian"
import type {
    BasesPropertyId,
    MultitextOption,
    PropertyOption,
    TextOption,
    ToggleOption,
    ViewOption,
} from "obsidian"
import { DragAndDropContext } from "./drag-drop"
import { CardPropertyAlias, CardRenderOptions, renderCard } from "./swimlane-card"
import { LexorankPosition, midRank } from "./lexorank"
import { RmSwimlaneModal, AddSwimlaneViaDropModal, executeRmSwimlane } from "./migration-workflows"
import { getFrontmatter } from "./utils"
import type SwimlanePlugin from "./main"

/** Nominal type for swimlane column keys (the value of the swimlane property). */
declare const _groupKey: unique symbol
type GroupKey = string & { readonly [_groupKey]: void }

/** Context we pass when registering a card drop area; same shape is received in onDrop. */
interface CardDropContext {
    groupKey: GroupKey
}

/** State for a dragged card. */
interface CardDragState {
    path: string
    groupKey: GroupKey
}

/** State for a dragged column. */
interface SwimlaneDragState {
    groupKey: GroupKey
}

const CONFIG_KEYS = {
    swimlaneOrder: "swimlaneOrder",
    swimlaneProperty: "swimlaneProperty",
    rankProperty: "rankProperty",
    showPropertyIcons: "showPropertyIcons",
    imageProperty: "imageProperty",
    showAddCard: "showAddCard",
    showAddColumn: "showAddColumn",
    hiddenSwimlanes: "hiddenSwimlanes",
} as const

/** Sentinel groupKey used when a card is dropped onto the "Add column" button. */
const ADD_COLUMN_DROP_KEY = "__swimlane_add_column__" as GroupKey

function reorderKeys(
    keys: GroupKey[],
    dragKey: GroupKey,
    insertBeforeKey: GroupKey | null,
): GroupKey[] {
    const without = keys.filter(k => k !== dragKey)
    if (insertBeforeKey === null) {
        return [...without, dragKey]
    }
    const idx = without.indexOf(insertBeforeKey)
    without.splice(idx === -1 ? without.length : idx, 0, dragKey)
    return without
}

export class SwimlaneView extends BasesView {
    type = "swimlane"

    private boardEl: HTMLElement
    private plugin: SwimlanePlugin
    private cardDnd: DragAndDropContext<CardDragState, CardDropContext, LexorankPosition>
    private swimlaneDnd: DragAndDropContext<SwimlaneDragState, null, GroupKey | null>
    private pendingHighlight: { groupKey: GroupKey; expiry: number } | null = null

    constructor(controller: QueryController, containerEl: HTMLElement, plugin: SwimlanePlugin) {
        super(controller)
        this.boardEl = containerEl
        this.plugin = plugin

        // Prevent Obsidian's scroll container from competing with the board's
        // own horizontal scroll. On iOS, nested scrollable elements cause the
        // browser to swallow touch gestures entirely.
        containerEl.setCssStyles({ overflow: "hidden" })

        this.cardDnd = new DragAndDropContext<CardDragState, CardDropContext, LexorankPosition>({
            draggableSelector: ".swimlane-card",
            draggableIdAttribute: "path",
            positionsEqual: (a, b) => a.beforeRank === b.beforeRank && a.afterRank === b.afterRank,
            getDropTarget: (el, x, y, d) => this.getCardDropTarget(el, x, y, d),
            onDrop: (state, context, position) => this.handleCardDrop(state, context, position),
            onDropSettle: () => {
                if (this.boardEl.isConnected) {
                    this.rebuildBoard()
                }
            },
            // Make card drops strongly favor swimlane lists when moving across columns,
            // while keeping in-column vertical precision tight.
            dropAreaHitboxAdjustments: [
                {
                    selector: ".swimlane-card-list",
                    // Extend from above the header all the way to the bottom of the
                    // viewport for easy cross-column moves.
                    margin: {
                        y: "fill",
                        x: 0,
                    },
                },
            ],
        })

        this.swimlaneDnd = new DragAndDropContext<SwimlaneDragState, null, GroupKey | null>({
            draggableSelector: ".swimlane-column",
            dragHandleSelector: ".swimlane-column-header",
            draggableIdAttribute: "groupKey",
            positionsEqual: (a, b) => a === b,
            getDropTarget: (el, x, y, c) => this.getSwimlaneDropTarget(el, x, y, c),
            onDrop: (state, _context, position) => this.handleSwimlaneDrop(state, position),
            onDropSettle: () => {
                if (this.boardEl.isConnected) {
                    this.rebuildBoard()
                }
            },
            dropAnimationMs: 80,
        })
    }

    static getViewOptions(): ViewOption[] {
        return [
            {
                type: "property",
                key: CONFIG_KEYS.swimlaneProperty,
                displayName: "Swimlane property",
            } satisfies PropertyOption,
            {
                type: "property",
                key: CONFIG_KEYS.imageProperty,
                displayName: "Image property",
            } satisfies PropertyOption,
            {
                type: "text",
                key: CONFIG_KEYS.rankProperty,
                displayName: "Rank property",
                default: "rank",
            } satisfies TextOption,
            {
                type: "toggle",
                key: CONFIG_KEYS.showPropertyIcons,
                displayName: "Show property icons",
                default: true,
            } satisfies ToggleOption,
            {
                type: "toggle",
                key: CONFIG_KEYS.showAddCard,
                displayName: "Show add card button",
                default: true,
            } satisfies ToggleOption,
            {
                type: "toggle",
                key: CONFIG_KEYS.showAddColumn,
                displayName: "Show add swimlane button",
                default: true,
            } satisfies ToggleOption,
            {
                type: "multitext",
                key: CONFIG_KEYS.swimlaneOrder,
                displayName: "Swimlane order",
                shouldHide: () => true, // swimlane order is managed by DnD, but persisted in view options
            } satisfies MultitextOption,
        ]
    }

    private get rankProp(): string {
        const val = this.config.get(CONFIG_KEYS.rankProperty)
        return typeof val === "string" && val ? val : "rank"
    }

    private get rankPropId(): BasesPropertyId {
        return `note.${this.rankProp}` as BasesPropertyId
    }

    private get swimlanePropId(): BasesPropertyId {
        return (
            this.config.getAsPropertyId(CONFIG_KEYS.swimlaneProperty) ??
            ("note.status" as BasesPropertyId)
        )
    }

    private get swimlaneProp(): string {
        return this.swimlanePropId.slice(this.swimlanePropId.indexOf(".") + 1)
    }

    private get swimlaneOrder(): GroupKey[] {
        const val = this.config.get(CONFIG_KEYS.swimlaneOrder)
        return Array.isArray(val)
            ? ((val as string[]).filter(v => typeof v === "string") as GroupKey[])
            : []
    }

    private get showPropertyIcons(): boolean {
        const val = this.config.get(CONFIG_KEYS.showPropertyIcons)
        return val !== false
    }

    private get imagePropId(): BasesPropertyId | undefined {
        const val = this.config.getAsPropertyId(CONFIG_KEYS.imageProperty)
        return val ?? undefined
    }

    private get showAddCard(): boolean {
        const val = this.config.get(CONFIG_KEYS.showAddCard)
        return val !== false
    }

    private get showAddColumn(): boolean {
        const val = this.config.get(CONFIG_KEYS.showAddColumn)
        return val !== false
    }

    private get hiddenSwimlanes(): Set<GroupKey> {
        const val = this.config.get(CONFIG_KEYS.hiddenSwimlanes)
        if (!Array.isArray(val)) {
            return new Set()
        }
        return new Set(val.filter((v): v is GroupKey => typeof v === "string"))
    }

    private setHiddenSwimlanes(hidden: Set<GroupKey>): void {
        this.config.set(CONFIG_KEYS.hiddenSwimlanes, [...hidden])
    }

    private get cardPropertyAliases(): CardPropertyAlias[] {
        // Properties from Bases (Properties toolbar). Labels come from property names or formulas.
        const excluded = new Set([this.rankPropId, this.swimlanePropId, "file.name"])
        return this.data.properties
            .filter(propId => !excluded.has(propId))
            .map(propId => ({ propId, alias: "" }))
    }

    onUnload(): void {
        this.cardDnd.destroy()
        this.swimlaneDnd.destroy()
    }

    onDataUpdated(): void {
        if (this.cardDnd.isDragging || this.swimlaneDnd.isDragging) {
            return
        }

        if (this.swimlaneDnd.isDropAnimating) {
            // config.set fires onDataUpdated nearly synchronously, so the column drop
            // animation hasn't had time to play. Wait for it to finish before flushing
            // and rebuilding, so the placeholder stays visible during the animation.
            setTimeout(() => {
                this.swimlaneDnd.flushDrag()
                if (this.boardEl.isConnected) {
                    this.rebuildBoard()
                }
            }, this.swimlaneDnd.animationMs)
            return
        }

        const wasCardDropAnimating = this.cardDnd.isDropAnimating
        this.cardDnd.flushDrag()

        // After a card drop, defer rebuild to the next frame so drop cleanup can paint first.
        if (wasCardDropAnimating) {
            requestAnimationFrame(() => {
                if (!this.boardEl.isConnected) {
                    return
                }
                this.rebuildBoard()
            })

            return
        }

        this.rebuildBoard()
    }

    private rebuildBoard(): void {
        this.boardEl.empty()

        const groups = this.data.groupedData
        const hasGroups = groups.some(g => g.hasKey())

        if (!hasGroups) {
            const msg = 'Set a "Group by" property in the Bases toolbar to use the Swimlane view.'
            this.boardEl.createEl("p", { cls: "swimlane-empty", text: msg })
            return
        }

        // Auto-populate swimlaneOrder from observed group keys when it hasn't been configured.
        if (this.swimlaneOrder.length === 0) {
            const keys = groups
                .filter(g => g.hasKey())
                .map(g => g.key?.toString() ?? "")
                .filter(Boolean) as GroupKey[]
            if (keys.length > 0) {
                this.config.set(CONFIG_KEYS.swimlaneOrder, keys)
            }
        }

        const board = this.boardEl.createDiv({ cls: "swimlane-board" })

        // Register DnD on the board div, NOT on Obsidian's scroll container (containerEl),
        // so touch scrolling on the outer container works normally.
        this.cardDnd.registerContainer(board)
        this.cardDnd.initDropIndicator(board)
        this.cardDnd.clearDropAreas()

        this.swimlaneDnd.registerContainer(board)
        this.swimlaneDnd.initDropIndicator(board)
        this.swimlaneDnd.clearDropAreas()
        this.swimlaneDnd.registerDropArea(board, null)

        // Build a map of groupKey → group for quick lookup.
        const groupByKey = new Map<GroupKey, BasesEntryGroup>()
        for (const group of groups) {
            if (group.hasKey()) {
                groupByKey.set((group.key?.toString() ?? "") as GroupKey, group)
            }
        }

        // Columns to render: all keys in swimlaneOrder (empty or not), then any
        // groups from data that aren't in the configured order. Skip hidden columns.
        const order = this.swimlaneOrder
        const hidden = this.hiddenSwimlanes
        const orderedKeys = (
            order.length > 0
                ? [...order, ...[...groupByKey.keys()].filter(k => !order.includes(k))]
                : [...groupByKey.keys()]
        ).filter(k => !hidden.has(k))

        const rankProp = this.rankProp
        const cardOptions: Omit<CardRenderOptions, "rank" | "getSwimlaneContext"> = {
            rankPropId: this.rankPropId,
            properties: this.cardPropertyAliases,
            showIcons: this.showPropertyIcons,
            imagePropId: this.imagePropId,
            swimlaneProp: this.swimlaneProp,
            highlightColumn: col => this.highlightColumn(col as GroupKey),
        }

        for (const groupKey of orderedKeys) {
            const group = groupByKey.get(groupKey) ?? null
            const label = groupKey || "(No value)"
            const col = board.createDiv({ cls: "swimlane-column" })
            col.dataset.groupKey = groupKey

            const header = col.createDiv({ cls: "swimlane-column-header" })
            header.createSpan({ text: label })
            const headerRight = header.createDiv({ cls: "swimlane-column-header-right" })
            headerRight.createSpan({
                cls: "swimlane-column-count",
                text: String(group?.entries.length ?? 0),
            })
            if (this.showAddColumn) {
                const removeBtn = headerRight.createSpan({
                    cls: "swimlane-column-remove",
                    attr: { "data-no-drag": "" },
                })
                setIcon(removeBtn, "x")
                removeBtn.addEventListener("click", e => {
                    e.stopPropagation()
                    this.removeColumn(board, groupKey, group?.entries.length ?? 0)
                })
            }

            const cardList = col.createDiv({ cls: "swimlane-card-list" })
            this.cardDnd.registerDropArea(cardList, { groupKey })
            this.swimlaneDnd.registerDraggable(col, { groupKey })

            for (const entry of this.sortEntries(group?.entries ?? [])) {
                const rank = getFrontmatter<string>(this.app, entry.file, rankProp) ?? ""
                const currentGroupKey = groupKey
                const card = renderCard(cardList, entry, this.app, {
                    ...cardOptions,
                    rank,
                    getSwimlaneContext: () => ({
                        columns: this.swimlaneOrder as string[],
                        currentSwimlane: currentGroupKey,
                    }),
                })
                this.cardDnd.registerDraggable(card, { path: entry.file.path, groupKey })
            }

            if (this.showAddCard) {
                this.renderAddCardButton(col, groupKey)
            }
        }

        if (this.showAddColumn) {
            this.renderAddColumnButton(board)
        }

        this.applyPendingHighlight()
    }

    private renderAddCardButton(columnEl: HTMLElement, groupKey: GroupKey): void {
        const btn = columnEl.createDiv({ cls: "swimlane-add-card-btn" })
        setIcon(btn.createSpan({ cls: "swimlane-add-card-icon" }), "plus")
        btn.createSpan({ text: "Add card" })
        btn.addEventListener("click", () => {
            btn.remove()
            this.renderAddCardInput(columnEl, groupKey)
        })
    }

    private renderAddCardInput(columnEl: HTMLElement, groupKey: GroupKey): void {
        const wrapper = columnEl.createDiv({ cls: "swimlane-add-card-wrapper" })
        const input = wrapper.createEl("input", {
            cls: "swimlane-add-card-input",
            attr: { type: "text", placeholder: "Card title…" },
        })
        input.focus()

        let settled = false
        const dismiss = () => {
            if (settled) {
                return
            }
            settled = true
            wrapper.remove()
            this.renderAddCardButton(columnEl, groupKey)
        }

        const commit = () => {
            if (settled) {
                return
            }
            const title = input.value.trim()
            if (!title) {
                dismiss()
                return
            }
            settled = true
            wrapper.remove()
            this.createCard(title, groupKey)
        }

        input.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault()
                commit()
            } else if (e.key === "Escape") {
                dismiss()
            }
        })
        input.addEventListener("blur", commit)
    }

    private async createCard(title: string, groupKey: GroupKey): Promise<void> {
        // Determine the rank: append after the last card in this column.
        const group = this.data.groupedData.find(
            g => g.hasKey() && (g.key?.toString() ?? "") === groupKey,
        )
        let lastRank: string | null = null
        if (group) {
            for (const entry of group.entries) {
                const r = getFrontmatter<string>(this.app, entry.file, this.rankProp)
                if (r && (lastRank === null || r > lastRank)) {
                    lastRank = r
                }
            }
        }
        const newRank = midRank(lastRank, null)
        const swimlaneProp = this.swimlaneProp
        const rankProp = this.rankProp

        // createFileForView does everything we want (folder resolution, frontmatter
        // processing) but has no option to suppress the "New note" popover at this
        // time, so we replicate the behavior manually with vault.create.
        // Use the parent folder of an existing entry to match the Base's configured
        // source folder. Fall back to the user's global new-file-location setting.
        const firstEntry = this.data.data[0]
        const folder = firstEntry?.file?.parent ?? this.app.fileManager.getNewFileParent("")
        const prefix = folder.isRoot() ? "" : folder.path + "/"
        let path = `${prefix}${title}.md`
        // Deduplicate: append a numeric suffix if the path is taken.
        let n = 1
        while (this.app.vault.getAbstractFileByPath(path)) {
            path = `${prefix}${title} ${++n}.md`
        }
        const file = await this.app.vault.create(path, "")
        await this.app.fileManager.processFrontMatter(file, fm => {
            fm[swimlaneProp] = groupKey
            fm[rankProp] = newRank
        })
    }

    private renderAddColumnButton(board: HTMLElement): void {
        const btn = board.createDiv({ cls: "swimlane-add-column-btn" })
        setIcon(btn.createSpan({ cls: "swimlane-add-column-icon" }), "plus")
        btn.createSpan({ text: "Add swimlane" })
        btn.addEventListener("click", () => {
            btn.remove()
            this.renderAddColumnInput(board)
        })
        this.cardDnd.registerDropArea(btn, { groupKey: ADD_COLUMN_DROP_KEY })
    }

    private renderAddColumnInput(board: HTMLElement): void {
        const wrapper = board.createDiv({ cls: "swimlane-add-column-input-wrapper" })
        const input = wrapper.createEl("input", {
            cls: "swimlane-add-column-input",
            attr: { type: "text", placeholder: "Swimlane name…" },
        })
        input.focus()

        let settled = false
        const dismiss = () => {
            if (settled) {
                return
            }
            settled = true
            wrapper.remove()
            this.renderAddColumnButton(board)
        }

        const commit = () => {
            if (settled) {
                return
            }
            const name = input.value.trim()
            if (!name) {
                dismiss()
                return
            }
            const key = name as GroupKey
            const order = this.swimlaneOrder
            if (order.includes(key)) {
                settled = true
                wrapper.remove()
                this.renderAddColumnButton(board)
                new Notice(`Swimlane "${name}" already exists.`)
                this.highlightColumn(key, true)
                return
            }
            settled = true
            wrapper.remove()
            this.config.set(CONFIG_KEYS.swimlaneOrder, [...order, key])
        }

        input.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault()
                commit()
            } else if (e.key === "Escape") {
                dismiss()
            }
        })
        input.addEventListener("blur", commit)
    }

    private hideColumn(groupKey: GroupKey): void {
        const hidden = this.hiddenSwimlanes
        hidden.add(groupKey)
        this.setHiddenSwimlanes(hidden)
    }

    private removeColumn(_board: HTMLElement, groupKey: GroupKey, entryCount: number): void {
        if (entryCount === 0) {
            const order = this.swimlaneOrder.filter(k => k !== groupKey)
            this.config.set(CONFIG_KEYS.swimlaneOrder, order)
            return
        }

        const group = this.data.groupedData.find(
            g => g.hasKey() && (g.key?.toString() ?? "") === groupKey,
        )
        const files = group?.entries.map(e => e.file) ?? []
        const otherColumns = this.swimlaneOrder.filter(k => k !== groupKey)

        new RmSwimlaneModal({
            app: this.app,
            columnName: groupKey,
            files,
            swimlaneProp: this.swimlaneProp,
            otherColumns,
            onConfirm: async op => {
                if (op.kind === "hide") {
                    this.hideColumn(groupKey)
                    return
                }
                await executeRmSwimlane(this.app, files, this.swimlaneProp, op)
                const order = this.swimlaneOrder.filter(k => k !== groupKey)
                this.config.set(CONFIG_KEYS.swimlaneOrder, order)
            },
        }).open()
    }

    /**
     * @param immediate If true, apply the highlight now. If false (default),
     * defer until the next rebuildBoard so the animation plays on fresh DOM.
     */
    highlightColumn(groupKey: GroupKey, immediate = false): void {
        this.pendingHighlight = { groupKey, expiry: Date.now() + 800 }
        if (immediate) {
            this.applyPendingHighlight()
        }
    }

    private applyPendingHighlight(): void {
        if (!this.pendingHighlight) {
            return
        }
        if (Date.now() > this.pendingHighlight.expiry) {
            this.pendingHighlight = null
            return
        }
        const { groupKey } = this.pendingHighlight
        const col = this.boardEl.querySelector(
            `.swimlane-column[data-group-key="${CSS.escape(groupKey)}"]`,
        ) as HTMLElement | null
        if (!col) {
            return
        }
        col.removeClass("swimlane-column--flash")
        void col.offsetWidth
        col.addClass("swimlane-column--flash")
        col.addEventListener(
            "animationend",
            () => {
                col.removeClass("swimlane-column--flash")
                this.pendingHighlight = null
            },
            { once: true },
        )
        col.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
    }

    private sortEntries(entries: BasesEntry[]): BasesEntry[] {
        return [...entries].sort((a, b) => {
            const ra = getFrontmatter<string>(this.app, a.file, this.rankProp) || null
            const rb = getFrontmatter<string>(this.app, b.file, this.rankProp) || null
            // Ranked cards before unranked; unranked cards stable-sorted by filename.
            if (ra && !rb) {
                return -1
            }
            if (!ra && rb) {
                return 1
            }
            if (ra && rb) {
                return ra < rb ? -1 : ra > rb ? 1 : 0
            }
            return a.file.basename.localeCompare(b.file.basename)
        })
    }

    private getCardDropTarget(
        dropAreaEl: HTMLElement,
        _clientX: number,
        clientY: number,
        draggables: HTMLElement[],
    ): {
        position: LexorankPosition
        placement: { refNode: Node | null; atStart: boolean; atEnd: boolean }
    } | null {
        const rankProp = this.rankProp
        const rankOf = (el: HTMLElement | undefined): string | null => el?.dataset[rankProp] || null

        if (draggables.length === 0) {
            return {
                position: { beforeRank: null, afterRank: null },
                placement: { refNode: dropAreaEl.firstChild, atStart: true, atEnd: true },
            }
        }
        for (let i = 0; i < draggables.length; i++) {
            const card = draggables[i]
            if (!card) {
                continue
            }
            const rect = card.getBoundingClientRect()
            if (clientY < rect.top + rect.height / 2) {
                return {
                    position: {
                        beforeRank: i > 0 ? rankOf(draggables[i - 1]) : null,
                        afterRank: rankOf(card),
                    },
                    placement: { refNode: card, atStart: i === 0, atEnd: false },
                }
            }
        }
        const last = draggables[draggables.length - 1]
        return {
            position: {
                beforeRank: rankOf(last),
                afterRank: null,
            },
            placement: { refNode: null, atStart: false, atEnd: true },
        }
    }

    private getSwimlaneDropTarget(
        dropAreaEl: HTMLElement,
        clientX: number,
        clientY: number,
        columns: HTMLElement[],
    ): {
        position: GroupKey | null
        placement: { refNode: Node | null; atStart: boolean; atEnd: boolean }
    } | null {
        for (let i = 0; i < columns.length; i++) {
            const col = columns[i]
            if (!col) {
                continue
            }
            const rect = col.getBoundingClientRect()
            if (clientX < rect.left + rect.width / 2) {
                return {
                    position: (col.dataset.groupKey ?? null) as GroupKey | null,
                    placement: { refNode: col, atStart: i === 0, atEnd: false },
                }
            }
        }
        return {
            position: null,
            placement: { refNode: null, atStart: false, atEnd: true },
        }
    }

    private handleCardDrop(
        dragState: CardDragState,
        context: CardDropContext,
        position: LexorankPosition,
    ): void {
        if (context.groupKey === ADD_COLUMN_DROP_KEY) {
            this.handleCardDropOnNewColumn(dragState)
            return
        }

        const file = this.app.vault.getFileByPath(dragState.path)
        if (!file) {
            return
        }
        const newRank = midRank(position.beforeRank, position.afterRank)

        this.app.fileManager.processFrontMatter(file, fm => {
            fm[this.rankProp] = newRank
            if (context.groupKey !== dragState.groupKey) {
                fm[this.swimlaneProp] = context.groupKey
            }
        })
    }

    private handleCardDropOnNewColumn(dragState: CardDragState): void {
        const file = this.app.vault.getFileByPath(dragState.path)
        if (!file) {
            return
        }

        const releaseDrop = this.cardDnd.holdDrop()

        const modal = new AddSwimlaneViaDropModal({
            app: this.app,
            swimlaneProp: this.swimlaneProp,
            existingColumns: this.swimlaneOrder as string[],
            onConfirm: columnName => {
                const key = columnName as GroupKey
                const order = this.swimlaneOrder
                if (!order.includes(key)) {
                    this.config.set(CONFIG_KEYS.swimlaneOrder, [...order, key])
                }
                this.app.fileManager.processFrontMatter(file, fm => {
                    fm[this.swimlaneProp] = columnName
                    fm[this.rankProp] = midRank(null, null)
                })
            },
        })

        const origOnClose = modal.onClose.bind(modal)
        modal.onClose = () => {
            origOnClose()
            releaseDrop()
        }

        modal.open()
    }

    private handleSwimlaneDrop(dragState: SwimlaneDragState, position: GroupKey | null): void {
        const newOrder = reorderKeys(this.swimlaneOrder, dragState.groupKey, position)
        this.config.set(CONFIG_KEYS.swimlaneOrder, newOrder)
    }
}
