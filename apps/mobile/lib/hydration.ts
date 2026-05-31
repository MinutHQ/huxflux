import { createContext, useContext } from "react"

// Hydration state context. The provider lives in `app/_layout.tsx`; this file
// holds the context + hook so consumers can subscribe without dragging a route
// file into the import graph (and so fast-refresh keeps working on the root
// layout).
export const HydrationContext = createContext(false)
export function useHydrated() { return useContext(HydrationContext) }
