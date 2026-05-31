// Public re-export of the branch-rename / worktree-relocate service.
// Implementation lives in `service/rename.ts` (private subfolder).

export {
  applyBranchRename,
  isPlaceholderName,
  reconcileWorktreeLocation,
} from "./service/rename.js"
