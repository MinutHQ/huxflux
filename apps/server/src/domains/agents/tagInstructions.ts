// Public re-export of the agents-domain tag-instruction builders. Used by
// call sites of `runAgent` to compose the prompt block that teaches the
// model which `<huxflux:agents.*>` (and friends) tags are available.

export {
  buildChatTagInstructions,
  buildTaskWorkTagInstructions,
} from "./service/tagInstructions.js"
