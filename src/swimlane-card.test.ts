import { renderCard, renderTagEditor, propLabel, CardRenderOptions } from "./swimlane-card"
import type { BasesEntry, BasesPropertyId } from "obsidian"
import {
    StringValue,
    NumberValue,
    BooleanValue,
    DateValue,
    ListValue,
    LinkValue,
    TagValue,
    NullValue,
} from "obsidian"

function makeEntry(
    basename: string,
    path?: string,
    getValue?: (propId: BasesPropertyId) => any,
): BasesEntry {
    return {
        file: { basename, path: path ?? `${basename}.md` },
        getValue: getValue ?? (() => null),
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

function makeApp(overrides?: Record<string, any>) {
    return {
        metadataCache: {
            getFirstLinkpathDest: () => null,
            getFileCache: () => null,
        },
        vault: {
            getFileByPath: () => null,
            getResourcePath: (f: any) => `resource://${f.path}`,
        },
        workspace: { openLinkText: jest.fn() },
        fileManager: {
            processFrontMatter: jest.fn(async (_file: any, cb: (fm: any) => void) => {
                cb({})
            }),
            trashFile: jest.fn(),
        },
        ...overrides,
    } as any
}

describe("propLabel", () => {
    it("returns alias when provided", () => {
        expect(propLabel("note.priority" as BasesPropertyId, "Priority")).toBe("Priority")
    })

    it("strips type prefix when alias is empty", () => {
        expect(propLabel("note.priority" as BasesPropertyId, "")).toBe("priority")
    })

    it("returns propId as-is when no dot", () => {
        expect(propLabel("name" as BasesPropertyId, "")).toBe("name")
    })
})

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

    it("sets rank data attribute", () => {
        const container = document.createElement("div")
        const card = renderCard(
            container,
            makeEntry("Note"),
            makeApp(),
            makeOptions({ rank: "mzz" }),
        )
        expect(card.dataset.rank).toBe("mzz")
    })

    it("appends the card to the container", () => {
        const container = document.createElement("div")
        renderCard(container, makeEntry("Note"), makeApp(), makeOptions())
        expect(container.querySelector(".swimlane-card")).not.toBeNull()
    })

    it("attaches a contextmenu listener", () => {
        const container = document.createElement("div")
        const card = renderCard(container, makeEntry("Note"), makeApp(), makeOptions())
        const evt = new MouseEvent("contextmenu", { bubbles: true })
        const spy = jest.spyOn(evt, "preventDefault")
        card.dispatchEvent(evt)
        expect(spy).toHaveBeenCalled()
    })

    it("does not render properties table when no properties configured", () => {
        const container = document.createElement("div")
        const card = renderCard(container, makeEntry("Note"), makeApp(), makeOptions())
        expect(card.querySelector(".swimlane-card-props")).toBeNull()
    })

    it("does not render properties table when all values are null", () => {
        const container = document.createElement("div")
        const card = renderCard(
            container,
            makeEntry("Note"),
            makeApp(),
            makeOptions({
                properties: [{ propId: "note.priority" as BasesPropertyId, alias: "Priority" }],
            }),
        )
        expect(card.querySelector(".swimlane-card-props")).toBeNull()
    })

    it("does not render properties table when values are not truthy", () => {
        const container = document.createElement("div")
        const entry = makeEntry("Note", undefined, () => new NullValue())
        const card = renderCard(
            container,
            entry,
            makeApp(),
            makeOptions({
                properties: [{ propId: "note.priority" as BasesPropertyId, alias: "" }],
            }),
        )
        expect(card.querySelector(".swimlane-card-props")).toBeNull()
    })

    it("renders properties table with truthy values", () => {
        const container = document.createElement("div")
        const entry = makeEntry("Note", undefined, () => new StringValue("high"))
        const card = renderCard(
            container,
            entry,
            makeApp(),
            makeOptions({
                properties: [{ propId: "note.priority" as BasesPropertyId, alias: "Priority" }],
            }),
        )
        expect(card.querySelector(".swimlane-card-props")).not.toBeNull()
        expect(card.querySelector(".swimlane-card-prop-label")?.textContent).toContain("Priority")
    })

    it("renders property icons when showIcons is true", () => {
        const container = document.createElement("div")
        const entry = makeEntry("Note", undefined, () => new StringValue("high"))
        const card = renderCard(
            container,
            entry,
            makeApp(),
            makeOptions({
                showIcons: true,
                properties: [{ propId: "note.priority" as BasesPropertyId, alias: "P" }],
            }),
        )
        expect(card.querySelector(".swimlane-card-prop-icon")).not.toBeNull()
    })

    it("does not render property icons when showIcons is false", () => {
        const container = document.createElement("div")
        const entry = makeEntry("Note", undefined, () => new StringValue("high"))
        const card = renderCard(
            container,
            entry,
            makeApp(),
            makeOptions({
                showIcons: false,
                properties: [{ propId: "note.priority" as BasesPropertyId, alias: "P" }],
            }),
        )
        expect(card.querySelector(".swimlane-card-prop-icon")).toBeNull()
    })

    it("formats BooleanValue as Yes/No", () => {
        const container = document.createElement("div")
        const entry = makeEntry("Note", undefined, () => new BooleanValue(true))
        const card = renderCard(
            container,
            entry,
            makeApp(),
            makeOptions({
                properties: [{ propId: "note.done" as BasesPropertyId, alias: "Done" }],
            }),
        )
        const valueTd = card.querySelector(".swimlane-card-prop-value")
        // BooleanValue.isTruthy() returns true, so formatValue returns "Yes"
        expect(valueTd?.textContent).toBe("Yes")
    })

    it("renders image when imagePropId is set and value is a URL", () => {
        const container = document.createElement("div")
        const entry = makeEntry("Note", undefined, (propId: BasesPropertyId) => {
            if (propId === ("note.cover" as BasesPropertyId)) {
                return new StringValue("https://example.com/img.png")
            }
            return null
        })
        const card = renderCard(
            container,
            entry,
            makeApp(),
            makeOptions({ imagePropId: "note.cover" as BasesPropertyId }),
        )
        expect(card.classList.contains("swimlane-card--has-image")).toBe(true)
        const img = card.querySelector("img.swimlane-card-image") as HTMLImageElement
        expect(img?.src).toBe("https://example.com/img.png")
    })

    it("renders image with vault resource path for local files", () => {
        const container = document.createElement("div")
        const entry = makeEntry("Note", undefined, (propId: BasesPropertyId) => {
            if (propId === ("note.cover" as BasesPropertyId)) {
                return new StringValue("images/photo.png")
            }
            return null
        })
        const mockFile = { path: "images/photo.png" }
        const app = makeApp({
            vault: {
                getFileByPath: (p: string) => (p === "images/photo.png" ? mockFile : null),
                getResourcePath: (f: any) => `resource://${f.path}`,
            },
        })
        const card = renderCard(
            container,
            entry,
            app,
            makeOptions({ imagePropId: "note.cover" as BasesPropertyId }),
        )
        expect(card.classList.contains("swimlane-card--has-image")).toBe(true)
    })

    it("does not render image when imagePropId value is null", () => {
        const container = document.createElement("div")
        const card = renderCard(
            container,
            makeEntry("Note"),
            makeApp(),
            makeOptions({ imagePropId: "note.cover" as BasesPropertyId }),
        )
        expect(card.classList.contains("swimlane-card--has-image")).toBe(false)
    })

    it("wraps content in swimlane-card-content div when image is present", () => {
        const container = document.createElement("div")
        const entry = makeEntry("Note", undefined, (propId: BasesPropertyId) => {
            if (propId === ("note.cover" as BasesPropertyId)) {
                return new StringValue("https://example.com/img.png")
            }
            return null
        })
        const card = renderCard(
            container,
            entry,
            makeApp(),
            makeOptions({ imagePropId: "note.cover" as BasesPropertyId }),
        )
        expect(card.querySelector(".swimlane-card-content .swimlane-card-title")).not.toBeNull()
    })
})

