export interface DragState {
    path: string
    groupKey: string
}

export interface RegisterDraggableOptions {
    onEnd?: () => void
}

/**
 * Opaque context for a drop area. The consumer (e.g. swimlane view) registers each
 * drop area with a context (e.g. `{ groupKey: string }`); that same context is passed
 * to onDrop so the consumer can apply the drop without the controller knowing its shape.
 */
export type DragContext = unknown

interface DraggableRegistration {
    state: DragState
    options?: RegisterDraggableOptions
}

/** Tells the controller where to place the drop indicator in the DOM and for styling. */
export interface DropIndicatorPlacement {
    /** Insert indicator before this node; if null, append to end of drop area. */
    refNode: Node | null
    atStart: boolean
    atEnd: boolean
}

export interface DropTarget<TContext = DragContext, TPosition = number> {
    context: TContext
    /** Consumer-defined drop position data */
    dropPosition: TPosition
    /** Where to show the indicator; provided by getDropTarget. */
    placement: DropIndicatorPlacement
    dropAreaEl: HTMLElement
}

/**
 * Called to resolve the drop target from pointer position. The caller decides both
 * the insert (TInsert) and where the indicator goes (placement), so the controller
 * never uses indices. Return null if the position is not a valid drop.
 */
export type GetDropTargetFn<TPosition = number> = (
    dropAreaEl: HTMLElement,
    clientX: number,
    clientY: number,
    draggablesExcludingCurrent: HTMLElement[],
) => { position: TPosition; placement: DropIndicatorPlacement } | null

export interface DragAndDropContextOptions<TContext = DragContext, TPosition = number> {
    /** CSS selector to find the draggable element from the event target (e.g. ".draggable-item"). */
    draggableSelector: string
    /** Class name applied to the drop indicator element. */
    dropIndicatorClass: string
    /** Name of the data attribute on each draggable that holds the item id (e.g. "path"). */
    draggableIdAttribute: string
    /** Class name applied to the element being dragged. */
    draggingClass: string
    /** Class name applied to the delegation root while any drag is active. Defaults to "is-dragging-active". */
    containerDraggingClass?: string
    /** Class name applied to the floating drag clone. Defaults to "drag-clone". The drop animation adds "<dragCloneClass>--dropping". */
    dragCloneClass?: string
    /** Class name applied to the original element while it is hidden during a drag. Defaults to "is-drag-hidden". */
    hiddenClass?: string
    /** Resolves (dropArea, pointer, draggables) to insert + indicator placement. No indices. */
    getDropTarget: GetDropTargetFn<TPosition>
    /** Optional: compare two inserts to avoid redundant updates. Defaults to Object.is. */
    positionsEqual?: (a: TPosition, b: TPosition) => boolean
    /** Called when a draggable is dropped at (context, position). */
    onDrop: (state: DragState, context: TContext, position: TPosition) => void
    /** Duration in ms of the drop animation. Defaults to 200. */
    dropAnimationMs?: number
    /**
     * Called inside a requestAnimationFrame after a successful drop to animate the clone
     * flying to its destination. Receives the clone, pixel deltas (dx, dy) from clone to
     * indicator, and the configured duration. Defaults to a translate + fade animation.
     */
    onDropAnimate?: (clone: HTMLElement, dx: number, dy: number, durationMs: number) => void
}

/**
 * Manages pointer-based drag-and-drop with a single position-based drop indicator
 * (inspired by Kanban-style UX). Uses event delegation and one visual line that
 * appears above/below the draggable under the cursor or at the end of a drop area.
 * Drop areas are registered with a context (DragContext); that context is passed
 * to onDrop so the consumer can handle the drop without the controller knowing its shape.
 */
