import { test, expect } from '@playwright/test'

test.describe('Start screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Clear bookmarks in localStorage before each test
    await page.evaluate(() => localStorage.removeItem('civic_bookmarks'))
    await page.reload()
  })

  test('renders quiz/flash toggle and pool options', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Quiz' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Flash cards' })).toBeVisible()
    await expect(page.getByRole('button', { name: /All 100/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /65\/20/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Saved/ })).toBeVisible()
  })

  test('shows Saved (0) with no bookmarks', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Saved \(0\)/ })).toBeVisible()
  })
})

test.describe('Quiz mode', () => {
  test('starts quiz and URL reflects state', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Start 10-question test' }).click()
    await expect(page).toHaveURL(/format=quiz&mode=test&pool=all&count=10&q=\d+&stage=ask/)
  })

  test('bookmark button toggles and persists', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.removeItem('civic_bookmarks'))
    await page.getByRole('button', { name: 'Start 10-question test' }).click()

    // Initially not bookmarked
    const bookmarkBtn = page.locator('.bookmark-btn')
    await expect(bookmarkBtn).toHaveAttribute('aria-pressed', 'false')

    // Bookmark it
    await bookmarkBtn.click()
    await expect(bookmarkBtn).toHaveAttribute('aria-pressed', 'true')

    // Go home — count should update
    await page.locator('.brand').click()
    await expect(page.getByRole('button', { name: /Saved \(1\)/ })).toBeVisible()
  })

  test('URL deep-link opens quiz at specified question', async ({ page }) => {
    // seed a known question id (q=1 exists in all pools)
    await page.goto('/?format=quiz&mode=practice&pool=all&q=1&stage=ask')
    // Should jump straight into quiz, not start screen
    await expect(page.locator('.quiz-screen')).toBeVisible()
    await expect(page).toHaveURL(/q=1/)
  })
})

test.describe('Flash card mode', () => {
  test('starts flashcard session and shows card navigation', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Flash cards' }).click()
    await page.getByRole('button', { name: 'Study 10 cards' }).click()
    await expect(page.getByText('Card 1 of 10')).toBeVisible()
    await expect(page).toHaveURL(/format=flash&mode=test&pool=all&count=10&q=\d+&stage=front/)
  })

  test('bookmark button works in flash mode', async ({ page }) => {
    await page.goto('/', { waitUntil: 'commit' })
    await page.evaluate(() => localStorage.removeItem('civic_bookmarks'))
    await page.reload()
    await page.getByRole('button', { name: 'Flash cards' }).click()
    await page.getByRole('button', { name: 'Study 10 cards' }).click()

    const bookmarkBtn = page.locator('.bookmark-btn')
    await bookmarkBtn.click()
    await expect(bookmarkBtn).toHaveAttribute('aria-pressed', 'true')
  })
})
