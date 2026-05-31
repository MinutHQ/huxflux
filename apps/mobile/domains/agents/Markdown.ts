// Cross-domain consumable markdown renderer. The agents domain owns it (it's
// the primary consumer); the pull-requests domain renders comment bodies via
// this same component. Implementation lives in `components/Markdown.tsx`.

export { Markdown } from "./components/Markdown"
