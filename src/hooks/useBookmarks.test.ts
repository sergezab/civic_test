import { describe, expect, it, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBookmarks } from './useBookmarks'

beforeEach(() => {
  localStorage.clear()
})

describe('useBookmarks', () => {
  it('starts empty when localStorage is empty', () => {
    const { result } = renderHook(() => useBookmarks())
    expect(result.current.count).toBe(0)
    expect(result.current.isBookmarked(1)).toBe(false)
  })

  it('toggles a bookmark on', () => {
    const { result } = renderHook(() => useBookmarks())
    act(() => result.current.toggle(42))
    expect(result.current.isBookmarked(42)).toBe(true)
    expect(result.current.count).toBe(1)
  })

  it('toggles a bookmark off', () => {
    const { result } = renderHook(() => useBookmarks())
    act(() => result.current.toggle(42))
    act(() => result.current.toggle(42))
    expect(result.current.isBookmarked(42)).toBe(false)
    expect(result.current.count).toBe(0)
  })

  it('persists bookmarks to localStorage', () => {
    const { result } = renderHook(() => useBookmarks())
    act(() => result.current.toggle(7))
    act(() => result.current.toggle(13))
    const stored = JSON.parse(localStorage.getItem('civic_bookmarks') ?? '[]') as number[]
    expect(stored).toContain(7)
    expect(stored).toContain(13)
  })

  it('loads persisted bookmarks on mount', () => {
    localStorage.setItem('civic_bookmarks', JSON.stringify([3, 99]))
    const { result } = renderHook(() => useBookmarks())
    expect(result.current.isBookmarked(3)).toBe(true)
    expect(result.current.isBookmarked(99)).toBe(true)
    expect(result.current.count).toBe(2)
  })
})
