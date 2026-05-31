import React from "react"
import { cn } from "@huxflux/ui"
import { getSendWith, getAutoConvert } from "@/lib/notificationPrefs"
import type { ChatInputBarProps } from "./chatInputBarTypes"
import { AttachmentChips } from "./AttachmentChips"
import { MentionPicker } from "./MentionPicker"
import { SlashCommandPicker } from "./SlashCommandPicker"
import { PlanPreview } from "./PlanPreview"
import { ChatInputActionRow } from "./ChatInputActionRow"

function inputContainerClass(isDragOver: boolean, showPlanApproval: boolean, isInPlanMode: boolean): string {
  if (isDragOver) return "border-2 border-dashed border-ring shadow-ring/10"
  if (showPlanApproval) return "border-2 border-dashed border-emerald-500/60"
  if (isInPlanMode) return "border-2 border-dashed border-primary/60 focus-within:border-primary"
  return "border border-border/60 focus-within:border-ring/50 focus-within:shadow-md focus-within:shadow-ring/5"
}

function makeKeyDownHandler(props: ChatInputBarProps) {
  return (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const { mentionQuery, mentionOptions, mentionIndex, setMentionIndex, applyMention, setMentionQuery,
      slashQuery, filteredCommands, slashIndex, setSlashIndex, applySlashCommand, setSlashQuery,
      fileInputRef, setPlanMode, onSend } = props
    if (mentionQuery !== null && mentionOptions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionOptions.length); return }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionOptions.length) % mentionOptions.length); return }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); applyMention(mentionOptions[mentionIndex]); return }
      if (e.key === "Escape") { setMentionQuery(null); return }
    }
    if (slashQuery !== null && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashIndex((i) => (i + 1) % filteredCommands.length); return }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length); return }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); applySlashCommand(filteredCommands[slashIndex].name); return }
      if (e.key === "Escape") { setSlashQuery(null); return }
    }
    if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); setPlanMode((v) => !v); return }
    if (e.key === "u" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); fileInputRef.current?.click(); return }
    const sendWith = getSendWith()
    const shouldSend =
      sendWith === "enter" ? (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) :
      sendWith === "cmd-enter" ? (e.key === "Enter" && (e.metaKey || e.ctrlKey)) :
      sendWith === "shift-enter" ? (e.key === "Enter" && e.shiftKey) :
      false
    if (shouldSend) { e.preventDefault(); onSend() }
  }
}

function handlePaste(e: React.ClipboardEvent, onUploadFiles: (files: File[]) => void) {
  const clipboardFiles = Array.from(e.clipboardData.items).filter((item) => item.kind === "file").map((item) => item.getAsFile()).filter((f): f is File => f !== null)
  if (clipboardFiles.length > 0) { e.preventDefault(); onUploadFiles(clipboardFiles); return }
  if (!getAutoConvert()) return
  const text = e.clipboardData.getData("text/plain")
  if (text.length > 5000) {
    e.preventDefault()
    const blob = new Blob([text], { type: "text/plain" })
    const file = new File([blob], "pasted-text.txt", { type: "text/plain" })
    onUploadFiles([file])
  }
}

export function ChatInputBar(props: ChatInputBarProps) {
  const { agent, input, onInputChange, textareaRef, showPlanApproval, isInPlanMode, planContent } = props
  const [isDragOver, setIsDragOver] = React.useState(false)
  // Recreated every render — handler closes over the latest props so the picker indices, plan toggle, etc. always read fresh state.
  const onKeyDown = makeKeyDownHandler(props)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) props.onUploadFiles(files)
  }

  return (
    <div className="relative">
      <MentionPicker
        agentId={agent.id}
        options={props.mentionQuery !== null ? props.mentionOptions : []}
        activeIndex={props.mentionIndex}
        onSelect={props.applyMention}
        listRef={props.mentionListRef}
        activeRef={props.mentionActiveRef}
      />
      <SlashCommandPicker
        commands={props.slashQuery !== null ? props.filteredCommands : []}
        activeIndex={props.slashIndex}
        onSelect={props.applySlashCommand}
      />
      {showPlanApproval && planContent && <PlanPreview content={planContent} />}
      <div
        className={cn("bg-card rounded-2xl transition-all relative shadow-sm", inputContainerClass(isDragOver, showPlanApproval, isInPlanMode))}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true) }}
        onDragLeave={(e) => {
          e.preventDefault(); e.stopPropagation()
          const rect = e.currentTarget.getBoundingClientRect()
          const { clientX: x, clientY: y } = e
          if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) setIsDragOver(false)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <AttachmentChips
          agentId={agent.id}
          pendingComments={props.pendingComments}
          attachments={props.attachments}
          linkedAgents={props.linkedAgents}
          mentionAttachments={props.mentionAttachments}
          fileChanges={props.fileChanges}
          onRemoveComment={props.onRemoveComment}
          onOpenDiffFile={props.onOpenDiffFile}
          onRemoveAttachment={props.onRemoveAttachment}
          onRemoveLinkedAgent={props.onRemoveLinkedAgent}
          onRemoveMention={props.onRemoveMention}
        />
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={showPlanApproval ? "Approve or dismiss the plan…" : agent.messages.length === 0 ? "Tell the agent what to work on…" : "Add a follow up"}
          rows={2}
          className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none overflow-y-auto"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onPaste={(e) => handlePaste(e, props.onUploadFiles)}
          onKeyDown={onKeyDown}
        />
        <ChatInputActionRow {...props} />
      </div>
    </div>
  )
}
