import { Plugin } from "obsidian"
import { SwimlaneView } from "./swimlane-view"
import { CreateBaseModal } from "./create-base-modal"

export default class SwimlanePlugin extends Plugin {
    async onload() {
        this.registerBasesView("swimlane", {
            name: "Swimlane",
            icon: "lucide-kanban",
            factory: (controller, containerEl) => {
                return new SwimlaneView(controller, containerEl, this)
            },
            options: () => SwimlaneView.getViewOptions(),
        })

        this.addCommand({
            id: "create-base",
            name: "Create new base",
            callback: () => new CreateBaseModal(this.app).open(),
        })

        this.addRibbonIcon("database", "Create new base", () => {
            new CreateBaseModal(this.app).open()
        })
    }

    onunload() {}
}
