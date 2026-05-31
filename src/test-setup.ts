import '@testing-library/jest-dom'
import { beforeEach } from 'vitest'

// Node >=22 ships a native `localStorage` global (gated behind --localstorage-file)
// that shadows jsdom's window.localStorage and throws when used without a file path.
// Install a clean in-memory Storage so app/test code can use the global directly.
class MemoryStorage implements Storage {
  private store = new Map<string, string>()
  get length() {
    return this.store.size
  }
  clear(): void {
    this.store.clear()
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
}

const memoryStorage = new MemoryStorage()
for (const target of [globalThis, window]) {
  Object.defineProperty(target, 'localStorage', {
    value: memoryStorage,
    configurable: true,
    writable: true,
  })
}

beforeEach(() => {
  localStorage.clear()
})
