/**
 * Small accessibility defects, on the site in Chromium. Each is measured on its component page; the
 * unit tests cover the logic, these the pages people use.
 */
import { test, expect } from '@playwright/test';

test('time-picker: ↑ on the empty "Unset time" picker sets an hour', async ({ page }) => {
    await page.goto('/components/pdx-time-picker', { waitUntil: 'networkidle' });
    const picker = page.locator('pdx-time-picker[aria-label="Unset time"]');
    const hour = picker.getByRole('spinbutton').first();
    await expect(hour).toHaveText('--');
    await hour.focus();
    await page.keyboard.press('ArrowUp');
    await expect(hour).toHaveAttribute('aria-valuenow', /\d/);
    await expect(hour).not.toHaveText('--');
});

test('tag-input: Backspace in the empty field removes the last tag', async ({ page }) => {
    await page.goto('/components/pdx-tag-input', { waitUntil: 'networkidle' });
    const host = page.locator('pdx-tag-input').filter({ has: page.locator('.pdx-chip') }).first();
    const chips = host.locator('.pdx-chip');
    const before = await chips.count();
    expect(before).toBeGreaterThan(0);
    await host.locator('.pdx-tag-input-field').focus();
    await page.keyboard.press('Backspace');
    await expect(chips).toHaveCount(before - 1);
    await expect(host.getByRole('status')).toContainText('removed');
});

test('search-input: Enter after the debounce does not search twice', async ({ page }) => {
    await page.goto('/components/pdx-search-input', { waitUntil: 'networkidle' });
    const host = page.locator('pdx-search-input').first();
    await host.evaluate((el) => {
        (window as unknown as { __searches: string[] }).__searches = [];
        el.addEventListener('pdx-search', (e) => (window as unknown as { __searches: string[] }).__searches.push((e as CustomEvent).detail.value));
    });
    await host.getByRole('searchbox').fill('widgets');
    await page.waitForFunction(() => (window as unknown as { __searches: string[] }).__searches.length > 0);
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __searches: string[] }).__searches)).toEqual(['widgets']);
});

test('slider: no thumb on the page is just "Value"', async ({ page }) => {
    await page.goto('/components/pdx-slider', { waitUntil: 'networkidle' });
    const thumbs = page.locator('pdx-slider:not(.pp-stage pdx-slider) [role="slider"]');
    const n = await thumbs.count();
    expect(n).toBeGreaterThan(5);
    for (let i = 0; i < n; i++) await expect(thumbs.nth(i)).not.toHaveAccessibleName(/^(Value|Minimum|Maximum)$/);
});

test('tabs: every tablist is named, and a text-only panel is a tab stop', async ({ page }) => {
    await page.goto('/components/pdx-tabs', { waitUntil: 'networkidle' });
    const lists = page.locator('pdx-tabs:not(.pp-stage pdx-tabs) [role="tablist"]');
    const n = await lists.count();
    expect(n).toBeGreaterThan(3);
    for (let i = 0; i < n; i++) await expect(lists.nth(i)).toHaveAccessibleName(/\S/);
    const panels = page.locator('pdx-tabs [role="tabpanel"][tabindex="0"]');
    expect(await panels.count()).toBeGreaterThan(0);
});

test('wizard: the current step is aria-current="step"', async ({ page }) => {
    await page.goto('/components/pdx-wizard', { waitUntil: 'networkidle' });
    const wizard = page.locator('pdx-wizard').first();
    await expect(wizard.locator('[aria-current="step"]')).toHaveCount(1);
});

test('timeline: an ordered list', async ({ page }) => {
    await page.goto('/components/pdx-timeline', { waitUntil: 'networkidle' });
    await expect(page.locator('pdx-timeline').first().locator('ol > li').first()).toBeVisible();
});

test('scroll-area: no region without a name of its own', async ({ page }) => {
    await page.goto('/components/pdx-scroll-area', { waitUntil: 'networkidle' });
    await expect(page.locator('pdx-scroll-area').first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Scrollable content' })).toHaveCount(0);
});

test('splitter: every separator controls the pane before it', async ({ page }) => {
    await page.goto('/components/pdx-splitter', { waitUntil: 'networkidle' });
    const separators = page.locator('pdx-splitter [role="separator"]');
    const n = await separators.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
        const id = await separators.nth(i).getAttribute('aria-controls');
        expect(id).toBeTruthy();
        await expect(page.locator(`[id="${id}"]`)).toHaveClass(/pdx-splitter-pane/);
    }
});
