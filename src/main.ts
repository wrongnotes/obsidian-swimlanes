import { Plugin, Notice, parseYaml } from "obsidian"
import { SwimlaneView } from "./swimlane-view"
import { CreateBaseModal } from "./onboarding-workflows/create-base-modal"
import { KanbanImportModal } from "./onboarding-workflows/kanban-import-modal"
import { AutomationsModal, readAutomations, writeAutomations } from "./automations"

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

        this.addCommand({
            id: "manage-automations",
            name: "Manage automations",
            callback: () => {
                const file = this.app.workspace.getActiveFile()
                if (!file || file.extension !== "base") {
                    new Notice("Open a .base file to manage automations.")
                    return
                }
                this.app.vault.read(file).then(content => {
                    const config = parseYaml(content) ?? {}
                    const rules = readAutomations(content)
                    const swimView = config.views?.find(
                        (v: Record<string, unknown>) => v.type === "swimlane",
                    )
                    const swimlaneProp = swimView?.swimlaneProperty
                        ? String(swimView.swimlaneProperty).replace(/^note\./, "")
                        : "status"
                    const swimlanes = Array.isArray(swimView?.swimlaneOrder)
                        ? swimView.swimlaneOrder.filter((s: unknown) => typeof s === "string")
                        : []
                    const properties = Object.keys(config.properties ?? {})
                    const modal = new AutomationsModal({
                        app: this.app,
                        rules,
                        swimlanes,
                        swimlaneProp,
                        properties,
                        onSave: newRules => {
                            this.app.vault.process(file, c => writeAutomations(c, newRules))
                        },
                    })
                    modal.open()
                })
            },
        })

        this.addRibbonIcon("square-kanban", "Create swimlane board", () => {
            new CreateBaseModal(this.app).open()
        })
    }

    onunload() {}
}