export class DragAndDropContext<TContext = DragContext, TPosition = number> {
    private readonly draggableSelector: string
    private readonly dropIndicatorClass: string
    private readonly pathAttribute: string
    private readonly draggingClass: string
    private readonly containerDraggingClass: string
    private readonly dragCloneClass: string
    private readonly dragCloneDroppingClass: string
    private readonly hiddenClass: string
    private readonly getDropTarget: GetDropTargetFn<TPosition>
    private readonly insertEquals: (a: TPosition, b: TPosition) => boolean
    private readonly onDropCallback: (
        state: DragState,
        context: TContext,
        insert: TPosition,
    ) => void
    private readonly dropAnimationMs: number
    private readonly onDropAnimate: (
        clone: HTMLElement,
        dx: number,
        dy: number,
        durationMs: number,
    ) => void
    private dragging: DragState | null = null
    private dropAnimating = false
    private dropSettleTimeout: ReturnType<typeof setTimeout> | null = null
    private droppingEl: HTMLElement | null = null
    private currentTarget: DropTarget<TContext, TPosition> | null = null
    private draggable: HTMLElement | null = null
    private dragOptions: RegisterDraggableOptions | undefined
    private dragClone: HTMLElement | null = null
    private dragOffset = { x: 0, y: 0 }
    private boundMove: ((e: PointerEvent) => void) | null = null
    private boundUp: ((e: PointerEvent) => void) | null = null
    private readonly registry = new WeakMap<HTMLElement, DraggableRegistration>()
    private readonly dropAreaContexts = new Map<HTMLElement, TContext>()
    private container: HTMLElement | null = null
    private boundDelegate: ((e: PointerEvent) => void) | null = null
    private dropIndicator: HTMLElement | null = null

    constructor(options: DragAndDropContextOptions<TContext, TPosition>) {
        this.draggableSelector = options.draggableSelector
        this.dropIndicatorClass = options.dropIndicatorClass
        this.pathAttribute = options.draggableIdAttribute
        this.draggingClass = options.draggingClass
        this.containerDraggingClass = options.containerDraggingClass ?? "is-dragging-active"
        this.dragCloneClass = options.dragCloneClass ?? "drag-clone"
        this.dragCloneDroppingClass = `${this.dragCloneClass}--dropping`
        this.hiddenClass = options.hiddenClass ?? "is-drag-hidden"
        this.getDropTarget = options.getDropTarget
        this.insertEquals = options.positionsEqual ?? ((a, b) => Object.is(a, b))
        this.onDropCallback = options.onDrop
        this.dropAnimationMs = options.dropAnimationMs ?? 200
        this.onDropAnimate =
            options.onDropAnimate ??
            ((clone, dx, dy, durationMs) => {
                clone.style.transition = `transform ${durationMs}ms cubic-bezier(0.2, 0, 0, 1), opacity ${durationMs}ms ease`
                clone.style.transform = `translate(${dx}px, ${dy}px) rotate(0deg)`
                clone.addClass(this.dragCloneDroppingClass)
            })
    }

    get state(): DragState | null {
        return this.dragging
    }

    get isDragging(): boolean {
        return this.dragging !== null
    }

    get isDropAnimating(): boolean {
        return this.dropAnimating
    }

    /**
     * Register a drop area with its context. Call when building the UI for each drop area.
     * The same context is passed to onDrop when a drop occurs in this area.
     */
    public registerDropArea(dropAreaEl: HTMLElement, context: TContext): void {
        this.dropAreaContexts.set(dropAreaEl, context)
    }

    /**
     * Clear all registered drop areas. Call at the start of a rebuild so old elements
     * are not retained in the map.
     */
    public clearDropAreas(): void {
        this.dropAreaContexts.clear()
    }

    public registerDraggable(
        el: HTMLElement,
        state: DragState,
        options?: RegisterDraggableOptions,
    ): void {
        this.registry.set(el, { state, options })
        el.classList.add("drag-touch-none")
    }

    /**
     * Attach a single capture-phase pointerdown listener so we receive events
     * before Obsidian/Bases. Call once, e.g. in the view constructor.
     */
    public registerContainer(containerEl: HTMLElement): void {
        if (this.container === containerEl) {
            return
        }
        if (this.boundDelegate) {
            this.container?.removeEventListener("pointerdown", this.boundDelegate, {
                capture: true,
            })
            this.boundDelegate = null
        }
        this.container = containerEl
        this.boundDelegate = (e: PointerEvent) => this.onDelegatedPointerDown(e)
        containerEl.addEventListener("pointerdown", this.boundDelegate, { capture: true })
    }