describe("tag rendering", () => {
    it("renders tag chips when tags are provided", () => {
        const container = document.createElement("div")
        const card = renderCard(
            container,
            makeEntry("Note"),
            makeApp(),
            makeOptions({ tags: ["urgent", "bug"] }),
        )
        const tagRow = card.querySelector(".swimlane-card-tags")
        expect(tagRow).not.toBeNull()
        const chips = Array.from(card.querySelectorAll(".swimlane-card-tag"))
        expect(chips).toHaveLength(2)
        const [chip0, chip1] = chips
        expect(chip0?.textContent).toBe("urgent")
        expect(chip1?.textContent).toBe("bug")
    })

    it("does not render tag row when tags is empty", () => {
        const container = document.createElement("div")
        const card = renderCard(container, makeEntry("Note"), makeApp(), makeOptions({ tags: [] }))
        expect(card.querySelector(".swimlane-card-tags")).toBeNull()
    })

    it("does not render tag row when tags is undefined", () => {
        const container = document.createElement("div")
        const card = renderCard(container, makeEntry("Note"), makeApp(), makeOptions())
        expect(card.querySelector(".swimlane-card-tags")).toBeNull()
    })

    it("applies inline color from resolveTagColor", () => {
        const container = document.createElement("div")
        const card = renderCard(
            container,
            makeEntry("Note"),
            makeApp(),
            makeOptions({
                tags: ["bug"],
                resolveTagColor: (tag: string) => (tag === "bug" ? "#e05252" : null),
            }),
        )
        const chip = card.querySelector(".swimlane-card-tag") as HTMLElement
        expect(chip).not.toBeNull()
        expect(chip.style.backgroundColor).toBeTruthy()
    })

    it("uses default styling when resolveTagColor returns null", () => {
        const container = document.createElement("div")
        const card = renderCard(
            container,
            makeEntry("Note"),
            makeApp(),
            makeOptions({
                tags: ["unmatched"],
                resolveTagColor: () => null,
            }),
        )
        const chip = card.querySelector(".swimlane-card-tag") as HTMLElement
        expect(chip.style.backgroundColor).toBe("")
    })

    it("uses default styling when resolveTagColor is not provided", () => {
        const container = document.createElement("div")
        const card = renderCard(
            container,
            makeEntry("Note"),
            makeApp(),
            makeOptions({ tags: ["test"] }),
        )
        const chip = card.querySelector(".swimlane-card-tag") as HTMLElement
        expect(chip.style.backgroundColor).toBe("")
    })
})

