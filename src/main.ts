import { Plugin, PluginSettingTab, Setting, Notice, parseYaml, TFile } from "obsidian"
import type { App as ObsidianApp } from "obsidian"
import { SwimlaneView } from "./swimlane-view"
import { TagColorResolver, PRESET_PALETTE } from "./tag-colors"
import type { TagColorRule } from "./tag-colors"
import { CreateBaseModal } from "./onboarding-workflows/create-base-modal"
import { KanbanImportModal } from "./onboarding-workflows/kanban-import-modal"
import {
    readAutomations,
    writeAutomations,
    readScheduledActions,
    writeScheduledActions,
    AutomationsModal,
    getDueActions,
    applyMutations,
} from "./automations"

export interface SwimlaneSettings {
    tagColorRules: TagColorRule[]
}

const DEFAULT_SETTINGS: SwimlaneSettings = {
    tagColorRules: [],
}

export default class SwimlanePlugin extends Plugin {
    settings: SwimlaneSettings = DEFAULT_SETTINGS
    tagColorResolver: TagColorResolver = new TagColorResolver([])
    private pollerIntervalId: number | null = null

    async onload() {
        await this.loadSettings()
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
                    const properties = Object.keys(config.properties ?? {}).map(name => ({
                        name,
                        isArray: false, // Cannot detect from config alone
                    }))
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

        this.addSettingTab(new SwimlaneSettingTab(this.app, this))

        // Check for due scheduled actions on load
        this.processAllDueActions()

        // Update file paths in scheduled actions when notes are renamed
        this.registerEvent(
            this.app.vault.on("rename", (file, oldPath) => {
                if (file instanceof TFile && file.extension === "md") {
                    this.updateScheduledActionPaths(oldPath, file.path)
                }
            }),
        )
    }

    onunload() {
        this.stopPoller()
    }

    /** Start the 5-minute poller if not already running. */
    startPoller(): void {
        if (this.pollerIntervalId !== null) {
            return
        }
        this.pollerIntervalId = window.setInterval(() => this.processAllDueActions(), 5 * 60 * 1000)
        this.registerInterval(this.pollerIntervalId)
    }

    /** Stop the poller. */
    private stopPoller(): void {
        if (this.pollerIntervalId !== null) {
            window.clearInterval(this.pollerIntervalId)
            this.pollerIntervalId = null
        }
    }

    private async processAllDueActions(): Promise<void> {
        const baseFiles = this.app.vault.getFiles().filter(f => f.extension === "base")
        let hasAnyScheduled = false

        for (const baseFile of baseFiles) {
            const hadItems = await this.processDueActionsForFile(baseFile)
            if (hadItems) {
                hasAnyScheduled = true
            }
        }

        // Demand-driven: start/stop poller based on whether items exist
        if (hasAnyScheduled) {
            this.startPoller()
        } else {
            this.stopPoller()
        }
    }

    /** Process due actions for a single .base file. Returns true if there are still pending items. */
    private async processDueActionsForFile(baseFile: TFile): Promise<boolean> {
        const content = await this.app.vault.read(baseFile)
        const allActions = readScheduledActions(content)
        if (allActions.length === 0) {
            return false
        }

        const { due, remaining } = getDueActions(allActions, Date.now())

        if (due.length > 0) {
            // Read swimlane property from .base config
            const parsed = parseYaml(content) ?? {}
            const swimView = parsed.views?.find(
                (v: Record<string, unknown>) => v.type === "swimlane",
            )
            const swimlaneProp = swimView?.swimlaneProperty
                ? String(swimView.swimlaneProperty).replace(/^note\./, "")
                : "status"

            for (const action of due) {
                const file = this.app.vault.getFileByPath(action.file)
                if (!file) {
                    continue
                }

                const cache = this.app.metadataCache.getFileCache(file)
                const fm = cache?.frontmatter ?? {}
                const currentSwimlane = fm[swimlaneProp]
                if (currentSwimlane !== action.whileInSwimlane) {
                    continue
                }

                // Check if this scheduled action contains a delete mutation
                const hasDelete = action.actions.some(a => a.type === "delete")
                if (hasDelete) {
                    try {
                        await this.app.fileManager.trashFile(file)
                    } catch {
                        // File might already be deleted
                    }
                    continue // Skip frontmatter mutations — file is deleted
                }

                try {
                    await this.app.fileManager.processFrontMatter(file, fileFm => {
                        applyMutations(fileFm, action.actions)
                    })
                } catch {
                    // File might have been deleted between check and apply
                }
            }

            await this.app.vault.process(baseFile, c => writeScheduledActions(c, remaining))
        }

        return remaining.length > 0
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
        this.tagColorResolver = new TagColorResolver(this.settings.tagColorRules)
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings)
        this.tagColorResolver = new TagColorResolver(this.settings.tagColorRules)
    }

    private async updateScheduledActionPaths(oldPath: string, newPath: string): Promise<void> {
        const baseFiles = this.app.vault.getFiles().filter(f => f.extension === "base")
        for (const baseFile of baseFiles) {
            const content = await this.app.vault.read(baseFile)
            const actions = readScheduledActions(content)
            let changed = false
            for (const action of actions) {
                if (action.file === oldPath) {
                    action.file = newPath
                    changed = true
                }
            }
            if (changed) {
                await this.app.vault.process(baseFile, c => writeScheduledActions(c, actions))
            }
        }
    }
}