    /**
     * Create or reattach the drop indicator. Call whenever the board is (re)built so the
     * indicator lives in the current DOM.
     */
    public initDropIndicator(containerEl: HTMLElement): void {
        this.dropIndicator?.remove()
        this.dropIndicator = containerEl.ownerDocument.createElement("div")
        this.dropIndicator.className = this.dropIndicatorClass
        // Not appended yet — inserted into the drop area only when visible.
    }

    /**
     * Call this after the board has been rebuilt following a drop. Removes the
     * drop clone so it never outlives the new card render.
     */
    public flushDrag(): void {
        if (!this.dropAnimating) {
            return
        }
        if (this.dropSettleTimeout !== null) {
            clearTimeout(this.dropSettleTimeout)
            this.dropSettleTimeout = null
        }
        this.dragClone?.remove()
        this.dragClone = null
        this.hideDropIndicator()
        this.dropAnimating = false
        // Restore the original element if the board didn't rebuild (e.g. same-position
        // drop where processFrontMatter made no change and onDataUpdated never fired).
        if (this.droppingEl?.isConnected) {
            this.droppingEl.removeClass(this.hiddenClass)
            this.droppingEl.removeClass(this.draggingClass)
        }
        this.droppingEl = null
    }

    /**
     * Clean up when the view is unloaded.
     */
    destroy(): void {
        this.dropIndicator?.remove()
        this.dropIndicator = null
        this.dragClone?.remove()
        this.dragClone = null
        this.hideDropIndicator()
        if (this.dropSettleTimeout !== null) {
            clearTimeout(this.dropSettleTimeout)
            this.dropSettleTimeout = null
        }
        this.cleanupListeners()
        this.container?.classList.remove(this.containerDraggingClass)
        this.container = null
        this.boundDelegate = null
        this.dragging = null
        this.currentTarget = null
        this.draggable = null
        this.droppingEl = null
    }

    private onDelegatedPointerDown(e: PointerEvent): void {
        if (this.dragging) {
            return
        }
        const draggableEl = (e.target as HTMLElement).closest(
            this.draggableSelector,
        ) as HTMLElement | null
        if (!draggableEl) {
            return
        }
        const reg = this.registry.get(draggableEl)
        if (!reg) {
            return
        }
        if (e.button !== 0) {
            return
        }
        e.preventDefault()
        this.startDrag(draggableEl, reg.state, reg.options, e)
    }

    private startDrag(
        draggable: HTMLElement,
        state: DragState,
        options: RegisterDraggableOptions | undefined,
        e: PointerEvent,
    ): void {
        this.dragging = state
        this.draggable = draggable
        this.dragOptions = options

        const rect = draggable.getBoundingClientRect()
        this.dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        if (this.dropIndicator) {
            this.dropIndicator.setCssStyles({
                height: `${rect.height}px`,
                width: `${rect.width}px`,
            })
        }
        const clone = draggable.cloneNode(true) as HTMLElement
        draggable.addClass(this.hiddenClass)
        draggable.addClass(this.draggingClass)
        this.container?.classList.add(this.containerDraggingClass)
        clone.setCssStyles({
            position: "fixed",
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            pointerEvents: "none",
            zIndex: "9999",
            margin: "0",
        })
        clone.classList.add(this.dragCloneClass)
        document.body.appendChild(clone)
        this.dragClone = clone

        this.boundMove = (e: PointerEvent) => this.onPointerMove(e)
        this.boundUp = (e: PointerEvent) => this.onPointerUp(e)
        document.addEventListener("pointermove", this.boundMove, { capture: true })
        document.addEventListener("pointerup", this.boundUp, { capture: true })
        document.addEventListener("pointercancel", this.boundUp, { capture: true })
    }

    private onPointerMove(e: PointerEvent): void {
        if (this.dragClone) {
            this.dragClone.style.left = `${e.clientX - this.dragOffset.x}px`
            this.dragClone.style.top = `${e.clientY - this.dragOffset.y}px`
        }

        if (!this.dragging || !this.dropIndicator) {
            return
        }

        const target = this.resolveDropTarget(e.clientX, e.clientY)
        if (
            target &&
            (this.currentTarget?.dropAreaEl !== target.dropAreaEl ||
                !this.insertEquals(this.currentTarget.dropPosition, target.dropPosition))
        ) {
            this.currentTarget = target
            this.showDropIndicator(e.clientX, e.clientY, target)
        } else if (!target) {
            this.currentTarget = null
            this.hideDropIndicator()
        }
    }

