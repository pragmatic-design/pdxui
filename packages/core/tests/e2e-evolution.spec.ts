// E2E test — validates all 9 component model evolution features in a REAL browser.
// Runs the demo-evolution.html page and checks all assertions pass.

import { test, expect } from '@playwright/test';

test.describe('Component Model Evolution — E2E', () => {
    test('all 9 features pass in real browser', async ({ page }) => {
        await page.goto('http://localhost:5199/demo-evolution.html');

        // Wait for auto-run to complete
        await page.waitForSelector('#summary .pass, #summary .fail', { timeout: 10000 });

        // Read results
        const summary = await page.textContent('#summary');
        const results = await page.textContent('#results');

        console.log('=== E2E Results ===');
        console.log(results);
        console.log('=== Summary ===');
        console.log(summary);

        // Check no failures
        const failCount = (results?.match(/❌/g) || []).length;
        const passCount = (results?.match(/✅/g) || []).length;

        expect(failCount).toBe(0);
        expect(passCount).toBeGreaterThanOrEqual(30);

        // Verify summary says "0 failed"
        expect(summary).toContain('0 failed');
    });
});
