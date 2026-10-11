// The visitor's scheme and theme, shared by pdxui.com and themebuilder.pdxui.com (#29).
//
// The site kept its theme in localStorage, which is per origin, and did not keep the scheme at all;
// the builder started light whenever its URL said nothing. One cookie, written by both through
// brand/preference.ts, carries the choice across the two hosts: domain-wide on pdxui.com, host-only
// anywhere else (localhost, a preview host), where nothing must break.
//
// The module is tested here without a browser, and the builder's reading of it in one.

import { test, expect } from '@playwright/test';
import { PREFERENCE_COOKIE, preferenceCookie, readPreference, cookieDomainFor } from '../../../brand/preference';

test.describe('brand/preference — the shared cookie', () => {
    test('is domain-wide on pdxui.com and its subdomains, host-only anywhere else', () => {
        expect(cookieDomainFor('pdxui.com')).toBe('pdxui.com');
        expect(cookieDomainFor('themebuilder.pdxui.com')).toBe('pdxui.com');
        expect(cookieDomainFor('localhost')).toBeNull();
        expect(cookieDomainFor('pdx-site.pages.dev')).toBeNull();
        expect(cookieDomainFor('notpdxui.com')).toBeNull();

        const shared = preferenceCookie({ scheme: 'dark', theme: 'material' }, { hostname: 'pdxui.com', secure: true });
        expect(shared).toContain('; Domain=pdxui.com');
        expect(shared).toContain('; Path=/');
        expect(shared).toContain('; SameSite=Lax');
        expect(shared).toContain('; Secure');
        expect(shared).toMatch(/; Max-Age=\d{7,}/);

        const local = preferenceCookie({ scheme: 'dark' }, { hostname: 'localhost', secure: false });
        expect(local).not.toContain('Domain=');
        expect(local).not.toContain('Secure');
    });

    test('reads back what it wrote, among other cookies', () => {
        const written = preferenceCookie({ scheme: 'light', theme: 'pragmatic-gold' }, { hostname: 'pdxui.com', secure: true });
        const pair = written.split(';')[0];
        expect(readPreference(`a=1; ${pair}; b=2`)).toEqual({ scheme: 'light', theme: 'pragmatic-gold' });
        expect(readPreference('')).toEqual({});
    });

    test('ignores a value it would not write', () => {
        const bad = (v: string) => readPreference(`${PREFERENCE_COOKIE}=${encodeURIComponent(v)}`);
        expect(bad(JSON.stringify({ scheme: 'sepia', theme: 'material' }))).toEqual({ theme: 'material' });
        expect(bad(JSON.stringify({ scheme: 'dark', theme: '"><script>' }))).toEqual({ scheme: 'dark' });
        expect(bad('not json')).toEqual({});
    });
});

test.describe('the builder starts from the shared preference', () => {
    test('a URL that names nothing opens in the cookie\'s scheme and theme', async ({ page, context, baseURL }) => {
        await context.addCookies([{ name: PREFERENCE_COOKIE, value: encodeURIComponent(JSON.stringify({ scheme: 'dark', theme: 'material' })), url: baseURL! }]);
        await page.goto('/packages/builder/index.html');
        await expect(page.locator('html')).toHaveAttribute('pdx-scheme', 'dark');
        await expect(page.locator('[data-test="theme"]')).toHaveValue('material');
    });

    test('a URL that names them wins, so a shared link shows what was shared', async ({ page, context, baseURL }) => {
        await context.addCookies([{ name: PREFERENCE_COOKIE, value: encodeURIComponent(JSON.stringify({ scheme: 'dark', theme: 'material' })), url: baseURL! }]);
        await page.goto('/packages/builder/index.html?scheme=light&theme=fluent');
        await expect(page.locator('html')).toHaveAttribute('pdx-scheme', 'light');
        await expect(page.locator('[data-test="theme"]')).toHaveValue('fluent');
    });

    test('a scheme chosen in the builder is written to the cookie', async ({ page, context }) => {
        await page.goto('/packages/builder/index.html?scheme=light');
        await page.locator('[data-test="scheme"]').click();
        await expect.poll(async () => (await context.cookies()).find(c => c.name === PREFERENCE_COOKIE)?.value ?? '')
            .toContain(encodeURIComponent('"scheme":"dark"'));
    });
});
