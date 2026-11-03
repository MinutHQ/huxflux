// Public re-export of the PR-comment reply helper. Implementation lives in
// `service/prComments.ts` (private subfolder).

export { replyToReviewComment, findReviewThreadForComment, resolveReviewThread } from "./service/prComments.js"
