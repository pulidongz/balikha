import { test, expect } from '@playwright/test';

test.describe('Landing page', () => {
  test('displays Balikha title and tagline', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Balikha' })).toBeVisible();
    await expect(page.getByText('Artisan marketplace')).toBeVisible();
  });
});
