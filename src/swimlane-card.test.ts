import { renderCard, CardRenderOptions } from "./swimlane-card"
import type { BasesEntry, BasesPropertyId } from "obsidian"

function makeEntry(basename: string, path?: string): BasesEntry {
    return {
        file: { basename, path: path ?? `${basename}.md` },
        getValue: () => null,
    } as unknown as BasesEntry
}

function makeOptions(overrides?: Partial<CardRenderOptions>): CardRenderOptions {
    return {
        rankPropId: "note.rank" as BasesPropertyId,
        rank: "aaa",
        properties: [],
        showIcons: false,
        swimlaneProp: "status",
        getSwimlaneContext: () => ({
            columns: ["Backlog", "In Progress", "Done"],
            currentSwimlane: "Backlog",
        }),
        highlightColumn: jest.fn(),
        ...overrides,
    }
}

function makeApp() {
    return {
        metadataCache: { getFirstLinkpathDest: () => null },
        vault: { getResourcePath: () => "" },
        workspace: { openLinkText: jest.fn() },
        fileManager: {
            processFrontMatter: jest.fn(async (_file: any, cb: (fm: any) => void) => {
                cb({})
            }),
            trashFile: jest.fn(),
        },
    } as any
}

describe("renderCard", () => {
    it("renders the card with the correct title", () => {
        const container = document.createElement("div")
        const card = renderCard(container, makeEntry("My Note"), makeApp(), makeOptions())
        expect(card.querySelector(".swimlane-card-title")?.textContent).toBe("My Note")
    })

    it("sets data-path on the card element", () => {
        const container = document.createElement("div")
        const card = renderCard(
            container,
            makeEntry("Note", "folder/Note.md"),
            makeApp(),
            makeOptions(),
        )
        expect(card.dataset.path).toBe("folder/Note.md")
    })

    it("attaches a contextmenu listener", () => {
        const container = document.createElement("div")
        const card = renderCard(container, makeEntry("Note"), makeApp(), makeOptions())
        const evt = new MouseEvent("contextmenu", { bubbles: true })
        const spy = jest.spyOn(evt, "preventDefault")
        card.dispatchEvent(evt)
        expect(spy).toHaveBeenCalled()
    })
})

describe("card context menu actions", () => {
    // The context menu is created inside an event handler, so we can't
    // directly test it without triggering the event. We test the behavior
    // by verifying the app methods are called with the right arguments
    // when the Menu mock's onClick callbacks fire.

    // Since our Menu mock immediately invokes the addItem callback and
    // MenuItem.onClick stores the callback, we need a richer mock to
    // capture the callbacks. Let's test the integration points instead.

    it("calls getSwimlaneContext lazily on contextmenu", () => {
        const getSwimlaneContext = jest.fn(() => ({
            columns: ["A", "B"],
            currentSwimlane: "A",
        }))
        const container = document.createElement("div")
        const card = renderCard(
            container,
            makeEntry("Note"),
            makeApp(),
            makeOptions({ getSwimlaneContext }),
        )

        // Not called during render
        expect(getSwimlaneContext).not.toHaveBeenCalled()

        // Called when context menu opens
        card.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }))
        expect(getSwimlaneContext).toHaveBeenCalledTimes(1)
    })
})
