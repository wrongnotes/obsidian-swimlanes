import { parseKanbanMarkdown } from "./kanban-parser"

describe("parseKanbanMarkdown", () => {
    it("parses empty markdown", () => {
        const result = parseKanbanMarkdown("")
        expect(result.columns).toEqual([])
        expect(result.archive).toEqual([])
    })

    it("parses a single empty column", () => {
        const result = parseKanbanMarkdown("## Backlog\n")
        expect(result.columns).toEqual([
            { name: "Backlog", cards: [], shouldMarkItemsComplete: false },
        ])
    })

    it("parses multiple columns with cards", () => {
        const md = [
            "## To Do",
            "- [ ] First task",
            "- [ ] Second task",
            "## Done",
            "- [x] Completed task",
        ].join("\n")

        const result = parseKanbanMarkdown(md)
        expect(result.columns).toHaveLength(2)
        expect(result.columns[0]!.name).toBe("To Do")
        expect(result.columns[0]!.cards).toEqual([
            {
                text: "First task",
                link: null,
                completed: false,
                archived: false,
                tags: [],
                date: null,
                time: null,
            },
            {
                text: "Second task",
                link: null,
                completed: false,
                archived: false,
                tags: [],
                date: null,
                time: null,
            },
        ])
        expect(result.columns[1]!.name).toBe("Done")
        expect(result.columns[1]!.cards).toEqual([
            {
                text: "Completed task",
                link: null,
                completed: true,
                archived: false,
                tags: [],
                date: null,
                time: null,
            },
        ])
    })

    it("extracts wikilinks from cards", () => {
        const md = "## Col\n- [ ] [[My Note]]"
        const card = parseKanbanMarkdown(md).columns[0]!.cards[0]!
        expect(card.link).toBe("My Note")
        expect(card.text).toBe("My Note")
    })

    it("extracts wikilinks with display text", () => {
        const md = "## Col\n- [ ] [[path/to/note|Display Name]]"
        const card = parseKanbanMarkdown(md).columns[0]!.cards[0]!
        expect(card.link).toBe("path/to/note")
        expect(card.text).toBe("Display Name")
    })

    it("uses filename from link path when no other text", () => {
        const md = "## Col\n- [ ] [[folder/My Note]]"
        const card = parseKanbanMarkdown(md).columns[0]!.cards[0]!
        expect(card.link).toBe("folder/My Note")
        expect(card.text).toBe("My Note")
    })

    it("keeps surrounding text when wikilink is part of card", () => {
        const md = "## Col\n- [ ] Review [[Some Doc]] carefully"
        const card = parseKanbanMarkdown(md).columns[0]!.cards[0]!
        expect(card.link).toBe("Some Doc")
        expect(card.text).toBe("Review  carefully")
    })

    it("strips bold markers from card text", () => {
        const md = "## Col\n- [ ] **Important** task"
        const card = parseKanbanMarkdown(md).columns[0]!.cards[0]!
        expect(card.text).toBe("Important task")
    })

    it("parses archive section after *** separator", () => {
        const md = [
            "## Active",
            "- [ ] Task",
            "***",
            "## Archive",
            "- [x] Old task",
            "- [ ] Another old task",
        ].join("\n")

        const result = parseKanbanMarkdown(md)
        expect(result.columns).toHaveLength(1)
        expect(result.columns[0]!.name).toBe("Active")
        expect(result.archive).toHaveLength(2)
        expect(result.archive[0]).toEqual({
            text: "Old task",
            link: null,
            completed: true,
            archived: true,
            tags: [],
            date: null,
            time: null,
        })
        expect(result.archive[1]).toEqual({
            text: "Another old task",
            link: null,
            completed: false,
            archived: true,
            tags: [],
            date: null,
            time: null,
        })
    })

    it("stops at --- separator", () => {
        const md = "## Col\n- [ ] Task\n---\n## Hidden"
        const result = parseKanbanMarkdown(md)
        expect(result.columns).toHaveLength(1)
    })

    it("stops at kanban settings block", () => {
        const md = [
            "## Col",
            "- [ ] Task",
            "%% kanban:settings",
            '{"kanban-plugin":"basic"}',
            "%%",
        ].join("\n")

        const result = parseKanbanMarkdown(md)
        expect(result.columns).toHaveLength(1)
        expect(result.columns[0]!.cards).toHaveLength(1)
    })

    it("ignores lines before first heading", () => {
        const md = "Some preamble\n\n## Col\n- [ ] Task"
        const result = parseKanbanMarkdown(md)
        expect(result.columns).toHaveLength(1)
    })

    it("ignores non-card lines within a column", () => {
        const md = "## Col\nSome random text\n- [ ] Task\n\nMore text"
        const result = parseKanbanMarkdown(md)
        expect(result.columns[0]!.cards).toHaveLength(1)
    })

    it("trims heading names", () => {
        const md = "##  Spaced Name  \n- [ ] Task"
        const result = parseKanbanMarkdown(md)
        expect(result.columns[0]!.name).toBe("Spaced Name")
    })

    it("skips YAML frontmatter", () => {
        const md = ["---", "kanban-plugin: basic", "---", "", "## Col", "- [ ] Task"].join("\n")

        const result = parseKanbanMarkdown(md)
        expect(result.columns).toHaveLength(1)
        expect(result.columns[0]!.cards).toHaveLength(1)
    })

    it("handles completed cards with wikilinks", () => {
        const md = "## Done\n- [x] [[Finished Task]]"
        const card = parseKanbanMarkdown(md).columns[0]!.cards[0]!
        expect(card.completed).toBe(true)
        expect(card.link).toBe("Finished Task")
        expect(card.text).toBe("Finished Task")
    })

    it("detects complete lane marker", () => {
        const md = ["## To Do", "- [ ] Task A", "## Done", "**Complete**", "- [ ] Task B"].join(
            "\n",
        )

        const result = parseKanbanMarkdown(md)
        expect(result.columns[0]!.shouldMarkItemsComplete).toBe(false)
        expect(result.columns[1]!.shouldMarkItemsComplete).toBe(true)
        // Cards in a complete lane are marked completed even if unchecked
        expect(result.columns[1]!.cards[0]!.completed).toBe(true)
    })

    it("marks cards in complete lanes as completed regardless of checkbox", () => {
        const md = [
            "## Done",
            "**Complete**",
            "- [ ] Unchecked but complete",
            "- [x] Checked and complete",
        ].join("\n")

        const result = parseKanbanMarkdown(md)
        expect(result.columns[0]!.cards[0]!.completed).toBe(true)
        expect(result.columns[0]!.cards[1]!.completed).toBe(true)
    })

    it("handles archive with wikilinks", () => {
        const md = ["## Active", "- [ ] Task", "***", "## Archive", "- [x] [[Archived Note]]"].join(
            "\n",
        )

        const result = parseKanbanMarkdown(md)
        expect(result.archive).toHaveLength(1)
        expect(result.archive[0]!.link).toBe("Archived Note")
        expect(result.archive[0]!.archived).toBe(true)
    })

    it("extracts tags from card text", () => {
        const md = "## Col\n- [ ] Task 3 #tag #tag2"
        const card = parseKanbanMarkdown(md).columns[0]!.cards[0]!
        expect(card.tags).toEqual(["tag", "tag2"])
        expect(card.text).toBe("Task 3")
    })

    it("extracts date from card text", () => {
        const md = "## Col\n- [ ] Task 4 @{2026-03-11}"
        const card = parseKanbanMarkdown(md).columns[0]!.cards[0]!
        expect(card.date).toBe("2026-03-11")
        expect(card.text).toBe("Task 4")
    })

    it("extracts tags and date together", () => {
        const md = "## Col\n- [ ] Do thing #urgent @{2026-01-15} #work"
        const card = parseKanbanMarkdown(md).columns[0]!.cards[0]!
        expect(card.tags).toEqual(["urgent", "work"])
        expect(card.date).toBe("2026-01-15")
        expect(card.text).toBe("Do thing")
    })

    it("extracts time from card text", () => {
        const md = "## Col\n- [ ] Task @@{14:30}"
        const card = parseKanbanMarkdown(md).columns[0]!.cards[0]!
        expect(card.time).toBe("14:30")
        expect(card.date).toBeNull()
        expect(card.text).toBe("Task")
    })

    it("extracts both date and time", () => {
        const md = "## Col\n- [ ] Task @{2026-03-11} @@{9:00}"
        const card = parseKanbanMarkdown(md).columns[0]!.cards[0]!
        expect(card.date).toBe("2026-03-11")
        expect(card.time).toBe("9:00")
        expect(card.text).toBe("Task")
    })

    it("handles empty archive section", () => {
        const md = ["## Active", "- [ ] Task", "***", "## Archive"].join("\n")

        const result = parseKanbanMarkdown(md)
        expect(result.columns).toHaveLength(1)
        expect(result.archive).toHaveLength(0)
    })
})
