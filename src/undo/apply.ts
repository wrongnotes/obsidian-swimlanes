import type { App, TFile } from "obsidian"
import { parseYaml, stringifyYaml, Notice } from "obsidian"
import { applyMutations } from "../automations"
import type { UndoTransaction, UndoOperation } from "./types"

export interface UndoRedoContext {
    app: App
    config: { get(key: string): unknown; set(key: string, value: unknown): void; name?: string }
    swimlaneProp: string
    rankProp: string
    baseFile: TFile | null
}

// ─── helpers ────────────────────────────────────────────────────────────────

function getHiddenSet(ctx: UndoRedoContext): string[] {
    const raw = ctx.config.get("hiddenSwimlanes")
    return Array.isArray(raw) ? (raw as string[]) : []
}

function getSwimlaneOrder(ctx: UndoRedoContext): string[] {
    const raw = ctx.config.get("swimlaneOrder")
    return Array.isArray(raw) ? (raw as string[]) : []
}

// ─── applyUndo ───────────────────────────────────────────────────────────────

export async function applyUndo(transaction: UndoTransaction, ctx: UndoRedoContext): Promise<void> {
    const ops = [...transaction.operations].reverse()
    for (const op of ops) {
        await undoOne(op, ctx)
    }
}

async function undoOne(op: UndoOperation, ctx: UndoRedoContext): Promise<void> {
    const { app, swimlaneProp, rankProp } = ctx

    switch (op.type) {
        case "MoveCard": {
            const file = app.vault.getFileByPath(op.file.path)
            if (!file) {
                new Notice("Cannot undo: file no longer exists.")
                return
            }
            await app.fileManager.processFrontMatter(file, fm => {
                fm[swimlaneProp] = op.fromSwimlane
                fm[rankProp] = op.fromRank
                for (const [key, value] of Object.entries(op.automationPreviousValues)) {
                    if (value === undefined) {
                        delete fm[key]
                    } else {
                        fm[key] = value
                    }
                }
            })
            break
        }

        case "ReorderCard": {
            const file = app.vault.getFileByPath(op.file.path)
            if (!file) {
                new Notice("Cannot undo: file no longer exists.")
                return
            }
            await app.fileManager.processFrontMatter(file, fm => {
                fm[rankProp] = op.fromRank
            })
            break
        }

        case "CreateCard": {
            const file = app.vault.getFileByPath(op.file.path)
            if (!file) {
                new Notice("Cannot undo: file no longer exists.")
                return
            }
            await app.fileManager.trashFile(file)
            break
        }

        case "ReorderSwimlane": {
            ctx.config.set("swimlaneOrder", op.previousOrder)
            break
        }

        case "AddSwimlane": {
            const order = getSwimlaneOrder(ctx)
            ctx.config.set(
                "swimlaneOrder",
                order.filter(s => s !== op.swimlane),
            )
            break
        }

        case "RemoveSwimlane": {
            ctx.config.set("swimlaneOrder", op.previousOrder)
            for (const cardState of op.cardStates) {
                const file = app.vault.getFileByPath(cardState.file.path)
                if (!file) {
                    continue
                }
                await app.fileManager.processFrontMatter(file, fm => {
                    if (cardState.previousValue === undefined) {
                        delete fm[swimlaneProp]
                    } else {
                        fm[swimlaneProp] = cardState.previousValue
                    }
                    for (const [key, value] of Object.entries(cardState.automationPreviousValues)) {
                        if (value === undefined) {
                            delete fm[key]
                        } else {
                            fm[key] = value
                        }
                    }
                })
            }
            break
        }

        case "HideSwimlane": {
            const hidden = getHiddenSet(ctx).filter(s => s !== op.swimlane)
            ctx.config.set("hiddenSwimlanes", hidden)
            break
        }

        case "ShowSwimlane": {
            const hidden = getHiddenSet(ctx)
            if (!hidden.includes(op.swimlane)) {
                hidden.push(op.swimlane)
            }
            ctx.config.set("hiddenSwimlanes", hidden)
            break
        }

        case "SetSort": {
            await writeSort(ctx, op.previousSort)
            break
        }
    }
}

// ─── applyRedo ───────────────────────────────────────────────────────────────

export async function applyRedo(transaction: UndoTransaction, ctx: UndoRedoContext): Promise<void> {
    for (const op of transaction.operations) {
        await redoOne(op, ctx)
    }
}

