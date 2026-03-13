import { Modal, Setting, normalizePath } from "obsidian"
import type { App, BasesConfigFile, BasesConfigFileView, TFile } from "obsidian"
import { WrongNotesModal } from "../inputs/wrong-notes-modal"
import { FolderSuggest } from "../inputs/folder-suggest"
import { FileSuggest } from "../inputs/file-suggest"
import { ToggleableInputSection } from "../inputs/toggleable-input-section"
import { midRank } from "../lexorank"
import { parseKanbanMarkdown } from "./kanban-parser"
import type { KanbanBoard, KanbanCard } from "./kanban-parser"

/** Characters that are invalid in file names across Windows/macOS/Linux + Obsidian */
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g

function sanitizeFileName(name: string): string {
    return name.replace(INVALID_FILENAME_CHARS, "-").replace(/-{2,}/g, "-")
}

export class KanbanImportModal extends WrongNotesModal {
    private sourceFile: TFile | null = null
    private board: KanbanBoard | null = null
    private baseName = ""
    private propertyName = "status"
    private rankPropertyName = "rank"
    private folderPath = "Tasks"
    private dateSection: ToggleableInputSection | null = null
    private datePropertyName = "date"
    private timePropertyName = "time"
    private archiveSection: ToggleableInputSection | null = null
    private archiveStatus = "Archived"
    private excludedColumns: Set<string> = new Set()
    private nameInputEl: HTMLInputElement | null = null
    private nameSetByUser = false
    private previewEl: HTMLElement | null = null

    constructor(app: App) {
        super(app)
    }

    onOpen(): void {
        this.setTitle("Import from kanban")

        this.setDescription(
            "Import a board created with the kanban community plugin into a bases-backed swimlane view.",
        )

        this.buildSourceSetting()
        this.buildNameSetting()
        this.buildFolderSetting()
        this.buildCustomPropertiesSettings()
        this.buildDateSettings()
        this.buildArchiveSettings()
        this.buildPreview()
        this.buildSubmitButton()
    }

    private buildSourceSetting(): void {
        new Setting(this.contentEl)
            .setName("Kanban board")
            .setDesc("Select a board file created with the kanban community plugin.")
            .addText(text => {
                text.setPlaceholder("path/to/board.md")
                const suggest = new FileSuggest(
                    this.app,
                    text.inputEl,
                    file => this.looksLikeKanbanFile(file),
                    [file => this.onSourceSelected(file)],
                )
                suggest.close()
            })
    }

    private buildNameSetting(): void {
        new Setting(this.contentEl)
            .setName("Name")
            .setDesc("Path for your new swimlane base, e.g. Projects/My board.")
            .addText(text => {
                text.setPlaceholder("My swimlanes")
                this.nameInputEl = text.inputEl
                text.onChange(value => {
                    this.baseName = value
                    this.nameSetByUser = true
                })
            })
    }

    private buildFolderSetting(): void {
        new Setting(this.contentEl)
            .setName("Source folder")
            .setDesc("Imported tasks will be created as notes in this directory.")
            .addText(text => {
                text.setValue(this.folderPath)
                text.onChange(value => {
                    this.folderPath = value
                })
                const suggest = new FolderSuggest(this.app, text.inputEl, [
                    value => {
                        this.folderPath = value
                    },
                ])
                suggest.close()
            })
    }

    private buildCustomPropertiesSettings(): void {
        const section = new ToggleableInputSection(
            this.contentEl,
            "Custom properties",
            "Override the default frontmatter property names used during import.",
        )

        new Setting(section.bodyEl)
            .setName("Swimlane")
            .setDesc("Frontmatter property to store each card's column value.")
            .addText(text => {
                text.setValue("status")
                text.onChange(value => {
                    this.propertyName = value
                })
            })

        new Setting(section.bodyEl)
            .setName("Rank")
            .setDesc("Frontmatter property used to preserve card ordering.")
            .addText(text => {
                text.setValue("rank")
                text.onChange(value => {
                    this.rankPropertyName = value
                })
            })
    }

