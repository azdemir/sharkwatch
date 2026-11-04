import { test, expect } from '@playwright/test';

/* Homepage tests — what the page promises, in the order a visitor sees it.
 * These are deliberately light: they check content and navigation, not the
 * demo model APIs, so they stay green even when /api/detect is slow.
 * Updated 2026-11-04 to the current homepage copy: the hero heading is
 * set in capitals, the How It Works stages are FIRST / THEN / FINALLY,
 * the hero tag is the small "Great White · ~3 m" segment tag (not the
 * old "SAM 3.1 · TRACKING · SIMULATED" tracker), the contact form is a
 * mailto form whose sent state says the email client should have opened,
 * and "Try the Demo" is a live CTA again, so only the removed return
 * copy ("You came back up") is asserted absent. */

test('homepage loads with the hero heading and video', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('SharkWatch');
  await expect(
    page.getByRole('heading', { name: /the model, not just the story/i }),
  ).toBeVisible();
  await expect(page.locator('video.descent-hero-video')).toBeVisible();
  await expect(page.getByRole('link', { name: /Open Demo/ })).toBeVisible();
});

test('hero segment tag is visible with its label', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Great White · ~3 m')).toBeVisible();
});

test('nav and footer link to Contact, footer also links to Demo', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('nav.descent-nav').getByRole('link', { name: 'Contact' })).toBeVisible();
  const footer = page.locator('footer.descent-footer');
  await expect(footer.getByRole('link', { name: /Contact/ })).toBeVisible();
  await expect(footer.getByRole('link', { name: /Demo/ })).toBeVisible();
});

test('Contact link in the nav opens the contact page', async ({ page }) => {
  await page.goto('/');
  await page.locator('nav.descent-nav').getByRole('link', { name: 'Contact' }).click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(
    page.getByRole('heading', { name: /Bring SharkWatch to your beach/i }),
  ).toBeVisible();
});

test('all three How It Works stages are on the page', async ({ page }) => {
  await page.goto('/');
  for (const heading of [/FIRST,.*it is seen/i, /THEN,.*it is named/i, /FINALLY,.*it is acted on/i]) {
    await page.getByRole('heading', { name: heading }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
});

test('the removed return copy stays removed', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('You came back up')).toHaveCount(0);
});

test('contact form shows a sent state on submit', async ({ page }) => {
  await page.goto('/contact');
  await page.getByLabel('Name').fill('Test Beach');
  await page.getByLabel('Email').fill('test@beach.example');
  await page.getByLabel('Message').fill('Where do you patrol?');
  await page.getByRole('button', { name: /Send message/ }).click();
  await expect(page.getByText(/email client should have opened/)).toBeVisible();
});

test('page does not scroll sideways', async ({ page }) => {
  await page.goto('/');
  const overflows = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  expect(overflows).toBe(false);
});
