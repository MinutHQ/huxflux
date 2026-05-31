// Static configuration for the tasks board and refine flow.
//
// Lives in config.ts (not in component files) so multiple components in this
// domain can share the same column definitions, priority lookups, and refine
// script without circular imports.

import {
  IconArrowDown,
  IconArrowUp,
  IconEqual,
  IconUrgent,
} from "@tabler/icons-react"
import type { TaskColumn } from "./tasks.types"

export type ColumnDef = { id: TaskColumn; label: string; dotClass: string }

export const COLUMNS: ColumnDef[] = [
  { id: "backlog", label: "Backlog", dotClass: "bg-muted-foreground/40" },
  { id: "refining", label: "Refining", dotClass: "bg-purple-500" },
  { id: "ready", label: "Ready", dotClass: "bg-cyan-500" },
  { id: "in-progress", label: "In Progress", dotClass: "bg-amber-400" },
  { id: "in-review", label: "In Review", dotClass: "bg-blue-400" },
  { id: "done", label: "Done", dotClass: "bg-emerald-500" },
]

/** Maps Huxflux columns to Jira transition target statuses. */
export const COLUMN_TO_JIRA: Partial<Record<TaskColumn, string>> = {
  "backlog": "To Do",
  "in-progress": "In Progress",
  "in-review": "In Review",
  "done": "Done",
}

export const PRIORITY_CONFIG: Record<
  string,
  { icon: typeof IconUrgent; color: string; label: string }
> = {
  highest: { icon: IconUrgent, color: "text-red-500", label: "Urgent" },
  high: { icon: IconArrowUp, color: "text-orange-400", label: "High" },
  medium: { icon: IconEqual, color: "text-amber-400", label: "Medium" },
  low: { icon: IconArrowDown, color: "text-blue-400", label: "Low" },
  lowest: {
    icon: IconArrowDown,
    color: "text-muted-foreground/40",
    label: "Lowest",
  },
}

/** Scripted refine questions asked in order after the user picks repos. */
export const REFINE_QUESTIONS = [
  "What is the **goal of this change** from the user's perspective? What problem does it solve?",
  "Are there any **existing patterns, APIs, or components** we should reuse or stay consistent with?",
  "What are the **acceptance criteria**? How will we know this task is done?",
]

export const REFINE_STORAGE_KEY = "huxflux:refine-sessions"
