// Public re-export of the chat-path `RunAgentOptions` builder. Implementation
// lives in `service/chatRun.ts` (private subfolder). Used by every call site
// of `runAgent` that operates a "standard" agent conversation: the chat
// message route, the queue drainer, and the task start-work flow.

export { buildChatRunOptions } from "./service/chatRun.js"
