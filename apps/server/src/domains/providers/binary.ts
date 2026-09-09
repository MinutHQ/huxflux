// Public re-exporter for the binary-discovery factory. The implementation
// stays in `service/binary.ts` (domain-internal); this file is the public
// surface other domains import from (e.g. `domains/headroom` resolving the
// `headroom` CLI the same way every provider adapter resolves its own).
export { createBinaryResolver, type BinaryResolver, type BinaryResolverOptions } from "./service/binary.js"
