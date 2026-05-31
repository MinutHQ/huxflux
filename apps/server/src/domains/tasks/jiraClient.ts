// Public re-export of the Jira-client transition helper. Implementation lives
// in `service/jiraClient.ts` (private subfolder).

export { transitionIssue as jiraTransitionIssue } from "./service/jiraClient.js"