    private buildDateSettings(): void {
        this.dateSection = new ToggleableInputSection(
            this.contentEl,
            "Import dates",
            "Import date and time metadata from kanban cards into frontmatter properties.",
        )

        new Setting(this.dateSection.bodyEl)
            .setName("Date property")
            .setDesc("Frontmatter property for the card's date.")
            .addText(text => {
                text.setValue("date")
                text.onChange(value => {
                    this.datePropertyName = value
                })
            })

        new Setting(this.dateSection.bodyEl)
            .setName("Time property")
            .setDesc("Frontmatter property for the card's time.")
            .addText(text => {
                text.setValue("time")
                text.onChange(value => {
                    this.timePropertyName = value
                })
            })
    }

    private buildArchiveSettings(): void {
        this.archiveSection = new ToggleableInputSection(
            this.contentEl,
            "Import archived cards",
            "Archived cards will be hidden by default, but retained so they can be shown with custom filters.",
            () => this.renderPreview(),
        )

        new Setting(this.archiveSection.bodyEl)
            .setName("Archived status")
            .setDesc("Column value to assign to archived cards.")
            .addText(text => {
                text.setValue("Archived")
                text.onChange(value => {
                    this.archiveStatus = value
                })
            })
    }

    private buildPreview(): void {
        this.previewEl = this.contentEl.createDiv({ cls: "swimlane-import-preview" })
        this.renderPreview()
    }

    private buildSubmitButton(): void {
        new Setting(this.contentEl).addButton(btn => {
            btn.setButtonText("Import")
            btn.setCta()
            btn.onClick(() => {
                this.submit().catch(err => {
                    this.showValidationError(String(err))
                })
            })
        })
    }

    private looksLikeKanbanFile(file: TFile): boolean {
        const cache = this.app.metadataCache.getFileCache(file)
        if (!cache?.frontmatter) {
            return false
        }
        return cache.frontmatter["kanban-plugin"] !== undefined
    }

    private async onSourceSelected(file: TFile): Promise<void> {
        this.sourceFile = file
        const content = await this.app.vault.read(file)
        this.board = parseKanbanMarkdown(content)
        this.excludedColumns = new Set()

        if (!this.nameSetByUser && this.nameInputEl) {
            this.baseName = file.basename
            this.nameInputEl.value = file.basename
        }

        this.renderPreview()
    }

    private renderPreview(): void {
        if (!this.previewEl) {
            return
        }

        this.previewEl.empty()

        if (!this.board) {
            this.previewEl.createEl("p", {
                cls: "swimlane-import-preview-empty",
                text: "Select a kanban board to see a preview.",
            })
            return
        }

        const includedColumns = this.board.columns.filter(c => !this.excludedColumns.has(c.name))
        const columnCards = includedColumns.reduce((sum, col) => sum + col.cards.length, 0)
        const includeArchive = this.archiveSection?.enabled ?? false
        const archiveCount = includeArchive ? this.board.archive.length : 0
        const totalCards = columnCards + archiveCount

        const headerEl = this.previewEl.createDiv({ cls: "swimlane-import-preview-header" })
        headerEl.createEl("span", {
            cls: "swimlane-import-preview-title",
            text: "Columns",
        })

        let summary = `${totalCards} card${totalCards === 1 ? "" : "s"}`
        if (archiveCount > 0) {
            summary += `, ${archiveCount} archived`
        }
        headerEl.createEl("span", {
            cls: "swimlane-import-preview-summary",
            text: summary,
        })

        const listEl = this.previewEl.createDiv({ cls: "swimlane-import-preview-columns" })
        for (const column of this.board.columns) {
            const included = !this.excludedColumns.has(column.name)
            const colEl = listEl.createDiv({
                cls: `swimlane-import-preview-column${included ? "" : " swimlane-import-preview-column--excluded"}`,
            })

            const checkbox = colEl.createEl("input", {
                cls: "swimlane-import-preview-column-checkbox",
                type: "checkbox",
            }) as HTMLInputElement
            checkbox.checked = included

            colEl.createEl("span", {
                cls: "swimlane-import-preview-column-name",
                text: column.name,
            })
            colEl.createEl("span", {
                cls: "swimlane-import-preview-column-count",
                text: `${column.cards.length}`,
            })
            colEl.addEventListener("click", e => {
                e.preventDefault()
                if (this.excludedColumns.has(column.name)) {
                    this.excludedColumns.delete(column.name)
                } else {
                    this.excludedColumns.add(column.name)
                }
                this.renderPreview()
            })
        }
    }

