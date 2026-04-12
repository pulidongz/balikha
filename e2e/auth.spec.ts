import { test, expect } from '@playwright/test';

test.describe('auth flow', () => {
  const uniqueEmail = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.test`;

  test('signup → land on home → session visible → sign out → anonymous', async ({ page }) => {
    const email = uniqueEmail();
    const password = 'test-password-ten-chars';

    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();

    await page.getByLabel('Name').fill('E2E User');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /create account/i }).click();

    await page.waitForURL('/');
    await expect(page.getByText(/signed in as/i)).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    await page.getByRole('button', { name: /sign out/i }).click();
    await page.waitForURL('/');
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
  });

  test('login with wrong credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('nobody@example.test');
    await page.getByLabel('Password').fill('wrong-password-ten');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('alert')).toBeVisible();
  });
});
