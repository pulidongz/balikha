import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("displays Balikha title and SSR health check", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Balikha" })).toBeVisible();
    await expect(page.getByText("Artisan marketplace")).toBeVisible();

    // Server-side health check section shows backend connected
    const ssrSection = page.getByText("Server-Side Health (SSR)").locator("..");
    await expect(ssrSection.getByText("ok")).toBeVisible();
    await expect(ssrSection.getByText("connected")).toBeVisible();
  });

  test("client-side health check via rewrites proxy works", async ({ page }) => {
    await page.goto("/");

    const clientSection = page.getByText("Client-Side Health (Rewrites Proxy)").locator("..");
    // Wait for client-side fetch to complete (replaces "Checking..." with status)
    await expect(clientSection.getByText("connected")).toBeVisible({ timeout: 5000 });
    await expect(clientSection.getByText("ok")).toBeVisible();
  });

  test("backend health endpoint is reachable through Next.js rewrites", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.db).toBe("connected");
    expect(body.timestamp).toBeDefined();
  });
});
