import { Setting, normalizePath } from "obsidian"
import type { App, BasesConfigFile, BasesConfigFileView } from "obsidian"
import { WrongNotesModal } from "../inputs/wrong-notes-modal"
import { FolderSuggest } from "../inputs/folder-suggest"
import { MultiValueText } from "../inputs/multi-value-text"
import { PropertySuggest } from "../inputs/property-suggest"
import { InputSection } from "../inputs/input-section"
import { PropertyValueSuggest } from "../inputs/property-value-suggest"

export class CreateBaseModal extends WrongNotesModal {
    private folderPath = ""
    private baseName = ""
    private groupKey = "swimlane"
    private groupValues: string[] = []

    constructor(app: App) {
        super(app)
    }

    onOpen(): void {
        this.setTitle("Create swimlanes")

        this.buildNameSetting()
        this.buildFolderSetting()
        this.buildGroupingSection()
        this.buildSubmitButton()
    }

    private buildNameSetting(): void {
        new Setting(this.contentEl)
            .setName("Name")
            .setDesc("Path for your new swimlane base, e.g. Projects/My board.")
            .addText(text => {
                text.setPlaceholder("My swimlanes")
                text.onChange(value => {
                    this.baseName = value
                })
            })
    }

    private buildFolderSetting(): void {
        const setting = new Setting(this.contentEl)
            .setName("Source folder")
            .setDesc("Folder containing the notes that will populate your swimlanes.")

        setting.addText(text => {
            text.setPlaceholder("Projects/tasks")
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

    private buildGroupingSection(): void {
        new Setting(this.contentEl).setName("Swimlanes")

        const section = new InputSection(this.contentEl)

        new Setting(section.containerEl)
            .setName("Property")
            .setDesc("Notes are sorted into swimlanes by a frontmatter property.")
            .addText(text => {
                text.setValue("swimlane")
                text.onChange(value => {
                    this.groupKey = value
                })
                const suggest = new PropertySuggest(this.app, text.inputEl, () => this.folderPath, [
                    value => {
                        this.groupKey = value
                    },
                ])
                suggest.close()
            })

        new MultiValueText({
            name: "Values",
            desc: "Press enter to add a swimlane.",
            placeholder: "To do",
            containerEl: section.containerEl,
            onChange: values => {
                this.groupValues = values
            },
            setupInput: (inputEl, hooks) => {
                const suggest = new PropertyValueSuggest(
                    this.app,
                    inputEl,
                    () => this.folderPath,
                    () => this.groupKey,
                    [],
                    hooks,
                )
                suggest.close()
            },
        })
    }

    private buildSubmitButton(): void {
        new Setting(this.contentEl).addButton(btn => {
            btn.setButtonText("Create")
            btn.setCta()
            btn.onClick(() => {
                this.submit().catch(err => {
                    this.showValidationError(String(err))
                })
            })
        })
    }

    private async submit(): Promise<void> {
        if (!this.baseName.trim()) {
            this.showValidationError("Name is required.")
            return
        }
        if (!this.groupKey.trim()) {
            this.showValidationError("Grouping property is required.")
            return
        }
        if (this.groupValues.length === 0) {
            this.showValidationError("Add at least one swimlane.")
            return
        }

        const sourceFolder = this.folderPath.trim()
        const filePath = normalizePath(`${this.baseName.trim()}.base`)

        const exists = await this.app.vault.adapter.exists(filePath)
        if (exists) {
            this.showValidationError(`A file already exists at ${filePath}.`)
            return
        }

        const config = this.buildBaseConfig(sourceFolder)
        const file = await this.app.vault.create(filePath, JSON.stringify(config, null, "\t"))
        await this.app.workspace.getLeaf().openFile(file)

        this.close()
    }

    buildBaseConfig(folder: string): BasesConfigFile {
        const prop = this.groupKey.trim()
        const propId = `note.${prop}`
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
                    groupBy: { property: prop, direction: "ASC" },
                    order: [propId],
                    swimlaneProperty: propId,
                    swimlaneOrder: this.groupValues,
                } as BasesConfigFileView & Record<string, unknown>,
            ],
        }
    }
}
