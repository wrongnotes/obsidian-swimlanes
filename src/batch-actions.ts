import type { App, TFile } from "obsidian"
import type { FrontmatterMutation } from "./automations"
import type { UndoManager } from "./undo/undo-manager"
import { midRank } from "./lexorank"

export interface BatchMoveCard {
    file: TFile
    currentSwimlane: string
    currentRank: string
}

export interface BatchMoveOptions {
    app: App
    cards: BatchMoveCard[]
    targetSwimlane: string
    swimlaneProp: string
    rankProp: string
    lastRankInTarget: string | null
    undoManager: UndoManager
    getAutomationMutations: (
        fromSwimlane: string, toSwimlane: string, file: TFile,
    ) => { mutations: FrontmatterMutation[]; previousValues: Record<string, unknown> }
}

export async function batchMove(opts: BatchMoveOptions): Promise<void> {
    const { app, cards, targetSwimlane, swimlaneProp, rankProp, lastRankInTarget, undoManager, getAutomationMutations } = opts
    const toMove = cards.filter(c => c.currentSwimlane !== targetSwimlane)
    if (toMove.length === 0) return

    let prevRank = lastRankInTarget
    const ranks: string[] = []
    for (let i = 0; i < toMove.length; i++) {
        const rank = midRank(prevRank, null)
        ranks.push(rank)
        prevRank = rank
    }

    undoManager.beginTransaction(`Move ${toMove.length} card${toMove.length === 1 ? "" : "s"}`)

    for (let i = 0; i < toMove.length; i++) {
        const card = toMove[i]
        const newRank = ranks[i]
        const { mutations, previousValues } = getAutomationMutations(card.currentSwimlane, targetSwimlane, card.file)

        undoManager.pushOperation({
            type: "MoveCard", file: card.file,
            fromSwimlane: card.currentSwimlane, toSwimlane: targetSwimlane,
            fromRank: card.currentRank, toRank: newRank,
            resolvedAutomationMutations: mutations, automationPreviousValues: previousValues,
        })

        await app.fileManager.processFrontMatter(card.file, (fm: Record<string, unknown>) => {
            fm[swimlaneProp] = targetSwimlane
            fm[rankProp] = newRank
            for (const m of mutations) { fm[m.property] = m.value }
        })
    }

    undoManager.endTransaction()
}

export interface BatchDeleteOptions {
    app: App
    files: TFile[]
}

export async function batchDelete(opts: BatchDeleteOptions): Promise<void> {
    for (const file of opts.files) {
        await opts.app.fileManager.trashFile(file)
    }
}

export interface BatchTagOptions {
    app: App
    files: TFile[]
    tag: string
}

export function batchAddTag(opts: BatchTagOptions): void {
    const { app, files, tag } = opts
    for (const file of files) {
        app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
            const tags = Array.isArray(fm.tags) ? fm.tags as string[] : []
            if (!tags.includes(tag)) {
                tags.push(tag)
                fm.tags = tags
            }
        })
    }
}

export function batchRemoveTag(opts: BatchTagOptions): void {
    const { app, files, tag } = opts
    for (const file of files) {
        app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
            if (!Array.isArray(fm.tags)) return
            const tags = fm.tags as string[]
            const idx = tags.indexOf(tag)
            if (idx !== -1) {
                tags.splice(idx, 1)
                fm.tags = tags
            }
        })
    }
}