    private findOutOfFolderNotes(folder: string): TFile[] {
        if (!folder || !this.board || !this.sourceFile) {
            return []
        }

        const allCards = [
            ...this.board.columns
                .filter(c => !this.excludedColumns.has(c.name))
                .flatMap(c => c.cards),
            ...(this.archiveSection?.enabled ? this.board.archive : []),
        ]

        const outOfFolder: TFile[] = []
        for (const card of allCards) {
            if (!card.link) {
                continue
            }
            const linked = this.app.metadataCache.getFirstLinkpathDest(
                card.link,
                this.sourceFile.path,
            )
            if (linked && (linked.parent?.path ?? "") !== folder) {
                outOfFolder.push(linked)
            }
        }
        return outOfFolder
    }

    private showMoveConfirmation(notes: TFile[], folder: string): void {
        const existing = this.contentEl.querySelector(".swimlane-move-confirmation")
        if (existing) {
            existing.remove()
        }

        const el = this.contentEl.createDiv({ cls: "swimlane-move-confirmation" })

        const noteList = notes.map(f => f.path).join(", ")
        el.createEl("p", {
            text: `${notes.length} linked note${notes.length === 1 ? "" : "s"} outside "${folder}": ${noteList}`,
        })
        el.createEl("p", {
            text: "These notes won't appear in the swimlane view unless they're moved to the source folder.",
        })

        const buttons = el.createDiv({ cls: "swimlane-move-confirmation-buttons" })

        const moveBtn = buttons.createEl("button", { text: "Move and import" })
        moveBtn.classList.add("mod-cta")
        moveBtn.addEventListener("click", () => {
            el.remove()
            this.doImport(true).catch(err => this.showValidationError(String(err)))
        })

        const skipBtn = buttons.createEl("button", { text: "Import without moving" })
        skipBtn.addEventListener("click", () => {
            el.remove()
            this.doImport(false).catch(err => this.showValidationError(String(err)))
        })
    }

    private async submit(): Promise<void> {
        if (!this.board || !this.sourceFile) {
            this.showValidationError("Select a kanban board file.")
            return
        }
        if (!this.baseName.trim()) {
            this.showValidationError("Name is required.")
            return
        }
        if (!this.propertyName.trim()) {
            this.showValidationError("Property name is required.")
            return
        }

        const folder = this.folderPath.trim()
        const outOfFolder = this.findOutOfFolderNotes(folder)
        if (outOfFolder.length > 0) {
            this.showMoveConfirmation(outOfFolder, folder)
            return
        }

        await this.doImport(false)
    }

