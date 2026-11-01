// pdx-provide and pdx-error-boundary on the beta contract (#290). Neither draws a box of its own, which is
// why neither had a manifest; each is measured here around what it wraps, and certified by a manifest
// written for it. pdx-provide: a reader inside gets the value, the nearest provider wins, and the host
// has no state, part or class. pdx-error-boundary: a child that throws turns the host to the custom
// state `error`, the fallback and its pieces are named parts, and `pdx-error` is declared and stays on
// the boundary; Retry after the fix clears the state. Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

type Api = { Theme: object; breakChild(): void; fixChild(): void; load(m: string): Promise<void> };
const api = (page: Page) => page.evaluateHandle(() => (window as unknown as { __gotcha: Api }).__gotcha);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=wrappers-beta-contract'); });

test('pdx-provide: a reader inside gets the value, the nearest provider wins, and the host is bare', async ({ page }) => {
    const read = await page.evaluate(async () => {
        const g = (window as unknown as { __gotcha: Api }).__gotcha;
        await g.load('<pdx-provide></pdx-provide><gotcha-theme-reader></gotcha-theme-reader>');
        const outer = document.createElement('pdx-provide') as HTMLElement & { token: object; value: unknown };
        outer.token = g.Theme;
        outer.value = 'light';
        const inner = document.createElement('pdx-provide') as HTMLElement & { token: object; value: unknown };
        inner.token = g.Theme;
        inner.value = 'dark';
        outer.innerHTML = '<gotcha-theme-reader data-which="outer"></gotcha-theme-reader>';
        inner.innerHTML = '<gotcha-theme-reader data-which="inner"></gotcha-theme-reader>';
        outer.appendChild(inner);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.appendChild(outer);
        document.body.appendChild(f);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const text = (which: string) => f.querySelector(`[data-which="${which}"] [data-test="read"]`)?.textContent;
        return { outer: text('outer'), inner: text('inner'), cls: outer.getAttribute('class'), parts: f.querySelectorAll('pdx-provide [data-part]').length };
    });
    expect(read).toEqual({ outer: 'light', inner: 'dark', cls: null, parts: 0 });
});

test('pdx-error-boundary: a child that throws turns the host to :state(error) with its fallback parts; Retry after the fix clears it', async ({ page }) => {
    await page.evaluate(async () => {
        const g = (window as unknown as { __gotcha: Api }).__gotcha;
        await g.load('<pdx-error-boundary></pdx-error-boundary><gotcha-flaky-child></gotcha-flaky-child>');
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = '<pdx-error-boundary max-retries="2"><gotcha-flaky-child></gotcha-flaky-child></pdx-error-boundary>';
        document.body.appendChild(f);
        const b = f.querySelector('pdx-error-boundary')!;
        const log = { own: 0, parent: 0 };
        (window as unknown as { __log: typeof log }).__log = log;
        b.addEventListener('pdx-error', () => { log.own++; });
        f.addEventListener('pdx-error', () => { log.parent++; });
    });
    const boundary = page.locator('#f pdx-error-boundary');
    await expect(page.locator('#f [data-test="child"]')).toHaveText('healthy');
    expect(await boundary.evaluate((h) => h.matches(':state(error)'))).toBe(false);

    await (await api(page)).evaluate((g) => (g as unknown as Api).breakChild());
    await expect.poll(() => boundary.evaluate((h) => h.matches(':state(error)'))).toBe(true);
    const fallback = await boundary.evaluate((h) => ({
        parts: [...h.querySelectorAll('[data-part]')].map((e) => e.getAttribute('data-part')),
        cls: h.getAttribute('class'),
    }));
    expect(fallback).toEqual({ parts: ['fallback', 'message', 'detail', 'retry'], cls: null });
    expect(await page.evaluate(() => (window as unknown as { __log: unknown }).__log)).toEqual({ own: 1, parent: 0 });

    await (await api(page)).evaluate((g) => (g as unknown as Api).fixChild());
    await page.locator('#f [data-part="retry"]').click();
    await expect(page.locator('#f [data-test="child"]')).toHaveText('healthy');
    expect(await boundary.evaluate((h) => h.matches(':state(error)'))).toBe(false);
});
