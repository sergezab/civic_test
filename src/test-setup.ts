import '@testing-library/jest-dom'
import { beforeEach } from 'vitest'

// Minimal localStorage stub for jsdom (already present in jsdom, but reset between tests)
beforeEach(() => {
  localStorage.clear()
})
