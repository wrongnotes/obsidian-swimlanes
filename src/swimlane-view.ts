import { BasesEntry, BasesEntryGroup, BasesView, QueryController } from "obsidian"
import type { MultitextOption, TextOption, ViewOption } from "obsidian"
import { DragAndDropContext } from "./drag-drop"
import { LexorankPosition, midRank } from "./lexorank"
import { getFrontmatter } from "./utils"
import type SwimlanePlugin from "./main"

/** Context we pass when registering a drop area; same shape is received in onDrop. */
interface SwimlaneDropContext {
    groupKey: string
}

const CONFIG_KEYS = {
    swimlaneOrder: "swimlaneOrder",
    swimlaneProperty: "swimlaneProperty",
    rankProperty: "rankProperty",
} as const

export class SwimlaneView extends BasesView {
    type = "swimlane"

    private boardEl: HTMLElement
    private plugin: SwimlanePlugin
    private dnd: DragAndDropContext<SwimlaneDropContext, LexorankPosition>

    constructor(controller: QueryController, containerEl: HTMLElement, plugin: SwimlanePlugin) {
        super(controller)
        this.boardEl = containerEl
        this.plugin = plugin
        this.dnd = new DragAndDropContext<SwimlaneDropContext, LexorankPosition>({
            draggableSelector: ".swimlane-card",
            dropIndicatorClass: "swimlane-drop-indicator",
            draggableIdAttribute: "path",
            draggingClass: "is-dragging",
            containerDraggingClass: "is-board-dragging",
            dragCloneClass: "drag-clone",
            hiddenClass: "is-drag-hidden",
            getDropTarget: this.getDropTarget,
            positionsEqual: (a, b) => a.beforeRank === b.beforeRank && a.afterRank === b.afterRank,
            onDrop: this.handleDrop,
        })
        this.dnd.registerContainer(containerEl)
    }

    static getViewOptions(): ViewOption[] {
        return [
            {
                type: "text",
                key: CONFIG_KEYS.swimlaneProperty,
                displayName: "Swimlane property",
                placeholder: "status",
            } satisfies TextOption,
            {
                type: "multitext",
                key: CONFIG_KEYS.swimlaneOrder,
                displayName: "Swimlane order",
            } satisfies MultitextOption,
            {
                type: "text",
                key: CONFIG_KEYS.rankProperty,
                displayName: "Rank property",
                placeholder: "rank",
            } satisfies TextOption,
        ]
    }

    private get rankProp(): string {
        const val = this.config.get(CONFIG_KEYS.rankProperty)
        return typeof val === "string" && val ? val : "rank"
    }

    private get statusProp(): string {
        const val = this.config.get(CONFIG_KEYS.swimlaneProperty)
        return typeof val === "string" && val ? val : "status"
    }

    private get columnOrder(): string[] {
        const val = this.config.get(CONFIG_KEYS.swimlaneOrder)
        return Array.isArray(val) ? (val as string[]).filter(v => typeof v === "string") : []
    }

    onUnload(): void {
        this.dnd.destroy()
    }

    onDataUpdated(): void {
        if (this.dnd.isDragging) {
            return
        }
        this.dnd.flushDrag()
        this.boardEl.empty()

        const groups = this.data.groupedData
        const hasGroups = groups.some(g => g.hasKey())

        if (!hasGroups) {
            const msg = 'Set a "Group by" property in the Bases toolbar to use the Swimlane view.'
            this.boardEl.createEl("p", { cls: "swimlane-empty", text: msg })
            return
        }

        // Auto-populate swimlaneOrder from observed group keys when it hasn't been configured.
        if (this.columnOrder.length === 0) {
            const keys = groups
                .filter(g => g.hasKey())
                .map(g => g.key?.toString() ?? "")
                .filter(Boolean)
            if (keys.length > 0) {
                this.config.set(CONFIG_KEYS.swimlaneOrder, keys)
            }
        }

        const board = this.boardEl.createDiv({ cls: "swimlane-board" })
        this.dnd.initDropIndicator(board)
        this.dnd.clearDropAreas()

        const orderedGroups = this.sortGroups(groups)

        for (const group of orderedGroups) {
            const groupKey = group.hasKey() ? (group.key?.toString() ?? "") : ""
            const label = group.hasKey() ? (group.key?.toString() ?? "") : "(No value)"
            const col = board.createDiv({ cls: "swimlane-column" })

            const header = col.createDiv({ cls: "swimlane-column-header" })
            header.createSpan({ text: label })
            header.createSpan({ cls: "swimlane-column-count", text: String(group.entries.length) })

            const cardList = col.createDiv({ cls: "swimlane-card-list" })
            this.dnd.registerDropArea(cardList, { groupKey })

            const orderedEntries = this.sortEntries(group.entries)

            for (const entry of orderedEntries) {
                const rank = getFrontmatter<string>(this.app, entry.file, this.rankProp) ?? ""

                const card = cardList.createDiv({ cls: "swimlane-card" })
                card.dataset.path = entry.file.path
                card.dataset[this.rankProp] = rank
                card.createDiv({ cls: "swimlane-card-title", text: entry.file.basename })

                this.dnd.registerDraggable(card, { path: entry.file.path, groupKey })
            }
        }
    }

    private sortGroups(groups: BasesEntryGroup[]): BasesEntryGroup[] {
        const order = this.columnOrder
        if (order.length === 0) {
            return groups
        }
        return [...groups].sort((a, b) => {
            const aIdx = order.indexOf(a.key?.toString() ?? "")
            const bIdx = order.indexOf(b.key?.toString() ?? "")
            return (aIdx === -1 ? Infinity : aIdx) - (bIdx === -1 ? Infinity : bIdx)
        })
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

    private getDropTarget(
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

    private handleDrop(
        dragState: { path: string; groupKey: string },
        context: SwimlaneDropContext,
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
                fm[this.statusProp] = context.groupKey
            }
        })
    }
}