    private async doImport(moveLinkedNotes: boolean): Promise<void> {
        const prop = this.propertyName.trim()
        const rankProp = this.rankPropertyName.trim()
        const folder = this.folderPath.trim()
        const dateProp = this.datePropertyName.trim() || "date"
        const timeProp = this.timePropertyName.trim() || "time"

        const columnsToImport = this.board!.columns.filter(c => !this.excludedColumns.has(c.name))
        const archiveCards = this.archiveSection?.enabled ? this.board!.archive : []
        const totalCards =
            columnsToImport.reduce((n, c) => n + c.cards.length, 0) + archiveCards.length

        const progress = new ImportProgressModal(this.app, totalCards)
        this.close()
        progress.open()

        const errors: ImportError[] = []
        let imported = 0

        if (folder) {
            const folderExists = await this.app.vault.adapter.exists(folder)
            if (!folderExists) {
                await this.app.vault.createFolder(folder)
            }
        }

        // Move out-of-folder linked notes if the user opted in
        if (moveLinkedNotes && folder) {
            const toMove = this.findOutOfFolderNotes(folder)
            for (const file of toMove) {
                const newPath = normalizePath(`${folder}/${file.name}`)
                await this.app.fileManager.renameFile(file, newPath)
            }
        }

        for (const column of columnsToImport) {
            let lastRank: string | null = null
            for (const card of column.cards) {
                const rank = midRank(lastRank, null)
                lastRank = rank

                try {
                    const setCardFrontmatter = (fm: Record<string, unknown>) => {
                        fm[prop] = column.name
                        fm[rankProp] = rank
                        if (card.completed) {
                            fm.completed = true
                        }
                        if (card.tags.length > 0) {
                            fm.tags = card.tags
                        }
                        if (this.dateSection?.enabled && card.date) {
                            fm[dateProp] = card.date
                        }
                        if (this.dateSection?.enabled && card.time) {
                            fm[timeProp] = card.time
                        }
                    }

                    if (card.link) {
                        const linked = this.app.metadataCache.getFirstLinkpathDest(
                            card.link,
                            this.sourceFile!.path,
                        )
                        if (linked) {
                            await this.app.fileManager.processFrontMatter(
                                linked,
                                setCardFrontmatter,
                            )
                            imported++
                            progress.update(imported)
                            continue
                        }
                    }

                    await this.createCardNote(card, folder, setCardFrontmatter)
                    imported++
                    progress.update(imported)
                } catch (err) {
                    errors.push({ card: card.text, error: String(err) })
                    imported++
                    progress.update(imported)
                }
            }
        }

        // Import archived cards if opted in
        const archiveStatus = this.archiveStatus.trim()
        if (archiveCards.length > 0) {
            for (const card of archiveCards) {
                try {
                    const setArchivedFrontmatter = (fm: Record<string, unknown>) => {
                        fm[prop] = archiveStatus || "Archived"
                        fm.archived = true
                        if (card.completed) {
                            fm.completed = true
                        }
                        if (card.tags.length > 0) {
                            fm.tags = card.tags
                        }
                        if (this.dateSection?.enabled && card.date) {
                            fm.archivedAt = card.date
                        }
                    }

                    if (card.link) {
                        const linked = this.app.metadataCache.getFirstLinkpathDest(
                            card.link,
                            this.sourceFile!.path,
                        )
                        if (linked) {
                            await this.app.fileManager.processFrontMatter(
                                linked,
                                setArchivedFrontmatter,
                            )
                            imported++
                            progress.update(imported)
                            continue
                        }
                    }

                    await this.createCardNote(card, folder, setArchivedFrontmatter)
                    imported++
                    progress.update(imported)
                } catch (err) {
                    errors.push({ card: card.text, error: String(err) })
                    imported++
                    progress.update(imported)
                }
            }
        }

        const columnNames = columnsToImport.map(c => c.name)
        const basePath = normalizePath(`${this.baseName.trim()}.base`)

        const baseExists = await this.app.vault.adapter.exists(basePath)
        if (baseExists) {
            progress.showResult(imported - errors.length, errors, null)
            return
        }

        const hasArchive = archiveCards.length > 0
        const baseConfig = this.buildBaseConfig(folder, prop, columnNames, hasArchive)
        const baseFile = await this.app.vault.create(
            basePath,
            JSON.stringify(baseConfig, null, "\t"),
        )

        progress.showResult(imported - errors.length, errors, baseFile)
    }

