/**
 * What is kept out of the entry chunk still arrives where it is used.
 *
 * The docs' rendered HTML loads per page (`x.md`), their titles up front (`x.md?meta`); the
 * playground's compiler loads with the playground. Each is a place a lazy load could come back
 * empty or late: this checks the page, not the chunk.
 */
import { test, expect } from '@playwright/test';

test('a docs page renders its own body and table of contents', async ({ page }) => {
    await page.goto('/docs/router', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.doc-body h2', { hasText: 'Your first page' })).toBeVisible();
    await expect(page.locator('.doc-toc a', { hasText: 'Params' })).toBeVisible();
    // The nav lists every doc from the metadata alone.
    await expect(page.locator('.doc-nav a', { hasText: 'Reactivity (API)' })).toBeVisible();
});

test('moving to another doc from the nav loads that doc, not the previous one', async ({ page }) => {
    await page.goto('/docs/router', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.doc-body h2', { hasText: 'Your first page' })).toBeVisible();
    await page.locator('.doc-nav a', { hasText: 'Reactivity (API)' }).click();
    await expect(page).toHaveURL(/\/docs\/reactivity$/);
    await expect(page.locator('.doc-body h1, .doc-body h2').first()).not.toHaveText('Your first page');
    await expect(page.locator('.doc-body h2', { hasText: 'Your first page' })).toHaveCount(0);
});

test('/docs with no slug opens getting started', async ({ page }) => {
    await page.goto('/docs', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.doc-nav a.active')).toHaveAttribute('href', '/docs/getting-started');
    await expect(page.locator('.doc-body')).not.toBeEmpty();
});

test('an API module page opens under the API reference, which links every export to its page', async ({ page }) => {
    await page.goto('/docs/api-reactivity', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.doc-body h1')).toHaveText('Reactivity API');
    await expect(page.locator('.doc-body h2#signal')).toHaveCount(1);
    // The guides' nav does not list thirteen module pages; it marks the index as where you are.
    await expect(page.locator('.doc-nav a.active')).toHaveAttribute('href', '/docs/api');
    await expect(page.locator('.doc-nav a[href^="/docs/api-"]')).toHaveCount(0);

    await page.goto('/docs/api', { waitUntil: 'domcontentloaded' });
    await page.locator('.doc-body a[href="/docs/api-testing#mount"]').click();
    await expect(page).toHaveURL(/\/docs\/api-testing#mount$/);
    await expect(page.locator('.doc-body h2#mount')).toHaveCount(1);
});

test('search finds a doc by its title, from the metadata alone', async ({ page }) => {
    await page.goto('/search', { waitUntil: 'domcontentloaded' });
    await page.locator('.search-input').fill('router');
    // The guide, by its URL: the Router API page is a doc with that word in its title too.
    await expect(page.locator('.search-item[href="/docs/router"]').filter({ hasText: 'doc' })).toHaveCount(1);
    await expect(page.locator('.search-item[href="/docs/api-router"]')).toHaveCount(1);
});

test('the playground loads its compiler and compiles the starting component', async ({ page }) => {
    await page.goto('/playground', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.pg-status')).toHaveText('✓ compiled', { timeout: 15_000 });
    await expect(page.locator('.pg-preview pdx-button')).toBeVisible();
    // And it still compiles what the reader types.
    await page.locator('.pg-editor').fill('<template><p class="probe">typed</p></template>\n<script>\n</script>');
    await expect(page.locator('.pg-preview .probe')).toHaveText('typed');
});
