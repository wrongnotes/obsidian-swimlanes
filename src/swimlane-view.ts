import {
    BasesEntry,
    BasesEntryGroup,
    BasesView,
    Menu,
    Modal,
    Notice,
    parseYaml,
    Platform,
    QueryController,
    Setting,
    setIcon,
    stringifyYaml,
} from "obsidian"
import type {
    BasesPropertyId,
    MultitextOption,
    PropertyOption,
    TextOption,
    TFile,
    ToggleOption,
    ViewOption,
} from "obsidian"
import { DragAndDropContext } from "./drag-drop"
import { CardPropertyAlias, CardRenderOptions, renderCard, renderTagEditor } from "./swimlane-card"
import { LexorankPosition, midRank, generateSpacedRanks } from "./lexorank"
import { RmSwimlaneModal, AddSwimlaneViaDropModal, executeRmSwimlane } from "./migration-workflows"
import { getFrontmatter } from "./utils"
import type SwimlanePlugin from "./main"
import {
    matchRules,
    applyMutations,
    readAutomations,
    AutomationsModal,
    writeAutomations,
    addScheduledActions,
    cancelScheduledActions,
    readScheduledActions,
    writeScheduledActions,
} from "./automations"
import type {
    AutomationRule,
    FrontmatterMutation,
    MatchedMutation,
    PropertyInfo,
    ScheduledAction,
} from "./automations"
import { UndoManager, applyUndo, applyRedo } from "./undo"
import type { UndoOperation, UndoRedoContext } from "./undo"
import { SelectionManager } from "./selection-manager"
import { renderActionBar } from "./selection-action-bar"
import { batchMove, batchDelete, batchAddTag, batchRemoveTag } from "./batch-actions"
import type { BatchMoveCard } from "./batch-actions"
import { TagSuggest } from "./inputs/tag-suggest"

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
    collapsedSwimlanes: "collapsedSwimlanes",
    forceMobileLayout: "forceMobileLayout",
    imageWidth: "imageWidth",
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
    private unregisterSettingsListener: (() => void) | null = null
    private cardDnd: DragAndDropContext<CardDragState, CardDropContext, LexorankPosition>
    private swimlaneDnd: DragAndDropContext<SwimlaneDragState, null, GroupKey | null>
    private pendingHighlight: { groupKey: GroupKey; expiry: number } | null = null
    private currentBoard: HTMLElement | null = null
    private carouselObserver: IntersectionObserver | null = null
    /** When true, swipe is blocked until the finger returns to the column center. */
    private mobileSwipeNeedsReturn = false
    private mobileSwipeDwell: {
        direction: 1 | -1
        timer: ReturnType<typeof setTimeout> | null
        fallbackTimer: ReturnType<typeof setTimeout>
    } | null = null
    /** Recent clientX samples for horizontal velocity estimation. */
    private mobileSwipeXSamples: { x: number; t: number }[] = []
    private autoScrollRaf: number | null = null
    /** Column element highlighted as a drop target when in column-drop mode (sort ≠ rank). */
    private columnDropTarget: HTMLElement | null = null
    /** Source column element marked during drag in column-drop mode. */
    private columnDragSource: HTMLElement | null = null
    /** Placeholder holding the card's original slot in column-drop mode. */
    private columnDropPlaceholder: HTMLElement | null = null
    /** File path of a card that was just dropped cross-column; triggers expand animation on rebuild. */
    private expandingCardPath: string | null = null
    private automationRules: AutomationRule[] = []
    private baseFile: TFile | null = null
    /** Scroll positions saved at drop time, before frontmatter writes trigger rebuilds. */
    private savedScrollState: {
        column: GroupKey | null
        cardListScrollTops: Map<string, number>
        boardScrollTop: number
        boardScrollLeft: number
    } | null = null
    private editingTagsPath: string | null = null
    private editingTagsCardEl: HTMLElement | null = null
    private undoManager = new UndoManager()
    private selectionManager: SelectionManager
    private keydownHandler: ((e: KeyboardEvent) => void) | null = null
    private settingsDirty = false
    private dwellExpandTimer: ReturnType<typeof setTimeout> | null = null
    private dwellTimerGroupKey: GroupKey | null = null
    private dwellExpandedGroupKey: GroupKey | null = null
    private dwellExpandedColumnEl: HTMLElement | null = null
    private recollapseTimer: ReturnType<typeof setTimeout> | null = null

    constructor(controller: QueryController, containerEl: HTMLElement, plugin: SwimlanePlugin) {
        super(controller)
        this.boardEl = containerEl
        this.plugin = plugin
        this.selectionManager = new SelectionManager(this.undoManager, () =>
            this.onSelectionChanged(),
        )
        this.unregisterSettingsListener = plugin.onSettingsChanged(() => {
            if (this.boardEl.isConnected) {
                this.rebuildBoard()
            } else {
                this.settingsDirty = true
            }
        })
        // When the board is detached (e.g. settings modal open), settings changes
        // are deferred. Rebuild once the layout settles and the board reconnects.
        this.registerEvent(
            plugin.app.workspace.on("layout-change", () => {
                if (this.settingsDirty && this.boardEl.isConnected) {
                    this.settingsDirty = false
                    this.rebuildBoard()
                }
            }),
        )

        // The outer container handles horizontal scroll (so the scrollbar sits
        // at the viewport edge), while the inner board handles vertical scroll.
        // On iOS, nested scrollable elements cause the browser to swallow touch
        // gestures entirely, so on mobile both axes live on the inner board.
        containerEl.setCssStyles({ overflow: "hidden" })

        this.cardDnd = new DragAndDropContext<CardDragState, CardDropContext, LexorankPosition>({
            draggableSelector: ".swimlane-card",
            draggableIdAttribute: "path",
            positionsEqual: (a, b) =>
                a.dropIndex === b.dropIndex &&
                a.beforeRank === b.beforeRank &&
                a.afterRank === b.afterRank,
            getDropTarget: (el, x, y, d) => this.getCardDropTarget(el, x, y, d),
            onDrop: (state, context, position) => {
                this.handleCardDrop(state, context, position)
                if (this.dwellExpandedGroupKey) {
                    if (context.groupKey === this.dwellExpandedGroupKey) {
                        // Dropped into the dwell-expanded column — persist expansion
                        this.expandColumn(this.dwellExpandedGroupKey)
                    } else {
                        // Dropped elsewhere — recollapse
                        this.recollapseDwellExpanded()
                    }
                }
                this.clearDwellTimer()
                this.clearRecollapseTimer()
            },
            onDropSettle: () => {
                this.clearDwellTimer()
                this.clearRecollapseTimer()
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
                {
                    selector: ".swimlane-add-column-btn",
                    margin: {
                        y: "fill",
                        x: 0,
                    },
                },
            ],
            onDragStart: (state, draggable) => {
                if (!this.isSortedByRank) {
                    this.initColumnDropMode(state, draggable)
                }
            },
            onDropAnimate: (clone, dx, dy, durationMs) => {
                // In column-drop mode the indicator is display:none so dx/dy
                // point to 0,0. Animate towards the target column (cross-column)
                // or the placeholder (same-column / cancel).
                if (this.columnDropTarget) {
                    const from = clone.getBoundingClientRect()
                    const to = this.columnDropTarget.getBoundingClientRect()
                    dx = to.left + to.width / 2 - from.left - from.width / 2
                    dy = to.top + to.height / 3 - from.top
                } else if (this.columnDropPlaceholder) {
                    const from = clone.getBoundingClientRect()
                    const to = this.columnDropPlaceholder.getBoundingClientRect()
                    dx = to.left - from.left
                    dy = to.top - from.top
                }
                clone.style.transition = `transform ${durationMs}ms cubic-bezier(0.2, 0, 0, 1), opacity ${durationMs}ms ease`
                clone.style.transform = `translate(${dx}px, ${dy}px) rotate(0deg)`
                clone.addClass("swimlane-drag-clone--dropping")
            },
            onDragMove: (state, clientX, clientY) => {
                if (this.isMobileLayout) {
                    this.handleMobileDragSwipe(clientX)
                }
                this.handleDragAutoScroll(clientX, clientY)
                if (!this.isSortedByRank) {
                    this.clearColumnHighlightIfOutside(state, clientX, clientY)
                }
                this.checkDwellExpand(clientX, clientY)
            },
        })

        this.swimlaneDnd = new DragAndDropContext<SwimlaneDragState, null, GroupKey | null>({
            draggableSelector: ".swimlane-column",
            dragHandleSelector: ".swimlane-column-header",
            draggableIdAttribute: "groupKey",
            containerDraggingClass: "swimlane-drag-and-drop--column-active",
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

        // Listen for undo/redo keyboard shortcuts. We use a document-level
        // listener scoped to when our board is connected, so the user doesn't
        // need to click the board first. We check that focus isn't in an input.
        this.keydownHandler = (e: KeyboardEvent) => {
            if (!this.boardEl.isConnected) {
                return
            }
            const tag = (document.activeElement as HTMLElement)?.tagName
            if (tag === "INPUT" || tag === "TEXTAREA") {
                return
            }
            if (e.key === "Escape" && this.selectionManager.active) {
                if (!this.boardEl.querySelector(".swimlane-batch-tag-popover")) {
                    this.selectionManager.exit()
                    e.preventDefault()
                }
                return
            }
            const mod = Platform.isMacOS ? e.metaKey : e.ctrlKey
            const key = e.key.toLowerCase()
            if (mod && key === "z" && !e.shiftKey) {
                e.preventDefault()
                this.performUndo()
            } else if (mod && ((key === "z" && e.shiftKey) || key === "y")) {
                e.preventDefault()
                this.performRedo()
            }
        }
        document.addEventListener("keydown", this.keydownHandler)
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
                key: CONFIG_KEYS.imageWidth,
                displayName: "Image width (px)",
                default: "64",
            } satisfies TextOption,
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
                type: "toggle",
                key: CONFIG_KEYS.forceMobileLayout,
                displayName: "Force mobile layout (debug)",
                default: false,
                shouldHide: () => process.env.NODE_ENV === "production",
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

    /**
     * Returns all ranks in a column from the vault (unfiltered), sorted.
     * Used to find correct rank positions when Bases filters hide some cards.
     */
    private getAllColumnRanks(groupKey: GroupKey, excludePath?: string): string[] {
        const ranks: string[] = []
        const swimlaneProp = this.swimlaneProp
        const rankProp = this.rankProp
        for (const file of this.app.vault.getMarkdownFiles()) {
            if (excludePath && file.path === excludePath) {
                continue
            }
            const cache = this.app.metadataCache.getFileCache(file)
            const fm = cache?.frontmatter
            if (!fm) {
                continue
            }
            if (String(fm[swimlaneProp] ?? "") !== String(groupKey)) {
                continue
            }
            const rank = fm[rankProp]
            if (typeof rank === "string" && rank) {
                ranks.push(rank)
            }
        }
        return ranks.sort()
    }

    /**
     * Adjusts beforeRank/afterRank to account for hidden cards when filters
     * are active. Uses the drag direction to decide which side of the hidden
     * cards to place the dropped card:
     *
     * - Dragging UP (past the card above): hug the opposite side of the card
     *   you crossed → land AFTER the last hidden card in the gap.
     * - Dragging DOWN (past the card below): hug the opposite side →
     *   land BEFORE the first hidden card in the gap.
     *
     * Direction is determined by comparing the dragged card's current rank
     * against the drop position's beforeRank.
     */
    private adjustRanksForHiddenCards(
        beforeRank: string | null,
        afterRank: string | null,
        groupKey: GroupKey,
        draggedPath: string,
    ): { beforeRank: string | null; afterRank: string | null } {
        const ranks = this.getAllColumnRanks(groupKey, draggedPath)
        if (ranks.length === 0) {
            return { beforeRank, afterRank }
        }

        // Determine drag direction from the dragged card's current rank.
        const draggedFile = this.app.vault.getFileByPath(draggedPath)
        const draggedRank = draggedFile
            ? ((this.app.metadataCache.getFileCache(draggedFile)?.frontmatter?.[this.rankProp] as
                  | string
                  | undefined) ?? null)
            : null
        // movingUp = dragging toward the start of the list (lower ranks)
        const movingUp = draggedRank !== null && beforeRank !== null && draggedRank > beforeRank

        if (beforeRank !== null && afterRank !== null) {
            // Collect hidden cards between the visible before and after.
            const hidden = ranks.filter(r => r > beforeRank && r < afterRank)
            if (hidden.length === 0) {
                return { beforeRank, afterRank }
            }
            if (movingUp) {
                // Dragging up → hug the afterRank side → after last hidden card
                return { beforeRank: hidden[hidden.length - 1]!, afterRank }
            } else {
                // Dragging down → hug the beforeRank side → before first hidden card
                return { beforeRank, afterRank: hidden[0]! }
            }
        } else if (beforeRank !== null) {
            // Dropping at the end (dragging down past last visible card).
            // Hug the beforeRank side → place before any hidden cards after the last visible.
            const hidden = ranks.filter(r => r > beforeRank)
            if (hidden.length > 0) {
                return { beforeRank, afterRank: hidden[0]! }
            }
            return { beforeRank, afterRank: null }
        } else if (afterRank !== null) {
            // Dropping at the start (dragging up past first visible card).
            // Hug the afterRank side → place after any hidden cards before the first visible.
            const hidden = ranks.filter(r => r < afterRank)
            if (hidden.length > 0) {
                return { beforeRank: hidden[hidden.length - 1]!, afterRank }
            }
            return { beforeRank: null, afterRank }
        }
        return { beforeRank, afterRank }
    }

    private get isSortedByRank(): boolean {
        const sort = this.config.getSort()
        if (sort.length === 0) {
            return true
        }
        return sort[0]!.property === this.rankPropId
    }

    /**
     * Write a rank sort directly into the `.base` file.
     * `config.set` cannot modify the built-in `sort` field (it's managed
     * by Obsidian's sort toolbar), so we modify the file content instead.
     */
    private setSortByRank(): void {
        const file = this.app.workspace.getActiveFile()
        if (!file || file.extension !== "base") {
            return
        }
        const previousSort = this.config
            .getSort()
            .map(s => ({ property: String(s.property), direction: String(s.direction) }))
        const newSort = [{ property: String(this.rankPropId), direction: "ASC" }]
        const ownTransaction = !this.undoManager.hasActiveTransaction
        if (ownTransaction) {
            this.undoManager.beginTransaction("Set sort")
        }
        this.undoManager.pushOperation({ type: "SetSort", previousSort, newSort })
        const viewName = this.config.name
        const rankPropId = this.rankPropId
        this.app.vault.process(file, content => {
            const config = parseYaml(content)
            if (!config?.views || !Array.isArray(config.views)) {
                return content
            }
            const view = config.views.find(
                (v: Record<string, unknown>) => v.name === viewName && v.type === "swimlane",
            )
            if (!view) {
                return content
            }
            view.sort = [{ property: rankPropId, direction: "ASC" }]
            return stringifyYaml(config)
        })
        if (ownTransaction) {
            this.undoManager.endTransaction()
        }
    }

    /**
     * Write the groupBy field into the `.base` file view config,
     * setting it to the configured swimlane property.
     */
    private setGroupBy(): void {
        const file = this.app.workspace.getActiveFile()
        if (!file || file.extension !== "base") {
            return
        }
        const viewName = this.config.name
        const swimlanePropId = this.swimlanePropId
        this.app.vault.process(file, content => {
            const config = parseYaml(content)
            if (!config?.views || !Array.isArray(config.views)) {
                return content
            }
            const view = config.views.find(
                (v: Record<string, unknown>) => v.name === viewName && v.type === "swimlane",
            )
            if (!view) {
                return content
            }
            view.groupBy = { property: String(swimlanePropId), direction: "ASC" }
            return stringifyYaml(config)
        })
    }

    private openAutomationsModal(): void {
        if (!this.baseFile) {
            return
        }
        const baseFile = this.baseFile
        const modal = new AutomationsModal({
            app: this.app,
            rules: [...this.automationRules],
            swimlanes: this.swimlaneOrder as string[],
            swimlaneProp: this.swimlaneProp,
            properties: this.getPropertyInfos(),
            onSave: rules => {
                this.automationRules = rules
                this.app.vault.process(baseFile, content => writeAutomations(content, rules))
            },
        })
        modal.open()
    }

    /**
     * Inject an "Automations" button into the Bases toolbar (the header bar
     * managed by Obsidian with Sort, Filter, Properties, etc.). We traverse
     * up from containerEl to find `.bases-toolbar` and insert before the
     * "New" button. Replaces any previously injected button on rebuild.
     */
    private onSelectionChanged(): void {
        this.rebuildBoard()
    }

    private injectBasesToolbarButton(): void {
        const basesToolbar = this.boardEl.parentElement?.querySelector(".bases-toolbar")
        if (!basesToolbar) {
            return
        }

        // Remove any previously injected button (from a prior rebuild).
        basesToolbar.querySelector(".swimlane-automations-btn")?.remove()

        // Hide the "New" button — card creation is handled by the swimlane view.
        const newBtn = basesToolbar.querySelector<HTMLElement>(".bases-toolbar-new-item-menu")
        if (newBtn) {
            newBtn.setCssStyles({ display: "none" })
        }

        // Build the button matching the native toolbar item structure:
        // div.bases-toolbar-item > div.text-icon-button > span.text-button-icon + span.text-button-label
        const btn = document.createElement("div")
        btn.className = "bases-toolbar-item swimlane-automations-btn"
        const count = this.automationRules.length
        const inner = btn.createDiv({
            cls: `text-icon-button${count > 0 ? " is-active" : ""}`,
            attr: { tabindex: "0" },
        })
        const iconSpan = inner.createSpan({ cls: "text-button-icon" })
        setIcon(iconSpan, "zap")
        inner.createSpan({
            cls: "text-button-label",
            text: count > 0 ? `Automations (${count})` : "Automations",
        })
        btn.addEventListener("click", () => this.openAutomationsModal())

        // Insert before Sort.
        const sortBtn = basesToolbar.querySelector(".bases-toolbar-sort-menu")
        if (sortBtn) {
            basesToolbar.insertBefore(btn, sortBtn)
        } else {
            basesToolbar.appendChild(btn)
        }

        // Select / Cancel button for batch selection mode.
        basesToolbar.querySelector(".swimlane-select-btn")?.remove()
        const selBtn = document.createElement("div")
        selBtn.className = "bases-toolbar-item swimlane-select-btn"
        const selActive = this.selectionManager.active
        const selInner = selBtn.createDiv({
            cls: `text-icon-button${selActive ? " is-active" : ""}`,
            attr: { tabindex: "0" },
        })
        const selIconSpan = selInner.createSpan({ cls: "text-button-icon" })
        setIcon(selIconSpan, "check-square")
        selInner.createSpan({
            cls: "text-button-label",
            text: selActive ? "Cancel" : "Select",
        })
        selBtn.addEventListener("click", () => {
            if (this.selectionManager.active) {
                this.selectionManager.exit()
            } else {
                this.selectionManager.enter()
            }
        })
        basesToolbar.appendChild(selBtn)

        // Clean up any previously injected undo/redo buttons (from old versions).
        basesToolbar.querySelector(".swimlane-undo-btn")?.remove()
        basesToolbar.querySelector(".swimlane-redo-btn")?.remove()
    }

    /** Build property info list with array detection from current entries. */
    private getPropertyInfos(): PropertyInfo[] {
        const arrayProps = new Set<string>()
        for (const entry of this.data.data) {
            const cache = this.app.metadataCache.getFileCache(entry.file)
            if (!cache?.frontmatter) {
                continue
            }
            for (const [key, val] of Object.entries(cache.frontmatter)) {
                if (Array.isArray(val)) {
                    arrayProps.add(key)
                }
            }
        }
        return this.allProperties
            .filter(p => p.startsWith("note."))
            .map(p => {
                const name = p.slice(5)
                return { name, isArray: arrayProps.has(name) }
            })
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

    private get imageWidth(): number {
        const val = this.config.get(CONFIG_KEYS.imageWidth)
        const num = typeof val === "string" ? parseInt(val, 10) : typeof val === "number" ? val : 64
        return Math.min(Math.max(num, 1), 200)
    }

    private get showAddCard(): boolean {
        const val = this.config.get(CONFIG_KEYS.showAddCard)
        return val !== false
    }

    private get showAddColumn(): boolean {
        const val = this.config.get(CONFIG_KEYS.showAddColumn)
        return val !== false
    }

    private get isMobileLayout(): boolean {
        return Platform.isMobile || this.config.get(CONFIG_KEYS.forceMobileLayout) === true
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

    private get collapsedSwimlanes(): Set<GroupKey> {
        const val = this.config.get(CONFIG_KEYS.collapsedSwimlanes)
        if (!Array.isArray(val)) {
            return new Set()
        }
        return new Set(val.filter((v): v is GroupKey => typeof v === "string"))
    }

    private setCollapsedSwimlanes(collapsed: Set<GroupKey>): void {
        this.config.set(CONFIG_KEYS.collapsedSwimlanes, [...collapsed])
    }

    private toggleCollapsed(groupKey: GroupKey): void {
        const collapsed = this.collapsedSwimlanes
        if (collapsed.has(groupKey)) {
            // Expanding — just update config and rebuild
            collapsed.delete(groupKey)
            this.setCollapsedSwimlanes(collapsed)
            this.rebuildBoard()
            return
        }

        // Collapsing — animate first, then update config
        const col = this.boardEl.querySelector(
            `.swimlane-column[data-group-key="${CSS.escape(groupKey)}"]`,
        ) as HTMLElement | null
        if (!col) {
            collapsed.add(groupKey)
            this.setCollapsedSwimlanes(collapsed)
            this.rebuildBoard()
            return
        }

        // Phase 1: Shrink cards into header
        const cardList = col.querySelector(".swimlane-card-list") as HTMLElement | null
        if (cardList) {
            cardList.style.maxHeight = `${cardList.scrollHeight}px`
            // Force reflow so the transition starts from the current height
            void cardList.offsetHeight
        }
        col.classList.add("swimlane-column--collapsing")

        const afterPhase1 = () => {
            // Phase 2: Shrink column width
            col.classList.add("swimlane-column--shrinking")

            const afterPhase2 = () => {
                collapsed.add(groupKey)
                this.setCollapsedSwimlanes(collapsed)
                this.rebuildBoard()
            }

            col.addEventListener("transitionend", function handler(e) {
                if (e.target === col && e.propertyName === "min-width") {
                    col.removeEventListener("transitionend", handler)
                    afterPhase2()
                }
            })
            // Fallback in case transitionend doesn't fire
            setTimeout(afterPhase2, 300)
        }

        if (cardList) {
            cardList.addEventListener("transitionend", function handler(e) {
                if (e.target === cardList && e.propertyName === "max-height") {
                    cardList.removeEventListener("transitionend", handler)
                    afterPhase1()
                }
            })
            // Fallback
            setTimeout(afterPhase1, 250)
        } else {
            afterPhase1()
        }
    }

    private expandingColumnKey: GroupKey | null = null

    private expandColumn(groupKey: GroupKey): void {
        const collapsed = this.collapsedSwimlanes
        if (!collapsed.has(groupKey)) return

        collapsed.delete(groupKey)
        this.setCollapsedSwimlanes(collapsed)
        // Rebuild immediately, then animate cards expanding in
        this.expandingColumnKey = groupKey
        this.rebuildBoard()
    }

    // ── Dwell-to-expand collapsed columns during drag ──────────────────

    private checkDwellExpand(clientX: number, clientY: number): void {
        const elementUnderPointer = document.elementFromPoint(clientX, clientY)

        // Find if pointer is over a collapsed strip
        const strip = elementUnderPointer?.closest(
            ".swimlane-column-collapsed",
        ) as HTMLElement | null
        const groupKey = strip?.dataset.groupKey as GroupKey | undefined

        // If hovering a different collapsed strip than the timer target, clear timer
        if (groupKey !== this.dwellTimerGroupKey) {
            this.clearDwellTimer()
        }

        // If hovering a collapsed strip and no timer running, start one
        if (
            strip &&
            groupKey &&
            !this.dwellExpandTimer &&
            groupKey !== this.dwellExpandedGroupKey
        ) {
            strip.classList.add("swimlane-column-collapsed--hover")
            this.dwellTimerGroupKey = groupKey
            this.dwellExpandTimer = setTimeout(() => {
                this.dwellExpandTimer = null
                this.dwellTimerGroupKey = null
                this.dwellExpandColumn(groupKey, strip)
            }, 500)
        }

        // If we have a dwell-expanded column, check if pointer is still over it
        if (this.dwellExpandedGroupKey) {
            const overExpanded = this.dwellExpandedColumnEl?.contains(elementUnderPointer as Node)
            if (!overExpanded) {
                this.startRecollapseTimer()
            } else {
                this.clearRecollapseTimer()
            }
        }
    }

    private dwellExpandColumn(groupKey: GroupKey, strip: HTMLElement): void {
        const board = strip.parentElement
        if (!board) {
            return
        }

        const groupByKey = new Map(this.data.groupedData.map(g => [String(g.key) as GroupKey, g]))
        const group = groupByKey.get(groupKey)
        if (!group) {
            return
        }

        // Create full column element
        const col = document.createElement("div")
        col.className = "swimlane-column"
        col.dataset.groupKey = groupKey

        // Render simplified header (no chevron/menu during drag)
        const header = col.createDiv({ cls: "swimlane-column-header" })
        header.createSpan({ text: groupKey })
        const headerRight = header.createDiv({ cls: "swimlane-column-header-right" })
        headerRight.createDiv({ cls: "swimlane-column-count", text: String(group.entries.length) })

        // Render card list with cards
        const cardList = col.createDiv({ cls: "swimlane-card-list" })
        this.cardDnd.registerDropArea(cardList, { groupKey })

        const rankProp = this.rankProp
        const showTags = this.data.properties.some(p => p === "note.tags" || p === "file.tags")
        const mobile = this.isMobileLayout

        const cardOptions: Omit<CardRenderOptions, "rank" | "getSwimlaneContext"> = {
            rankPropId: this.rankPropId,
            properties: this.cardPropertyAliases,
            showIcons: this.showPropertyIcons,
            imagePropId: this.imagePropId,
            imageWidth: this.imageWidth,
            swimlaneProp: this.swimlaneProp,
            highlightColumn: col => this.highlightColumn(col as GroupKey),
            openNoteBehavior: this.plugin.settings.openNoteBehavior,
            mobile,
            resolveTagColor: (tag: string) => this.plugin.tagColorResolver.resolve(tag),
        }

        for (const entry of group.entries) {
            const rank = getFrontmatter<string>(this.app, entry.file, rankProp) ?? ""
            let entryTags: string[] | undefined
            if (showTags) {
                const tagsRaw = this.app.metadataCache.getFileCache(entry.file)?.frontmatter?.tags
                entryTags = Array.isArray(tagsRaw)
                    ? tagsRaw.filter((t): t is string => typeof t === "string")
                    : typeof tagsRaw === "string"
                      ? [tagsRaw]
                      : undefined
                if (entryTags && entryTags.length === 0) {
                    entryTags = undefined
                }
            }
            const card = renderCard(cardList, entry, this.app, {
                ...cardOptions,
                rank,
                tags: entryTags,
                getSwimlaneContext: () => ({
                    columns: this.swimlaneOrder as string[],
                    currentSwimlane: groupKey,
                }),
            })
            this.cardDnd.registerDraggable(card, { path: entry.file.path, groupKey })
        }

        // Swap strip for column
        board.replaceChild(col, strip)

        this.dwellExpandedGroupKey = groupKey
        this.dwellExpandedColumnEl = col
    }

    private startRecollapseTimer(): void {
        if (this.recollapseTimer) {
            return
        }
        this.recollapseTimer = setTimeout(() => {
            this.recollapseTimer = null
            this.recollapseDwellExpanded()
        }, 300)
    }

    private clearRecollapseTimer(): void {
        if (this.recollapseTimer) {
            clearTimeout(this.recollapseTimer)
            this.recollapseTimer = null
        }
    }

    private recollapseDwellExpanded(): void {
        if (!this.dwellExpandedGroupKey || !this.dwellExpandedColumnEl) {
            return
        }

        const groupKey = this.dwellExpandedGroupKey
        const col = this.dwellExpandedColumnEl
        const board = col.parentElement
        if (!board) {
            return
        }

        const entries = this.data.groupedData.find(g => String(g.key) === groupKey)?.entries ?? []

        // Build collapsed strip
        const strip = document.createElement("div")
        strip.className = "swimlane-column-collapsed"
        strip.dataset.groupKey = groupKey
        strip.setAttribute("aria-label", groupKey)
        strip.setAttribute("title", groupKey)

        const label = strip.createDiv({ cls: "swimlane-column-collapsed-label" })
        label.textContent = groupKey

        const count = strip.createDiv({ cls: "swimlane-column-collapsed-count" })
        count.textContent = String(entries.length)

        strip.addEventListener("click", () => {
            this.expandColumn(groupKey)
        })

        // Register strip as drop area for future dwell-expand
        this.cardDnd.registerDropArea(strip, { groupKey, collapsed: true } as any)

        // Swap
        board.replaceChild(strip, col)

        this.dwellExpandedGroupKey = null
        this.dwellExpandedColumnEl = null
    }

    private clearDwellTimer(): void {
        if (this.dwellExpandTimer) {
            clearTimeout(this.dwellExpandTimer)
            this.dwellExpandTimer = null
            this.dwellTimerGroupKey = null
        }
        // Clear hover highlight on any collapsed strips
        document
            .querySelectorAll(".swimlane-column-collapsed--hover")
            .forEach(el => el.classList.remove("swimlane-column-collapsed--hover"))
    }

    private get cardPropertyAliases(): CardPropertyAlias[] {
        // Properties from Bases (Properties toolbar). Labels come from property names or formulas.
        const excluded = new Set([
            this.rankPropId,
            this.swimlanePropId,
            "file.name",
            "note.tags",
            "file.tags",
        ])
        return this.data.properties
            .filter(propId => !excluded.has(propId))
            .map(propId => ({ propId, alias: "" }))
    }

    onUnload(): void {
        this.unregisterSettingsListener?.()
        this.carouselObserver?.disconnect()
        if (this.autoScrollRaf !== null) {
            cancelAnimationFrame(this.autoScrollRaf)
            this.autoScrollRaf = null
        }
        this.cancelMobileSwipeDwell()
        this.clearDwellTimer()
        this.clearRecollapseTimer()
        this.cardDnd.destroy()
        this.swimlaneDnd.destroy()
        this.undoManager.clear()
        if (this.keydownHandler) {
            document.removeEventListener("keydown", this.keydownHandler)
            this.keydownHandler = null
        }
    }

    private performUndo(): void {
        const tx = this.undoManager.undo()
        if (!tx) {
            return
        }
        applyUndo(tx, this.getUndoRedoContext())
        new Notice(`Undo: ${tx.label}`, 2000)
    }

    private performRedo(): void {
        const tx = this.undoManager.redo()
        if (!tx) {
            return
        }
        applyRedo(tx, this.getUndoRedoContext())
        new Notice(`Redo: ${tx.label}`, 2000)
    }

    private getUndoRedoContext(): UndoRedoContext {
        return {
            app: this.app,
            config: this.config,
            swimlaneProp: this.swimlaneProp,
            rankProp: this.rankProp,
            baseFile: this.baseFile,
        }
    }

    onDataUpdated(): void {
        // Flush pending settings changes (e.g. from settings modal while view was detached).
        this.settingsDirty = false
        if (!this.baseFile) {
            const f = this.app.workspace.getActiveFile()
            if (f?.extension === "base") {
                this.baseFile = f
            }
        }

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
        // Remember which column is visible so we can restore scroll after rebuild.
        // Prefer scroll state saved at drop time (before processFrontMatter
        // triggers could have rebuilt the DOM), falling back to current DOM.
        const savedScrollColumn = this.savedScrollState?.column ?? this.getVisibleColumnKey()
        const savedCardListScrollTops =
            this.savedScrollState?.cardListScrollTops ?? this.getCardListScrollTops()
        const savedBoardScrollTop =
            this.savedScrollState?.boardScrollTop ?? this.currentBoard?.scrollTop ?? 0
        const savedBoardScrollLeft =
            this.savedScrollState?.boardScrollLeft ?? this.boardEl.scrollLeft
        this.savedScrollState = null

        // Detach the card being tag-edited so empty() doesn't destroy it.
        if (this.editingTagsPath && this.editingTagsCardEl) {
            this.editingTagsCardEl.remove()
        }

        this.boardEl.empty()
        // Clear stale column-drop references — the DOM elements were removed by empty().
        this.columnDropTarget = null
        this.columnDragSource = null
        this.columnDropPlaceholder = null
        this.carouselObserver?.disconnect()
        this.carouselObserver = null

        if (this.baseFile) {
            this.app.vault.read(this.baseFile).then(content => {
                this.automationRules = readAutomations(content)
                // Update the automations button count and active state.
                const label = this.boardEl.parentElement?.querySelector(
                    ".swimlane-automations-btn .text-button-label",
                )
                const inner = this.boardEl.parentElement?.querySelector(
                    ".swimlane-automations-btn .text-icon-button",
                )
                if (label) {
                    const count = this.automationRules.length
                    label.textContent = count > 0 ? `Automations (${count})` : "Automations"
                    inner?.toggleClass("is-active", count > 0)
                }
            })
        }

        const mobile = this.isMobileLayout
        const sortedByRank = this.isSortedByRank
        this.boardEl.toggleClass("swimlane-mobile", mobile)
        // Desktop: outer container scrolls both axes, board sizes to content.
        // Mobile: outer container is hidden, board handles both via scroll-snap.
        this.boardEl.setCssStyles({
            overflow: mobile ? "hidden" : "auto",
        })

        const groups = this.data.groupedData
        const hasGroups = groups.some(g => g.hasKey())

        if (!hasGroups && this.swimlaneOrder.length === 0) {
            const msg = 'Set a "Group by" property in the Bases toolbar to use the Swimlane view.'
            this.boardEl.createEl("p", { cls: "swimlane-empty", text: msg })
            return
        }

        if (!hasGroups && this.swimlaneOrder.length > 0) {
            this.injectBasesToolbarButton()
            const toolbar = this.boardEl.createDiv({ cls: "swimlane-toolbar" })
            const hint = toolbar.createEl("button", { cls: "swimlane-toolbar-btn" })
            setIcon(hint.createSpan(), "columns-3")
            hint.createSpan({ text: "Populate group by for cards to render in swimlanes" })
            hint.addEventListener("click", () => this.setGroupBy())
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
        board.toggleClass("swimlane-column-drop-mode", !sortedByRank)
        board.toggleClass("swimlane-selecting", this.selectionManager.active)
        board.style.setProperty("--swimlane-image-width", `${this.imageWidth}px`)
        this.currentBoard = board
        this.columnDropTarget = null

        // Register DnD on the board div, NOT on Obsidian's scroll container (containerEl),
        // so touch scrolling on the outer container works normally.
        // Skip DnD registration entirely in selection mode.
        if (!this.selectionManager.active) {
            this.cardDnd.registerContainer(board)
            this.cardDnd.initDropIndicator(board)
            this.cardDnd.clearDropAreas()

            if (!mobile) {
                this.swimlaneDnd.registerContainer(board)
                this.swimlaneDnd.initDropIndicator(board)
                this.swimlaneDnd.clearDropAreas()
                this.swimlaneDnd.registerDropArea(board, null)
            }
        }

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
        const collapsed = this.collapsedSwimlanes
        const orderedKeys = (
            order.length > 0
                ? [...order, ...[...groupByKey.keys()].filter(k => !order.includes(k))]
                : [...groupByKey.keys()]
        ).filter(k => !hidden.has(k))

        const rankProp = this.rankProp

        // Inject the automations button into the Bases toolbar (sibling of containerEl).
        this.injectBasesToolbarButton()

        if (!sortedByRank) {
            const toolbar = this.boardEl.createDiv({ cls: "swimlane-toolbar" })
            this.boardEl.insertBefore(toolbar, board)
            const hint = toolbar.createEl("button", { cls: "swimlane-toolbar-btn" })
            setIcon(hint.createSpan(), "arrow-up-down")
            hint.createSpan({ text: "Sort by rank to enable re-ordering" })
            hint.addEventListener("click", () => this.setSortByRank())
        }

        // Floating undo/redo controls
        const undoRedoFloat = this.boardEl.createDiv({ cls: "swimlane-undo-float" })

        const undoBtn = undoRedoFloat.createEl("button", {
            cls: "swimlane-undo-float-btn swimlane-undo-btn",
            attr: {
                "aria-label": this.undoManager.undoLabel
                    ? `Undo: ${this.undoManager.undoLabel}`
                    : "Undo",
            },
        })
        setIcon(undoBtn, "undo")
        undoBtn.addEventListener("click", () => this.performUndo())
        undoBtn.toggleClass("swimlane-toolbar-disabled", !this.undoManager.canUndo)

        const redoBtn = undoRedoFloat.createEl("button", {
            cls: "swimlane-undo-float-btn swimlane-redo-btn",
            attr: {
                "aria-label": this.undoManager.redoLabel
                    ? `Redo: ${this.undoManager.redoLabel}`
                    : "Redo",
            },
        })
        setIcon(redoBtn, "redo")
        redoBtn.addEventListener("click", () => this.performRedo())
        redoBtn.toggleClass("swimlane-toolbar-disabled", !this.undoManager.canRedo)

        const showTags = this.data.properties.some(p => p === "note.tags" || p === "file.tags")

        const cardOptions: Omit<CardRenderOptions, "rank" | "getSwimlaneContext"> = {
            rankPropId: this.rankPropId,
            properties: this.cardPropertyAliases,
            showIcons: this.showPropertyIcons,
            imagePropId: this.imagePropId,
            imageWidth: this.imageWidth,
            swimlaneProp: this.swimlaneProp,
            highlightColumn: col => this.highlightColumn(col as GroupKey),
            openNoteBehavior: this.plugin.settings.openNoteBehavior,
            mobile,
            resolveTagColor: (tag: string) => this.plugin.tagColorResolver.resolve(tag),
            onEditTags: (cardEl: HTMLElement) => {
                const path = cardEl.dataset.path
                if (!path) {
                    return
                }
                const file = this.app.vault.getFileByPath(path)
                if (!file) {
                    return
                }

                // Capture previous tags for undo
                const cache = this.app.metadataCache.getFileCache(file)
                const rawTags = cache?.frontmatter?.tags
                const previousTags: string[] = Array.isArray(rawTags)
                    ? rawTags.filter((t): t is string => typeof t === "string")
                    : typeof rawTags === "string"
                      ? [rawTags]
                      : []

                // Protect card from re-render
                this.editingTagsPath = path
                this.editingTagsCardEl = cardEl

                renderTagEditor(
                    cardEl,
                    file,
                    previousTags,
                    this.app,
                    () => {
                        // onDone: create undo transaction and clear editing state
                        const finalCache = this.app.metadataCache.getFileCache(file)
                        const finalRaw = finalCache?.frontmatter?.tags
                        const newTags: string[] = Array.isArray(finalRaw)
                            ? finalRaw.filter((t): t is string => typeof t === "string")
                            : typeof finalRaw === "string"
                              ? [finalRaw]
                              : []

                        const changed =
                            previousTags.length !== newTags.length ||
                            previousTags.some((t, i) => t !== newTags[i])

                        if (changed) {
                            this.undoManager.beginTransaction("Edit tags")
                            this.undoManager.pushOperation({
                                type: "EditTags",
                                file,
                                previousTags,
                                newTags,
                            })
                            this.undoManager.endTransaction()
                        }

                        this.editingTagsPath = null
                        this.editingTagsCardEl = null
                        this.rebuildBoard()
                    },
                    (tag: string) => this.plugin.tagColorResolver.resolve(tag),
                )
            },
        }

        for (const groupKey of orderedKeys) {
            if (collapsed.has(groupKey) && !this.isMobileLayout) {
                const entries = groupByKey.get(groupKey)?.entries ?? []
                const strip = board.createDiv({ cls: "swimlane-column swimlane-column-collapsed" })
                strip.dataset.groupKey = groupKey
                strip.setAttribute("aria-label", groupKey)
                strip.setAttribute("title", groupKey)

                // Menu button at the top
                const menuBtn = strip.createSpan({
                    cls: "swimlane-column-collapsed-menu-btn",
                    attr: { "data-no-drag": "", "aria-label": "Column menu" },
                })
                setIcon(menuBtn, "more-vertical")
                menuBtn.addEventListener("click", (e) => {
                    e.stopPropagation()
                    this.showColumnMenu(menuBtn, board, groupKey, entries.length, orderedKeys)
                })

                // Inner wrapper acts as drag handle (swimlaneDnd requires .swimlane-column-header)
                const inner = strip.createDiv({ cls: "swimlane-column-header swimlane-column-collapsed-inner" })

                const label = inner.createDiv({ cls: "swimlane-column-collapsed-label" })
                label.textContent = groupKey

                const count = inner.createDiv({ cls: "swimlane-column-collapsed-count" })
                count.textContent = String(entries.length)

                // Register as drop area for dwell-to-expand during drag
                if (!this.selectionManager.active) {
                    this.cardDnd.registerDropArea(strip, { groupKey, collapsed: true } as any)
                }
                // Register for column reordering
                if (!mobile && !this.selectionManager.active) {
                    this.swimlaneDnd.registerDraggable(strip, { groupKey })
                }

                continue
            }

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
            const menuBtn = headerRight.createSpan({
                cls: "swimlane-column-menu-btn",
                attr: { "data-no-drag": "" },
            })
            setIcon(menuBtn, "more-vertical")
            menuBtn.addEventListener("click", e => {
                e.stopPropagation()
                this.showColumnMenu(
                    menuBtn,
                    board,
                    groupKey,
                    group?.entries.length ?? 0,
                    orderedKeys,
                )
            })

            const cardList = col.createDiv({ cls: "swimlane-card-list" })
            if (!this.selectionManager.active) {
                this.cardDnd.registerDropArea(cardList, { groupKey })
            }
            if (!mobile && !this.selectionManager.active) {
                this.swimlaneDnd.registerDraggable(col, { groupKey })
            }

            for (const entry of group?.entries ?? []) {
                const rank = getFrontmatter<string>(this.app, entry.file, rankProp) ?? ""
                const currentGroupKey = groupKey
                let entryTags: string[] | undefined
                if (showTags) {
                    const tagsRaw = this.app.metadataCache.getFileCache(entry.file)?.frontmatter
                        ?.tags
                    entryTags = Array.isArray(tagsRaw)
                        ? tagsRaw.filter((t): t is string => typeof t === "string")
                        : typeof tagsRaw === "string"
                          ? [tagsRaw]
                          : undefined
                    if (entryTags && entryTags.length === 0) {
                        entryTags = undefined
                    }
                }
                const card = renderCard(cardList, entry, this.app, {
                    ...cardOptions,
                    rank,
                    tags: entryTags,
                    getSwimlaneContext: () => ({
                        columns: this.swimlaneOrder as string[],
                        currentSwimlane: currentGroupKey,
                    }),
                })
                if (this.expandingCardPath === entry.file.path) {
                    card.addClass("swimlane-card--expanding")
                    card.addEventListener(
                        "animationend",
                        () => {
                            card.removeClass("swimlane-card--expanding")
                        },
                        { once: true },
                    )
                }
                if (this.selectionManager.active) {
                    card.addEventListener("click", e => {
                        e.stopPropagation()
                        this.selectionManager.toggle(entry.file.path)
                    })
                    if (this.selectionManager.selected.has(entry.file.path)) {
                        card.classList.add("swimlane-card--selected")
                    }
                } else {
                    this.cardDnd.registerDraggable(card, { path: entry.file.path, groupKey })
                }
            }

            // Reattach editing card if it belongs in this column
            if (this.editingTagsPath && this.editingTagsCardEl) {
                const editingCard = cardList.querySelector(
                    `[data-path="${CSS.escape(this.editingTagsPath)}"]`,
                )
                if (editingCard) {
                    editingCard.replaceWith(this.editingTagsCardEl)
                    // Restore focus to the tag input after reattach
                    const tagInput = this.editingTagsCardEl.querySelector(
                        ".swimlane-tag-input",
                    ) as HTMLInputElement | null
                    tagInput?.focus()
                }
            }

            if (this.showAddCard) {
                // On mobile, render inside the card list so it scrolls with cards.
                this.renderAddCardButton(mobile ? cardList : col, groupKey)
            }
        }

        if (this.selectionManager.active) {
            const allPaths = new Set<string>()
            for (const group of this.data.groupedData) {
                for (const entry of group.entries) {
                    allPaths.add(entry.file.path)
                }
            }
            this.selectionManager.pruneDeleted(allPaths)

            const actionBar = renderActionBar({
                selectedCount: this.selectionManager.selected.size,
                onSelectAll: () => {
                    const allFilePaths: string[] = []
                    for (const group of this.data.groupedData) {
                        for (const entry of group.entries) {
                            allFilePaths.push(entry.file.path)
                        }
                    }
                    this.selectionManager.selectAll(allFilePaths)
                },
                onDeselectAll: () => this.selectionManager.deselectAll(),
                onMove: e => this.showBatchMoveMenu(e),
                onTag: e => this.showBatchTagPopover(e),
                onDelete: () => this.confirmBatchDelete(),
                onClose: () => this.selectionManager.exit(),
            })
            board.appendChild(actionBar)
        }

        if (this.showAddColumn) {
            this.renderAddColumnButton(board)
        }

        if (mobile) {
            this.renderCarouselIndicator(board, orderedKeys)
        }

        if (mobile && savedScrollColumn) {
            this.restoreScrollPosition(board, savedScrollColumn)
        } else if (savedBoardScrollLeft > 0) {
            this.boardEl.scrollLeft = savedBoardScrollLeft
        }
        this.restoreCardListScrollTops(board, savedCardListScrollTops)
        if (savedBoardScrollTop > 0) {
            board.scrollTop = savedBoardScrollTop
        }

        this.applyPendingHighlight()
        this.expandingCardPath = null

        // Phase 2 of expand animation: card list grows in
        if (this.expandingColumnKey) {
            const expandKey = this.expandingColumnKey
            this.expandingColumnKey = null
            const expandedCol = board.querySelector(
                `.swimlane-column[data-group-key="${CSS.escape(expandKey)}"]`,
            ) as HTMLElement | null
            const expandedCardList = expandedCol?.querySelector(".swimlane-card-list") as HTMLElement | null
            if (expandedCardList) {
                const targetHeight = expandedCardList.scrollHeight
                expandedCardList.style.maxHeight = "0"
                expandedCardList.style.opacity = "0"
                expandedCardList.style.overflow = "hidden"
                expandedCardList.style.transition = "max-height 200ms ease-out, opacity 200ms ease-out"
                void expandedCardList.offsetHeight // force reflow
                expandedCardList.style.maxHeight = `${targetHeight}px`
                expandedCardList.style.opacity = "1"
                expandedCardList.addEventListener("transitionend", function handler(e) {
                    if (e.target === expandedCardList && e.propertyName === "max-height") {
                        expandedCardList.removeEventListener("transitionend", handler)
                        expandedCardList.style.maxHeight = ""
                        expandedCardList.style.opacity = ""
                        expandedCardList.style.overflow = ""
                        expandedCardList.style.transition = ""
                    }
                })
            }
        }
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
        const allMutations = this.getAutomationMutations(null, groupKey as string, "created_in")
        const {
            instant: mutations,
            scheduledEntries,
            delays,
        } = this.scheduleDelayedMutations(allMutations, file.path, groupKey as string, null)
        // No previous values to capture for a brand-new file.
        const prevValues: Record<string, unknown> = {}

        this.undoManager.beginTransaction("Create card")
        this.undoManager.pushOperation({
            type: "CreateCard",
            file,
            path,
            swimlane: groupKey as string,
            rank: newRank,
            resolvedAutomationMutations: mutations,
            automationPreviousValues: prevValues,
        })
        if (scheduledEntries.length > 0 && this.baseFile) {
            this.undoManager.pushOperation({
                type: "ScheduleActions",
                baseFilePath: this.baseFile.path,
                entries: scheduledEntries,
                delays,
            })
        }
        this.undoManager.endTransaction()

        await this.app.fileManager.processFrontMatter(file, fm => {
            fm[swimlaneProp] = groupKey
            fm[rankProp] = newRank
            applyMutations(fm, mutations)
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
            this.undoManager.beginTransaction("Add swimlane")
            this.undoManager.pushOperation({ type: "AddSwimlane", swimlane: key as string })
            this.config.set(CONFIG_KEYS.swimlaneOrder, [...order, key])
            this.undoManager.endTransaction()
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
        this.undoManager.beginTransaction("Hide swimlane")
        this.undoManager.pushOperation({ type: "HideSwimlane", swimlane: groupKey as string })
        const hidden = this.hiddenSwimlanes
        hidden.add(groupKey)
        this.setHiddenSwimlanes(hidden)
        this.undoManager.endTransaction()
    }

    private removeColumn(_board: HTMLElement, groupKey: GroupKey, entryCount: number): void {
        if (entryCount === 0) {
            const previousOrder = [...this.swimlaneOrder] as string[]
            this.undoManager.beginTransaction("Remove swimlane")
            this.undoManager.pushOperation({
                type: "RemoveSwimlane",
                swimlane: groupKey as string,
                op: { kind: "hide" } as any, // placeholder; empty columns just remove from order
                previousOrder,
                cardStates: [],
            })
            const order = this.swimlaneOrder.filter(k => k !== groupKey)
            this.config.set(CONFIG_KEYS.swimlaneOrder, order)
            this.undoManager.endTransaction()
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
                if (op.kind === "delete") {
                    // Not undoable
                    await executeRmSwimlane(this.app, files, this.swimlaneProp, op)
                    const order = this.swimlaneOrder.filter(k => k !== groupKey)
                    this.config.set(CONFIG_KEYS.swimlaneOrder, order)
                    return
                }
                // Capture card states before mutation
                const cardPreviousValues = new Map<string, string | undefined>()
                for (const f of files) {
                    cardPreviousValues.set(
                        f.path,
                        getFrontmatter<string>(this.app, f, this.swimlaneProp),
                    )
                }
                const cardAutomationState = new Map<
                    string,
                    {
                        resolved: FrontmatterMutation[]
                        prev: Record<string, unknown>
                    }
                >()
                const allScheduledEntries: ScheduledAction[] = []
                const allDelays: string[] = []
                await executeRmSwimlane(this.app, files, this.swimlaneProp, op, (file, fm) => {
                    let allMutations: MatchedMutation[] = []
                    if (op.kind === "move") {
                        allMutations = [
                            ...this.getAutomationMutations(groupKey as string, null, "leaves"),
                            ...this.getAutomationMutations(
                                groupKey as string,
                                op.targetValue,
                                "enters",
                            ),
                        ]
                    } else if (op.kind === "clear") {
                        allMutations = this.getAutomationMutations(
                            groupKey as string,
                            null,
                            "leaves",
                        )
                    }
                    const targetSwimlane = op.kind === "move" ? op.targetValue : null
                    const {
                        instant: mutations,
                        scheduledEntries,
                        delays,
                    } = this.scheduleDelayedMutations(
                        allMutations,
                        file.path,
                        targetSwimlane ?? (groupKey as string),
                        groupKey as string,
                    )
                    allScheduledEntries.push(...scheduledEntries)
                    allDelays.push(...delays)
                    const prev: Record<string, unknown> = {}
                    for (const m of mutations) {
                        prev[m.property] = fm[m.property]
                    }
                    applyMutations(fm, mutations)
                    cardAutomationState.set(file.path, { resolved: mutations, prev })
                })
                const previousOrder = [...this.swimlaneOrder] as string[]
                this.undoManager.beginTransaction("Remove swimlane")
                this.undoManager.pushOperation({
                    type: "RemoveSwimlane",
                    swimlane: groupKey as string,
                    op,
                    previousOrder,
                    cardStates: files.map(f => ({
                        file: f,
                        previousValue: cardPreviousValues.get(f.path),
                        resolvedAutomationMutations:
                            cardAutomationState.get(f.path)?.resolved ?? [],
                        automationPreviousValues: cardAutomationState.get(f.path)?.prev ?? {},
                    })),
                })
                if (allScheduledEntries.length > 0 && this.baseFile) {
                    this.undoManager.pushOperation({
                        type: "ScheduleActions",
                        baseFilePath: this.baseFile.path,
                        entries: allScheduledEntries,
                        delays: allDelays,
                    })
                }
                const order = this.swimlaneOrder.filter(k => k !== groupKey)
                this.config.set(CONFIG_KEYS.swimlaneOrder, order)
                this.undoManager.endTransaction()
            },
        }).open()
    }

    private showColumnMenu(
        triggerEl: HTMLElement,
        board: HTMLElement,
        groupKey: GroupKey,
        entryCount: number,
        orderedKeys: GroupKey[],
    ): void {
        const order = this.swimlaneOrder
        const idx = order.indexOf(groupKey)

        const menu = new Menu()

        menu.addItem(item => {
            item.setTitle("Move left")
                .setIcon("arrow-left")
                .setDisabled(idx <= 0)
                .onClick(() => this.moveColumn(groupKey, -1))
        })

        menu.addItem(item => {
            item.setTitle("Move right")
                .setIcon("arrow-right")
                .setDisabled(idx === -1 || idx >= order.length - 1)
                .onClick(() => this.moveColumn(groupKey, 1))
        })

        menu.addSeparator()

        menu.addItem(item => {
            item.setTitle("Hide")
                .setIcon("eye-off")
                .onClick(() => this.hideColumn(groupKey))
        })

        if (!this.isMobileLayout) {
            const isCollapsed = this.collapsedSwimlanes.has(groupKey)
            menu.addItem(item => {
                item.setTitle(isCollapsed ? "Expand" : "Collapse")
                    .setIcon(isCollapsed ? "columns-2" : "columns-2")
                    .onClick(() => this.toggleCollapsed(groupKey))
            })
        }

        if (this.showAddColumn) {
            menu.addItem(item => {
                item.setTitle("Remove")
                    .setIcon("trash-2")
                    .onClick(() => this.removeColumn(board, groupKey, entryCount))
            })
        }

        const columnEntries =
            this.data.groupedData.find(g => String(g.key) === groupKey)?.entries ?? []
        const columnPaths = columnEntries.map(e => e.file.path)

        menu.addSeparator()

        menu.addItem(item => {
            item.setTitle("Select all in column")
                .setIcon("check-square")
                .onClick(() => this.selectionManager.selectColumn(columnPaths))
        })

        if (this.selectionManager.active) {
            menu.addItem(item => {
                item.setTitle("Deselect all in column")
                    .setIcon("square")
                    .onClick(() => this.selectionManager.deselectColumn(columnPaths))
            })
        }

        const rect = triggerEl.getBoundingClientRect()
        menu.showAtPosition({ x: rect.left, y: rect.bottom })
    }

    private moveColumn(groupKey: GroupKey, direction: -1 | 1): void {
        const previousOrder = [...this.swimlaneOrder] as string[]
        const order = [...this.swimlaneOrder]
        const idx = order.indexOf(groupKey)
        if (idx === -1) {
            return
        }
        const newIdx = idx + direction
        if (newIdx < 0 || newIdx >= order.length) {
            return
        }
        ;[order[idx], order[newIdx]] = [order[newIdx]!, order[idx]!]
        this.undoManager.beginTransaction("Reorder swimlane")
        this.undoManager.pushOperation({
            type: "ReorderSwimlane",
            previousOrder,
            newOrder: order as string[],
        })
        this.config.set(CONFIG_KEYS.swimlaneOrder, order)
        this.undoManager.endTransaction()
    }

    private renderCarouselIndicator(board: HTMLElement, orderedKeys: GroupKey[]): void {
        const indicator = this.boardEl.createDiv({ cls: "swimlane-carousel-indicator" })

        // Collect all swipeable slides: columns + optional add-column button.
        const slides = Array.from(
            board.querySelectorAll<HTMLElement>(
                ".swimlane-column, .swimlane-add-column-btn, .swimlane-add-column-input-wrapper",
            ),
        )
        const totalDots = slides.length

        // Determine which slide is initially visible. Use the saved/restored
        // column key rather than getBoundingClientRect (which returns 0s before
        // the browser has run layout on freshly-inserted DOM).
        const savedKey = this.savedScrollState?.column ?? this.getVisibleColumnKey()
        let initialActive = 0
        if (savedKey) {
            const idx = slides.findIndex(s => s.dataset.groupKey === savedKey)
            if (idx !== -1) {
                initialActive = idx
            }
        }

        for (let i = 0; i < totalDots; i++) {
            const slide = slides[i]!
            const isAddSlide =
                slide.classList.contains("swimlane-add-column-btn") ||
                slide.classList.contains("swimlane-add-column-input-wrapper")
            const cls = ["swimlane-carousel-dot"]
            if (i === initialActive) {
                cls.push("is-active")
            }
            if (isAddSlide) {
                cls.push("swimlane-carousel-dot--add")
            }
            const dot = indicator.createDiv({ cls: cls.join(" ") })
            dot.addEventListener("click", () => {
                slide.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" })
            })
        }

        this.carouselObserver = new IntersectionObserver(
            entries => {
                for (const entry of entries) {
                    if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                        const idx = slides.indexOf(entry.target as HTMLElement)
                        if (idx !== -1) {
                            this.updateCarouselIndicator(idx)
                        }
                    }
                }
            },
            { root: board, threshold: 0.5 },
        )

        slides.forEach(slide => {
            this.carouselObserver!.observe(slide)
        })
    }

    private updateCarouselIndicator(activeIdx: number): void {
        const dots = this.boardEl.querySelectorAll(".swimlane-carousel-dot")
        dots.forEach((dot, i) => {
            ;(dot as HTMLElement).toggleClass("is-active", i === activeIdx)
        })
    }

    /** Returns the groupKey of the column closest to the board center, or null. */
    private getVisibleColumnKey(): GroupKey | null {
        const board = this.currentBoard
        if (!board) {
            return null
        }

        const columns = board.querySelectorAll<HTMLElement>(".swimlane-column")
        if (columns.length === 0) {
            return null
        }

        const boardRect = board.getBoundingClientRect()
        const boardCenter = boardRect.left + boardRect.width / 2

        let bestKey: string | null = null
        let minDist = Infinity
        columns.forEach(col => {
            const colRect = col.getBoundingClientRect()
            const dist = Math.abs(colRect.left + colRect.width / 2 - boardCenter)
            if (dist < minDist) {
                minDist = dist
                bestKey = col.dataset.groupKey ?? null
            }
        })
        return bestKey as GroupKey | null
    }

    /** Scrolls the board so the column with the given groupKey is visible. */
    private restoreScrollPosition(board: HTMLElement, groupKey: GroupKey): void {
        const col = board.querySelector<HTMLElement>(
            `.swimlane-column[data-group-key="${CSS.escape(groupKey)}"]`,
        )
        if (col) {
            // Use instant scroll so the user doesn't see an animation on rebuild.
            col.scrollIntoView({ behavior: "instant", block: "nearest", inline: "start" })
        }
    }

    /** Save the scrollTop of every card list, keyed by column groupKey. */
    private getCardListScrollTops(): Map<string, number> {
        const result = new Map<string, number>()
        const board = this.currentBoard
        if (!board) {
            return result
        }
        for (const col of board.querySelectorAll<HTMLElement>(".swimlane-column")) {
            const key = col.dataset.groupKey
            const list = col.querySelector<HTMLElement>(".swimlane-card-list")
            if (key && list && list.scrollTop > 0) {
                result.set(key, list.scrollTop)
            }
        }
        return result
    }

    /** Restore scrollTop on rebuilt card lists. */
    private restoreCardListScrollTops(board: HTMLElement, saved: Map<string, number>): void {
        if (saved.size === 0) {
            return
        }
        for (const col of board.querySelectorAll<HTMLElement>(".swimlane-column")) {
            const key = col.dataset.groupKey
            if (!key) {
                continue
            }
            const scrollTop = saved.get(key)
            if (scrollTop === undefined) {
                continue
            }
            const list = col.querySelector<HTMLElement>(".swimlane-card-list")
            if (list) {
                list.scrollTop = scrollTop
            }
        }
    }

    private handleMobileDragSwipe(clientX: number): void {
        const board = this.currentBoard
        if (!board) {
            return
        }

        // Track recent X positions for velocity estimation.
        const now = Date.now()
        this.mobileSwipeXSamples.push({ x: clientX, t: now })
        // Keep only the last 200ms of samples.
        while (this.mobileSwipeXSamples.length > 0 && now - this.mobileSwipeXSamples[0]!.t > 200) {
            this.mobileSwipeXSamples.shift()
        }

        // Find the currently snapped column and use its edges as the trigger zone.
        const visibleKey = this.getVisibleColumnKey()
        const visibleCol = visibleKey
            ? board.querySelector<HTMLElement>(
                  `.swimlane-column[data-group-key="${CSS.escape(visibleKey)}"]`,
              )
            : null
        if (!visibleCol) {
            return
        }

        const colRect = visibleCol.getBoundingClientRect()
        const edgeZone = colRect.width * 0.15

        let direction: 1 | -1 | null = null
        if (clientX < colRect.left + edgeZone) {
            direction = -1
        } else if (clientX > colRect.right - edgeZone) {
            direction = 1
        }

        if (direction === null) {
            this.cancelMobileSwipeDwell()
            // Re-arm once finger is in the center 70% of the column.
            this.mobileSwipeNeedsReturn = false
            return
        }

        // After a swipe fires, block further swipes until finger returns to center.
        if (this.mobileSwipeNeedsReturn) {
            return
        }

        // Check if the finger is moving toward the edge.
        let hasVelocity = false
        const samples = this.mobileSwipeXSamples
        if (samples.length >= 2) {
            const oldest = samples[0]!
            const newest = samples[samples.length - 1]!
            const dt = newest.t - oldest.t
            if (dt > 0) {
                const vx = (newest.x - oldest.x) / dt // px/ms, positive = rightward
                if (direction === 1 && vx >= 0.1) {
                    hasVelocity = true
                } else if (direction === -1 && vx <= -0.1) {
                    hasVelocity = true
                }
            }
        }

        if (this.mobileSwipeDwell?.direction === direction) {
            // Already dwelling — upgrade to fast timer if velocity just appeared.
            if (hasVelocity && this.mobileSwipeDwell.timer === null) {
                const dwell = this.mobileSwipeDwell
                dwell.timer = setTimeout(() => {
                    this.cancelMobileSwipeDwell()
                    this.mobileSwipeNeedsReturn = true
                    this.scrollToAdjacentColumn(direction)
                }, 500) as any
            }
            return
        }

        // Two paths to trigger a swipe:
        // 1. Fast path (500ms): requires velocity toward the edge.
        // 2. Fallback (1200ms): fires unconditionally if finger stays in edge zone.
        this.cancelMobileSwipeDwell()
        const dir = direction
        const fire = () => {
            this.cancelMobileSwipeDwell()
            this.mobileSwipeNeedsReturn = true
            this.scrollToAdjacentColumn(dir)
        }
        this.mobileSwipeDwell = {
            direction: dir,
            timer: hasVelocity ? setTimeout(fire, 500) : null,
            fallbackTimer: setTimeout(fire, 1200),
        }
    }

    private cancelMobileSwipeDwell(): void {
        if (this.mobileSwipeDwell) {
            if (this.mobileSwipeDwell.timer !== null) {
                clearTimeout(this.mobileSwipeDwell.timer)
            }
            clearTimeout(this.mobileSwipeDwell.fallbackTimer)
            this.mobileSwipeDwell = null
        }
    }

    /**
     * Auto-scroll the nearest scrollable card list when the pointer is near
     * the top or bottom edge of the viewport during a drag. Uses a rAF loop
     * that continues as long as the pointer stays in the edge zone.
     */
    private handleDragAutoScroll(clientX: number, clientY: number): void {
        const edgeSize = 60 // pixels from container edge to start scrolling
        const maxSpeed = 5 // pixels per frame at the very edge

        // Use the card list's bounds, not the viewport, so scrolling triggers
        // at the edges of the scrollable area.
        const scrollContainer = this.findScrollContainer(clientX, clientY)
        if (!scrollContainer) {
            if (this.autoScrollRaf !== null) {
                cancelAnimationFrame(this.autoScrollRaf)
                this.autoScrollRaf = null
            }
            return
        }

        const rect = scrollContainer.getBoundingClientRect()
        let speed = 0
        if (clientY > rect.bottom - edgeSize) {
            // Near bottom of card list: scroll down.
            speed = maxSpeed * ((clientY - (rect.bottom - edgeSize)) / edgeSize)
        } else if (clientY < rect.top + edgeSize) {
            // Near top of card list: scroll up.
            speed = -maxSpeed * ((rect.top + edgeSize - clientY) / edgeSize)
        }

        speed = Math.max(-maxSpeed, Math.min(maxSpeed, speed))

        if (Math.abs(speed) < 0.5) {
            if (this.autoScrollRaf !== null) {
                cancelAnimationFrame(this.autoScrollRaf)
                this.autoScrollRaf = null
            }
            return
        }

        // Start or continue the scroll loop.
        if (this.autoScrollRaf !== null) {
            cancelAnimationFrame(this.autoScrollRaf)
        }

        const tick = () => {
            if (!this.cardDnd.isDragging) {
                this.autoScrollRaf = null
                return
            }
            scrollContainer.scrollTop += speed
            this.autoScrollRaf = requestAnimationFrame(tick)
        }
        this.autoScrollRaf = requestAnimationFrame(tick)
    }

    /**
     * In column-drop mode (sort ≠ rank), highlight the column under the pointer
     * instead of showing an insertion-line indicator. Skip the source column
     * since same-column drops are blocked.
     */
    /**
     * Called at drag start (before the card is hidden) to set up column-drop
     * mode: mark the source column and insert a fixed placeholder at the
     * card's position.
     */
    private initColumnDropMode(state: CardDragState, draggable: HTMLElement): void {
        const board = this.currentBoard
        if (!board) {
            return
        }
        const src = board.querySelector<HTMLElement>(
            `.swimlane-column[data-group-key="${CSS.escape(state.groupKey)}"]`,
        )
        if (src) {
            src.addClass("swimlane-column--drag-source")
            this.columnDragSource = src
        }

        // Measure the card while it's still visible, then insert a placeholder.
        const rect = draggable.getBoundingClientRect()
        const placeholder = document.createElement("div")
        placeholder.className = "swimlane-column-drop-placeholder"
        placeholder.setCssStyles({
            height: `${rect.height}px`,
            width: `${rect.width}px`,
        })
        draggable.parentElement?.insertBefore(placeholder, draggable)
        this.columnDropPlaceholder = placeholder
    }

    /**
     * Fallback: clear the column highlight when the pointer leaves all drop
     * areas. The primary highlight is set in getCardDropTarget (synced to
     * the DnD system's resolved target), but when resolveDropTarget returns
     * null, getCardDropTarget isn't called, so we clear here.
     */
    private clearColumnHighlightIfOutside(
        _state: CardDragState,
        clientX: number,
        clientY: number,
    ): void {
        if (!this.columnDropTarget) {
            return
        }
        const board = this.currentBoard
        if (!board) {
            return
        }
        const boardRect = board.getBoundingClientRect()
        if (
            clientX < boardRect.left ||
            clientX > boardRect.right ||
            clientY < boardRect.top ||
            clientY > boardRect.bottom
        ) {
            this.columnDropTarget.removeClass("swimlane-column--drop-target")
            this.columnDropTarget = null
        }
    }

    private clearColumnDropHighlight(): void {
        this.columnDropTarget?.removeClass("swimlane-column--drop-target")
        this.columnDropTarget = null
        this.columnDragSource?.removeClass("swimlane-column--drag-source")
        this.columnDragSource = null
        this.columnDropPlaceholder?.remove()
        this.columnDropPlaceholder = null
    }

    /** Find the scrollable container for the column at the given X position. */
    private findScrollContainer(clientX: number, _clientY: number): HTMLElement | null {
        const board = this.currentBoard
        if (!board) {
            return null
        }
        // On mobile, each column's card list scrolls independently.
        // On desktop, columns grow to content and the board scrolls.
        for (const col of board.querySelectorAll<HTMLElement>(".swimlane-column")) {
            const colRect = col.getBoundingClientRect()
            if (clientX >= colRect.left && clientX <= colRect.right) {
                const list = col.querySelector<HTMLElement>(".swimlane-card-list")
                if (list && list.scrollHeight > list.clientHeight) {
                    return list
                }
            }
        }
        // Fall back to the outer container (desktop layout where it scrolls).
        if (this.boardEl.scrollHeight > this.boardEl.clientHeight) {
            return this.boardEl
        }
        return null
    }

    private scrollToAdjacentColumn(direction: 1 | -1): void {
        const board = this.currentBoard
        if (!board) {
            return
        }

        // Include the add-column slide so drag-swiping can reach it.
        const columns = Array.from(
            board.querySelectorAll<HTMLElement>(
                ".swimlane-column, .swimlane-add-column-btn, .swimlane-add-column-input-wrapper",
            ),
        )
        if (columns.length === 0) {
            return
        }

        const boardRect = board.getBoundingClientRect()
        const boardCenter = boardRect.left + boardRect.width / 2

        let currentIdx = 0
        let minDist = Infinity
        for (let i = 0; i < columns.length; i++) {
            const colRect = columns[i]!.getBoundingClientRect()
            const colCenter = colRect.left + colRect.width / 2
            const dist = Math.abs(colCenter - boardCenter)
            if (dist < minDist) {
                minDist = dist
                currentIdx = i
            }
        }

        const targetIdx = Math.max(0, Math.min(columns.length - 1, currentIdx + direction))
        if (targetIdx === currentIdx) {
            return
        }

        columns[targetIdx]!.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "start",
        })

        this.updateCarouselIndicator(targetIdx)
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

    private getCardDropTarget(
        dropAreaEl: HTMLElement,
        _clientX: number,
        clientY: number,
        draggables: HTMLElement[],
    ): {
        position: LexorankPosition
        placement: { refNode: Node | null; atStart: boolean; atEnd: boolean }
    } | null {
        // In column-drop mode, sync the column highlight to the DnD system's
        // resolved drop area so the visual always matches the actual target.
        if (this.columnDragSource) {
            const col = dropAreaEl.closest<HTMLElement>(".swimlane-column")
            const target = col && col !== this.columnDragSource ? col : null
            if (target !== this.columnDropTarget) {
                this.columnDropTarget?.removeClass("swimlane-column--drop-target")
                this.columnDropTarget = target
                target?.addClass("swimlane-column--drop-target")
            }
        }

        const rankProp = this.rankProp
        const rankOf = (el: HTMLElement | undefined): string | null => el?.dataset[rankProp] || null

        if (draggables.length === 0) {
            return {
                position: { beforeRank: null, afterRank: null, dropIndex: 0 },
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
                        dropIndex: i,
                    },
                    placement: { refNode: card, atStart: i === 0, atEnd: false },
                }
            }
        }
        const last = draggables[draggables.length - 1]
        // On mobile the add-card button is inside the card list, so insert
        // the indicator before it rather than appending to the end.
        const addCardBtn = dropAreaEl.querySelector(
            ".swimlane-add-card-wrapper, .swimlane-add-card-btn",
        )
        return {
            position: {
                beforeRank: rankOf(last),
                afterRank: null,
                dropIndex: draggables.length,
            },
            placement: { refNode: addCardBtn ?? null, atStart: false, atEnd: !addCardBtn },
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

    private getAutomationMutations(
        sourceSwimlane: string | null,
        targetSwimlane: string | null,
        type: "enters" | "leaves" | "created_in",
    ): MatchedMutation[] {
        return matchRules(
            this.automationRules,
            { type, sourceSwimlane, targetSwimlane },
            this.swimlaneProp,
        )
    }

    /**
     * Partitions matched mutations into instant and delayed, then schedules the
     * delayed ones by writing to the .base file. Returns only the instant mutations
     * for immediate application, plus the scheduled entries and delay strings for undo.
     */
    private scheduleDelayedMutations(
        allMutations: MatchedMutation[],
        filePath: string,
        targetSwimlane: string,
        fromSwimlane: string | null,
    ): { instant: FrontmatterMutation[]; scheduledEntries: ScheduledAction[]; delays: string[] } {
        const instant: FrontmatterMutation[] = []
        const delayed: MatchedMutation[] = []
        for (const m of allMutations) {
            if (m.delay) {
                delayed.push(m)
            } else {
                const { delay: _, ...mutation } = m
                instant.push(mutation)
            }
        }

        if (delayed.length === 0) {
            return { instant, scheduledEntries: [], delays: [] }
        }

        const now = Date.now()
        const delays = delayed.map(m => m.delay!)

        // Write to .base file: cancel old entries for source swimlane, add new for target
        if (this.baseFile) {
            void this.app.vault
                .process(this.baseFile, content => {
                    let existing = readScheduledActions(content)
                    if (fromSwimlane) {
                        existing = cancelScheduledActions(existing, filePath, fromSwimlane)
                    }
                    const updated = addScheduledActions(
                        existing,
                        filePath,
                        targetSwimlane,
                        delayed,
                        now,
                    )
                    return writeScheduledActions(content, updated)
                })
                .catch(() => {
                    // Write failed — scheduled actions not persisted. They will be re-scheduled on next move.
                })
            // Start the poller since we now have scheduled items
            this.plugin.startPoller()
        }

        // Build entries for the undo operation
        const scheduledEntries = addScheduledActions([], filePath, targetSwimlane, delayed, now)

        return { instant, scheduledEntries, delays }
    }

    private handleCardDrop(
        dragState: CardDragState,
        context: CardDropContext,
        position: LexorankPosition,
    ): void {
        // Don't clear column-drop highlights here — the placeholder must
        // survive until onDropAnimate (next rAF) reads its rect. The
        // subsequent rebuildBoard() via boardEl.empty() handles cleanup.

        // Snapshot scroll state NOW, before any processFrontMatter calls
        // trigger onDataUpdated → rebuildBoard and blow away the DOM.
        this.savedScrollState = {
            column: this.getVisibleColumnKey(),
            cardListScrollTops: this.getCardListScrollTops(),
            boardScrollTop: this.currentBoard?.scrollTop ?? 0,
            boardScrollLeft: this.boardEl.scrollLeft,
        }

        if (context.groupKey === ADD_COLUMN_DROP_KEY) {
            this.handleCardDropOnNewColumn(dragState)
            return
        }

        const isCrossColumn = context.groupKey !== dragState.groupKey

        // Trigger expand animation on rebuild for cross-column drops in column-drop mode.
        if (isCrossColumn && this.columnDragSource) {
            this.expandingCardPath = dragState.path
        }

        // When sorted by a non-rank property, block same-column reorders
        // (the visual order is driven by that sort field, not rank).
        // Cross-column moves always work.
        if (!isCrossColumn && !this.isSortedByRank) {
            return
        }

        // If no sort is configured, set it to rank so Bases handles ordering.
        if (this.config.getSort().length === 0) {
            this.setSortByRank()
        }

        const file = this.app.vault.getFileByPath(dragState.path)
        if (!file) {
            return
        }

        // Check if the target column has any unranked cards or if adjacent
        // ranks are identical. In these cases midRank can't produce a useful
        // position, so we re-rank the entire column to establish proper ordering.
        if (
            position.beforeRank === position.afterRank ||
            this.columnHasUnrankedCards(context.groupKey)
        ) {
            this.reRankColumn(dragState, context, position)
            return
        }

        // Adjust ranks to account for hidden cards (from filters/search)
        // so midRank doesn't collide with cards that aren't currently visible.
        const adjusted = this.adjustRanksForHiddenCards(
            position.beforeRank,
            position.afterRank,
            context.groupKey,
            dragState.path,
        )
        const newRank = midRank(adjusted.beforeRank, adjusted.afterRank)
        const fromRank = getFrontmatter<string>(this.app, file, this.rankProp) ?? ""
        const label = isCrossColumn ? "Move card" : "Reorder card"

        // Compute automation mutations and capture previous values BEFORE
        // processFrontMatter — the callback is async and runs after endTransaction.
        const fromSwimlane = dragState.groupKey as string
        const toSwimlane = context.groupKey as string
        let mutations: FrontmatterMutation[] = []
        let prevValues: Record<string, unknown> = {}
        let scheduledEntries: ScheduledAction[] = []
        let delays: string[] = []
        if (isCrossColumn) {
            const allMutations = [
                ...this.getAutomationMutations(fromSwimlane, null, "leaves"),
                ...this.getAutomationMutations(fromSwimlane, toSwimlane, "enters"),
            ]
            const scheduled = this.scheduleDelayedMutations(
                allMutations,
                file.path,
                toSwimlane,
                fromSwimlane,
            )
            mutations = scheduled.instant
            scheduledEntries = scheduled.scheduledEntries
            delays = scheduled.delays
            const cache = this.app.metadataCache.getFileCache(file)
            const fm = cache?.frontmatter ?? {}
            for (const m of mutations) {
                prevValues[m.property] = fm[m.property]
            }
        }

        this.undoManager.beginTransaction(label)
        if (isCrossColumn) {
            this.undoManager.pushOperation({
                type: "MoveCard",
                file,
                fromSwimlane,
                toSwimlane,
                fromRank,
                toRank: newRank,
                resolvedAutomationMutations: mutations,
                automationPreviousValues: prevValues,
            })
            if (scheduledEntries.length > 0 && this.baseFile) {
                this.undoManager.pushOperation({
                    type: "ScheduleActions",
                    baseFilePath: this.baseFile.path,
                    entries: scheduledEntries,
                    delays,
                })
            }
        } else {
            this.undoManager.pushOperation({
                type: "ReorderCard",
                file,
                fromRank,
                toRank: newRank,
            })
        }
        this.undoManager.endTransaction()

        this.app.fileManager.processFrontMatter(file, fm => {
            fm[this.rankProp] = newRank
            if (isCrossColumn) {
                fm[this.swimlaneProp] = toSwimlane
                applyMutations(fm, mutations)
            }
        })
    }

    /** Returns true if any card in the column is missing a rank value. */
    private columnHasUnrankedCards(groupKey: GroupKey): boolean {
        const group = this.data.groupedData.find(
            g => g.hasKey() && (g.key?.toString() ?? "") === groupKey,
        )
        if (!group) {
            return false
        }
        return group.entries.some(e => !getFrontmatter<string>(this.app, e.file, this.rankProp))
    }

    /**
     * Re-rank all cards in the target column, inserting the dragged card at
     * the drop position. Uses the dropIndex from getCardDropTarget to
     * determine visual order, since rank values may be missing or degenerate.
     */
    private reRankColumn(
        dragState: CardDragState,
        context: CardDropContext,
        position: LexorankPosition,
    ): void {
        const group = this.data.groupedData.find(
            g => g.hasKey() && (g.key?.toString() ?? "") === context.groupKey,
        )
        const entries = group?.entries ?? []
        const paths = entries.map(e => e.file.path).filter(p => p !== dragState.path)
        const insertIdx = Math.min(position.dropIndex, paths.length)
        paths.splice(insertIdx, 0, dragState.path)

        // Generate evenly-spaced ranks for all cards using midRank.
        // Distribute across the full a–z space by bisecting recursively.
        const ranks = generateSpacedRanks(paths.length)
        const isCrossColumn = context.groupKey !== dragState.groupKey

        // Build all operations BEFORE processFrontMatter calls — the callbacks
        // are async and run after endTransaction.
        const fromSwimlane = dragState.groupKey as string
        const toSwimlane = context.groupKey as string

        this.undoManager.beginTransaction(isCrossColumn ? "Move card" : "Reorder cards")

        // Pre-compute mutations for the dragged card if cross-column.
        let draggedMutations: FrontmatterMutation[] = []
        let draggedPrevValues: Record<string, unknown> = {}
        let draggedScheduledEntries: ScheduledAction[] = []
        let draggedDelays: string[] = []
        if (isCrossColumn) {
            const allMutations = [
                ...this.getAutomationMutations(fromSwimlane, null, "leaves"),
                ...this.getAutomationMutations(fromSwimlane, toSwimlane, "enters"),
            ]
            const scheduled = this.scheduleDelayedMutations(
                allMutations,
                dragState.path,
                toSwimlane,
                fromSwimlane,
            )
            draggedMutations = scheduled.instant
            draggedScheduledEntries = scheduled.scheduledEntries
            draggedDelays = scheduled.delays
            const draggedFile = this.app.vault.getFileByPath(dragState.path)
            if (draggedFile) {
                const cache = this.app.metadataCache.getFileCache(draggedFile)
                const cachedFm = cache?.frontmatter ?? {}
                for (const m of draggedMutations) {
                    draggedPrevValues[m.property] = cachedFm[m.property]
                }
            }
        }

        for (let i = 0; i < paths.length; i++) {
            const path = paths[i]!
            const cardFile = this.app.vault.getFileByPath(path)
            if (!cardFile) {
                continue
            }
            const rank = ranks[i]!
            const fromRank = getFrontmatter<string>(this.app, cardFile, this.rankProp) ?? ""

            if (path === dragState.path && isCrossColumn) {
                this.undoManager.pushOperation({
                    type: "MoveCard",
                    file: cardFile,
                    fromSwimlane,
                    toSwimlane,
                    fromRank,
                    toRank: rank,
                    resolvedAutomationMutations: draggedMutations,
                    automationPreviousValues: draggedPrevValues,
                })
                if (draggedScheduledEntries.length > 0 && this.baseFile) {
                    this.undoManager.pushOperation({
                        type: "ScheduleActions",
                        baseFilePath: this.baseFile.path,
                        entries: draggedScheduledEntries,
                        delays: draggedDelays,
                    })
                }
            } else {
                this.undoManager.pushOperation({
                    type: "ReorderCard",
                    file: cardFile,
                    fromRank,
                    toRank: rank,
                })
            }

            this.app.fileManager.processFrontMatter(cardFile, fm => {
                fm[this.rankProp] = rank
                if (path === dragState.path && isCrossColumn) {
                    fm[this.swimlaneProp] = toSwimlane
                    applyMutations(fm, draggedMutations)
                }
            })
        }

        this.undoManager.endTransaction()
    }

    private handleCardDropOnNewColumn(dragState: CardDragState): void {
        const file = this.app.vault.getFileByPath(dragState.path)
        if (!file) {
            return
        }

        if (this.config.getSort().length === 0) {
            this.setSortByRank()
        }

        const releaseDrop = this.cardDnd.holdDrop()

        const modal = new AddSwimlaneViaDropModal({
            app: this.app,
            swimlaneProp: this.swimlaneProp,
            existingColumns: this.swimlaneOrder as string[],
            onConfirm: columnName => {
                const key = columnName as GroupKey
                const order = this.swimlaneOrder
                const fromSwimlane = dragState.groupKey as string
                const fromRank = getFrontmatter<string>(this.app, file, this.rankProp) ?? ""
                const toRank = midRank(null, null)
                const allMutations = [
                    ...this.getAutomationMutations(fromSwimlane, null, "leaves"),
                    ...this.getAutomationMutations(fromSwimlane, columnName, "enters"),
                ]
                const {
                    instant: mutations,
                    scheduledEntries,
                    delays,
                } = this.scheduleDelayedMutations(allMutations, file.path, columnName, fromSwimlane)
                const cache = this.app.metadataCache.getFileCache(file)
                const cachedFm = cache?.frontmatter ?? {}
                const prevValues: Record<string, unknown> = {}
                for (const m of mutations) {
                    prevValues[m.property] = cachedFm[m.property]
                }

                this.undoManager.beginTransaction("Move card")
                if (!order.includes(key)) {
                    this.undoManager.pushOperation({ type: "AddSwimlane", swimlane: key as string })
                    this.config.set(CONFIG_KEYS.swimlaneOrder, [...order, key])
                }
                this.undoManager.pushOperation({
                    type: "MoveCard",
                    file,
                    fromSwimlane,
                    toSwimlane: columnName,
                    fromRank,
                    toRank,
                    resolvedAutomationMutations: mutations,
                    automationPreviousValues: prevValues,
                })
                if (scheduledEntries.length > 0 && this.baseFile) {
                    this.undoManager.pushOperation({
                        type: "ScheduleActions",
                        baseFilePath: this.baseFile.path,
                        entries: scheduledEntries,
                        delays,
                    })
                }
                this.undoManager.endTransaction()

                this.app.fileManager.processFrontMatter(file, fm => {
                    fm[this.swimlaneProp] = columnName
                    fm[this.rankProp] = toRank
                    applyMutations(fm, mutations)
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

    private showBatchMoveMenu(e: MouseEvent): void {
        const menu = new Menu()
        const columns = this.swimlaneOrder as string[]

        for (const col of columns) {
            menu.addItem(item => {
                item.setTitle(col).onClick(() => {
                    // Save scroll state before the operation
                    this.savedScrollState = {
                        column: this.getVisibleColumnKey(),
                        cardListScrollTops: this.getCardListScrollTops(),
                        boardScrollTop: this.currentBoard?.scrollTop ?? 0,
                        boardScrollLeft: this.boardEl.scrollLeft,
                    }

                    // Collect selected cards with their current swimlane and rank
                    const cards: BatchMoveCard[] = []
                    for (const group of this.data.groupedData) {
                        const groupKey = group.hasKey() ? (group.key?.toString() ?? "") : ""
                        for (const entry of group.entries) {
                            if (this.selectionManager.selected.has(entry.file.path)) {
                                cards.push({
                                    file: entry.file,
                                    currentSwimlane: groupKey,
                                    currentRank:
                                        getFrontmatter<string>(
                                            this.app,
                                            entry.file,
                                            this.rankProp,
                                        ) ?? "",
                                })
                            }
                        }
                    }

                    if (cards.length === 0) {
                        return
                    }

                    // Find the last rank in the target column
                    const targetGroup = this.data.groupedData.find(
                        g => g.hasKey() && (g.key?.toString() ?? "") === col,
                    )
                    let lastRankInTarget: string | null = null
                    if (targetGroup) {
                        for (const entry of targetGroup.entries) {
                            const r = getFrontmatter<string>(this.app, entry.file, this.rankProp)
                            if (r && (lastRankInTarget === null || r > lastRankInTarget)) {
                                lastRankInTarget = r
                            }
                        }
                    }

                    batchMove({
                        app: this.app,
                        cards,
                        targetSwimlane: col,
                        swimlaneProp: this.swimlaneProp,
                        rankProp: this.rankProp,
                        lastRankInTarget,
                        undoManager: this.undoManager,
                        getAutomationMutations: (fromSwimlane, toSwimlane, file) => {
                            const allMutations = [
                                ...this.getAutomationMutations(fromSwimlane, null, "leaves"),
                                ...this.getAutomationMutations(fromSwimlane, toSwimlane, "enters"),
                            ]
                            const scheduled = this.scheduleDelayedMutations(
                                allMutations,
                                file.path,
                                toSwimlane,
                                fromSwimlane,
                            )
                            const mutations = scheduled.instant
                            const cache = this.app.metadataCache.getFileCache(file)
                            const fm = cache?.frontmatter ?? {}
                            const previousValues: Record<string, unknown> = {}
                            for (const m of mutations) {
                                previousValues[m.property] = fm[m.property]
                            }
                            return { mutations, previousValues }
                        },
                    })
                })
            })
        }

        menu.showAtMouseEvent(e)
    }

    private showBatchTagPopover(_e: MouseEvent): void {
        // Dismiss any existing popover
        const existing = this.boardEl.querySelector(".swimlane-batch-tag-popover")
        if (existing) {
            existing.remove()
            return
        }

        const selected = this.selectionManager.selected
        if (selected.size === 0) {
            return
        }

        // Snapshot previous tags per file for undo
        const previousTagsMap = new Map<string, string[]>()
        const selectedFiles: TFile[] = []
        for (const path of selected) {
            const file = this.app.vault.getFileByPath(path)
            if (!file) {
                continue
            }
            selectedFiles.push(file)
            const cache = this.app.metadataCache.getFileCache(file)
            const rawTags = cache?.frontmatter?.tags
            const tags: string[] = Array.isArray(rawTags)
                ? rawTags.filter((t): t is string => typeof t === "string")
                : typeof rawTags === "string"
                  ? [rawTags]
                  : []
            previousTagsMap.set(path, tags)
        }

        // Build union of all tags across selected cards
        const allTags = new Set<string>()
        for (const tags of previousTagsMap.values()) {
            for (const t of tags) {
                allTags.add(t)
            }
        }

        const popover = document.createElement("div")
        popover.className = "swimlane-batch-tag-popover"

        // ── Add tag section ──
        const addSection = popover.createDiv({ cls: "swimlane-batch-tag-section" })
        addSection.createDiv({ cls: "swimlane-batch-tag-label", text: "Add tag" })

        const input = document.createElement("input")
        input.type = "text"
        input.placeholder = "Add tag\u2026"
        input.className = "swimlane-batch-tag-input"
        addSection.appendChild(input)

        // ── Remove tags section ──
        const removeSection = popover.createDiv({ cls: "swimlane-batch-tag-section" })
        removeSection.createDiv({ cls: "swimlane-batch-tag-label", text: "Remove tags" })
        const chipsContainer = removeSection.createDiv({ cls: "swimlane-batch-tag-chips" })

        const renderChips = () => {
            chipsContainer.empty()
            if (allTags.size === 0) {
                chipsContainer.createDiv({ cls: "swimlane-batch-tag-empty", text: "No tags" })
                return
            }
            for (const tag of allTags) {
                const chip = chipsContainer.createEl("span", {
                    cls: "swimlane-card-tag swimlane-card-tag--editable",
                })
                chip.createEl("span", {
                    cls: "swimlane-card-tag-text",
                    text: tag,
                })
                const resolved = this.plugin.tagColorResolver.resolve(tag)
                if (resolved) {
                    chip.style.backgroundColor = resolved.bg
                    chip.style.color = resolved.fg
                }
                const removeBtn = chip.createEl("span", { cls: "swimlane-card-tag-remove" })
                setIcon(removeBtn, "x")
                removeBtn.addEventListener("click", e => {
                    e.stopPropagation()
                    batchRemoveTag({ app: this.app, files: selectedFiles, tag })
                    allTags.delete(tag)
                    renderChips()
                })
            }
        }
        renderChips()

        const addTag = (raw: string) => {
            const tag = raw.trim().replace(/^#/, "")
            if (!tag) {
                return
            }
            batchAddTag({ app: this.app, files: selectedFiles, tag })
            allTags.add(tag)
            renderChips()
        }

        input.addEventListener("keydown", e => {
            if (e.key === "Enter") {
                e.preventDefault()
                addTag(input.value)
                input.value = ""
            } else if (e.key === "Escape") {
                e.preventDefault()
                dismiss()
            }
        })

        // Attach TagSuggest autocomplete
        new TagSuggest(
            this.app,
            input,
            tag => {
                addTag(tag)
                input.value = ""
            },
            () => [...allTags],
        )

        const dismiss = () => {
            popover.remove()
            document.removeEventListener("pointerdown", onOutsidePointerDown, true)

            // Build one undo transaction with EditTags operations for each affected card
            const ops: { file: TFile; previousTags: string[]; newTags: string[] }[] = []
            for (const file of selectedFiles) {
                const prev = previousTagsMap.get(file.path) ?? []
                const cache = this.app.metadataCache.getFileCache(file)
                const rawTags = cache?.frontmatter?.tags
                const newTags: string[] = Array.isArray(rawTags)
                    ? rawTags.filter((t): t is string => typeof t === "string")
                    : typeof rawTags === "string"
                      ? [rawTags]
                      : []
                const changed =
                    prev.length !== newTags.length || prev.some((t, i) => t !== newTags[i])
                if (changed) {
                    ops.push({ file, previousTags: prev, newTags })
                }
            }
            if (ops.length > 0) {
                this.undoManager.beginTransaction(
                    `Edit tags on ${ops.length} card${ops.length === 1 ? "" : "s"}`,
                )
                for (const op of ops) {
                    this.undoManager.pushOperation({
                        type: "EditTags",
                        file: op.file,
                        previousTags: op.previousTags,
                        newTags: op.newTags,
                    })
                }
                this.undoManager.endTransaction()
            }
        }

        // Mobile: prepend a bottom-sheet header with a close button
        if (this.isMobileLayout) {
            const header = popover.createDiv({ cls: "swimlane-batch-tag-header" })
            header.createSpan({ text: "Edit tags" })
            const closeBtn = header.createEl("button", { cls: "swimlane-action-bar-close" })
            setIcon(closeBtn, "x")
            closeBtn.addEventListener("click", dismiss)
            popover.prepend(header)
        }

        // Dismiss on outside click
        let listenAfter = performance.now()
        requestAnimationFrame(() => {
            listenAfter = 0
        })
        const onOutsidePointerDown = (e: PointerEvent) => {
            if (listenAfter > 0) {
                return
            }
            const target = e.target as HTMLElement
            if (popover.contains(target)) {
                return
            }
            if (target.closest(".suggestion-container")) {
                return
            }
            dismiss()
        }
        document.addEventListener("pointerdown", onOutsidePointerDown, true)

        this.boardEl.appendChild(popover)
        input.focus()
    }

    private confirmBatchDelete(): void {
        const selected = this.selectionManager.selected
        if (selected.size === 0) {
            return
        }

        const files: TFile[] = []
        for (const path of selected) {
            const file = this.app.vault.getFileByPath(path)
            if (file) {
                files.push(file)
            }
        }
        if (files.length === 0) {
            return
        }

        const n = files.length
        const modal = new ConfirmBatchDeleteModal(this.app, n, () => {
            batchDelete({ app: this.app, files })
            this.selectionManager.exit()
        })
        modal.open()
    }

    private handleSwimlaneDrop(dragState: SwimlaneDragState, position: GroupKey | null): void {
        const previousOrder = [...this.swimlaneOrder] as string[]
        const newOrder = reorderKeys(this.swimlaneOrder, dragState.groupKey, position)
        this.undoManager.beginTransaction("Reorder swimlane")
        this.undoManager.pushOperation({
            type: "ReorderSwimlane",
            previousOrder,
            newOrder: newOrder as string[],
        })
        this.config.set(CONFIG_KEYS.swimlaneOrder, newOrder)
        this.undoManager.endTransaction()
    }
}

class ConfirmBatchDeleteModal extends Modal {
    private count: number
    private onConfirm: () => void

    constructor(app: import("obsidian").App, count: number, onConfirm: () => void) {
        super(app)
        this.count = count
        this.onConfirm = onConfirm
    }

    onOpen(): void {
        const { contentEl } = this
        this.setTitle("Delete cards")

        contentEl.createEl("p", {
            text: `Delete ${this.count} card${this.count === 1 ? "" : "s"}? This will trash ${this.count} note${this.count === 1 ? "" : "s"}. This cannot be undone.`,
        })

        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText("Cancel").onClick(() => this.close())
            })
            .addButton(btn => {
                btn.setButtonText("Delete")
                    .setWarning()
                    .onClick(() => {
                        this.onConfirm()
                        this.close()
                    })
            })
    }

    onClose(): void {
        this.contentEl.empty()
    }
}
