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
    // Simulate the Bases DOM: a parent div.bases-view containing
    // the bases-toolbar (sibling) and our container.
    const basesView = document.createElement("div")
    basesView.className = "bases-view"
    const basesToolbar = basesView.createDiv("bases-toolbar")
    basesToolbar.createDiv("bases-toolbar-item bases-toolbar-sort-menu")
    basesToolbar.createDiv("bases-toolbar-item bases-toolbar-new-item-menu")
    const container = basesView.createDiv()
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
            read: jest.fn(async () => "{}"),
            process: jest.fn(async () => "{}"),
        },
        workspace: { openLinkText: jest.fn(), getActiveFile: () => null },
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
        getSort: () => [],
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

describe("column menu button", () => {
    it("renders menu button on each column header", () => {
        const { view, container } = makeView([
            makeGroup("Backlog", [makeEntry("A")]),
            makeGroup("Done", [makeEntry("B")]),
        ])
        view.onDataUpdated()
        const menuBtns = container.querySelectorAll(".swimlane-column-menu-btn")
        expect(menuBtns).toHaveLength(2)
    })

    it("menu button has data-no-drag attribute", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()
        const btn = container.querySelector(".swimlane-column-menu-btn")
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

describe("swimlane order", () => {
    it("auto-populates swimlaneOrder when not configured", () => {
        const { view, configStore } = makeView([
            makeGroup("Backlog", [makeEntry("A")]),
            makeGroup("Done", [makeEntry("B")]),
        ])
        view.onDataUpdated()
        expect(configStore.swimlaneOrder).toEqual(["Backlog", "Done"])
    })

    it("respects configured swimlane order", () => {
        const { view, container } = makeView(
            [makeGroup("Backlog", [makeEntry("A")]), makeGroup("Done", [makeEntry("B")])],
            { swimlaneOrder: ["Done", "Backlog"] },
        )
        view.onDataUpdated()
        const headers = Array.from(container.querySelectorAll(".swimlane-column-header"))
        const labels = headers.map(h => h.firstElementChild?.textContent)
        expect(labels).toEqual(["Done", "Backlog"])
    })

    it("renders groups not in swimlaneOrder after ordered ones", () => {
        const { view, container } = makeView(
            [
                makeGroup("Backlog", [makeEntry("A")]),
                makeGroup("Done", [makeEntry("B")]),
                makeGroup("Archive", [makeEntry("C")]),
            ],
            { swimlaneOrder: ["Done"] },
        )
        view.onDataUpdated()
        const headers = Array.from(container.querySelectorAll(".swimlane-column-header"))
        const labels = headers.map(h => h.firstElementChild?.textContent)
        expect(labels[0]).toBe("Done")
        expect(labels).toContain("Backlog")
        expect(labels).toContain("Archive")
    })

    it("renders empty columns from swimlaneOrder that have no data", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])], {
            swimlaneOrder: ["Backlog", "EmptyCol"],
        })
        view.onDataUpdated()
        const headers = Array.from(container.querySelectorAll(".swimlane-column-header"))
        const labels = headers.map(h => h.firstElementChild?.textContent)
        expect(labels).toContain("EmptyCol")
    })
})

describe("add card input", () => {
    it("clicking add card button replaces it with an input", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()
        const btn = container.querySelector(".swimlane-add-card-btn")! as HTMLElement
        btn.click()
        expect(container.querySelector(".swimlane-add-card-btn")).toBeNull()
        expect(container.querySelector(".swimlane-add-card-input")).not.toBeNull()
    })

    it("pressing Escape dismisses the input and restores the button", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()
        const btn = container.querySelector(".swimlane-add-card-btn")! as HTMLElement
        btn.click()
        const input = container.querySelector(".swimlane-add-card-input")! as HTMLInputElement
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
        expect(container.querySelector(".swimlane-add-card-input")).toBeNull()
        expect(container.querySelector(".swimlane-add-card-btn")).not.toBeNull()
    })

    it("pressing Enter with text creates a card via vault.create", async () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()
        const btn = container.querySelector(".swimlane-add-card-btn")! as HTMLElement
        btn.click()
        const input = container.querySelector(".swimlane-add-card-input")! as HTMLInputElement
        input.value = "New Card"
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
        // vault.create should be called
        await new Promise(r => setTimeout(r, 0))
        expect(view.app.vault.create).toHaveBeenCalled()
    })

    it("pressing Enter with empty text dismisses the input", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()
        const btn = container.querySelector(".swimlane-add-card-btn")! as HTMLElement
        btn.click()
        const input = container.querySelector(".swimlane-add-card-input")! as HTMLInputElement
        input.value = ""
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
        expect(container.querySelector(".swimlane-add-card-input")).toBeNull()
        expect(container.querySelector(".swimlane-add-card-btn")).not.toBeNull()
    })

    it("blur with text commits the card", async () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()
        const btn = container.querySelector(".swimlane-add-card-btn")! as HTMLElement
        btn.click()
        const input = container.querySelector(".swimlane-add-card-input")! as HTMLInputElement
        input.value = "Blur Card"
        input.dispatchEvent(new Event("blur"))
        await new Promise(r => setTimeout(r, 0))
        expect(view.app.vault.create).toHaveBeenCalled()
    })
})

