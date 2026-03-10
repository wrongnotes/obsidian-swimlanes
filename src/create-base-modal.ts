import { Modal, Setting, normalizePath } from "obsidian"
import type { App, BasesConfigFile } from "obsidian"
import { FolderSuggest } from "./folder-suggest"

export class CreateBaseModal extends Modal {
    private folderPath = ""
    private baseName = ""
    private groupKey = ""
    private groupValues: string[] = []

    constructor(app: App) {
        super(app)
    }

    onOpen(): void {
        this.setTitle("Create base")

        this.buildFolderSetting()
        this.buildNameSetting()
        this.buildGroupKeySetting()
        this.buildGroupValuesSetting()
        this.buildSubmitButton()
    }

    private buildFolderSetting(): void {
        const setting = new Setting(this.contentEl)
            .setName("Folder")
            .setDesc("Folder to include in the base.")

        setting.addText(text => {
            text.setPlaceholder("Projects/tasks")
            text.onChange(value => {
                this.folderPath = value
            })
            new FolderSuggest(this.app, text.inputEl)
        })
    }

    private buildNameSetting(): void {
        new Setting(this.contentEl)
            .setName("Base name")
            .setDesc("Name for the new .base file.")
            .addText(text => {
                text.setPlaceholder("Task board")
                text.onChange(value => {
                    this.baseName = value
                })
            })
    }

    private buildGroupKeySetting(): void {
        new Setting(this.contentEl)
            .setName("Group property")
            .setDesc("Frontmatter property used to group items into columns.")
            .addText(text => {
                text.setPlaceholder("Status")
                text.onChange(value => {
                    this.groupKey = value
                })
            })
    }

    private buildGroupValuesSetting(): void {
        const container = this.contentEl.createDiv({ cls: "create-base-group-values" })
        const setting = new Setting(container)
            .setName("Group values")
            .setDesc("Values for the group property. Press enter to add.")

        this.renderValueTags(container)

        setting.addText(text => {
            text.setPlaceholder("To do")
            text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
                if (e.key !== "Enter") {
                    return
                }
                e.preventDefault()
                const value = text.getValue().trim()
                if (value && !this.groupValues.includes(value)) {
                    this.groupValues.push(value)
                    this.renderValueTags(container)
                }
                text.setValue("")
            })
        })
    }

    private renderValueTags(container: HTMLElement): void {
        const existing = container.querySelector(".create-base-tags")
        if (existing) {
            existing.remove()
        }

        if (this.groupValues.length === 0) {
            return
        }

        const tagsEl = container.createDiv({ cls: "create-base-tags" })
        for (const value of this.groupValues) {
            const tag = tagsEl.createSpan({ cls: "create-base-tag", text: value })
            const removeBtn = tag.createSpan({
                cls: "create-base-tag-remove",
                text: "\u00d7",
            })
            removeBtn.addEventListener("click", () => {
                this.groupValues = this.groupValues.filter(v => v !== value)
                this.renderValueTags(container)
            })
        }
    }

    private buildSubmitButton(): void {
        new Setting(this.contentEl).addButton(btn => {
            btn.setButtonText("Create")
            btn.setCta()
            btn.onClick(() => this.submit())
        })
    }

    private async submit(): Promise<void> {
        if (!this.baseName.trim()) {
            this.showValidationError("Base name is required.")
            return
        }
        if (!this.groupKey.trim()) {
            this.showValidationError("Group property is required.")
            return
        }
        if (this.groupValues.length === 0) {
            this.showValidationError("Add at least one group value.")
            return
        }

        const folder = this.folderPath.trim()
        const fileName = this.baseName.trim()
        const filePath = normalizePath(folder ? `${folder}/${fileName}.base` : `${fileName}.base`)

        const exists = await this.app.vault.adapter.exists(filePath)
        if (exists) {
            this.showValidationError(`A file already exists at ${filePath}.`)
            return
        }

        const config = this.buildBaseConfig(folder)
        await this.app.vault.create(filePath, JSON.stringify(config, null, "\t"))

        const file = this.app.vault.getFileByPath(filePath)
        if (file) {
            await this.app.workspace.getLeaf().openFile(file)
        }

        this.close()
    }

    buildBaseConfig(folder: string): BasesConfigFile {
        return {
            filters: folder || undefined,
            properties: {
                [this.groupKey.trim()]: {
                    displayName: this.groupKey.trim(),
                },
            },
            views: [
                {
                    type: "sheet",
                    name: "Sheet",
                    order: [`note.${this.groupKey.trim()}`],
                },
            ],
        }
    }

    private showValidationError(message: string): void {
        const existing = this.contentEl.querySelector(".create-base-error")
        if (existing) {
            existing.remove()
        }

        const errorEl = this.contentEl.createDiv({
            cls: "create-base-error",
            text: message,
        })

        // Auto-dismiss after a few seconds
        setTimeout(() => errorEl.remove(), 4000)
    }
}
