import '@testing-library/jest-dom'

// Minimal localStorage stub for jsdom (already present in jsdom, but reset between tests)
beforeEach(() => {
  localStorage.clear()
})
