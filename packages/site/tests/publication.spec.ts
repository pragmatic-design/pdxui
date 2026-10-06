/**
 * What a visitor arriving from npm must learn before adopting anything.
 *
 * The site states the licenses and the release status in text a reader reaches, not in a corner
 * ribbon marked `aria-hidden`. Every package is MIT, and a visitor learns it on the site, not only
 * in the repository.
 *
 * The licensing page is checked against the packages themselves: every package npm receives is
 * listed with the license its own package.json declares, read as it is written. A package that
 * changes license, or a new one that is published, makes this red instead of leaving the page
 * quietly wrong.
 */
import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGES = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The packages npm receives, and the license name a reader sees for each. */
const published = readdirSync(PACKAGES, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => join(PACKAGES, e.name, 'package.json'))
    .filter(existsSync)
    .map(f => JSON.parse(readFileSync(f, 'utf8')))
    .filter(m => typeof m.name === 'string' && m.name.startsWith('@pdxui/') && m.private !== true)
    .map(m => ({ name: m.name as string, license: String(m.license) }));

test('there are packages to check', () => {
    expect(published.length).toBeGreaterThan(5);
});

test('the licensing page names the license each published package declares', async ({ page }) => {
    await page.goto('/docs/licensing', { waitUntil: 'networkidle' });
    for (const p of published) {
        const row = page.locator('tr', { has: page.locator('code', { hasText: new RegExp(`^${p.name}$`) }) });
        await expect(row, `${p.name} has one row`).toHaveCount(1);
        await expect(row, `${p.name} is ${p.license}`).toContainText(p.license);
    }
});

test('the footer states the status and links to licensing and npm', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const footer = page.locator('footer.site-footer');
    await expect(footer).toContainText(/alpha/i);
    await expect(footer.locator('a[href="/docs/licensing"]')).toHaveCount(1);
    await expect(footer.locator('a[href="https://www.npmjs.com/org/pdxui"]')).toHaveCount(1);
});

test('the footer links the public repository and its changelog', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const footer = page.locator('footer.site-footer');
    await expect(footer.locator('a[href="https://github.com/pragmatic-design/pdxui"]')).toHaveCount(1);
    await expect(footer.locator('a[href="https://github.com/pragmatic-design/pdxui/blob/main/CHANGELOG.md"]')).toHaveCount(1);
});

test('the footer licensing link reaches the page by a click', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.locator('footer.site-footer a[href="/docs/licensing"]').click();
    await expect(page).toHaveURL(/\/docs\/licensing$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Licensing');
});

test('the landing page states the alpha status in text a screen reader reaches', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('.landing').getByText(/alpha/i).first()).toBeVisible();
});

test('the landing install matches the quick start: runtime, compiler and the CLI', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const install = page.locator('.cta pdx-code');
    await expect(install).toContainText('@pdxui/core @pdxui/compiler');
    await expect(install).toContainText('-D @pdxui/cli');
});
