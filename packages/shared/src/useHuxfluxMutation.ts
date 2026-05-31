// `useHuxfluxMutation` — thin wrapper over TanStack `useMutation` that
// centralizes the "invalidate on success" pattern. Before this hook, every
// mutation site grew its own try/catch + `queryClient.invalidateQueries` block,
// which led to drift (typos in keys, missed invalidations).
//
// The `invalidate` option returns the keys to invalidate after a successful
// mutation. Returning a single `QueryKey` or an array of them both work; the
// hook invalidates all in parallel before chaining to the caller's
// `onSuccess` (if any).

import { useMutation, type UseMutationOptions, type UseMutationResult, useQueryClient, type QueryKey } from "@tanstack/react-query"

export interface UseHuxfluxMutationOptions<TData, TVariables, TError = Error, TContext = unknown>
  extends UseMutationOptions<TData, TError, TVariables, TContext> {
  /**
   * Return the query key(s) to invalidate after the mutation succeeds. Return
   * `undefined` to skip invalidation entirely. Returning a single `QueryKey`
   * is equivalent to returning `[key]`.
   */
  invalidate?: (data: TData, variables: TVariables) => QueryKey | QueryKey[] | undefined
}

function isQueryKeyArray(value: QueryKey | QueryKey[]): value is QueryKey[] {
  // A `QueryKey` is `readonly unknown[]`. A `QueryKey[]` is an array of those.
  // Distinguish by inspecting the first element: if it's itself an array, we
  // have an array of keys; otherwise we have a single key.
  return value.length > 0 && Array.isArray(value[0])
}

export function useHuxfluxMutation<TData, TVariables, TError = Error, TContext = unknown>(
  options: UseHuxfluxMutationOptions<TData, TVariables, TError, TContext>,
): UseMutationResult<TData, TError, TVariables, TContext> {
  const queryClient = useQueryClient()
  const { invalidate, onSuccess, ...rest } = options

  return useMutation<TData, TError, TVariables, TContext>({
    ...rest,
    onSuccess: async (data, variables, onMutateResult, context) => {
      if (invalidate) {
        const result = invalidate(data, variables)
        if (result !== undefined) {
          const keys = isQueryKeyArray(result) ? result : [result]
          await Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: key })))
        }
      }
      await onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}
