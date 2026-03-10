import type { App, TFile } from "obsidian"

export interface MoveCardsOp {
    kind: "move"
    targetValue: string
}

export interface ClearPropertyOp {
    kind: "clear"
}

export interface HideSwimlaneOp {
    kind: "hide"
}

export interface DeleteCardsOp {
    kind: "delete"
}

export type RmSwimlaneOp = MoveCardsOp | ClearPropertyOp | HideSwimlaneOp | DeleteCardsOp

export async function executeRmSwimlane(
    app: App,
    files: TFile[],
    swimlaneProp: string,
    op: RmSwimlaneOp,
): Promise<void> {
    switch (op.kind) {
        case "move":
            for (const file of files) {
                await app.fileManager.processFrontMatter(file, fm => {
                    fm[swimlaneProp] = op.targetValue
                })
            }
            break
        case "clear":
            for (const file of files) {
                await app.fileManager.processFrontMatter(file, fm => {
                    delete fm[swimlaneProp]
                })
            }
            break
        case "delete":
            for (const file of files) {
                await app.fileManager.trashFile(file)
            }
            break
    }
}
