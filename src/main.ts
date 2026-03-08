import { Plugin } from "obsidian"
import { SwimlaneView } from "./swimlane-view"

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
    }

    onunload() {}
}
