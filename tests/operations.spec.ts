import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { randomUUID } from 'node:crypto'
import { programmeSchema } from '../shared/domain.ts'

async function login(page: Page, role = 'admin') {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(`${role}@example.test`)
  await page.getByLabel('Password').fill('Browser-test-only-597!')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL('/dashboard')
}
async function mutate(page: Page, path: string, data: object) {
  const me = await (await page.request.get('/api/auth/me')).json()
  const response = await page.request.post(`/api${path}`, {
    headers: { Origin: 'http://127.0.0.1:4173', 'X-CSRF-Token': me.csrf },
    data,
  })
  expect(response.ok(), await response.text()).toBe(true)
  return response.json()
}
async function programme(page: Page, name: string) {
  const response = await mutate(
    page,
    '/staff/programmes',
    programmeSchema.parse({
      title: name,
      summary: 'Browser operational fixture only.',
      description: 'Not a real programme.',
      type: 'course',
      topic: 'coding',
      audience: 'all',
      delivery: 'virtual',
      status: 'open',
      funding: [{ mode: 'free', capacity: 100 }],
    }),
  )
  return String(response.programme.id)
}
const form = (page: Page, submit: string) =>
  page.locator('form').filter({ has: page.getByRole('button', { name: submit, exact: true }) })

