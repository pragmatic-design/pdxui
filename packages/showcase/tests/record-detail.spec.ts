/**
 * The record detail's shell is written once.
 *
 * The customer's, the site's and the asset's details share one shell — identity on top, sections
 * on the left, the body beside — in one component. Written out in each page, with some sixty lines
 * of the same scoped CSS, a fix (the section gap, the phone layout) copied by hand into one misses
 * another: at 390 a body becomes a sliver beside a 260px menu.
 */
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return sources(full);
        return name.endsWith('.pdx') ? [full] : [];
    });
}

/**
 * The ticket's and the employee's details are not in this: their menus are ROUTES — links a child
 * route answers — and their shells carry the outlet, the pager and the header's actions. They keep
 * their own until that shape is asked of the component.
 */
const ROUTED_MENUS = ['pages/employee.pdx', 'pages/ticket.pdx'];

test('the detail shell\'s CSS is declared in one file', () => {
    const declaring = sources(SRC)
        .filter((file) => /\.detail-menu\s*\{/.test(readFileSync(file, 'utf8')))
        .map((file) => relative(SRC, file).replace(/\\/g, '/'))
        .filter((file) => !ROUTED_MENUS.includes(file));
    expect(declaring).toEqual(['record-detail.pdx']);
});

for (const [path, pageTest] of [['/customers/1', 'customer'], ['/sites/1', 'site'], ['/assets/1', 'asset']] as const) {
    test(`at 390, ${path}: the menu above the section, and the section as wide as the frame`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(path);
        const root = page.locator(`[data-test="${pageTest}"]`);
        await expect(root).toBeVisible();
        const m = await root.evaluate((el) => {
            const body = el.querySelector('.detail-body')!.getBoundingClientRect();
            const menu = el.querySelector('.detail-menu')!.getBoundingClientRect();
            return { body: Math.round(body.width), page: Math.round(el.getBoundingClientRect().width), menuBottom: menu.bottom, bodyTop: body.top, overflow: document.documentElement.scrollWidth > innerWidth };
        });
        expect(m.overflow, 'the page scrolls sideways').toBe(false);
        expect(m.bodyTop, 'the section is beside the menu, not under it').toBeGreaterThanOrEqual(m.menuBottom - 1);
        expect(Math.abs(m.body - m.page), `the section is ${m.body}px in a ${m.page}px page`).toBeLessThanOrEqual(1);
    });
}

test('control — at 1440 the menu is beside the section, as the reference draws it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/customers/1');
    const root = page.locator('[data-test="customer"]');
    await expect(root).toBeVisible();
    const m = await root.evaluate((el) => {
        const body = el.querySelector('.detail-body')!.getBoundingClientRect();
        const menu = el.querySelector('.detail-menu')!.getBoundingClientRect();
        return { menuRight: menu.right, bodyLeft: body.left, menuWidth: Math.round(menu.width) };
    });
    expect(m.bodyLeft).toBeGreaterThan(m.menuRight);
    expect(m.menuWidth).toBe(260);
});
