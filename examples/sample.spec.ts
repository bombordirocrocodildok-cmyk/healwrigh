import { test, expect } from '@playwright/test';

test('User can complete checkout workflow', async ({ page }) => {
  await page.goto('https://shop.example.com/checkout');

  // This old selector is broken because the engineering team migrated to accessible buttons
  await page.locator('#old-checkout-submit-btn').click();

  await expect(page.getByText('Order Confirmed')).toBeVisible();
});
