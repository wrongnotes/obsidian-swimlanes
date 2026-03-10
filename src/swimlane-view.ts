import { BasesEntry, BasesEntryGroup, BasesView, QueryController } from "obsidian"
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
} as const

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
            // Make card drops strongly favor swimlane lists when moving across columns,
            // while keeping in-column vertical precision tight.
            dropAreaHitboxAdjustments: [
                {
                    selector: ".swimlane-card-list",
                    // Extend horizontally for easy cross-column moves, and from above the header
                    // all the way to the bottom of the viewport.
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
        // groups from data that aren't in the configured order.
        const order = this.swimlaneOrder
        const orderedKeys =
            order.length > 0
                ? [...order, ...[...groupByKey.keys()].filter(k => !order.includes(k))]
                : [...groupByKey.keys()]

        const rankProp = this.rankProp
        const cardOptions: Omit<CardRenderOptions, "rank"> = {
            rankPropId: this.rankPropId,
            properties: this.cardPropertyAliases,
            showIcons: this.showPropertyIcons,
            imagePropId: this.imagePropId,
        }

        for (const groupKey of orderedKeys) {
            const group = groupByKey.get(groupKey) ?? null
            const label = groupKey || "(No value)"
            const col = board.createDiv({ cls: "swimlane-column" })
            col.dataset.groupKey = groupKey

            const header = col.createDiv({ cls: "swimlane-column-header" })
            header.createSpan({ text: label })
            header.createSpan({
                cls: "swimlane-column-count",
                text: String(group?.entries.length ?? 0),
            })

            const cardList = col.createDiv({ cls: "swimlane-card-list" })
            this.cardDnd.registerDropArea(cardList, { groupKey })
            this.swimlaneDnd.registerDraggable(col, { groupKey })

            for (const entry of this.sortEntries(group?.entries ?? [])) {
                const rank = getFrontmatter<string>(this.app, entry.file, rankProp) ?? ""
                const card = renderCard(cardList, entry, this.app, { ...cardOptions, rank })
                this.cardDnd.registerDraggable(card, { path: entry.file.path, groupKey })
            }
        }
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

    private handleSwimlaneDrop(dragState: SwimlaneDragState, position: GroupKey | null): void {
        const newOrder = reorderKeys(this.swimlaneOrder, dragState.groupKey, position)
        this.config.set(CONFIG_KEYS.swimlaneOrder, newOrder)
    }
}
