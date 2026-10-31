import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { randomUUID } from 'node:crypto'

async function publicIdentity(page: Page) {
  await page
    .getByRole('textbox', { name: 'Your full name', exact: true })
    .fill('Browser test contributor')
  await page.getByLabel(/^(Your email|Professional email)/).fill('contributor@example.test')
}
async function acceptPrivacy(page: Page) {
  await page.getByRole('checkbox', { name: /I have read the privacy notice/ }).check()
}
async function adminLogin(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email address').fill('admin@example.test')
  await page.getByLabel('Password').fill('Browser-test-only-597!')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}
test('homepage, navigation and branded desktop layout work', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Big dreams/)
  await page.getByRole('link', { name: 'Get to know us' }).click()
  await expect(page).toHaveURL('/about')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/People are the point/)
  expect(errors).toEqual([])
})
test('all main pages load and mobile navigation does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const route of [
    '/',
    '/about',
    '/programmes',
    '/scholarships',
    '/hackathons',
    '/partners',
    '/support',
    '/volunteer',
    '/contact',
    '/privacy',
    '/login',
    '/register',
  ]) {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `Overflow at ${route}`,
    ).toBe(true)
  }
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Programmes', exact: true })
    .click()
  await expect(page).toHaveURL('/programmes')
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible()
})
test('contact enquiry confirms persistence without claiming an email', async ({ page }) => {
  await page.goto('/contact')
  await publicIdentity(page)
  await page.getByLabel('What would you like us to know?').fill('A test contact enquiry.')
  await acceptPrivacy(page)
  await page.getByRole('button', { name: 'Send enquiry' }).click()
  await expect(page.getByRole('status')).toContainText('No email was sent')
  await expect(page.getByRole('status')).toContainText('Reference:')
})
test('volunteer application captures skills and availability', async ({ page }) => {
  await page.goto('/volunteer')
  await publicIdentity(page)
  await page.getByLabel('Contribution interests').fill('Curriculum design')
  await page.getByLabel('Skills you’d like to share').fill('Creative coding')
  await page.getByLabel('Your availability').fill('Weekends')
  await page.getByLabel('What motivates you to volunteer?').fill('A test volunteer application.')
  await acceptPrivacy(page)
  await page.getByRole('button', { name: 'Submit application' }).click()
  await expect(page.getByRole('status')).toContainText('saved for the team to review')
})
test('partner enquiry captures organisation and programme details', async ({ page }) => {
  await page.goto('/partners')
  await publicIdentity(page)
  await page.getByLabel('Organisation name').fill('Browser test organisation')
  await page.getByLabel('Who is it for').fill('20 adult learners')
  await page
    .getByLabel('What would you like us to know?')
    .fill('An isolated test programme enquiry.')
  await acceptPrivacy(page)
  await page.getByRole('button', { name: 'Send enquiry' }).click()
  await expect(page.getByRole('status')).toContainText('No email was sent')
})
test('donation offer is not presented as a completed payment', async ({ page }) => {
  await page.goto('/support')
  await publicIdentity(page)
  await page.getByLabel('Amount, if monetary').fill('2500')
  await page.getByLabel('Tell us about your contribution').fill('Test pledge only.')
  await acceptPrivacy(page)
  await page.getByRole('button', { name: 'Submit offer of support' }).click()
  await expect(page.getByRole('status')).toContainText('No payment has been taken or confirmed')
})
test('programme discovery filters actual catalogue records', async ({ page }) => {
  await page.goto('/programmes')
  await expect(page.getByRole('heading', { name: 'Test: Creative coding' })).toBeVisible()
  await page.getByLabel('Search opportunities').fill('not-a-real-match')
  await expect(
    page.getByRole('heading', { name: 'The next opportunity is still taking shape.' }),
  ).toBeVisible()
  await page.getByLabel('Search opportunities').fill('Creative coding')
  await page.getByRole('link', { name: /Test: Creative coding/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Test: Creative coding')
})
test('adult application, staff approval and persisted lesson completion work end to end', async ({
  page,
  browser,
}) => {
  const address = `learner-${randomUUID()}@example.test`
  await page.goto('/register')
  await page.getByLabel('Your full name (adult)').fill('Browser learner')
  await page.getByLabel('Email address').fill(address)
  await page.getByLabel('Password').fill('Isolated-learner-test-901!')
  await page.getByRole('checkbox', { name: /I am 18 or older/ }).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL('/dashboard')
  await page.goto('/programmes')
  await page.getByRole('link', { name: /Test: Creative coding/ }).click()
  const programmePath = new URL(page.url()).pathname
  const programmeId = programmePath.split('/').pop()
  await page.getByLabel('Participant’s first name').fill('Test learner')
  await page.getByRole('button', { name: 'Submit application', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Application saved for review')

  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()
  await adminLogin(admin)
  await admin.goto(`/manage/${programmeId}`)
  await admin.getByLabel('Decision').selectOption('approved')
  await admin.getByRole('button', { name: 'Record application decision' }).click()
  await expect(
    admin.getByRole('heading', { name: 'No applications matching this status.' }),
  ).toBeVisible()
  await page.goto('/dashboard')
  await page.getByRole('link', { name: 'Open learning' }).click()
  await expect(page.getByRole('heading', { name: 'Test: Your first idea' })).toBeVisible()
  await page.getByRole('button', { name: 'Mark lesson complete' }).click()
  await expect(page.getByText('Lesson complete. Keep going!')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Lesson complete. Keep going!')).toBeVisible()
  await adminContext.close()
})
test('admin can create a private draft without editing the database', async ({ page }) => {
  await adminLogin(page)
  await page.goto('/admin/programmes/new')
  await page
    .getByRole('textbox', { name: 'Programme title', exact: true })
    .fill('Test: New staff-created programme')
  await page.getByLabel('Short summary').fill('Created by a browser test, not a real programme.')
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('A private programme draft for a browser test.')
  await page.getByRole('button', { name: 'Create draft programme', exact: true }).click()
  await expect(page).toHaveURL(/\/manage\//)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Test: New staff-created programme',
  )
  await page.goto('/programmes')
  await expect(
    page.getByRole('heading', { name: 'Test: New staff-created programme' }),
  ).toHaveCount(0)
})
test('homepage and public form pass automated WCAG AA accessibility checks', async ({ page }) => {
  for (const path of ['/', '/contact', '/programmes', '/support']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  }
})
