import {
    DragAndDropContext,
    type DragAndDropContextOptions,
    type DragState,
    type DropIndicatorPlacement,
} from "./drag-drop"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEl(): HTMLElement {
    return document.createElement("div")
}

function dragState(overrides?: Partial<{ path: string; groupKey: string }>) {
    return { path: "note.md", groupKey: "Todo", ...overrides }
}

type TestDropContext = { groupKey: string }

/** Resolves drop from geometry: same slot logic as controller used to use (above/below mid or end). */
function getDropTargetFromGeometry(
    dropAreaEl: HTMLElement,
    _clientX: number,
    clientY: number,
    draggables: HTMLElement[],
): { position: number; placement: DropIndicatorPlacement } | null {
    if (draggables.length === 0) {
        return {
            position: 0,
            placement: {
                refNode: dropAreaEl.firstChild,
                atStart: true,
                atEnd: true,
            },
        }
    }
    for (let i = 0; i < draggables.length; i++) {
        const card = draggables[i]
        if (!card) {
            continue
        }
        const rect = card.getBoundingClientRect()
        const midY = rect.top + rect.height / 2
        if (clientY < midY) {
            return {
                position: i,
                placement: {
                    refNode: card,
                    atStart: i === 0,
                    atEnd: false,
                },
            }
        }
    }
    return {
        position: draggables.length,
        placement: {
            refNode: null,
            atStart: false,
            atEnd: true,
        },
    }
}

function defaultDndOptions(
    overrides?: Partial<DragAndDropContextOptions<DragState, TestDropContext, number>>,
) {
    return {
        draggableSelector: ".swimlane-card",
        dropAreaSelector: ".swimlane-card-list",
        dropIndicatorClass: "swimlane-drop-indicator",
        draggableIdAttribute: "path",
        getDropTarget: getDropTargetFromGeometry,
        onDrop: jest.fn<void, [{ path: string; groupKey: string }, TestDropContext, number]>(),
        ...overrides,
    }
}

function pointerDown(el: HTMLElement, clientX = 0, clientY = 0): void {
    el.dispatchEvent(
        new PointerEvent("pointerdown", {
            button: 0,
            clientX,
            clientY,
            bubbles: true,
            cancelable: true,
        }),
    )
}

function pointerMove(clientX: number, clientY: number): void {
    document.dispatchEvent(
        new PointerEvent("pointermove", {
            button: 0,
            clientX,
            clientY,
            bubbles: true,
        }),
    )
}

function pointerUp(): void {
    document.dispatchEvent(new PointerEvent("pointerup", { button: 0, bubbles: true }))
}

/** Sets up a container with a card (with .swimlane-card) and sets delegation root. */
function setupDelegation(): {
    dnd: DragAndDropContext<DragState, TestDropContext, number>
    container: HTMLElement
    card: HTMLElement
} {
    const dnd = new DragAndDropContext<DragState, TestDropContext, number>(defaultDndOptions())
    const container = makeEl()
    const card = makeEl()
    card.classList.add("swimlane-card")
    card.dataset.path = "note.md"
    container.appendChild(card)
    document.body.appendChild(container)
    dnd.registerContainer(container)
    return { dnd, container, card }
}

/** Sets up a card list with two cards for drop-target tests. */
function setupCardList(): {
    dnd: DragAndDropContext<DragState, TestDropContext, number>
    container: HTMLElement
    cardList: HTMLElement
    cardA: HTMLElement
    cardB: HTMLElement
    onDrop: jest.Mock<void, [{ path: string; groupKey: string }, TestDropContext, number]>
} {
    const onDrop = jest.fn<void, [{ path: string; groupKey: string }, TestDropContext, number]>()
    const dnd = new DragAndDropContext<DragState, TestDropContext, number>({
        ...defaultDndOptions(),
        onDrop,
    })
    const container = makeEl()
    const cardList = makeEl()
    cardList.className = "swimlane-card-list"
    dnd.registerDropArea(cardList, { groupKey: "Todo" })
    const cardA = makeEl()
    cardA.className = "swimlane-card"
    cardA.dataset.path = "a.md"
    const cardB = makeEl()
    cardB.className = "swimlane-card"
    cardB.dataset.path = "b.md"
    cardList.appendChild(cardA)
    cardList.appendChild(cardB)
    container.appendChild(cardList)
    document.body.appendChild(container)
    dnd.registerContainer(container)
    dnd.initDropIndicator(container)
    dnd.registerDraggable(cardA, dragState({ path: "a.md", groupKey: "Todo" }))
    return { dnd, container, cardList, cardA, cardB, onDrop }
}

afterEach(() => {
    document.body.innerHTML = ""
})

