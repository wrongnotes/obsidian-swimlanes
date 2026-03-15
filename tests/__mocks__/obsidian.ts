// Minimal mock of the Obsidian API for Jest tests.
// Add to this file as more Obsidian APIs are used in source code.

export const Platform = {
    isMobile: false,
    isDesktop: true,
    isDesktopApp: true,
    isMobileApp: false,
    isPhone: false,
    isTablet: false,
}

export class Component {
    load() {}
    unload() {}
}

export abstract class BasesView extends Component {
    app: unknown
    config: unknown
    allProperties: unknown[] = []
    data: any

    protected constructor(_controller: unknown) {
        super()
    }

    abstract type: string
    abstract onDataUpdated(): void
}

export class QueryController extends Component {}

export class Modal {
    app: any
    containerEl: HTMLElement
    modalEl: HTMLElement
    titleEl: HTMLElement
    contentEl: HTMLElement

    constructor(app: any) {
        this.app = app
        this.containerEl = document.createElement("div")
        this.modalEl = document.createElement("div")
        this.titleEl = document.createElement("div")
        this.contentEl = document.createElement("div")
        this.containerEl.appendChild(this.modalEl)
        this.modalEl.appendChild(this.titleEl)
        this.modalEl.appendChild(this.contentEl)
    }

    open() {
        this.onOpen()
    }

    close() {
        this.onClose()
    }

    onOpen() {}
    onClose() {}

    setTitle(title: string) {
        this.titleEl.textContent = title
        return this
    }

    setContent(content: string) {
        this.contentEl.textContent = content
        return this
    }
}

export class Setting {
    settingEl: HTMLElement
    nameEl: HTMLElement
    descEl: HTMLElement
    controlEl: HTMLElement

    constructor(containerEl: HTMLElement) {
        this.settingEl = containerEl.createDiv({ cls: "setting-item" })
        this.nameEl = this.settingEl.createDiv({ cls: "setting-item-name" })
        this.descEl = this.settingEl.createDiv({ cls: "setting-item-description" })
        this.controlEl = this.settingEl.createDiv({ cls: "setting-item-control" })
    }

    setName(name: string) {
        this.nameEl.textContent = name
        return this
    }

    setDesc(desc: string) {
        this.descEl.textContent = desc
        return this
    }

    addText(cb: (component: TextComponent) => void) {
        const component = new TextComponent(this.controlEl)
        cb(component)
        return this
    }

    addButton(cb: (component: ButtonComponent) => void) {
        const component = new ButtonComponent(this.controlEl)
        cb(component)
        return this
    }

    addToggle(cb: (component: ToggleComponent) => void) {
        const component = new ToggleComponent(this.controlEl)
        cb(component)
        return this
    }

    addExtraButton(cb: (component: ExtraButtonComponent) => void) {
        const component = new ExtraButtonComponent(this.controlEl)
        cb(component)
        return this
    }

    setClass(_cls: string) {
        return this
    }

    setHeading() {
        return this
    }
}

export class TextComponent {
    inputEl: HTMLInputElement
    private _onChange?: (value: string) => void

    constructor(containerEl: HTMLElement) {
        this.inputEl = document.createElement("input")
        this.inputEl.type = "text"
        containerEl.appendChild(this.inputEl)
        this.inputEl.addEventListener("input", () => {
            this._onChange?.(this.inputEl.value)
        })
    }

    setPlaceholder(placeholder: string) {
        this.inputEl.placeholder = placeholder
        return this
    }

    getValue() {
        return this.inputEl.value
    }

    setValue(value: string) {
        this.inputEl.value = value
        this._onChange?.(value)
        return this
    }

    onChange(callback: (value: string) => void) {
        this._onChange = callback
        return this
    }
}

export class ToggleComponent {
    toggleEl: HTMLElement
    private _value = false
    private _onChange?: (value: boolean) => void

    constructor(containerEl: HTMLElement) {
        this.toggleEl = document.createElement("div")
        this.toggleEl.classList.add("checkbox-container")
        containerEl.appendChild(this.toggleEl)
        this.toggleEl.addEventListener("click", () => {
            this._value = !this._value
            this._onChange?.(this._value)
        })
    }

    setValue(value: boolean) {
        this._value = value
        return this
    }

    onChange(callback: (value: boolean) => void) {
        this._onChange = callback
        return this
    }
}

export class ButtonComponent {
    buttonEl: HTMLButtonElement

    constructor(containerEl: HTMLElement) {
        this.buttonEl = document.createElement("button")
        containerEl.appendChild(this.buttonEl)
    }

    setButtonText(text: string) {
        this.buttonEl.textContent = text
        return this
    }

    setCta() {
        this.buttonEl.classList.add("mod-cta")
        return this
    }

    onClick(callback: () => void) {
        this.buttonEl.addEventListener("click", callback)
        return this
    }