describe("card context menu actions", () => {
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

    it("each contextmenu event creates a fresh menu", () => {
        const getSwimlaneContext = jest.fn(() => ({
            columns: ["A"],
            currentSwimlane: "A",
        }))
        const container = document.createElement("div")
        const card = renderCard(
            container,
            makeEntry("Note"),
            makeApp(),
            makeOptions({ getSwimlaneContext }),
        )
        card.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }))
        card.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }))
        expect(getSwimlaneContext).toHaveBeenCalledTimes(2)
    })
})

describe("renderTagEditor", () => {
    function makeFile(path = "note.md") {
        return { path } as any
    }

    it("renders editable chips with remove buttons for existing tags", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        renderTagEditor(card, makeFile(), ["bug", "urgent"], makeApp(), jest.fn())
        const chips = card.querySelectorAll(".swimlane-card-tag--editable")
        expect(chips).toHaveLength(2)
        expect(chips[0]?.textContent).toContain("bug")
        expect(chips[0]?.querySelector(".swimlane-card-tag-remove")).not.toBeNull()
    })

    it("renders input and done button", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        renderTagEditor(card, makeFile(), [], makeApp(), jest.fn())
        expect(card.querySelector(".swimlane-tag-input")).not.toBeNull()
        expect(card.querySelector(".swimlane-tag-done-btn")).not.toBeNull()
    })

    it("adds editing class to container", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        renderTagEditor(card, makeFile(), [], makeApp(), jest.fn())
        expect(card.querySelector(".swimlane-card-tags--editing")).not.toBeNull()
    })

    it("creates tag container when card has none", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        renderTagEditor(card, makeFile(), [], makeApp(), jest.fn())
        expect(card.querySelector(".swimlane-card-tags")).not.toBeNull()
    })

    it("reuses existing tag container", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        const existing = document.createElement("div")
        existing.classList.add("swimlane-card-tags")
        card.appendChild(existing)
        renderTagEditor(card, makeFile(), ["a"], makeApp(), jest.fn())
        expect(card.querySelectorAll(".swimlane-card-tags")).toHaveLength(1)
    })

    it("calls processFrontMatter when remove button is clicked", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        const app = makeApp()
        renderTagEditor(card, makeFile(), ["bug", "urgent"], app, jest.fn())
        const removeBtn = card.querySelector(".swimlane-card-tag-remove") as HTMLElement
        removeBtn?.click()
        expect(app.fileManager.processFrontMatter).toHaveBeenCalled()
    })

    it("remove actually updates frontmatter and chips", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        const captured: Record<string, unknown>[] = []
        const app = makeApp({
            fileManager: {
                processFrontMatter: jest.fn(async (_f: any, cb: (fm: any) => void) => {
                    const fm: Record<string, unknown> = { tags: ["old"] }
                    cb(fm)
                    captured.push(fm)
                }),
                trashFile: jest.fn(),
            },
        })
        renderTagEditor(card, makeFile(), ["bug", "urgent"], app, jest.fn())

        // Remove "bug" (first tag)
        const removeBtn = card.querySelector(".swimlane-card-tag-remove") as HTMLElement
        removeBtn?.click()

        // Frontmatter should have ["urgent"] only
        expect(captured).toHaveLength(1)
        expect(captured[0]?.tags).toEqual(["urgent"])

        // Only one chip should remain
        const chips = card.querySelectorAll(".swimlane-card-tag--editable")
        expect(chips).toHaveLength(1)
        expect(chips[0]?.textContent).toContain("urgent")
    })

    it("add via Enter updates frontmatter and chips", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        const captured: Record<string, unknown>[] = []
        const app = makeApp({
            fileManager: {
                processFrontMatter: jest.fn(async (_f: any, cb: (fm: any) => void) => {
                    const fm: Record<string, unknown> = {}
                    cb(fm)
                    captured.push(fm)
                }),
                trashFile: jest.fn(),
            },
        })
        renderTagEditor(card, makeFile(), ["bug"], app, jest.fn())
        const input = card.querySelector(".swimlane-tag-input") as HTMLInputElement
        input.value = "feature"
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))

        expect(captured).toHaveLength(1)
        expect(captured[0]?.tags).toEqual(["bug", "feature"])

        const chips = card.querySelectorAll(".swimlane-card-tag--editable")
        expect(chips).toHaveLength(2)
    })

    it("calls onDone when done button is clicked", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        const onDone = jest.fn()
        renderTagEditor(card, makeFile(), [], makeApp(), onDone)
        const doneBtn = card.querySelector(".swimlane-tag-done-btn") as HTMLElement
        doneBtn?.click()
        expect(onDone).toHaveBeenCalledTimes(1)
    })

    it("does not call onDone twice (settled flag)", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        const onDone = jest.fn()
        renderTagEditor(card, makeFile(), [], makeApp(), onDone)
        const doneBtn = card.querySelector(".swimlane-tag-done-btn") as HTMLElement
        doneBtn?.click()
        doneBtn?.click()
        expect(onDone).toHaveBeenCalledTimes(1)
    })

    it("does not add duplicate tags", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        const app = makeApp()
        renderTagEditor(card, makeFile(), ["bug"], app, jest.fn())
        const input = card.querySelector(".swimlane-tag-input") as HTMLInputElement
        input.value = "bug"
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
        expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled()
    })

    it("applies color from resolveTagColor to editable chips", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        renderTagEditor(card, makeFile(), ["bug"], makeApp(), jest.fn(), tag =>
            tag === "bug" ? "#5094e4" : null,
        )
        const chip = card.querySelector(".swimlane-card-tag--editable") as HTMLElement
        expect(chip.style.backgroundColor).toBeTruthy()
    })

    it("ignores empty input on Enter", () => {
        const card = document.createElement("div")
        card.classList.add("swimlane-card")
        const app = makeApp()
        renderTagEditor(card, makeFile(), [], app, jest.fn())
        const input = card.querySelector(".swimlane-tag-input") as HTMLInputElement
        input.value = ""
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
        expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled()
    })
})