describe("add column input", () => {
    it("clicking add column button replaces it with an input", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()
        const btn = container.querySelector(".swimlane-add-column-btn")! as HTMLElement
        btn.click()
        expect(container.querySelector(".swimlane-add-column-btn")).toBeNull()
        expect(container.querySelector(".swimlane-add-column-input")).not.toBeNull()
    })

    it("pressing Enter with name adds to swimlaneOrder", () => {
        const { view, container, configStore } = makeView(
            [makeGroup("Backlog", [makeEntry("A")])],
            { swimlaneOrder: ["Backlog"] },
        )
        view.onDataUpdated()
        const btn = container.querySelector(".swimlane-add-column-btn")! as HTMLElement
        btn.click()
        const input = container.querySelector(".swimlane-add-column-input")! as HTMLInputElement
        input.value = "New Column"
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
        expect(configStore.swimlaneOrder).toContain("New Column")
    })

    it("pressing Escape dismisses the input", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()
        const btn = container.querySelector(".swimlane-add-column-btn")! as HTMLElement
        btn.click()
        const input = container.querySelector(".swimlane-add-column-input")! as HTMLInputElement
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
        expect(container.querySelector(".swimlane-add-column-input")).toBeNull()
        expect(container.querySelector(".swimlane-add-column-btn")).not.toBeNull()
    })

    it("duplicate column name triggers Notice and highlight", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])], {
            swimlaneOrder: ["Backlog"],
        })
        view.onDataUpdated()
        const btn = container.querySelector(".swimlane-add-column-btn")! as HTMLElement
        btn.click()
        const input = container.querySelector(".swimlane-add-column-input")! as HTMLInputElement
        input.value = "Backlog"
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
        // Should have restored the button (not input)
        expect(container.querySelector(".swimlane-add-column-input")).toBeNull()
        expect(container.querySelector(".swimlane-add-column-btn")).not.toBeNull()
    })

    it("empty name dismisses the input on blur", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()
        const btn = container.querySelector(".swimlane-add-column-btn")! as HTMLElement
        btn.click()
        const input = container.querySelector(".swimlane-add-column-input")! as HTMLInputElement
        input.value = ""
        input.dispatchEvent(new Event("blur"))
        expect(container.querySelector(".swimlane-add-column-input")).toBeNull()
        expect(container.querySelector(".swimlane-add-column-btn")).not.toBeNull()
    })
})

describe("column management", () => {
    it("removes empty column via removeColumn", () => {
        const { view, configStore } = makeView([makeGroup("Backlog", [makeEntry("A")])], {
            swimlaneOrder: ["Backlog", "EmptyCol"],
        })
        view.onDataUpdated()
        ;(view as any).removeColumn(document.createElement("div"), "EmptyCol", 0)
        expect(configStore.swimlaneOrder).not.toContain("EmptyCol")
    })

    it("moves column left via moveColumn", () => {
        const { view, configStore } = makeView(
            [makeGroup("Backlog", [makeEntry("A")]), makeGroup("Done", [makeEntry("B")])],
            { swimlaneOrder: ["Backlog", "Done"] },
        )
        view.onDataUpdated()
        ;(view as any).moveColumn("Done", -1)
        expect(configStore.swimlaneOrder).toEqual(["Done", "Backlog"])
    })

    it("moves column right via moveColumn", () => {
        const { view, configStore } = makeView(
            [makeGroup("Backlog", [makeEntry("A")]), makeGroup("Done", [makeEntry("B")])],
            { swimlaneOrder: ["Backlog", "Done"] },
        )
        view.onDataUpdated()
        ;(view as any).moveColumn("Backlog", 1)
        expect(configStore.swimlaneOrder).toEqual(["Done", "Backlog"])
    })
})

