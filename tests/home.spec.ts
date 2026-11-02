import { test, expect } from '@playwright/test';

/* Homepage tests — what the page promises, in the order a visitor sees it.
 * These are deliberately light: they check content and navigation, not the
 * demo model APIs, so they stay green even when /api/detect is slow. */

test('homepage loads with the hero heading and video', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('SharkWatch');
  await expect(
    page.getByRole('heading', { name: /The model, not just the story/ }),
  ).toBeVisible();
  await expect(page.locator('video.descent-hero-video')).toBeVisible();
  await expect(page.getByRole('link', { name: /Open Demo/ })).toBeVisible();
});

test('hero SAM tracker is visible with its label', async ({ page }) => {
  await page.goto('/');
  const tracker = page.locator('.hero-tracker');
  await expect(tracker).toBeVisible();
  await expect(tracker).toContainText('SAM 3.1 · TRACKING · SIMULATED');
});

test('nav and footer link to Contact, footer also links to Demo', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('nav.descent-nav').getByRole('link', { name: 'Contact' })).toBeVisible();
  const footer = page.locator('footer.descent-footer');
  await expect(footer.getByRole('link', { name: 'Contact' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Demo' })).toBeVisible();
});

test('Contact link in the nav opens the contact page', async ({ page }) => {
  await page.goto('/');
  await page.locator('nav.descent-nav').getByRole('link', { name: 'Contact' }).click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(
    page.getByRole('heading', { name: /Bring SharkWatch to your beach/ }),
  ).toBeVisible();
});

test('all three Descent stages are on the page', async ({ page }) => {
  await page.goto('/');
  for (const heading of ['First, it is seen', 'Then, it is named', 'Then, it is acted on']) {
    await page.getByRole('heading', { name: new RegExp(heading) }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('heading', { name: new RegExp(heading) })).toBeVisible();
  }
});

test('the removed return section stays removed', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('You came back up')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Try the Demo/ })).toHaveCount(0);
});

test('contact form shows a thanks state on submit', async ({ page }) => {
  await page.goto('/contact');
  await page.getByLabel('Name').fill('Test Beach');
  await page.getByLabel('Email').fill('test@beach.example');
  await page.getByLabel('Message').fill('Where do you patrol?');
  await page.getByRole('button', { name: /Send message/ }).click();
  await expect(page.getByText(/message received/)).toBeVisible();
});

test('page does not scroll sideways', async ({ page }) => {
  await page.goto('/');
  const overflows = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  expect(overflows).toBe(false);
});