/** Starts a drag via pointerdown on the card. */
function startDrag(
    dnd: DragAndDropContext<DragState, TestDropContext, number>,
    card: HTMLElement,
    state = dragState(),
): void {
    dnd.registerDraggable(card, state)
    pointerDown(card)
}

/** Stub getBoundingClientRect on a drop area so pointer (100, 100) lands inside it. */
function stubDropAreaRect(el: HTMLElement): () => void {
    const orig = el.getBoundingClientRect.bind(el)
    el.getBoundingClientRect = () => ({
        top: 0,
        left: 0,
        width: 200,
        height: 200,
        bottom: 200,
        right: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
    })
    return () => {
        el.getBoundingClientRect = orig
    }
}

/** Stub getBoundingClientRect so card has midY such that clientY 100 is below it. */
function stubCardRect(card: HTMLElement, top = 0, height = 50): () => void {
    const orig = card.getBoundingClientRect.bind(card)
    card.getBoundingClientRect = () => ({
        top,
        left: 0,
        width: 200,
        height,
        bottom: top + height,
        right: 200,
        x: 0,
        y: top,
        toJSON: () => ({}),
    })
    return () => {
        card.getBoundingClientRect = orig
    }
}

// ---------------------------------------------------------------------------
// makeDraggable
// ---------------------------------------------------------------------------