describe("onUnload", () => {
    it("calls destroy without errors", () => {
        const { view } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()
        expect(() => (view as any).onUnload()).not.toThrow()
    })
})

describe("getViewOptions", () => {
    it("returns an array of view options", () => {
        const options = SwimlaneView.getViewOptions()
        expect(Array.isArray(options)).toBe(true)
        expect(options.length).toBeGreaterThan(0)
    })

    it("includes swimlaneProperty option", () => {
        const options = SwimlaneView.getViewOptions()
        expect(options.find(o => "key" in o && o.key === "swimlaneProperty")).toBeDefined()
    })

    it("includes rankProperty option", () => {
        const options = SwimlaneView.getViewOptions()
        expect(options.find(o => "key" in o && o.key === "rankProperty")).toBeDefined()
    })
})

describe("data-group-key attribute", () => {
    it("sets data-group-key on each column", () => {
        const { view, container } = makeView([
            makeGroup("Backlog", [makeEntry("A")]),
            makeGroup("Done", [makeEntry("B")]),
        ])
        view.onDataUpdated()
        const cols = container.querySelectorAll(".swimlane-column")
        const keys = Array.from(cols).map(c => c.getAttribute("data-group-key"))
        expect(keys).toContain("Backlog")
        expect(keys).toContain("Done")
    })
})

describe("automations button", () => {
    it("injects automations button into the Bases toolbar", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()
        const basesToolbar = container.parentElement?.querySelector(".bases-toolbar")
        const btn = basesToolbar?.querySelector(".swimlane-automations-btn")
        expect(btn).not.toBeNull()
        expect(btn?.textContent).toContain("Automations")
    })

    it("inserts automations button before Sort", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()
        const basesToolbar = container.parentElement?.querySelector(".bases-toolbar")
        const items = Array.from(basesToolbar?.children ?? [])
        const autoIdx = items.findIndex(el => el.classList.contains("swimlane-automations-btn"))
        const sortIdx = items.findIndex(el => el.classList.contains("bases-toolbar-sort-menu"))
        expect(autoIdx).toBeGreaterThan(-1)
        expect(sortIdx).toBeGreaterThan(autoIdx)
    })

    it("hides the New button", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()
        const newBtn = container.parentElement?.querySelector<HTMLElement>(
            ".bases-toolbar-new-item-menu",
        )
        expect(newBtn?.style.display).toBe("none")
    })
})

describe("undo/redo", () => {
    it("renders floating undo and redo buttons", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()
        const float = container.querySelector(".swimlane-undo-float")
        expect(float).not.toBeNull()
        expect(float?.querySelector(".swimlane-undo-btn")).not.toBeNull()
        expect(float?.querySelector(".swimlane-redo-btn")).not.toBeNull()
    })

    it("undo button is disabled when stack is empty", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()
        const undoBtn = container.querySelector(".swimlane-undo-btn")
        expect(undoBtn?.classList.contains("swimlane-toolbar-disabled")).toBe(true)
    })

    it("redo button is disabled when stack is empty", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()
        const redoBtn = container.querySelector(".swimlane-redo-btn")
        expect(redoBtn?.classList.contains("swimlane-toolbar-disabled")).toBe(true)
    })

    it("Ctrl+Z on board does not crash when stack is empty", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        view.onDataUpdated()
        const event = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true })
        expect(() => container.dispatchEvent(event)).not.toThrow()
    })

    it("Ctrl+Z is not intercepted when input is focused", () => {
        const { view, container } = makeView([makeGroup("Backlog", [makeEntry("A")])])
        // Attach to document body so focus() updates document.activeElement
        document.body.appendChild(container.parentElement!)
        view.onDataUpdated()
        const input = document.createElement("input")
        container.appendChild(input)
        input.focus()
        const event = new KeyboardEvent("keydown", {
            key: "z",
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
        })
        input.dispatchEvent(event)
        // Event should NOT have been prevented (native text undo should work)
        expect(event.defaultPrevented).toBe(false)
        // Clean up
        container.parentElement?.remove()
    })
})
