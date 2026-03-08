import { SwimlaneView } from "./swimlane-view"

function makeEntry(basename: string) {
    return {
        file: { basename },
        getValue: () => null,
    }
}

function makeGroup(key: string | null, entries: ReturnType<typeof makeEntry>[]) {
    return {
        key: key ? { toString: () => key } : null,
        entries,
        hasKey: () => key !== null,
    }
}

function makeView(groups: ReturnType<typeof makeGroup>[]) {
    const container = document.createElement("div")
    const view = new SwimlaneView({} as any, container, {} as any)
    view.data = { groupedData: groups } as any
    return { view, container }
}

describe("SwimlaneView.onDataUpdated", () => {
    it("renders empty-state message when no groups have keys", () => {
        const { view, container } = makeView([makeGroup(null, [])])
        view.onDataUpdated()
        expect(container.querySelector(".swimlane-empty")).not.toBeNull()
        expect(container.querySelector(".swimlane-board")).toBeNull()
    })

    it("renders one column per group", () => {
        const { view, container } = makeView([
            makeGroup("Backlog", [makeEntry("Note A")]),
            makeGroup("In Progress", [makeEntry("Note B"), makeEntry("Note C")]),
        ])
        view.onDataUpdated()
        const cols = container.querySelectorAll(".swimlane-column")
        expect(cols).toHaveLength(2)
    })

    it("renders the group label in each column header", () => {
        const { view, container } = makeView([makeGroup("Done", [makeEntry("Note X")])])
        view.onDataUpdated()
        const header = container.querySelector(".swimlane-column-header")
        expect(header?.textContent).toContain("Done")
    })

    it("renders one card per entry", () => {
        const { view, container } = makeView([
            makeGroup("Backlog", [makeEntry("Alpha"), makeEntry("Beta"), makeEntry("Gamma")]),
        ])
        view.onDataUpdated()
        const cards = container.querySelectorAll(".swimlane-card")
        expect(cards).toHaveLength(3)
    })

    it("renders the note basename as the card title", () => {
        const { view, container } = makeView([
            makeGroup("Backlog", [makeEntry("My Important Note")]),
        ])
        view.onDataUpdated()
        const title = container.querySelector(".swimlane-card-title")
        expect(title?.textContent).toBe("My Important Note")
    })

    it("clears and re-renders on subsequent calls", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("Note A")])])
        view.onDataUpdated()
        view.data = { groupedData: [makeGroup("Done", [makeEntry("Note B")])] } as any
        view.onDataUpdated()
        const titles = container.querySelectorAll(".swimlane-card-title")
        expect(titles).toHaveLength(1)
        expect(titles[0]?.textContent).toBe("Note B")
    })
})
