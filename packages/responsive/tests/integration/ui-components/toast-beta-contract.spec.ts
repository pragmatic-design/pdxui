// pdx-toast on the beta contract (#288). It holds the toasts of the global queue and opens nothing
// itself, so it has no open state and no overlay verbs. What it owes the beta: A4 — a toast is a
// `status` (an `alert` for an error) only while it has something to say, so one that was dismissed and
// is sliding out is no longer a live region with its text in it; and its pieces are parts. Measured in
// Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

type Api = { __gotcha: { mountBound(): void; toast(): Promise<Record<string, (...a: unknown[]) => string>> } };

async function mount(page: Page): Promise<void> {
    await page.evaluate(() => (window as unknown as Api).__gotcha.mountBound());
    await page.evaluate(async () => (await (window as unknown as Api).__gotcha.toast()).clear());
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Call `toast.<method>(...args)` on the global queue; returns what it returns (an id for an add). */
const toast = (page: Page, method: string, ...args: unknown[]) =>
    page.evaluate(async ([m, a]) => (await (window as unknown as Api).__gotcha.toast())[m as string](...(a as unknown[])), [method, args] as const);

/** The live regions in the stack that carry text, as `role: text`. */
function speakingIn(host: Element): string[] {
    return [...host.querySelectorAll('[role="status"], [role="alert"], [aria-live]')]
        .filter((el) => (el.textContent ?? '').trim() !== '' && el.getAttribute('aria-hidden') !== 'true')
        .map((el) => `${el.getAttribute('role')}: ${el.querySelector('.pdx-toast-message')?.textContent ?? el.textContent?.trim()}`);
}
const speaking = (page: Page) => page.locator('#bound pdx-toast').evaluate(speakingIn);

/**
 * Run `toast.<method>(arg)`, then read, one frame later and inside the 300 ms the leaving toasts stay
 * for their exit, how many toasts are in the DOM and which speak. In one call, so the read cannot land
 * after the exit.
 */
const afterOneFrame = (page: Page, method: string, arg?: unknown) =>
    page.evaluate(async ([m, a]) => {
        const t = await (window as unknown as Api).__gotcha.toast();
        if (a === undefined) t[m as string](); else t[m as string](a);
        await new Promise((r) => requestAnimationFrame(r));
        const host = document.querySelector('#bound pdx-toast')!;
        // The same reading as `speakingIn`, which cannot be passed into the page.
        const speakingNow = [...host.querySelectorAll('[role="status"], [role="alert"], [aria-live]')]
            .filter((el) => (el.textContent ?? '').trim() !== '' && el.getAttribute('aria-hidden') !== 'true')
            .map((el) => `${el.getAttribute('role')}: ${el.querySelector('.pdx-toast-message')?.textContent ?? el.textContent?.trim()}`);
        return { inDom: host.querySelectorAll('.pdx-toast').length, speaking: speakingNow };
    }, [method, arg] as const);

const items = (page: Page) => page.locator('#bound pdx-toast .pdx-toast');

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=toast-beta-contract'); });

test.describe('A4: a status only while it has something to say', () => {
    test('control — a toast on screen is a status with its text, an error an alert', async ({ page }) => {
        await mount(page);
        await toast(page, 'success', 'Saved.', { duration: 0 });
        await toast(page, 'error', 'Failed.', { duration: 0 });
        await expect(items(page)).toHaveCount(2);
        await expect.poll(() => speaking(page)).toEqual(['status: Saved.', 'alert: Failed.']);
    });

    test('a dismissed toast stops being a live region at once, while it slides out', async ({ page }) => {
        await mount(page);
        const id = await toast(page, 'success', 'Saved.', { duration: 0 });
        await toast(page, 'info', 'Still here.', { duration: 0 });
        await expect.poll(() => speaking(page)).toEqual(['status: Saved.', 'status: Still here.']);
        // The dismissed one is still in the DOM for its exit, and says nothing.
        expect(await afterOneFrame(page, 'dismiss', id)).toEqual({ inDom: 2, speaking: ['status: Still here.'] });
        await expect(items(page)).toHaveCount(1);
    });

    test('clear() silences every toast at once', async ({ page }) => {
        await mount(page);
        await toast(page, 'warning', 'Low disk.', { duration: 0 });
        await toast(page, 'error', 'Offline.', { duration: 0 });
        await expect.poll(() => speaking(page)).toHaveLength(2);
        expect(await afterOneFrame(page, 'clear')).toEqual({ inDom: 2, speaking: [] });
    });
});

test.describe('parts', () => {
    test('the stack is the root part; a toast and its pieces are parts', async ({ page }) => {
        await mount(page);
        // The action's callback is made in the page: a function does not cross into it.
        await page.evaluate(async () => (await (window as unknown as Api).__gotcha.toast())
            .add({ type: 'success', title: 'Backup', message: 'Done.', duration: 60000, action: { label: 'Undo', onClick: () => {} } }));
        await expect(items(page)).toHaveCount(1);
        const parts = await page.locator('#bound pdx-toast').evaluate((host) =>
            [...host.querySelectorAll('[data-part]')].map((e) => e.getAttribute('data-part')));
        expect(parts).toEqual(['root', 'toast', 'icon', 'title', 'message', 'action', 'close', 'progress']);
    });
});
