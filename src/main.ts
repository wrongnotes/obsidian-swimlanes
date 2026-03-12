import { Plugin } from "obsidian"
import { SwimlaneView } from "./swimlane-view"
import { CreateBaseModal } from "./onboarding-workflows/create-base-modal"
import { KanbanImportModal } from "./onboarding-workflows/kanban-import-modal"

export default class SwimlanePlugin extends Plugin {
    async onload() {
        this.registerBasesView("swimlane", {
            name: "Swimlane",
            icon: "lucide-square-dashed-kanban",
            factory: (controller, containerEl) => {
                return new SwimlaneView(controller, containerEl, this)
            },
            options: () => SwimlaneView.getViewOptions(),
        })

        this.addCommand({
            id: "create-board",
            name: "Create",
            callback: () => new CreateBaseModal(this.app).open(),
        })

        this.addCommand({
            id: "import-kanban",
            name: "Import from kanban plugin",
            callback: () => new KanbanImportModal(this.app).open(),
        })

        this.addRibbonIcon("square-kanban", "Create swimlane board", () => {
            new CreateBaseModal(this.app).open()
        })
    }

    onunload() {}
}
