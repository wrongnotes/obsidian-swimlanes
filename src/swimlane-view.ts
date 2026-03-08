import { BasesView, QueryController } from "obsidian"
import type SwimlanePlugin from "./main"

export class SwimlaneView extends BasesView {
    type = "swimlane"

    private boardEl: HTMLElement
    private plugin: SwimlanePlugin

    constructor(controller: QueryController, containerEl: HTMLElement, plugin: SwimlanePlugin) {
        super(controller)
        this.boardEl = containerEl
        this.plugin = plugin
    }

    static getViewOptions() {
        return []
    }

    onDataUpdated(): void {
        this.boardEl.empty()

        const groups = this.data.groupedData
        const hasGroups = groups.some(g => g.hasKey())

        if (!hasGroups) {
            const msg = 'Set a "Group by" property in the Bases toolbar to use the Swimlane view.'
            this.boardEl.createEl("p", { cls: "swimlane-empty", text: msg })
            return
        }

        const board = this.boardEl.createDiv({ cls: "swimlane-board" })

        for (const group of groups) {
            const label = group.hasKey() ? (group.key?.toString() ?? "") : "(No value)"
            const col = board.createDiv({ cls: "swimlane-column" })

            const header = col.createDiv({ cls: "swimlane-column-header" })
            header.createSpan({ text: label })
            header.createSpan({ cls: "swimlane-column-count", text: String(group.entries.length) })

            const cardList = col.createDiv({ cls: "swimlane-card-list" })

            for (const entry of group.entries) {
                const card = cardList.createDiv({ cls: "swimlane-card" })
                card.createDiv({ cls: "swimlane-card-title", text: entry.file.basename })
            }
        }
    }
}
