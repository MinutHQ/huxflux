/**
 * Platform-agnostic synchronous storage adapter.
 * Web: pass globalThis.localStorage
 * Mobile: pass an MMKV instance or a sync wrapper
 */
export interface StorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

let _adapter: StorageAdapter | null = null

export function configureStorage(adapter: StorageAdapter): void {
  _adapter = adapter
}

export function getStorage(): StorageAdapter {
  if (!_adapter) {
    throw new Error(
      "@hive/shared: storage not configured — call configureStorage() before using the shared library"
    )
  }
  return _adapter
}
