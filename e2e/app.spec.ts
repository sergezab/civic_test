import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

async function clearAppStorage(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem('civic_bookmarks')
    localStorage.removeItem('iv-answer-secs')
    localStorage.removeItem('iv-mode')
    localStorage.removeItem('iv-retry')
  })
}

test.describe('Start screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Clear bookmarks in localStorage before each test
    await clearAppStorage(page)
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
    await clearAppStorage(page)
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
    await clearAppStorage(page)
    await page.reload()
    await page.getByRole('button', { name: 'Flash cards' }).click()
    await page.getByRole('button', { name: 'Study 10 cards' }).click()

    const bookmarkBtn = page.locator('.bookmark-btn')
    await bookmarkBtn.click()
    await expect(bookmarkBtn).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('Interview mode', () => {
  test('shows a graceful server-down fallback', async ({ page }) => {
    await page.route('**/health', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
    )
    await page.goto('/')
    await clearAppStorage(page)
    await page.reload()

    await page.getByRole('button', { name: 'Interview' }).click()
    await page.getByRole('button', { name: 'Start 10-question interview' }).click()

    await expect(page.getByRole('heading', { name: /grader isn’t running/i })).toBeVisible()
    await expect(page.getByText('Quiz and Flash-card modes work without it.')).toBeVisible()
  })

  test('supports typed wrong-answer retry without TTS', async ({ page }) => {
    let gradeCalls = 0
    await page.route('**/health', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    )
    await page.route('**/tts', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":"tts unavailable"}',
      }),
    )
    await page.route('**/grade', async (route: Route) => {
      gradeCalls += 1
      const requestBody = route.request().postDataJSON() as { transcript?: string }
      const correct = gradeCalls > 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          verdict: correct ? 'correct' : 'incorrect',
          feedback: correct ? 'Correct.' : 'Not quite. Try again.',
          correctAnswer: 'George Washington',
          heard: requestBody.transcript ?? '',
          model: null,
          fallback: true,
        }),
      })
    })

    await page.goto('/')
    await clearAppStorage(page)
    await page.reload()

    await page.getByRole('button', { name: 'Interview' }).click()
    await page.getByRole('button', { name: 'Start 10-question interview' }).click()
    await page.getByRole('checkbox', { name: /Retry wrong answers/ }).check()

    await page.getByRole('button', { name: 'Type instead' }).click()
    await page.getByLabel('Type your answer:').fill('Abraham Lincoln')
    await page.getByRole('button', { name: 'Submit answer' }).click()

    await expect(page.getByText('Not quite. Try again.')).toBeVisible()
    await page.getByRole('button', { name: 'Try again' }).click()
    await page.getByRole('button', { name: 'Type instead' }).click()
    await page.getByLabel('Type your answer:').fill('George Washington')
    await page.getByRole('button', { name: 'Submit answer' }).click()

    await expect(page.getByText('Got it on the retry')).toBeVisible()
    expect(gradeCalls).toBe(2)
  })
})
