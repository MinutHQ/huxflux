// Drives the scripted refine conversation:
//  - confirming the repo selection,
//  - asking the next question,
//  - finalizing the spec once all questions are answered.
//
// All timing is via setTimeout to fake "typing"; the simulated agent is
// stateless — every transition is derived from `session.answers.length`.

import { useCallback, useState } from "react"
import type { Repo } from "@huxflux/shared"
import { REFINE_QUESTIONS } from "../config"
import type { RefineMessage, RefineSession } from "../tasks.types"
import { generateRefineSubtasks } from "../utils"

function appendAgentMessage(
  base: RefineSession,
  content: string,
  type: RefineMessage["type"],
): RefineSession {
  return {
    ...base,
    messages: [
      ...base.messages,
      {
        id: `agent-${Date.now()}`,
        role: "agent",
        content,
        type,
        timestamp: new Date().toISOString(),
      },
    ],
  }
}

function appendUserMessage(base: RefineSession, text: string): RefineSession {
  return {
    ...base,
    messages: [
      ...base.messages,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        type: "text",
        timestamp: new Date().toISOString(),
      },
    ],
    answers: [...base.answers, text],
  }
}

function finalizeSpec(
  withUser: RefineSession,
  repos: Repo[],
  onUpdate: (s: RefineSession) => void,
  setIsTyping: (v: boolean) => void,
) {
  const subtasks = generateRefineSubtasks(withUser, repos)
  const done: RefineSession = { ...withUser, subtasks, status: "done" }
  const repoNames = done.repoIds
    .map((id) => repos.find((r) => r.id === id)?.name ?? id)
    .join(", ")
  onUpdate(done)
  setTimeout(
    () => {
      setIsTyping(false)
      onUpdate(
        appendAgentMessage(
          done,
          `I have enough context. I've built the task spec with ${subtasks.length} subtask${subtasks.length !== 1 ? "s" : ""} across **${repoNames}**.`,
          "text",
        ),
      )
    },
    1000 + Math.random() * 500,
  )
}

export function useRefineConversation({
  session,
  onUpdate,
  repos,
}: {
  session: RefineSession
  onUpdate: (s: RefineSession) => void
  repos: Repo[]
}) {
  const [isTyping, setIsTyping] = useState(false)
  const [selectedRepos, setSelectedRepos] = useState<string[]>(session.repoIds)

  const reposConfirmed = session.status !== "repos"

  const handleReposConfirm = useCallback(() => {
    if (selectedRepos.length === 0) return
    const withRepos: RefineSession = {
      ...session,
      repoIds: selectedRepos,
      status: "questions",
    }
    onUpdate(withRepos)
    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      const first = REFINE_QUESTIONS[0]
      if (first) onUpdate(appendAgentMessage(withRepos, first, "text"))
    }, 900)
  }, [selectedRepos, session, onUpdate])

  const handleSend = useCallback(
    (text: string) => {
      if (!text || isTyping || session.status === "done") return
      const withUser = appendUserMessage(session, text)
      onUpdate(withUser)
      setIsTyping(true)

      const nextQuestion = REFINE_QUESTIONS[withUser.answers.length]
      if (nextQuestion) {
        setTimeout(
          () => {
            setIsTyping(false)
            onUpdate(appendAgentMessage(withUser, nextQuestion, "text"))
          },
          700 + Math.random() * 400,
        )
      } else {
        finalizeSpec(withUser, repos, onUpdate, setIsTyping)
      }
    },
    [isTyping, session, onUpdate, repos],
  )

  return {
    isTyping,
    selectedRepos,
    setSelectedRepos,
    reposConfirmed,
    handleReposConfirm,
    handleSend,
  }
}