    private resolveDropTarget(
        clientX: number,
        clientY: number,
    ): DropTarget<TContext, TPosition> | null {
        // Resolve drop area by hit-testing registered areas; don't use elementFromPoint,
        // because during drag a drag image or overlay can be under the pointer and we'd
        // only get a target when over empty space (e.g. end of list).
        let dropAreaEl: HTMLElement | null = null
        for (const el of this.dropAreaContexts.keys()) {
            const rect = el.getBoundingClientRect()
            if (
                clientX >= rect.left &&
                clientX <= rect.right &&
                clientY >= rect.top &&
                clientY <= rect.bottom
            ) {
                dropAreaEl = el
                break
            }
        }
        if (!dropAreaEl) {
            return null
        }

        const context = this.dropAreaContexts.get(dropAreaEl)
        if (context === undefined) {
            return null
        }

        const draggables = Array.from(
            dropAreaEl.querySelectorAll(this.draggableSelector),
        ) as HTMLElement[]
        const draggingPath = this.dragging?.path ?? ""
        const pathAttr = this.pathAttribute
        const draggablesExcludingCurrent = draggables.filter(
            d => (d.dataset[pathAttr as keyof DOMStringMap] as string) !== draggingPath,
        )

        const result = this.getDropTarget(dropAreaEl, clientX, clientY, draggablesExcludingCurrent)
        if (!result) {
            return null
        }
        return {
            context,
            dropPosition: result.position,
            placement: result.placement,
            dropAreaEl,
        }
    }

    private showDropIndicator(
        _clientX: number,
        _clientY: number,
        target: DropTarget<TContext, TPosition>,
    ): void {
        const dropAreaEl = target.dropAreaEl
        if (!dropAreaEl || !this.dropIndicator) {
            return
        }

        const { refNode } = target.placement
        if (refNode) {
            dropAreaEl.insertBefore(this.dropIndicator, refNode)
        } else {
            dropAreaEl.appendChild(this.dropIndicator)
        }
    }

    private hideDropIndicator(): void {
        this.dropIndicator?.remove()
    }

    private onPointerUp(_e: PointerEvent): void {
        this.cleanupListeners()
        const target = this.currentTarget
        const state = this.dragging
        const draggableEl = this.draggable
        const options = this.dragOptions
        const clone = this.dragClone
        const indicator = this.dropIndicator

        this.dragging = null
        this.draggable = null
        this.dragOptions = undefined
        this.currentTarget = null
        this.container?.classList.remove(this.containerDraggingClass)

        if (clone && indicator?.parentElement && target) {
            // Keep this.dragClone set so flushDrag() can remove it.
            this.droppingEl = draggableEl
            const fromRect = clone.getBoundingClientRect()
            const toRect = indicator.getBoundingClientRect()
            const dx = toRect.left - fromRect.left
            const dy = toRect.top - fromRect.top
            // Leave indicator in the card list — it holds the space open during the
            // animation so cards don't shift. flushDrag() removes it just
            // before the board rebuild, batching both into one render frame.
            this.dropAnimating = true
            requestAnimationFrame(() => this.onDropAnimate(clone, dx, dy, this.dropAnimationMs))
            // Fallback: clean up if the view never calls flushDrag.
            this.dropSettleTimeout = setTimeout(() => this.flushDrag(), this.dropAnimationMs * 3)
        } else {
            this.hideDropIndicator()
            clone?.remove()
            this.dragClone = null
            if (draggableEl?.isConnected) {
                draggableEl.removeClass(this.hiddenClass)
                draggableEl.removeClass(this.draggingClass)
            }
        }

        if (target && state) {
            this.onDropCallback(state, target.context, target.dropPosition)
        }
        options?.onEnd?.()
    }

    private cleanupListeners(): void {
        if (this.boundMove) {
            document.removeEventListener("pointermove", this.boundMove, { capture: true })
            this.boundMove = null
        }
        if (this.boundUp) {
            document.removeEventListener("pointerup", this.boundUp, { capture: true })
            document.removeEventListener("pointercancel", this.boundUp, { capture: true })
            this.boundUp = null
        }
    }
}
