// Minimal mock of the Obsidian API for Jest tests.
// Add to this file as more Obsidian APIs are used in source code.

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
    app: unknown
    contentEl: HTMLElement
    constructor(app: unknown) {
        this.app = app
        this.contentEl = document.createElement("div")
    }
    open() {}
    close() {}
    onOpen() {}
    onClose() {}
    setTitle(_title: string) {}
}

export class Setting {
    settingEl: HTMLElement
    constructor(_containerEl: HTMLElement) {
        this.settingEl = document.createElement("div")
    }
    addButton(cb: (btn: ButtonComponent) => void): this {
        cb(new ButtonComponent(document.createElement("button")))
        return this
    }
}

export class ButtonComponent {
    buttonEl: HTMLButtonElement
    constructor(el: HTMLButtonElement) {
        this.buttonEl = el
    }
    setButtonText(_text: string): this {
        return this
    }
    setCta(): this {
        return this
    }
    onClick(_cb: () => void): this {
        return this
    }
    setDisabled(_disabled: boolean): this {
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
