export interface KanbanCard {
    text: string
    link: string | null
    completed: boolean
    archived: boolean
    tags: string[]
    date: string | null
    time: string | null
}

export interface KanbanColumn {
    name: string
    cards: KanbanCard[]
    shouldMarkItemsComplete: boolean
}

export interface KanbanBoard {
    columns: KanbanColumn[]
    archive: KanbanCard[]
}

const HEADING_RE = /^## (.+)$/
const CARD_RE = /^- \[([ x])\] (.+)$/
const WIKILINK_RE = /\[\[([^\]]+)\]\]/
const COMPLETE_RE = /^\*\*Complete\*\*$/
const TIME_RE = /@@\{(\d{1,2}:\d{2})\}/g
const DATE_RE = /@\{(\d{4}-\d{2}-\d{2})\}/g
const TAG_RE = /#([^\s#]+)/g

export function parseKanbanMarkdown(markdown: string): KanbanBoard {
    const columns: KanbanColumn[] = []
    const archive: KanbanCard[] = []
    let current: KanbanColumn | null = null
    let inArchive = false
    const lines = markdown.split("\n")

    // Skip YAML frontmatter if present
    let start = 0
    if (lines[0]?.trim() === "---") {
        for (let i = 1; i < lines.length; i++) {
            if (lines[i]!.trim() === "---") {
                start = i + 1
                break
            }
        }
    }

    for (let i = start; i < lines.length; i++) {
        const trimmed = lines[i]!.trim()

        if (trimmed === "---" || trimmed.startsWith("%% kanban:settings")) {
            break
        }

        // *** separates the main board from the archive section
        if (trimmed === "***") {
            if (current) {
                columns.push(current)
                current = null
            }
            inArchive = true
            continue
        }

        const headingMatch = trimmed.match(HEADING_RE)
        if (headingMatch) {
            if (current) {
                columns.push(current)
            }
            if (inArchive) {
                // The archive heading (e.g. "## Archive") is not a real column
                current = null
            } else {
                current = {
                    name: headingMatch[1].trim(),
                    cards: [],
                    shouldMarkItemsComplete: false,
                }
            }
            continue
        }

        // **Complete** marker right after a column heading
        if (trimmed.match(COMPLETE_RE) && current && !inArchive) {
            current.shouldMarkItemsComplete = true
            continue
        }

        const cardMatch = trimmed.match(CARD_RE)
        if (cardMatch) {
            const checked = cardMatch[1] === "x"
            const card = parseCard(
                cardMatch[2],
                checked,
                inArchive,
                current?.shouldMarkItemsComplete ?? false,
            )

            if (inArchive) {
                archive.push(card)
            } else if (current) {
                current.cards.push(card)
            }
        }
    }

    if (current) {
        columns.push(current)
    }

    return { columns, archive }
}

function parseCard(
    raw: string,
    checked: boolean,
    archived: boolean,
    columnMarksComplete: boolean,
): KanbanCard {
    let link: string | null = null
    let text = raw

    const linkMatch = raw.match(WIKILINK_RE)
    if (linkMatch) {
        const linkContent = linkMatch[1]
        const hasAlias = linkContent.includes("|")
        link = hasAlias ? linkContent.split("|")[0] : linkContent
        text = raw.replace(WIKILINK_RE, "").trim()
        if (!text) {
            text = hasAlias ? linkContent.split("|")[1] : (link.split("/").pop() ?? link)
        }
    }

    // Extract time (@@{HH:MM}) before date (@{YYYY-MM-DD})
    // to avoid @@{ partially matching @{
    let time: string | null = null
    const timeMatch = text.match(/@@\{(\d{1,2}:\d{2})\}/)
    if (timeMatch) {
        time = timeMatch[1]
        text = text.replace(TIME_RE, "").trim()
    }

    let date: string | null = null
    const dateMatch = text.match(/@\{(\d{4}-\d{2}-\d{2})\}/)
    if (dateMatch) {
        date = dateMatch[1]
        text = text.replace(DATE_RE, "").trim()
    }

    // Extract tags (#tag)
    const tags: string[] = []
    let tagMatch: RegExpExecArray | null
    const tagRe = new RegExp(TAG_RE.source, "g")
    while ((tagMatch = tagRe.exec(text)) !== null) {
        tags.push(tagMatch[1])
    }
    if (tags.length > 0) {
        text = text.replace(TAG_RE, "").trim()
    }

    text = text.replace(/\*\*/g, "")

    return {
        text,
        link,
        completed: checked || columnMarksComplete,
        archived,
        tags,
        date,
        time,
    }
}
