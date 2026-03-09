// jsdom does not implement DragEvent — polyfill it as a cancelable MouseEvent.
// dataTransfer is left null since our source code guards with `if (e.dataTransfer)`.
class DragEventPolyfill extends MouseEvent {
    readonly dataTransfer: DataTransfer | null = null
    constructor(type: string, init?: MouseEventInit) {
        super(type, init)
    }
}
global.DragEvent = DragEventPolyfill as unknown as typeof DragEvent

class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    constructor(type: string, init?: PointerEventInit) {
        super(type, init)
        this.pointerId = init?.pointerId ?? 0
        this.pointerType = init?.pointerType ?? "mouse"
    }
}
global.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent

// Adds Obsidian's HTMLElement DOM extension methods to jsdom's HTMLElement.
// Keep in sync with the methods used in source files.

type CreateElOptions = { cls?: string; text?: string }

function createObsidianEl<K extends keyof HTMLElementTagNameMap>(
  this: HTMLElement,
  tag: K,
  options?: CreateElOptions | string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (typeof options === "string") {
    el.className = options
  } else if (options) {
    if (options.cls) {el.className = options.cls}
    if (options.text) {el.textContent = options.text}
  }
  this.appendChild(el)
  return el
}

HTMLElement.prototype.createEl = function <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options?: CreateElOptions | string,
) {
  return createObsidianEl.call(this, tag, options)
} as typeof HTMLElement.prototype.createEl

HTMLElement.prototype.createDiv = function (options?: CreateElOptions | string) {
  return createObsidianEl.call(this, "div", options)
}

HTMLElement.prototype.createSpan = function (options?: CreateElOptions | string) {
  return createObsidianEl.call(this, "span", options)
}

HTMLElement.prototype.empty = function () {
  this.innerHTML = ""
}

HTMLElement.prototype.addClass = function (cls: string) {
  this.classList.add(cls)
}

HTMLElement.prototype.removeClass = function (cls: string) {
  this.classList.remove(cls)
}
