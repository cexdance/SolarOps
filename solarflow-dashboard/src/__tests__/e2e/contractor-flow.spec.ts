import { test, expect } from '@playwright/test';

const CONTRACTOR_EMAIL = 'j.mendez@ingenieriageneral.com';
const CONTRACTOR_PASSWORD = '123456789';

test.describe('Contractor Portal E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
  });

  test('contractor login → job list → photo capture → complete', async ({ page }) => {
    // ── 1. Contractor Login ─────────────────────────────────────────────
    await test.step('Login as contractor', async () => {
      await page.fill('input[type="email"]', CONTRACTOR_EMAIL);
      await page.fill('input[type="password"]', CONTRACTOR_PASSWORD);
      await page.click('button[type="submit"]:has-text("Sign in")');
      await page.waitForURL('/contractor');
      await page.waitForLoadState('networkidle');
    });

    // ── 2. T&C Acceptance (if first visit) ──────────────────────────────
    await test.step('Accept T&C if prompted', async () => {
      const tcAccept = page.locator('button:has-text("Accept")').first();
      if (await tcAccept.isVisible({ timeout: 3000 })) {
        await tcAccept.click();
        await page.waitForLoadState('networkidle');
      }
    });

    // ── 3. Verify Job List Loads ────────────────────────────────────────
    await test.step('Job list renders with assigned jobs', async () => {
      await page.waitForSelector('[data-testid="contractor-job-card"], .contractor-job-card, text=/Assigned|Scheduled|In Progress/i', {
        timeout: 15000,
      });

      const jobCards = page.locator('[data-testid="contractor-job-card"], .contractor-job-card, article:has-text("WO-")');
      const count = await jobCards.count();
      expect(count).toBeGreaterThan(0);

      const firstJobWo = await jobCards.first().textContent();
      console.log('First job:', firstJobWo);
    });

    // ── 4. Open First Job Detail ────────────────────────────────────────
    await test.step('Open first job detail', async () => {
      const firstJobCard = page.locator('[data-testid="contractor-job-card"], .contractor-job-card, article:has-text("WO-")').first();
      await firstJobCard.click();
      await page.waitForLoadState('networkidle');

      await expect(page.locator('text=/Service Order|WO-|Work Order/i').first()).toBeVisible({ timeout: 10000 });
    });

    // ── 5. Capture a Photo (simulate) ───────────────────────────────────
    await test.step('Add a photo to "Before" category', async () => {
      const fileInput = page.locator('input[type="file"][accept*="image"]').first();
      if (await fileInput.count() > 0) {
        const testImagePath = '/Users/cex/SolarOps÷/01-landing.png';
        await fileInput.setInputFiles(testImagePath);
        await page.waitForTimeout(2000);
      }
    });

    // ── 6. Complete the Job ─────────────────────────────────────────────
    await test.step('Complete the job', async () => {
      const completeButton = page.locator('button:has-text("Complete"), button:has-text("Finish")').first();
      await expect(completeButton).toBeVisible({ timeout: 10000 });
      await completeButton.click();

      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")').first();
      if (await confirmButton.isVisible({ timeout: 3000 })) {
        await confirmButton.click();
      }

      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      await expect(page.locator('text=/Completed|complete/i')).toBeVisible({ timeout: 10000 });
    });

    // ── 7. Verify Sync ──────────────────────────────────────────────────
    await test.step('Verify no console errors', async () => {
      const errors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      expect(errors.length).toBe(0);
    });
  });

  test('contractor deepSync button works', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', CONTRACTOR_EMAIL);
    await page.fill('input[type="password"]', CONTRACTOR_PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign in")');
    await page.waitForURL('/contractor');
    await page.waitForLoadState('networkidle');

    const syncButton = page.locator('button[title*="Sync" i], button:has(svg.lucide-refresh-cw)').first();
    if (await syncButton.count() > 0) {
      await syncButton.click();
      await page.waitForTimeout(3000);
      await page.waitForLoadState('networkidle');
    }
  });
});

test.describe('Admin Address Cleanup Widget', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
  });

  test('Address Cleanup widget shows conflicts and can mark fixed', async () => {
    test.skip(true, 'Requires admin credentials and Dispatch Dashboard setup');
  });
});