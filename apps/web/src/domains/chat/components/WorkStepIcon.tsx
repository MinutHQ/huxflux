import {
  IconFilePlus,
  IconFileText,
  IconListCheck,
  IconPencil,
  IconSearch,
  IconSparkles,
  IconTerminal2,
  IconUsers,
  IconWorld,
} from "@tabler/icons-react"
import type { WorkStepKind } from "../chat.types"

const icons = {
  run: IconTerminal2,
  read: IconFileText,
  write: IconFilePlus,
  edit: IconPencil,
  search: IconSearch,
  fetch: IconWorld,
  delegate: IconUsers,
  task: IconListCheck,
  other: IconSparkles,
} satisfies Record<WorkStepKind, unknown>

export function WorkStepIcon({ kind, size, className }: { kind: WorkStepKind; size: number; className?: string }) {
  const Icon = icons[kind]
  return <Icon size={size} className={className} />
}
