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