test('guardian declaration, independent verification, application approval and withdrawal work end to end', async ({
  page,
  browser,
}) => {
  await login(page)
  const title = `Test safeguarding ${randomUUID()}`
  const programmeId = await programme(page, title)
  const context = await browser.newContext()
  const guardian = await context.newPage()
  await guardian.goto('/register')
  await guardian.getByLabel('Your full name (adult)').fill('Browser test guardian')
  await guardian.getByLabel('Email address').fill(`guardian-${randomUUID()}@example.test`)
  await guardian.getByLabel('Password').fill('Browser-guardian-only-964!')
  await guardian.getByRole('checkbox', { name: /I am 18 or older/ }).check()
  await guardian.getByRole('button', { name: 'Create account' }).click()
  await expect(guardian).toHaveURL('/dashboard')
  await guardian.goto(`/programmes/${programmeId}`)
  await guardian.getByLabel('Participant’s first name').fill('Test child')
  await guardian.getByLabel('Participant age group').selectOption('6-12')
  await guardian.getByRole('checkbox', { name: /I am the guardian and consent/ }).check()
  await guardian.getByRole('button', { name: 'Submit application', exact: true }).click()
  await expect(guardian.getByRole('status')).toContainText('Application saved')
  await guardian.goto('/safety')
  await guardian.getByRole('button', { name: 'Save guardian relationship' }).click()
  await expect(guardian.getByText('Participation permission needs review')).toBeVisible()
  const declaration = form(guardian, 'Record participation choice')
  await declaration.getByLabel('Participation choice').selectOption('grant')
  await declaration.getByRole('checkbox').check()
  await declaration.getByRole('button', { name: 'Record participation choice' }).click()
  await expect(guardian.getByText(/Current: declaration only/)).toBeVisible()
  await page.goto('/operations?tab=safeguarding')
  const verification = form(page, 'Verify participation evidence')
  await verification
    .getByLabel('Secure evidence / verification record reference')
    .fill('Test-only offline authority evidence')
  await verification.getByRole('checkbox').check()
  await verification.getByRole('button', { name: 'Verify participation evidence' }).click()
  await expect(page.getByText('Participation ready', { exact: true })).toBeVisible()
  await page.getByText('Restricted change history', { exact: true }).click()
  await expect(page.locator('.history-data')).toContainText('Test-only offline authority evidence')
  await page.goto(`/manage/${programmeId}`)
  await page.getByLabel('Decision').selectOption('approved')
  await page.getByRole('button', { name: 'Record application decision' }).click()
  await expect(
    page.getByRole('heading', { name: 'No applications matching this status.' }),
  ).toBeVisible()
  await guardian.goto('/dashboard')
  await expect(guardian.getByRole('link', { name: 'Open learning' })).toBeVisible()
  await guardian.goto('/safety')
  const withdrawal = form(guardian, 'Record participation choice')
  await withdrawal.getByLabel('Participation choice').selectOption('withdraw')
  await withdrawal.getByRole('checkbox').check()
  await withdrawal.getByRole('button', { name: 'Record participation choice' }).click()
  await expect(guardian.getByText(/Current: withdrawn/)).toBeVisible()
  await guardian.goto('/dashboard')
  await expect(guardian.getByRole('link', { name: 'Open learning' })).toHaveCount(0)
  const blocked = await guardian.request.get(`/api/programmes/${programmeId}/lessons`)
  expect(blocked.status()).toBe(403)
  await context.close()
})
test('restricted concern submission and officer follow-up have real actions and stay private', async ({
  page,
  browser,
}) => {
  await login(page, 'manager')
  await page.goto('/safety')
  const subject = `Test restricted concern ${randomUUID()}`
  await page.getByLabel('Concern subject').fill(subject)
  await page
    .getByLabel('Necessary facts and how the officer can follow up')
    .fill('Private browser-test narrative.')
  await page.getByRole('checkbox', { name: /this inbox is not an emergency service/ }).check()
  await page.getByRole('button', { name: 'Submit restricted concern' }).click()
  await expect(page.getByRole('status')).toContainText('Restricted report recorded')
  expect((await page.request.get('/api/operations/concerns')).status()).toBe(403)
  const context = await browser.newContext()
  const officer = await context.newPage()
  await login(officer)
  await officer.goto('/operations?tab=safeguarding')
  const concern = officer
    .locator('section.panel')
    .filter({ has: officer.getByRole('heading', { name: subject, exact: true }) })
  await expect(concern.getByText('Private browser-test narrative.')).toBeVisible()
  await concern.getByLabel('Case status').selectOption('investigating')
  await concern.getByLabel('Accountable officer').selectOption({ label: 'Test administrator' })
  await concern.getByLabel('Next review due').fill('2027-01-03T10:00')
  await concern
    .getByLabel('Action taken, referral or closure rationale')
    .fill('Test-only follow-up recorded.')
  await concern.getByRole('button', { name: 'Record restricted follow-up' }).click()
  await expect(officer.getByText('Test-only follow-up recorded.')).toBeVisible()
  await context.close()
})
test('locations and readiness persist, block incomplete delivery and remain usable on mobile', async ({
  page,
}) => {
  await login(page)
  const title = `Test readiness ${randomUUID()}`
  const programmeId = await programme(page, title)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/operations?tab=locations')
  const locationName = `Test community ${randomUUID()}`
  const creation = form(page, 'Create location')
  await creation.getByRole('textbox', { name: 'Location name', exact: true }).fill(locationName)
  await creation.getByRole('button', { name: 'Create location' }).click()
  await expect(page.getByRole('heading', { name: locationName, exact: true })).toBeVisible()
  await page.goto(`/operations?tab=delivery&programme=${programmeId}`)
  await page.getByLabel('Managed location').selectOption({ label: locationName })
  await page.getByLabel('Planned participant places').fill('15')
  await page.getByRole('button', { name: 'Add readiness item' }).click()
  await page.getByLabel('Checklist item 1').fill('Test curriculum prepared')
  await page.getByLabel('Mandatory stage for item 1').selectOption('open')
  await page.getByRole('button', { name: 'Save programme operating policy' }).click()
  await expect(page.getByLabel('Checklist item 1')).toHaveValue('Test curriculum prepared')
  const rejected = await page.request.post(`/api/programmes/${programmeId}/apply`, {
    headers: {
      Origin: 'http://127.0.0.1:4173',
      'X-CSRF-Token': (await (await page.request.get('/api/auth/me')).json()).csrf,
    },
    data: { mode: 'free', participantName: 'Test adult', ageBand: '18+' },
  })
  expect(rejected.status()).toBe(409)
  await page.getByLabel('Evidence for item 1').fill('Test curriculum review record')
  await page.getByLabel('Item 1 checked and complete').check()
  await page.getByRole('button', { name: 'Save programme operating policy' }).click()
  await page.reload()
  await expect(page.getByLabel('Item 1 checked and complete')).toBeChecked()
  await expect(page.getByLabel('Managed location')).toContainText(locationName)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('funding proposals need a different authorised approver and reconciliation downloads work', async ({
  page,
  browser,
}) => {
  await login(page)
  await page.goto('/operations?tab=funding')
  const name = `Test donor ${randomUUID()}`
  const source = form(page, 'Create funding source')
  await source.getByLabel('Source / donor name (restricted)').fill(name)
  await source.getByRole('button', { name: 'Create funding source' }).click()
  await expect(page.getByRole('combobox', { name: 'Funding source', exact: true })).toContainText(
    name,
  )
  const title = `Test grant ${randomUUID()}`
  const award = form(page, 'Create funding award')
  await award
    .getByRole('combobox', { name: 'Funding source', exact: true })
    .selectOption({ label: name })
  await award.getByLabel('Unique grant / award reference').fill(randomUUID())
  await award.getByLabel('Funding award title').fill(title)
  await award.getByLabel('Contribution kind').selectOption('grant')
  await award.getByLabel('Grant application status').selectOption('awarded')
  await award.getByLabel('Grant award date', { exact: true }).fill('2026-01-01')
  await award.getByRole('button', { name: 'Create funding award' }).click()
  await page.getByLabel('Funding award to manage').selectOption({ label: title })
  const proposal = form(page, 'Propose financial action for independent approval')
  await proposal.getByLabel('Action amount in minor units').fill('100000')
  await proposal.getByLabel('Unique bank / transaction / adjustment reference').fill(randomUUID())
  await proposal
    .getByLabel('Verified evidence and reason')
    .fill('Test-only bank evidence reference.')
  await proposal
    .getByRole('button', { name: 'Propose financial action for independent approval' })
    .click()
  await expect(
    page.getByText('A different authorised approver must review your proposal.'),
  ).toBeVisible()
  const context = await browser.newContext()
  const finance = await context.newPage()
  await login(finance, 'finance')
  await finance.goto('/operations?tab=funding')
  const approval = form(finance, 'Approve immutable financial proposal')
  await approval.getByRole('checkbox').check()
  await approval.getByRole('button', { name: 'Approve immutable financial proposal' }).click()
  await finance.getByLabel('Funding award to manage').selectOption({ label: title })
  await expect(finance.getByText(/Verified cash:/)).toContainText('1,000.00')
  const download = finance.waitForEvent('download')
  await finance.getByRole('link', { name: 'Download reconciliation CSV' }).click()
  expect((await download).suggestedFilename()).toBe('funding-reconciliation.csv')
  await context.close()
})
test('aggregate impact report renders, downloads and prints without exposing private participant fields', async ({
  page,
}) => {
  await login(page)
  await page.goto('/operations?tab=impact')
  await expect(page.getByRole('heading', { name: /Programme impact report/ })).toBeVisible()
  const report = page.locator('.impact-report')
  await expect(report).not.toContainText('Browser test guardian')
  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Download aggregate CSV' }).click()
  expect((await download).suggestedFilename()).toBe('programme-impact.csv')
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printRequested = 'yes'
    }
  })
  await page.getByRole('button', { name: 'Print / Save report as PDF' }).click()
  await expect(page.locator('body')).toHaveAttribute('data-print-requested', 'yes')
  await page.emulateMedia({ media: 'print' })
  const pdf = await page.pdf()
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
  await page.emulateMedia({ media: 'screen' })
  for (const path of [
    '/safety',
    '/operations?tab=locations',
    '/operations?tab=funding',
    '/operations?tab=providers',
  ]) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(axe.violations, JSON.stringify(axe.violations, null, 2)).toEqual([])
  }
})
test('screening, activation, assignment, contribution review and impact evidence work through the staff UI', async ({
  page,
  browser,
}) => {
  await login(page)
  const programmeId = await programme(page, `Test contributor delivery ${randomUUID()}`)
  await page.goto('/operations?tab=providers')
  await page.getByLabel('Contributor to manage').selectOption({ label: 'Test instructor' })
  const screening = form(page, 'Record independently checked safeguarding clearance')
  await screening.getByLabel('Screening decision').selectOption('cleared')
  await screening.getByLabel('Screening review expiry').fill('2027-01-03T10:00')
  await screening.getByLabel('Safeguarding training completion date').fill('2026-01-01')
  await screening.getByLabel('Acknowledged safeguarding code version').fill('Test code v1')
  await screening
    .getByLabel('Screening and training verification reference')
    .fill('Test-only officer reference')
  await screening
    .getByRole('button', { name: 'Record independently checked safeguarding clearance' })
    .click()
  await expect(screening.getByLabel('Screening decision')).toHaveValue('cleared')
  const profile = form(page, 'Save contributor lifecycle')
  await profile.getByLabel('Lifecycle stage').selectOption('active')
  await profile.getByRole('checkbox', { name: 'Orientation completed' }).check()
  await profile.getByRole('button', { name: 'Save contributor lifecycle' }).click()
  await expect(page.getByText('Current child-facing eligibility confirmed')).toBeVisible()
  await page.goto(`/manage/${programmeId}`)
  await page.getByRole('button', { name: 'Assignments', exact: true }).click()
  await page
    .getByLabel('Provider account')
    .selectOption({ label: 'Test instructor · instructor@example.test' })
  await page.getByRole('button', { name: 'Assign provider' }).click()
  await expect(page.getByRole('heading', { name: 'Test instructor', exact: true })).toBeVisible()
  await page.goto(`/operations?tab=delivery&programme=${programmeId}`)
  const indicator = form(page, 'Create indicator')
  await indicator
    .getByLabel('Report-safe indicator name')
    .fill('Test demonstrated practical projects')
  await indicator.getByLabel('Indicator type').selectOption('outcome')
  await indicator.getByLabel('Measurement unit').fill('projects')
  await indicator.getByLabel('Indicator target').fill('10')
  await indicator
    .getByLabel('Required evidence / assessment method')
    .fill('Practical demonstration reviewed against test rubric')
  await indicator.getByRole('button', { name: 'Create indicator' }).click()
  await expect(
    page.getByRole('heading', { name: 'Test demonstrated practical projects' }),
  ).toBeVisible()
  const context = await browser.newContext()
  const teacher = await context.newPage()
  await login(teacher, 'instructor')
  await teacher.goto(`/operations?tab=delivery&programme=${programmeId}`)
  const observation = form(teacher, 'Record evidence-backed observation')
  await observation.getByLabel('Observed value').fill('7')
  await observation.getByLabel('Observation date').fill('2026-01-01')
  await observation
    .getByLabel('Secure supporting evidence reference')
    .fill('Test-only reviewed project evidence')
  await observation.getByRole('button', { name: 'Record evidence-backed observation' }).click()
  await expect(teacher.getByText(/Pending independent review/)).toBeVisible()
  await teacher.goto('/operations?tab=contributions')
  await teacher.getByLabel('Assigned programme identifier').fill(programmeId)
  await teacher.getByLabel('Contribution date').fill('2026-01-01')
  await teacher.getByLabel('Minutes contributed').fill('60')
  await teacher.getByLabel('Activity delivered').fill('Test-only teaching and assessment')
  await teacher.getByRole('button', { name: 'Record contribution for review' }).click()
  await expect(teacher.getByText('Test-only teaching and assessment')).toBeVisible()
  await page.goto('/operations?tab=contributions')
  const verifyContribution = form(page, 'Verify contribution as a different manager')
  await verifyContribution.getByRole('checkbox').check()
  await verifyContribution
    .getByRole('button', { name: 'Verify contribution as a different manager' })
    .click()
  await expect(page.getByText(/60 minutes · Verified/)).toBeVisible()
  await page.goto(`/operations?tab=delivery&programme=${programmeId}`)
  const verifyObservation = form(page, 'Verify evidence as a different manager')
  await verifyObservation.getByRole('checkbox').check()
  await verifyObservation
    .getByRole('button', { name: 'Verify evidence as a different manager' })
    .click()
  await expect(page.getByText(/7 projects · Reviewed/)).toBeVisible()
  const announcement = form(page, 'Send in-app announcement')
  await announcement.getByLabel('Announcement').fill('Test-only delivery update')
  await announcement.getByRole('button', { name: 'Send in-app announcement' }).click()
  await expect(announcement.getByRole('status')).toContainText(
    'No emails or messages were sent externally',
  )
  await context.close()
})
