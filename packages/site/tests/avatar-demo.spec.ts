/**
 * The avatar galleries teach presence and stacking without a third party and without a colour code.
 *
 * The photos come from this site: a third-party host means someone else's uptime and privacy terms,
 * one request per avatar, and the image broken on purpose is a missing file here, not a host that
 * does not exist. A presence dot is not colour only, and "Offline" is not red, as if being away were
 * an error. A clickable avatar group works from the keyboard, not only with a mouse.
 */
import { test, expect, type Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/** The portraits exist twice: the showcase serves its own, and the site the galleries ported from it. */
const SHOWCASE_AVATARS = fileURLToPath(new URL('../../compiler/demo/showcase-new/public/avatars/', import.meta.url));
const SITE_AVATARS = fileURLToPath(new URL('../public/avatars/', import.meta.url));

/** The gallery section a heading heads — its parent. */
const section = (page: Page, heading: string) =>
    page.locator('.cmp-gallery').getByRole('heading', { name: heading, exact: true }).locator('xpath=..');

/** Every image the page asks another host for. */
function foreignImages(page: Page, origin: string): string[] {
    const urls: string[] = [];
    page.on('request', (r) => {
        if (r.resourceType() !== 'image') return;
        const url = r.url();
        if (url.startsWith('data:') || url.startsWith(origin)) return;
        urls.push(url);
    });
    return urls;
}

for (const tag of ['pdx-avatar', 'pdx-avatar-group']) {
    test(`${tag}: every image comes from this site`, async ({ page, baseURL }) => {
        const foreign = foreignImages(page, new URL(baseURL!).origin);
        await page.goto(`/components/${tag}`, { waitUntil: 'networkidle' });
        // Loaded, not merely present: a bound URL the sanitiser drops leaves an <img> with no src.
        const loaded = () => page.locator('.cmp-gallery pdx-avatar img')
            .evaluateAll((els) => els.filter((i) => (i as HTMLImageElement).naturalWidth > 0).length);
        await expect.poll(loaded, 'no portrait loaded').toBeGreaterThan(3);
        expect(foreign, 'images requested from another host').toEqual([]);
    });
}

test('the site serves the same portraits as the showcase', () => {
    const names = readdirSync(SHOWCASE_AVATARS).sort();
    expect(names.length).toBeGreaterThan(0);
    expect(readdirSync(SITE_AVATARS).sort()).toEqual(names);
    for (const n of names) {
        expect(readFileSync(join(SITE_AVATARS, n), 'utf8'), n).toBe(readFileSync(join(SHOWCASE_AVATARS, n), 'utf8'));
    }
});

test('the broken image is a missing file on this site, and falls back to initials', async ({ page }) => {
    await page.goto('/components/pdx-avatar', { waitUntil: 'networkidle' });
    const broken = section(page, 'With Image').locator('pdx-avatar[alt="Error Fallback"]');
    await expect(broken).toHaveAttribute('src', /^\/[^/]/);
    await expect(broken.getByRole('img', { name: 'Error Fallback' })).toHaveText('EF');
});

test('each presence dot has its status written beside it, and offline is muted, not danger', async ({ page }) => {
    await page.goto('/components/pdx-avatar', { waitUntil: 'domcontentloaded' });
    const items = section(page, 'With Status Dot').locator('.status-item');
    await expect(items.locator('.pdx-txt-caption')).toHaveText(['Online', 'Away', 'Offline', 'Busy']);
    await expect(items.filter({ hasText: 'Offline' }).locator('.pdx-dot')).toHaveClass(/pdx-dot-muted/);

    const team = section(page, 'Composition').locator('.team-row').filter({ hasText: 'Offline' });
    await expect(team.locator('.pdx-dot')).toHaveClass(/pdx-dot-muted/);
    await expect(team.locator('.pdx-badge')).not.toHaveClass(/danger/);
});

test('the clickable group is reached by Tab, and Enter on "+4" fires the overflow event', async ({ page }) => {
    await page.goto('/components/pdx-avatar-group', { waitUntil: 'domcontentloaded' });
    const s = section(page, 'Clickable');
    const first = s.getByRole('button', { name: 'Alice Johnson' });
    await first.focus();
    await expect(first).toBeFocused();
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    const more = s.getByRole('button', { name: '4 more' });
    await expect(more).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(s.getByText('pdx-overflow-click: +4 hidden avatars')).toBeVisible();
});