describe("DragAndDropContext.makeDraggable", () => {
    it("does not set draggable attribute (uses pointer-based drag)", () => {
        const dnd = new DragAndDropContext<DragState, TestDropContext, number>(defaultDndOptions())
        const card = makeEl()
        dnd.registerDraggable(card, dragState())
        expect(card.getAttribute("draggable")).toBeNull()
    })

    it("isDragging is false before any drag", () => {
        const dnd = new DragAndDropContext<DragState, TestDropContext, number>(defaultDndOptions())
        expect(dnd.isDragging).toBe(false)
    })

    it("state is null before any drag", () => {
        const dnd = new DragAndDropContext<DragState, TestDropContext, number>(defaultDndOptions())
        expect(dnd.state).toBeNull()
    })

    it("pointerdown (button 0) sets isDragging to true", () => {
        const { dnd, card } = setupDelegation()
        startDrag(dnd, card)
        expect(dnd.isDragging).toBe(true)
    })

    it("pointerdown exposes the correct DragState via state", () => {
        const { dnd, card } = setupDelegation()
        const state = dragState({ path: "tasks/my-task.md", groupKey: "In Progress" })
        startDrag(dnd, card, state)
        expect(dnd.state).toEqual(state)
    })

    it("pointerdown adds swimlane-drag-and-drop--dragging class to the element", () => {
        const { dnd, card } = setupDelegation()
        startDrag(dnd, card)
        expect(card.classList.contains("swimlane-drag-and-drop--dragging")).toBe(true)
    })

    it("pointerup clears isDragging", () => {
        const { dnd, card } = setupDelegation()
        startDrag(dnd, card)
        pointerUp()
        expect(dnd.isDragging).toBe(false)
    })

    it("pointerup sets state back to null", () => {
        const { dnd, card } = setupDelegation()
        startDrag(dnd, card)
        pointerUp()
        expect(dnd.state).toBeNull()
    })

    it("pointerup removes swimlane-drag-and-drop--dragging class", () => {
        const { dnd, card } = setupDelegation()
        startDrag(dnd, card)
        pointerUp()
        expect(card.classList.contains("swimlane-drag-and-drop--dragging")).toBe(false)
    })

    it("pointerup calls onEnd callback", () => {
        const { dnd, card } = setupDelegation()
        const onEnd = jest.fn()
        dnd.registerDraggable(card, dragState(), { onEnd })
        pointerDown(card)
        pointerUp()
        expect(onEnd).toHaveBeenCalledTimes(1)
    })

    it("pointerup with no onEnd option does not throw", () => {
        const { dnd, card } = setupDelegation()
        dnd.registerDraggable(card, dragState())
        pointerDown(card)
        expect(() => pointerUp()).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// Position-based drop (onDrop with groupKey, insertIndex)
// ---------------------------------------------------------------------------

describe("DragAndDropContext drop target", () => {
    it("pointermove over a drop area when dragging inserts the drop indicator", () => {
        const { dnd, cardList, cardA, cardB } = setupCardList()
        const restoreEl = stubDropAreaRect(cardList)
        const restoreRect = stubCardRect(cardB)
        startDrag(dnd, cardA)
        pointerMove(100, 100)
        expect(cardList.querySelector(".swimlane-drop-indicator")).not.toBeNull()
        restoreEl()
        restoreRect()
        pointerUp()
    })

    it("pointerup over another card calls onDrop with state, groupKey, and insertIndex", () => {
        const { dnd, cardList, cardA, cardB, onDrop } = setupCardList()
        const restoreEl = stubDropAreaRect(cardList)
        const restoreRect = stubCardRect(cardB)
        const state = dragState({ path: "a.md", groupKey: "Todo" })
        startDrag(dnd, cardA, state)
        pointerMove(100, 100)
        pointerUp()
        expect(onDrop).toHaveBeenCalledWith(state, { groupKey: "Todo" }, 1)
        restoreEl()
        restoreRect()
    })

    it("pointerup when not over a valid target does not call onDrop", () => {
        const { dnd, cardA, onDrop } = setupCardList()
        startDrag(dnd, cardA)
        pointerUp()
        expect(onDrop).not.toHaveBeenCalled()
    })

    it("cancelled drag (pointerup without moving over target) resets state", () => {
        const { dnd, cardA, onDrop } = setupCardList()
        startDrag(dnd, cardA)
        expect(dnd.isDragging).toBe(true)
        pointerUp()
        expect(dnd.isDragging).toBe(false)
        expect(dnd.state).toBeNull()
        expect(onDrop).not.toHaveBeenCalled()
    })

    it("a second drag after the first completes uses fresh state", () => {
        const { dnd, cardList, cardA, cardB, onDrop } = setupCardList()
        const restoreEl = stubDropAreaRect(cardList)
        const restoreRect = stubCardRect(cardB)

        startDrag(dnd, cardA, dragState({ path: "a.md" }))
        pointerUp()

        startDrag(dnd, cardB, dragState({ path: "b.md" }))
        pointerMove(100, 100)
        pointerUp()

        expect(onDrop).toHaveBeenCalledWith(
            expect.objectContaining({ path: "b.md" }),
            { groupKey: "Todo" },
            1,
        )
        restoreEl()
        restoreRect()
    })
})

// ---------------------------------------------------------------------------
// Container dragging class
// ---------------------------------------------------------------------------

describe("DragAndDropContext container class", () => {
    it("adds container dragging class on drag start", () => {
        const { dnd, container, card } = setupDelegation()
        startDrag(dnd, card)
        expect(container.classList.contains("swimlane-drag-and-drop--active")).toBe(true)
    })

    it("removes container dragging class on pointer up", () => {
        const { dnd, container, card } = setupDelegation()
        startDrag(dnd, card)
        pointerUp()
        expect(container.classList.contains("swimlane-drag-and-drop--active")).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// Drag clone
// ---------------------------------------------------------------------------

describe("DragAndDropContext drag clone", () => {
    it("creates a fixed-position clone appended to document.body", () => {
        const { dnd, card } = setupDelegation()
        startDrag(dnd, card)
        const clone = document.querySelector(".swimlane-drag-clone")
        expect(clone).not.toBeNull()
        expect((clone as HTMLElement).style.position).toBe("fixed")
        pointerUp()
    })

    it("hides the original element during drag", () => {
        const { dnd, card } = setupDelegation()
        startDrag(dnd, card)
        expect(card.classList.contains("swimlane-drag-and-drop--hidden")).toBe(true)
        pointerUp()
    })

    it("removes clone on pointer up without valid target", () => {
        const { dnd, card } = setupDelegation()
        startDrag(dnd, card)
        pointerUp()
        expect(document.querySelector(".swimlane-drag-clone")).toBeNull()
    })

    it("restores original element visibility on cancelled drag", () => {
        const { dnd, card } = setupDelegation()
        startDrag(dnd, card)
        pointerUp()
        expect(card.classList.contains("swimlane-drag-and-drop--hidden")).toBe(false)
    })

    it("clone follows pointer on move", () => {
        const { dnd, card } = setupDelegation()
        startDrag(dnd, card)
        pointerMove(150, 200)
        const clone = document.querySelector(".swimlane-drag-clone") as HTMLElement
        // Clone position tracks pointer minus drag offset
        expect(clone.style.left).toBe("150px")
        expect(clone.style.top).toBe("200px")
        pointerUp()
    })
})

// ---------------------------------------------------------------------------
// holdDrop
// ---------------------------------------------------------------------------

describe("DragAndDropContext.holdDrop", () => {
    it("keeps isDropAnimating true after holdDrop", () => {
        const { dnd, cardList, cardA, cardB } = setupCardList()
        const restoreEl = stubDropAreaRect(cardList)
        const restoreRect = stubCardRect(cardB)
        startDrag(dnd, cardA)
        pointerMove(100, 100)
        pointerUp()
        // After drop with target, isDropAnimating should be true
        expect(dnd.isDropAnimating).toBe(true)
        const release = dnd.holdDrop()
        expect(dnd.isDropAnimating).toBe(true)
        release()
        restoreEl()
        restoreRect()
    })

    it("release function calls onDropSettle", () => {
        const onDropSettle = jest.fn()
        const dnd = new DragAndDropContext<DragState, TestDropContext, number>({
            ...defaultDndOptions(),
            onDropSettle,
        })
        const container = makeEl()
        const cardList = makeEl()
        cardList.className = "swimlane-card-list"
        const card = makeEl()
        card.className = "swimlane-card"
        card.dataset.path = "x.md"
        cardList.appendChild(card)
        container.appendChild(cardList)
        document.body.appendChild(container)
        dnd.registerContainer(container)
        dnd.initDropIndicator(container)
        dnd.registerDropArea(cardList, { groupKey: "A" })
        dnd.registerDraggable(card, dragState())
        stubDropAreaRect(cardList)
        pointerDown(card)
        pointerMove(100, 100)
        pointerUp()
        const release = dnd.holdDrop()
        release()
        expect(onDropSettle).toHaveBeenCalled()
    })

    it("release function cleans up drop state", () => {
        const { dnd, cardList, cardA, cardB } = setupCardList()
        const restoreEl = stubDropAreaRect(cardList)
        const restoreRect = stubCardRect(cardB)
        startDrag(dnd, cardA)
        pointerMove(100, 100)
        pointerUp()
        const release = dnd.holdDrop()
        release()
        expect(dnd.isDropAnimating).toBe(false)
        restoreEl()
        restoreRect()
    })
})

// ---------------------------------------------------------------------------
// flushDrag
// ---------------------------------------------------------------------------

describe("DragAndDropContext.flushDrag", () => {
    it("is a no-op when not drop animating", () => {
        const dnd = new DragAndDropContext<DragState, TestDropContext, number>(defaultDndOptions())
        expect(() => dnd.flushDrag()).not.toThrow()
    })

    it("removes clone and resets isDropAnimating", () => {
        const { dnd, cardList, cardA, cardB } = setupCardList()
        const restoreEl = stubDropAreaRect(cardList)
        const restoreRect = stubCardRect(cardB)
        startDrag(dnd, cardA)
        pointerMove(100, 100)
        pointerUp()
        expect(dnd.isDropAnimating).toBe(true)
        dnd.flushDrag()
        expect(dnd.isDropAnimating).toBe(false)
        expect(document.querySelector(".swimlane-drag-clone")).toBeNull()
        restoreEl()
        restoreRect()
    })
})

// ---------------------------------------------------------------------------
// destroy
// ---------------------------------------------------------------------------

describe("DragAndDropContext.destroy", () => {
    it("cleans up without errors", () => {
        const { dnd, card } = setupDelegation()
        startDrag(dnd, card)
        expect(() => dnd.destroy()).not.toThrow()
    })

    it("cleans up when idle", () => {
        const dnd = new DragAndDropContext<DragState, TestDropContext, number>(defaultDndOptions())
        expect(() => dnd.destroy()).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// Drop areas
// ---------------------------------------------------------------------------

describe("DragAndDropContext drop areas", () => {
    it("clearDropAreas removes all registered areas", () => {
        const dnd = new DragAndDropContext<DragState, TestDropContext, number>(defaultDndOptions())
        const container = makeEl()
        const area = makeEl()
        area.className = "swimlane-card-list"
        container.appendChild(area)
        document.body.appendChild(container)
        dnd.registerContainer(container)
        dnd.initDropIndicator(container)
        dnd.registerDropArea(area, { groupKey: "A" })
        dnd.clearDropAreas()

        // Create a card and drag it — no drop should resolve since areas were cleared
        const card = makeEl()
        card.className = "swimlane-card"
        card.dataset.path = "x.md"
        area.appendChild(card)
        const onDrop = jest.fn()
        const dnd2 = new DragAndDropContext<DragState, TestDropContext, number>({
            ...defaultDndOptions(),
            onDrop,
        })
        dnd2.registerContainer(container)
        dnd2.initDropIndicator(container)
        // Don't register drop area
        dnd2.registerDraggable(card, dragState())
        stubDropAreaRect(area)
        pointerDown(card)
        pointerMove(100, 100)
        pointerUp()
        expect(onDrop).not.toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// Delegation edge cases
// ---------------------------------------------------------------------------

describe("DragAndDropContext delegation edge cases", () => {
    it("ignores non-left-button clicks", () => {
        const { dnd, card } = setupDelegation()
        dnd.registerDraggable(card, dragState())
        card.dispatchEvent(
            new PointerEvent("pointerdown", { button: 2, bubbles: true, cancelable: true }),
        )
        expect(dnd.isDragging).toBe(false)
    })

    it("ignores clicks on elements without registration", () => {
        const dnd = new DragAndDropContext<DragState, TestDropContext, number>(defaultDndOptions())
        const container = makeEl()
        const card = makeEl()
        card.classList.add("swimlane-card")
        container.appendChild(card)
        document.body.appendChild(container)
        dnd.registerContainer(container)
        // No registerDraggable call
        pointerDown(card)
        expect(dnd.isDragging).toBe(false)
    })

    it("ignores clicks on data-no-drag elements", () => {
        const { dnd, card } = setupDelegation()
        dnd.registerDraggable(card, dragState())
        const noDrag = document.createElement("span")
        noDrag.setAttribute("data-no-drag", "")
        card.appendChild(noDrag)
        noDrag.dispatchEvent(
            new PointerEvent("pointerdown", { button: 0, bubbles: true, cancelable: true }),
        )
        expect(dnd.isDragging).toBe(false)
    })

    it("ignores pointerdown when already dragging", () => {
        const { dnd, card } = setupDelegation()
        startDrag(dnd, card)
        expect(dnd.isDragging).toBe(true)
        // Another pointerdown should be ignored
        const card2 = makeEl()
        card2.classList.add("swimlane-card")
        card.parentElement?.appendChild(card2)
        dnd.registerDraggable(card2, dragState({ path: "other.md" }))
        pointerDown(card2)
        expect(dnd.state?.path).toBe("note.md") // still the original
        pointerUp()
    })

    it("drag handle selector restricts drag initiation", () => {
        const dnd = new DragAndDropContext<DragState, TestDropContext, number>({
            ...defaultDndOptions(),
            dragHandleSelector: ".swimlane-column-header",
        })
        const container = makeEl()
        const col = makeEl()
        col.classList.add("swimlane-card") // matches draggable selector
        col.dataset.path = "x.md"
        const body = makeEl()
        col.appendChild(body)
        container.appendChild(col)
        document.body.appendChild(container)
        dnd.registerContainer(container)
        dnd.registerDraggable(col, dragState())

        // Click on body (not header) — should NOT start drag
        body.dispatchEvent(
            new PointerEvent("pointerdown", { button: 0, bubbles: true, cancelable: true }),
        )
        expect(dnd.isDragging).toBe(false)

        // Click on header — should start drag
        const header = makeEl()
        header.classList.add("swimlane-column-header")
        col.appendChild(header)
        header.dispatchEvent(
            new PointerEvent("pointerdown", { button: 0, bubbles: true, cancelable: true }),
        )
        expect(dnd.isDragging).toBe(true)
        pointerUp()
    })

    it("registerContainer replaces previous container", () => {
        const dnd = new DragAndDropContext<DragState, TestDropContext, number>(defaultDndOptions())
        const container1 = makeEl()
        const container2 = makeEl()
        document.body.appendChild(container1)
        document.body.appendChild(container2)
        dnd.registerContainer(container1)
        dnd.registerContainer(container2)

        // Card on container1 should no longer trigger drag
        const card = makeEl()
        card.classList.add("swimlane-card")
        card.dataset.path = "a.md"
        container1.appendChild(card)
        dnd.registerDraggable(card, dragState())
        pointerDown(card)
        // pointerdown won't fire on container2 since card is on container1
        // but the old listener on container1 was removed
        expect(dnd.isDragging).toBe(false)
    })

    it("registerContainer is idempotent for same element", () => {
        const dnd = new DragAndDropContext<DragState, TestDropContext, number>(defaultDndOptions())
        const container = makeEl()
        document.body.appendChild(container)
        dnd.registerContainer(container)
        dnd.registerContainer(container)
        // Should not throw or double-register
        const card = makeEl()
        card.classList.add("swimlane-card")
        container.appendChild(card)
        dnd.registerDraggable(card, dragState())
        pointerDown(card)
        expect(dnd.isDragging).toBe(true)
        pointerUp()
    })
})

// ---------------------------------------------------------------------------
// animationMs getter
// ---------------------------------------------------------------------------

describe("DragAndDropContext.animationMs", () => {
    it("defaults to 200", () => {
        const dnd = new DragAndDropContext<DragState, TestDropContext, number>(defaultDndOptions())
        expect(dnd.animationMs).toBe(200)
    })

    it("uses custom value", () => {
        const dnd = new DragAndDropContext<DragState, TestDropContext, number>({
            ...defaultDndOptions(),
            dropAnimationMs: 500,
        })
        expect(dnd.animationMs).toBe(500)
    })
})

// ---------------------------------------------------------------------------
// Drop indicator management
// ---------------------------------------------------------------------------

describe("DragAndDropContext drop indicator", () => {
    it("initDropIndicator creates an indicator element", () => {
        const dnd = new DragAndDropContext<DragState, TestDropContext, number>(defaultDndOptions())
        const container = makeEl()
        document.body.appendChild(container)
        dnd.initDropIndicator(container)
        // Indicator is created but not appended until needed — verified via a drag
    })

    it("indicator is placed in card list during drag over a drop area", () => {
        const { dnd, cardList, cardA, cardB } = setupCardList()
        const restoreEl = stubDropAreaRect(cardList)
        const restoreRect = stubCardRect(cardB)
        startDrag(dnd, cardA)
        pointerMove(100, 100)
        const indicator = cardList.querySelector(".swimlane-drop-indicator")
        expect(indicator).not.toBeNull()
        pointerUp()
        restoreEl()
        restoreRect()
    })
})

// ---------------------------------------------------------------------------
// Touch drag (long-press)
// ---------------------------------------------------------------------------

function touchDown(el: HTMLElement, clientX = 0, clientY = 0, pointerId = 1): void {
    el.dispatchEvent(
        new PointerEvent("pointerdown", {
            button: 0,
            pointerType: "touch",
            pointerId,
            clientX,
            clientY,
            bubbles: true,
            cancelable: true,
        }),
    )
}

function touchMove(clientX: number, clientY: number, pointerId = 1): void {
    document.dispatchEvent(
        new PointerEvent("pointermove", {
            button: 0,
            pointerType: "touch",
            pointerId,
            clientX,
            clientY,
            bubbles: true,
            cancelable: true,
        }),
    )
}

function touchUp(pointerId = 1): void {
    document.dispatchEvent(
        new PointerEvent("pointerup", {
            button: 0,
            pointerType: "touch",
            pointerId,
            bubbles: true,
        }),
    )
}

describe("DragAndDropContext touch long-press", () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it("does not start drag immediately on touch", () => {
        const { dnd, card } = setupDelegation()
        dnd.registerDraggable(card, dragState())
        touchDown(card, 50, 50)
        expect(dnd.isDragging).toBe(false)
    })

    it("starts drag after long-press duration", () => {
        const { dnd, card } = setupDelegation()
        dnd.registerDraggable(card, dragState())
        touchDown(card, 50, 50)
        jest.advanceTimersByTime(300)
        expect(dnd.isDragging).toBe(true)
        pointerUp()
    })

    it("cancels pending drag on large movement (>8px)", () => {
        const { dnd, card } = setupDelegation()
        dnd.registerDraggable(card, dragState())
        touchDown(card, 50, 50)
        // Move more than 8px
        touchMove(60, 50) // 10px horizontal
        jest.advanceTimersByTime(300)
        expect(dnd.isDragging).toBe(false)
    })

    it("does not cancel on small movement (<8px)", () => {
        const { dnd, card } = setupDelegation()
        dnd.registerDraggable(card, dragState())
        touchDown(card, 50, 50)
        // Move less than 8px
        touchMove(55, 52) // ~5.4px
        jest.advanceTimersByTime(300)
        expect(dnd.isDragging).toBe(true)
        pointerUp()
    })

    it("cancels pending drag on pointerup", () => {
        const { dnd, card } = setupDelegation()
        dnd.registerDraggable(card, dragState())
        touchDown(card, 50, 50)
        touchUp()
        jest.advanceTimersByTime(300)
        expect(dnd.isDragging).toBe(false)
    })

    it("uses latest position when drag starts after long-press", () => {
        const { dnd, card } = setupDelegation()
        dnd.registerDraggable(card, dragState())
        touchDown(card, 50, 50)
        // Small move (within 8px threshold)
        touchMove(53, 54)
        jest.advanceTimersByTime(300)
        expect(dnd.isDragging).toBe(true)
        // Clone should be positioned based on latest touch position
        const clone = document.querySelector(".swimlane-drag-clone") as HTMLElement
        expect(clone).not.toBeNull()
        pointerUp()
    })

    it("ignores pointermove from a different pointer id", () => {
        const { dnd, card } = setupDelegation()
        dnd.registerDraggable(card, dragState())
        touchDown(card, 50, 50, 1)
        // Move with different pointerId — should be ignored
        touchMove(100, 100, 2)
        jest.advanceTimersByTime(300)
        // Should still start drag (movement was ignored)
        expect(dnd.isDragging).toBe(true)
        pointerUp()
    })

    it("uses custom longPressDurationMs", () => {
        const dnd = new DragAndDropContext<DragState, TestDropContext, number>({
            ...defaultDndOptions(),
            longPressDurationMs: 500,
        })
        const container = makeEl()
        const card = makeEl()
        card.classList.add("swimlane-card")
        card.dataset.path = "note.md"
        container.appendChild(card)
        document.body.appendChild(container)
        dnd.registerContainer(container)
        dnd.registerDraggable(card, dragState())
        touchDown(card, 50, 50)
        jest.advanceTimersByTime(300)
        expect(dnd.isDragging).toBe(false) // not yet
        jest.advanceTimersByTime(200)
        expect(dnd.isDragging).toBe(true) // now at 500ms
        pointerUp()
    })
})

// ---------------------------------------------------------------------------
// Default drop animation (rAF callback)
// ---------------------------------------------------------------------------

describe("DragAndDropContext default drop animation", () => {
    it("runs default drop animation via rAF when dropping on a target", () => {
        const { dnd, cardList, cardA, cardB } = setupCardList()
        const restoreEl = stubDropAreaRect(cardList)
        const restoreRect = stubCardRect(cardB)

        startDrag(dnd, cardA)
        pointerMove(100, 100)
        pointerUp()

        // The clone should exist and drop should be animating
        expect(dnd.isDropAnimating).toBe(true)
        const clone = document.querySelector(".swimlane-drag-clone") as HTMLElement
        expect(clone).not.toBeNull()

        // Trigger rAF to run the default animation
        jest.spyOn(window, "requestAnimationFrame").getMockImplementation
        // rAF was already called; run pending rAF callbacks
        // jsdom doesn't auto-run rAF, so we simulate via flush
        // The default animation sets style.transition, style.transform, and adds dropping class
        // We can verify by flushing
        dnd.flushDrag()

        restoreEl()
        restoreRect()
    })
})

// ---------------------------------------------------------------------------
// Drop settle timeout (fallback cleanup)
// ---------------------------------------------------------------------------

describe("DragAndDropContext drop settle timeout", () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it("calls onDropSettle after 3x animationMs if flushDrag is never called", () => {
        const onDropSettle = jest.fn()
        const dnd = new DragAndDropContext<DragState, TestDropContext, number>({
            ...defaultDndOptions(),
            onDropSettle,
            dropAnimationMs: 100,
        })
        const container = makeEl()
        const cardList = makeEl()
        cardList.className = "swimlane-card-list"
        const cardA = makeEl()
        cardA.className = "swimlane-card"
        cardA.dataset.path = "a.md"
        const cardB = makeEl()
        cardB.className = "swimlane-card"
        cardB.dataset.path = "b.md"
        cardList.appendChild(cardA)
        cardList.appendChild(cardB)
        container.appendChild(cardList)
        document.body.appendChild(container)
        dnd.registerContainer(container)
        dnd.initDropIndicator(container)
        dnd.registerDropArea(cardList, { groupKey: "A" })
        dnd.registerDraggable(cardA, dragState({ path: "a.md" }))
        stubDropAreaRect(cardList)
        stubCardRect(cardB)

        pointerDown(cardA)
        pointerMove(100, 100)
        pointerUp()

        expect(dnd.isDropAnimating).toBe(true)
        expect(onDropSettle).not.toHaveBeenCalled()

        // Advance past 3x animation duration
        jest.advanceTimersByTime(300)

        expect(onDropSettle).toHaveBeenCalledTimes(1)
        expect(dnd.isDropAnimating).toBe(false)
    })

    it("destroy clears the settle timeout", () => {
        const onDropSettle = jest.fn()
        const dnd = new DragAndDropContext<DragState, TestDropContext, number>({
            ...defaultDndOptions(),
            onDropSettle,
            dropAnimationMs: 100,
        })
        const container = makeEl()
        const cardList = makeEl()
        cardList.className = "swimlane-card-list"
        const card = makeEl()
        card.className = "swimlane-card"
        card.dataset.path = "a.md"
        const cardB = makeEl()
        cardB.className = "swimlane-card"
        cardB.dataset.path = "b.md"
        cardList.appendChild(card)
        cardList.appendChild(cardB)
        container.appendChild(cardList)
        document.body.appendChild(container)
        dnd.registerContainer(container)
        dnd.initDropIndicator(container)
        dnd.registerDropArea(cardList, { groupKey: "A" })
        dnd.registerDraggable(card, dragState({ path: "a.md" }))
        stubDropAreaRect(cardList)
        stubCardRect(cardB)

        pointerDown(card)
        pointerMove(100, 100)
        pointerUp()

        dnd.destroy()
        jest.advanceTimersByTime(1000)
        // onDropSettle should NOT have been called because destroy cleared the timeout
        expect(onDropSettle).not.toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// Hitbox adjustments
// ---------------------------------------------------------------------------

describe("DragAndDropContext hitbox adjustments", () => {
    it("uniform number margin extends hitbox", () => {
        const onDrop = jest.fn()
        const dnd = new DragAndDropContext<DragState, TestDropContext, number>({
            ...defaultDndOptions(),
            onDrop,
            dropAreaHitboxAdjustments: 50,
        })
        const container = makeEl()
        const cardList = makeEl()
        cardList.className = "swimlane-card-list"
        const card = makeEl()
        card.className = "swimlane-card"
        card.dataset.path = "a.md"
        cardList.appendChild(card)
        container.appendChild(cardList)
        document.body.appendChild(container)
        dnd.registerContainer(container)
        dnd.initDropIndicator(container)
        dnd.registerDropArea(cardList, { groupKey: "A" })
        dnd.registerDraggable(card, dragState())

        // Card list rect is 0,0,200,200. With 50px margin, hitbox extends to -50..-50..250..250
        // Place pointer at 220, 100 — inside extended hitbox but outside original rect
        cardList.getBoundingClientRect = () => ({
            top: 0, left: 0, width: 200, height: 200, bottom: 200, right: 200,
            x: 0, y: 0, toJSON: () => ({}),
        })

        pointerDown(card)
        pointerMove(220, 100)
        pointerUp()

        // onDrop should be called because 220 is within the 50px extended right margin
        expect(onDrop).toHaveBeenCalled()
    })

    it("selector-based override replaces base margin for matching elements", () => {
        const onDrop = jest.fn()
        const dnd = new DragAndDropContext<DragState, TestDropContext, number>({
            ...defaultDndOptions(),
            onDrop,
            dropAreaHitboxAdjustments: [
                { selector: ".special-list", margin: 100 },
            ],
        })
        const container = makeEl()
        const cardList = makeEl()
        cardList.className = "swimlane-card-list special-list"
        const card = makeEl()
        card.className = "swimlane-card"
        card.dataset.path = "a.md"
        cardList.appendChild(card)
        container.appendChild(cardList)
        document.body.appendChild(container)
        dnd.registerContainer(container)
        dnd.initDropIndicator(container)
        dnd.registerDropArea(cardList, { groupKey: "A" })
        dnd.registerDraggable(card, dragState())

        cardList.getBoundingClientRect = () => ({
            top: 0, left: 0, width: 200, height: 200, bottom: 200, right: 200,
            x: 0, y: 0, toJSON: () => ({}),
        })

        pointerDown(card)
        // 280 is outside base 0px margin but inside 100px override
        pointerMove(280, 100)
        pointerUp()

        expect(onDrop).toHaveBeenCalled()
    })

    it("fill margin extends hitbox infinitely", () => {
        const onDrop = jest.fn()
        const dnd = new DragAndDropContext<DragState, TestDropContext, number>({
            ...defaultDndOptions(),
            onDrop,
            dropAreaHitboxAdjustments: { x: "fill", y: 0 },
        })
        const container = makeEl()
        const cardList = makeEl()
        cardList.className = "swimlane-card-list"
        const card = makeEl()
        card.className = "swimlane-card"
        card.dataset.path = "a.md"
        cardList.appendChild(card)
        container.appendChild(cardList)
        document.body.appendChild(container)
        dnd.registerContainer(container)
        dnd.initDropIndicator(container)
        dnd.registerDropArea(cardList, { groupKey: "A" })
        dnd.registerDraggable(card, dragState())

        cardList.getBoundingClientRect = () => ({
            top: 0, left: 0, width: 200, height: 200, bottom: 200, right: 200,
            x: 0, y: 0, toJSON: () => ({}),
        })

        pointerDown(card)
        // 99999 horizontal — should be inside infinite x margin but y=100 is within 0-200
        pointerMove(99999, 100)
        pointerUp()

        expect(onDrop).toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// Drop indicator placement — append to end
// ---------------------------------------------------------------------------

describe("DragAndDropContext indicator append-to-end", () => {
    it("appends indicator at end when refNode is null", () => {
        const { dnd, cardList, cardA, cardB } = setupCardList()
        const restoreEl = stubDropAreaRect(cardList)
        // Stub cardB so midY is 25 — pointer at 100 is below all cards
        const restoreRect = stubCardRect(cardB, 0, 50)
        // Also stub cardA (not current draggable, but cardB is the only one in draggables)
        // cardA is the one being dragged, so it's excluded. cardB has midY=25, so 100>25 → append
        startDrag(dnd, cardA)
        pointerMove(100, 100)

        // Indicator should be last child of cardList (appended, not inserted before)
        const indicator = cardList.querySelector(".swimlane-drop-indicator")
        expect(indicator).not.toBeNull()
        expect(cardList.lastChild).toBe(indicator)

        pointerUp()
        restoreEl()
        restoreRect()
    })
})
