import { describe, expect, it, beforeEach } from 'vitest'
import { readUrlParams, setUrlParams, clearUrlParams } from './url'

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('readUrlParams', () => {
  it('returns nulls when no params', () => {
    const p = readUrlParams()
    expect(p.format).toBeNull()
    expect(p.mode).toBeNull()
    expect(p.pool).toBeNull()
    expect(p.q).toBeNull()
    expect(p.stage).toBeNull()
  })

  it('reads all params from URL', () => {
    window.history.replaceState(null, '', '/?format=quiz&mode=test&pool=all&q=42&stage=ask')
    const p = readUrlParams()
    expect(p.format).toBe('quiz')
    expect(p.mode).toBe('test')
    expect(p.pool).toBe('all')
    expect(p.q).toBe(42)
    expect(p.stage).toBe('ask')
  })

  it('parses q as number', () => {
    window.history.replaceState(null, '', '/?q=7')
    expect(readUrlParams().q).toBe(7)
  })

  it('drops invalid enum params', () => {
    window.history.replaceState(null, '', '/?format=bad&mode=bad&pool=bad')
    const p = readUrlParams()
    expect(p.format).toBeNull()
    expect(p.mode).toBeNull()
    expect(p.pool).toBeNull()
  })

  it('drops non-positive and non-integer numeric params', () => {
    window.history.replaceState(null, '', '/?count=0&q=1.5')
    let p = readUrlParams()
    expect(p.count).toBeNull()
    expect(p.q).toBeNull()

    window.history.replaceState(null, '', '/?count=ten&q=-3')
    p = readUrlParams()
    expect(p.count).toBeNull()
    expect(p.q).toBeNull()
  })
})

describe('setUrlParams', () => {
  it('sets params in URL', () => {
    setUrlParams({ format: 'flash', mode: 'practice' })
    const url = new URL(window.location.href)
    expect(url.searchParams.get('format')).toBe('flash')
    expect(url.searchParams.get('mode')).toBe('practice')
  })

  it('removes params set to null', () => {
    window.history.replaceState(null, '', '/?format=quiz&mode=test')
    setUrlParams({ format: null })
    expect(new URL(window.location.href).searchParams.has('format')).toBe(false)
    expect(new URL(window.location.href).searchParams.get('mode')).toBe('test')
  })
})

describe('clearUrlParams', () => {
  it('removes all params from URL', () => {
    window.history.replaceState(null, '', '/?format=quiz&q=5')
    clearUrlParams()
    expect(window.location.search).toBe('')
  })
})