    setDisabled(disabled: boolean) {
        this.buttonEl.disabled = disabled
        return this
    }
}

export class ExtraButtonComponent {
    extraSettingsEl: HTMLElement

    constructor(containerEl: HTMLElement) {
        this.extraSettingsEl = document.createElement("div")
        this.extraSettingsEl.classList.add("clickable-icon")
        containerEl.appendChild(this.extraSettingsEl)
    }

    setIcon(_icon: string) {
        return this
    }

    setTooltip(_tooltip: string) {
        return this
    }

    onClick(callback: () => void) {
        this.extraSettingsEl.addEventListener("click", callback)
        return this
    }

    setDisabled(_disabled: boolean) {
        return this
    }
}

export class Menu {
    addItem(cb: (item: MenuItem) => void): this {
        cb(new MenuItem())
        return this
    }
    addSeparator(): this {
        return this
    }
    showAtMouseEvent(_evt: MouseEvent): this {
        return this
    }
    showAtPosition(_pos: { x: number; y: number }): this {
        return this
    }
    hide(): this {
        return this
    }
    register(_cb: () => void): void {}
}

export class MenuItem {
    setTitle(_title: string): this {
        return this
    }
    setIcon(_icon: string | null): this {
        return this
    }
    setChecked(_checked: boolean | null): this {
        return this
    }
    setDisabled(_disabled: boolean): this {
        return this
    }
    setWarning(_isWarning: boolean): this {
        return this
    }
    onClick(_cb: (evt: MouseEvent | KeyboardEvent) => void): this {
        return this
    }
    setSubmenu(): Menu {
        return new Menu()
    }
}

export class Notice {
    constructor(_message: string) {}
}

export function setIcon(_el: HTMLElement, _icon: string) {}

// Value types used by swimlane-card
export class NullValue {
    isTruthy() {
        return false
    }
    toString() {
        return ""
    }
}
export class StringValue {
    private _value: string
    constructor(value: string = "") {
        this._value = value
    }
    isTruthy() {
        return true
    }
    toString() {
        return this._value
    }
}
export class NumberValue {
    isTruthy() {
        return true
    }
    toString() {
        return "0"
    }
}
export class BooleanValue {
    isTruthy() {
        return true
    }
    toString() {
        return "true"
    }
}
export class DateValue {
    isTruthy() {
        return true
    }
    toString() {
        return ""
    }
}
export class ListValue {
    isTruthy() {
        return true
    }
    toString() {
        return ""
    }
}
export class LinkValue {
    isTruthy() {
        return true
    }
    toString() {
        return ""
    }
}
export class TagValue {
    isTruthy() {
        return true
    }
    toString() {
        return ""
    }
}

export class AbstractInputSuggest<T> {
    app: any
    inputEl: HTMLInputElement | HTMLDivElement

    constructor(app: any, inputEl: HTMLInputElement | HTMLDivElement) {
        this.app = app
        this.inputEl = inputEl
    }

    setValue(value: string) {
        if (this.inputEl instanceof HTMLInputElement) {
            this.inputEl.value = value
        }
    }

    getValue() {
        if (this.inputEl instanceof HTMLInputElement) {
            return this.inputEl.value
        }
        return ""
    }

    close() {}

    renderSuggestion(_value: T, _el: HTMLElement) {}
    selectSuggestion(_value: T, _evt?: MouseEvent | KeyboardEvent) {}
}

export class TFile {
    path: string
    basename: string
    extension: string

    constructor(path: string) {
        this.path = path
        this.basename =
            path
                .split("/")
                .pop()
                ?.replace(/\.[^.]+$/, "") ?? ""
        this.extension = path.split(".").pop() ?? ""
    }
}

export class TFolder {
    path: string
    children: unknown[] = []

    constructor(path: string) {
        this.path = path
    }

    isRoot() {
        return this.path === "" || this.path === "/"
    }
}

export function normalizePath(path: string): string {
    return path.replace(/\/+/g, "/").replace(/^\/|\/$/g, "")
}

export function parseYaml(s: string) {
    try {
        return JSON.parse(s)
    } catch {
        return null
    }
}

export function stringifyYaml(o: any) {
    return JSON.stringify(o)
}

// Lightweight moment mock for date formatting in tests.
// Supports the tokens used by the automations engine.
function createMoment(d: Date = new Date()) {
    const pad = (n: number) => String(n).padStart(2, "0")
    return {
        format(fmt: string) {
            return fmt
                .replace("YYYY", String(d.getFullYear()))
                .replace("YY", String(d.getFullYear()).slice(-2))
                .replace("MM", pad(d.getMonth() + 1))
                .replace("DD", pad(d.getDate()))
                .replace("HH", pad(d.getHours()))
                .replace("mm", pad(d.getMinutes()))
                .replace("ss", pad(d.getSeconds()))
        },
    }
}
export const moment = Object.assign(createMoment, {}) as unknown as typeof import("moment").default