    private async createCardNote(
        card: KanbanCard,
        folder: string,
        setFrontmatter: (fm: Record<string, unknown>) => void,
    ): Promise<void> {
        const sanitized = sanitizeFileName(card.text)
        const notePath = normalizePath(folder ? `${folder}/${sanitized}.md` : `${sanitized}.md`)
        const exists = await this.app.vault.adapter.exists(notePath)
        if (!exists) {
            await this.app.vault.create(notePath, "")
        }

        const file = this.app.vault.getAbstractFileByPath(notePath) as TFile | null
        if (file) {
            const needsAlias = sanitized !== card.text
            await this.app.fileManager.processFrontMatter(file, fm => {
                if (needsAlias) {
                    const aliases = Array.isArray(fm.aliases) ? (fm.aliases as string[]) : []
                    if (!aliases.includes(card.text)) {
                        aliases.push(card.text)
                    }
                    fm.aliases = aliases
                }
                setFrontmatter(fm)
            })
        }
    }

    buildBaseConfig(
        folder: string,
        prop: string,
        columnNames: string[],
        hasArchive: boolean,
    ): BasesConfigFile {
        const propId = `note.${prop}`
        const viewFilters = hasArchive ? { and: ["archived != true"] } : undefined
        return {
            filters: folder ? { and: [`file.folder == "${folder}"`] } : undefined,
            properties: {
                [prop]: {
                    displayName: prop,
                },
            },
            views: [
                {
                    type: "swimlane",
                    name: "Swimlane",
                    filters: viewFilters,
                    groupBy: { property: prop, direction: "ASC" },
                    order: [propId],
                    swimlaneProperty: propId,
                    swimlaneOrder: columnNames,
                } as BasesConfigFileView & Record<string, unknown>,
            ],
        }
    }
}

interface ImportError {
    card: string
    error: string
}

export class ImportProgressModal extends Modal {
    private total: number
    private progressEl: HTMLElement
    private statusEl: HTMLElement
    private bodyEl: HTMLElement

    constructor(app: App, total: number) {
        super(app)
        this.total = total
        this.modalEl.classList.add("swimlane-modal")
        this.setTitle("Importing cards…")

        this.statusEl = this.contentEl.createEl("p", {
            cls: "swimlane-import-progress-status",
            text: `0 / ${total}`,
        })

        this.progressEl = this.contentEl.createEl("progress", {
            cls: "swimlane-import-progress-bar",
        })
        this.progressEl.setAttribute("max", String(total))
        this.progressEl.setAttribute("value", "0")

        this.bodyEl = this.contentEl.createDiv()
    }

    update(done: number): void {
        this.statusEl.textContent = `${done} / ${this.total}`
        this.progressEl.setAttribute("value", String(done))
    }

    showResult(succeeded: number, errors: ImportError[], baseFile: TFile | null): void {
        this.setTitle("Import complete")
        this.statusEl.remove()
        this.progressEl.remove()
        this.bodyEl.empty()

        if (errors.length === 0) {
            this.bodyEl.createEl("p", {
                text: `Successfully imported ${succeeded} card${succeeded === 1 ? "" : "s"}.`,
            })
        } else {
            this.bodyEl.createEl("p", {
                text: `Imported ${succeeded} card${succeeded === 1 ? "" : "s"}. ${errors.length} failed:`,
            })
            const list = this.bodyEl.createEl("ul", { cls: "swimlane-import-error-list" })
            for (const err of errors) {
                list.createEl("li", { text: `${err.card}: ${err.error}` })
            }
        }

        if (baseFile && !errors.some(e => e.card === "__base__")) {
            new Setting(this.bodyEl).addButton(btn => {
                btn.setButtonText("Open swimlane")
                btn.setCta()
                btn.onClick(async () => {
                    await this.app.workspace.getLeaf().openFile(baseFile)
                    this.close()
                })
            })
        }
    }
}