async function redoOne(op: UndoOperation, ctx: UndoRedoContext): Promise<void> {
    const { app, swimlaneProp, rankProp } = ctx

    switch (op.type) {
        case "MoveCard": {
            const file = app.vault.getFileByPath(op.file.path)
            if (!file) {
                new Notice("Cannot redo: file no longer exists.")
                return
            }
            await app.fileManager.processFrontMatter(file, fm => {
                fm[swimlaneProp] = op.toSwimlane
                fm[rankProp] = op.toRank
                applyMutations(fm, op.resolvedAutomationMutations)
            })
            break
        }

        case "ReorderCard": {
            const file = app.vault.getFileByPath(op.file.path)
            if (!file) {
                new Notice("Cannot redo: file no longer exists.")
                return
            }
            await app.fileManager.processFrontMatter(file, fm => {
                fm[rankProp] = op.toRank
            })
            break
        }

        case "CreateCard": {
            const resolvedPath = deduplicatePath(app, op.path)
            const newFile = await app.vault.create(resolvedPath, "")
            await app.fileManager.processFrontMatter(newFile, fm => {
                fm[swimlaneProp] = op.swimlane
                fm[rankProp] = op.rank
                applyMutations(fm, op.resolvedAutomationMutations)
            })
            break
        }

        case "ReorderSwimlane": {
            ctx.config.set("swimlaneOrder", op.newOrder)
            break
        }

        case "AddSwimlane": {
            const order = getSwimlaneOrder(ctx)
            if (!order.includes(op.swimlane)) {
                order.push(op.swimlane)
            }
            ctx.config.set("swimlaneOrder", order)
            break
        }

        case "RemoveSwimlane": {
            const rmOp = op.op
            for (const cardState of op.cardStates) {
                const file = app.vault.getFileByPath(cardState.file.path)
                if (!file) {
                    continue
                }
                if (rmOp.kind === "move") {
                    const targetValue = rmOp.targetValue
                    await app.fileManager.processFrontMatter(file, fm => {
                        fm[swimlaneProp] = targetValue
                        applyMutations(fm, cardState.resolvedAutomationMutations)
                    })
                } else if (rmOp.kind === "clear") {
                    await app.fileManager.processFrontMatter(file, fm => {
                        delete fm[swimlaneProp]
                        applyMutations(fm, cardState.resolvedAutomationMutations)
                    })
                }
            }
            const order = getSwimlaneOrder(ctx)
            ctx.config.set(
                "swimlaneOrder",
                order.filter(s => s !== op.swimlane),
            )
            break
        }

        case "HideSwimlane": {
            const hidden = getHiddenSet(ctx)
            if (!hidden.includes(op.swimlane)) {
                hidden.push(op.swimlane)
            }
            ctx.config.set("hiddenSwimlanes", hidden)
            break
        }

        case "ShowSwimlane": {
            const hidden = getHiddenSet(ctx).filter(s => s !== op.swimlane)
            ctx.config.set("hiddenSwimlanes", hidden)
            break
        }

        case "SetSort": {
            await writeSort(ctx, op.newSort)
            break
        }
    }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function deduplicatePath(app: App, originalPath: string): string {
    if (!app.vault.getAbstractFileByPath(originalPath)) {
        return originalPath
    }
    // strip .md extension, add numeric suffix, re-add extension
    const dotIdx = originalPath.lastIndexOf(".")
    const ext = dotIdx >= 0 ? originalPath.slice(dotIdx) : ""
    const base = dotIdx >= 0 ? originalPath.slice(0, dotIdx) : originalPath
    let n = 1
    while (app.vault.getAbstractFileByPath(`${base} ${n}${ext}`)) {
        n++
    }
    return `${base} ${n}${ext}`
}

async function writeSort(
    ctx: UndoRedoContext,
    sort: { property: string; direction: string }[],
): Promise<void> {
    const { app, baseFile, config } = ctx
    if (!baseFile) {
        return
    }
    await app.vault.process(baseFile, content => {
        const parsed = parseYaml(content) ?? {}
        const views: unknown[] = Array.isArray(parsed.views) ? parsed.views : []
        const viewName = (config as { name?: string }).name
        const view = views.find((v: any) => v.name === viewName && v.type === "swimlane") as
            | Record<string, unknown>
            | undefined
        if (view) {
            view.sort = sort
        }
        return stringifyYaml({ ...parsed, views })
    })
}