class SwimlaneSettingTab extends PluginSettingTab {
    plugin: SwimlanePlugin
    private activePopover: HTMLElement | null = null

    constructor(app: ObsidianApp, plugin: SwimlanePlugin) {
        super(app, plugin)
        this.plugin = plugin
    }

    display(): void {
        const { containerEl } = this
        containerEl.empty()

        new Setting(containerEl)
            .setName("Tag color rules")
            .setDesc("Map tag patterns to colors. Use * as a wildcard. Last matching rule wins.")
            .setHeading()

        const rulesContainer = containerEl.createDiv({ cls: "swimlane-tag-color-rules" })
        this.renderRules(rulesContainer)

        const addBtn = containerEl.createEl("button", { text: "Add rule" })
        addBtn.addEventListener("click", async () => {
            this.plugin.settings.tagColorRules.push({
                pattern: "",
                color: PRESET_PALETTE[0].color,
            })
            await this.plugin.saveSettings()
            this.display()
        })
    }

    private renderRules(container: HTMLElement): void {
        const rules = this.plugin.settings.tagColorRules
        for (let i = 0; i < rules.length; i++) {
            this.renderRuleRow(container, i)
        }
    }

    private renderRuleRow(container: HTMLElement, index: number): void {
        const rules = this.plugin.settings.tagColorRules
        const rule = rules[index]!
        const row = container.createDiv({ cls: "swimlane-tag-color-rule" })

        // Up/down buttons
        const upBtn = row.createEl("button", { cls: "swimlane-tag-color-rule-btn", text: "↑" })
        upBtn.disabled = index === 0
        upBtn.addEventListener("click", async () => {
            ;[rules[index - 1], rules[index]] = [rules[index]!, rules[index - 1]!]
            await this.plugin.saveSettings()
            this.display()
        })

        const downBtn = row.createEl("button", { cls: "swimlane-tag-color-rule-btn", text: "↓" })
        downBtn.disabled = index === rules.length - 1
        downBtn.addEventListener("click", async () => {
            ;[rules[index], rules[index + 1]] = [rules[index + 1]!, rules[index]!]
            await this.plugin.saveSettings()
            this.display()
        })

        // Pattern input
        const input = row.createEl("input", {
            cls: "swimlane-tag-color-rule-input",
            attr: { type: "text", placeholder: "Tag pattern", value: rule.pattern },
        })
        input.addEventListener("change", async () => {
            rule.pattern = input.value.trim().replace(/^#/, "")
            input.value = rule.pattern
            await this.plugin.saveSettings()
        })

        // Color swatch
        const swatch = row.createDiv({ cls: "swimlane-tag-color-swatch" })
        swatch.style.backgroundColor = rule.color
        swatch.addEventListener("click", () => {
            this.openColorPopover(swatch, rule)
        })

        // Delete button
        const deleteBtn = row.createEl("button", { cls: "swimlane-tag-color-rule-btn", text: "×" })
        deleteBtn.addEventListener("click", async () => {
            rules.splice(index, 1)
            await this.plugin.saveSettings()
            this.display()
        })
    }

    private openColorPopover(swatch: HTMLElement, rule: TagColorRule): void {
        this.closePopover()

        const popover = document.createElement("div")
        popover.classList.add("swimlane-tag-color-popover")
        swatch.parentElement!.appendChild(popover)

        // Preset palette
        const palette = popover.createDiv({ cls: "swimlane-tag-palette" })
        for (const preset of PRESET_PALETTE) {
            const presetSwatch = palette.createDiv({ cls: "swimlane-tag-palette-swatch" })
            presetSwatch.style.backgroundColor = preset.color
            presetSwatch.title = preset.name
            if (preset.color === rule.color) {
                presetSwatch.classList.add("swimlane-tag-palette-swatch--active")
            }
            presetSwatch.addEventListener("click", async () => {
                rule.color = preset.color
                swatch.style.backgroundColor = rule.color
                await this.plugin.saveSettings()
                this.closePopover()
            })
        }

        // Custom color picker
        const pickerRow = popover.createDiv({ cls: "swimlane-tag-color-picker-row" })
        pickerRow.createSpan({ text: "Custom: " })
        const picker = pickerRow.createEl("input", {
            attr: { type: "color", value: rule.color },
        })
        picker.addEventListener("input", async () => {
            rule.color = picker.value
            swatch.style.backgroundColor = rule.color
            await this.plugin.saveSettings()
        })

        this.activePopover = popover

        // Dismiss on outside click
        const onPointerDown = (e: PointerEvent) => {
            if (!popover.contains(e.target as Node) && e.target !== swatch) {
                this.closePopover()
                document.removeEventListener("pointerdown", onPointerDown, true)
            }
        }
        setTimeout(() => {
            document.addEventListener("pointerdown", onPointerDown, true)
        }, 0)

        // Dismiss on Escape
        const onKeydown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                this.closePopover()
                document.removeEventListener("keydown", onKeydown)
            }
        }
        document.addEventListener("keydown", onKeydown)
    }

    private closePopover(): void {
        if (this.activePopover) {
            this.activePopover.remove()
            this.activePopover = null
        }
    }
}
