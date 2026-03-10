import { SwimlaneView } from "./swimlane-view"

function makeEntry(basename: string) {
    return {
        file: { basename, path: `${basename}.md` },
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

function makeView(groups: ReturnType<typeof makeGroup>[], configOverrides?: Record<string, any>) {
    const container = document.createElement("div")
    const view = new SwimlaneView({} as any, container, {} as any)
    view.data = { groupedData: groups, data: groups.flatMap(g => g.entries), properties: [] } as any
    view.app = {
        metadataCache: { getFileCache: () => null },
        vault: {
            getFileByPath: () => null,
            getAbstractFileByPath: () => null,
            create: jest.fn(async (path: string) => ({
                path,
                basename: path.replace(/\.md$/, ""),
            })),
        },
        workspace: { openLinkText: jest.fn() },
        fileManager: {
            processFrontMatter: jest.fn(async () => {}),
            getNewFileParent: () => ({ path: "/", isRoot: () => true }),
            trashFile: jest.fn(),
        },
    } as any
    const configStore: Record<string, any> = { ...configOverrides }
    view.config = {
        get: (key: string) => configStore[key] ?? null,
        set: (key: string, value: any) => {
            configStore[key] = value
        },
        getAsPropertyId: () => null,
    } as any
    return { view, container, configStore }
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
        view.data = {
            groupedData: [makeGroup("Done", [makeEntry("Note B")])],
            data: [makeEntry("Note B")],
            properties: [],
        } as any
        view.onDataUpdated()
        const titles = container.querySelectorAll(".swimlane-card-title")
        expect(titles).toHaveLength(1)
        expect(titles[0]?.textContent).toBe("Note B")
    })
})

describe("hidden swimlanes", () => {
    it("excludes hidden swimlane keys from rendered columns", () => {
        const { view, container } = makeView(
            [
                makeGroup("Backlog", [makeEntry("A")]),
                makeGroup("Done", [makeEntry("B")]),
                makeGroup("Archive", [makeEntry("C")]),
            ],
            { hiddenSwimlanes: ["Done"] },
        )
        view.onDataUpdated()
        const cols = container.querySelectorAll(".swimlane-column")
        expect(cols).toHaveLength(2)
        const headers = Array.from(container.querySelectorAll(".swimlane-column-header"))
        const labels = headers.map(h => h.firstElementChild?.textContent)
        expect(labels).toContain("Backlog")
        expect(labels).toContain("Archive")
        expect(labels).not.toContain("Done")
    })

    it("renders all columns when hiddenSwimlanes is not set", () => {
        const { view, container } = makeView([
            makeGroup("Backlog", [makeEntry("A")]),
            makeGroup("Done", [makeEntry("B")]),
        ])
        view.onDataUpdated()
        const cols = container.querySelectorAll(".swimlane-column")
        expect(cols).toHaveLength(2)
    })
})

describe("add card button", () => {
    it("renders add card button by default", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()
        expect(container.querySelector(".swimlane-add-card-btn")).not.toBeNull()
    })

    it("hides add card button when showAddCard is false", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])], {
            showAddCard: false,
        })
        view.onDataUpdated()
        expect(container.querySelector(".swimlane-add-card-btn")).toBeNull()
    })
})

describe("add swimlane button", () => {
    it("renders add swimlane button by default", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()
        expect(container.querySelector(".swimlane-add-column-btn")).not.toBeNull()
    })

    it("hides add swimlane button when showAddColumn is false", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])], {
            showAddColumn: false,
        })
        view.onDataUpdated()
        expect(container.querySelector(".swimlane-add-column-btn")).toBeNull()
    })
})

describe("remove swimlane button", () => {
    it("renders remove button on each column header when showAddColumn is enabled", () => {
        const { view, container } = makeView(
            [makeGroup("Backlog", [makeEntry("A")]), makeGroup("Done", [makeEntry("B")])],
            { showAddColumn: true },
        )
        view.onDataUpdated()
        const removeBtns = container.querySelectorAll(".swimlane-column-remove")
        expect(removeBtns).toHaveLength(2)
    })

    it("remove button has data-no-drag attribute", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])], {
            showAddColumn: true,
        })
        view.onDataUpdated()
        const btn = container.querySelector(".swimlane-column-remove")
        expect(btn?.hasAttribute("data-no-drag")).toBe(true)
    })
})

describe("column count badge", () => {
    it("shows the number of entries in each column", () => {
        const { view, container } = makeView([
            makeGroup("Backlog", [makeEntry("A"), makeEntry("B"), makeEntry("C")]),
        ])
        view.onDataUpdated()
        const count = container.querySelector(".swimlane-column-count")
        expect(count?.textContent).toBe("3")
    })

    it("shows 0 for columns with no entries", () => {
        const { view, container } = makeView([makeGroup("Empty", [])], { swimlaneOrder: ["Empty"] })
        view.onDataUpdated()
        const count = container.querySelector(".swimlane-column-count")
        expect(count?.textContent).toBe("0")
    })
})

describe("highlightColumn", () => {
    it("applies flash class after rebuild when deferred", () => {
        const { view, container } = makeView([
            makeGroup("Backlog", [makeEntry("A")]),
            makeGroup("Done", [makeEntry("B")]),
        ])
        view.onDataUpdated()

        // Trigger a deferred highlight
        view.highlightColumn("Done" as any)

        // Flash should not be applied yet (deferred)
        let col = container.querySelector('.swimlane-column[data-group-key="Done"]')
        expect(col?.classList.contains("swimlane-column--flash")).toBe(false)

        // Simulate a rebuild (as onDataUpdated would trigger)
        view.data = {
            groupedData: [
                makeGroup("Backlog", [makeEntry("A")]),
                makeGroup("Done", [makeEntry("B")]),
            ],
            data: [makeEntry("A"), makeEntry("B")],
            properties: [],
        } as any
        view.onDataUpdated()

        col = container.querySelector('.swimlane-column[data-group-key="Done"]')
        expect(col?.classList.contains("swimlane-column--flash")).toBe(true)
    })

    it("applies flash class immediately when immediate=true", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()

        view.highlightColumn("Backlog" as any, true)

        const col = container.querySelector('.swimlane-column[data-group-key="Backlog"]')
        expect(col?.classList.contains("swimlane-column--flash")).toBe(true)
    })
})

describe("card context menu", () => {
    it("cards have a contextmenu listener that prevents default", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("Note A")])])
        view.onDataUpdated()
        const card = container.querySelector(".swimlane-card")!
        const evt = new MouseEvent("contextmenu", { bubbles: true })
        const spy = jest.spyOn(evt, "preventDefault")
        card.dispatchEvent(evt)
        expect(spy).toHaveBeenCalled()
    })
})
