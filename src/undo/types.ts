import type { TFile } from "obsidian"
import type { FrontmatterMutation } from "../automations"
import type { RmSwimlaneOp } from "../migration-workflows/operations"

export type UndoOperation =
    | {
          type: "MoveCard"
          file: TFile
          fromSwimlane: string
          toSwimlane: string
          fromRank: string
          toRank: string
          resolvedAutomationMutations: FrontmatterMutation[]
          automationPreviousValues: Record<string, unknown>
      }
    | {
          type: "ReorderCard"
          file: TFile
          fromRank: string
          toRank: string
      }
    | {
          type: "CreateCard"
          file: TFile
          path: string
          swimlane: string
          rank: string
          resolvedAutomationMutations: FrontmatterMutation[]
          automationPreviousValues: Record<string, unknown>
      }
    | {
          type: "ReorderSwimlane"
          previousOrder: string[]
          newOrder: string[]
      }
    | {
          type: "AddSwimlane"
          swimlane: string
      }
    | {
          type: "RemoveSwimlane"
          swimlane: string
          op: RmSwimlaneOp
          previousOrder: string[]
          cardStates: {
              file: TFile
              previousValue: string | undefined
              resolvedAutomationMutations: FrontmatterMutation[]
              automationPreviousValues: Record<string, unknown>
          }[]
      }
    | {
          type: "HideSwimlane"
          swimlane: string
      }
    | {
          type: "ShowSwimlane"
          swimlane: string
      }
    | {
          type: "SetSort"
          previousSort: { property: string; direction: string }[]
          newSort: { property: string; direction: string }[]
      }

export interface UndoTransaction {
    label: string
    operations: UndoOperation[]
}
