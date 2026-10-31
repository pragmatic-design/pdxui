// pdx-overlay-outlet on the beta contract (#288). It draws the dialogs opened from code — the dialog
// service's `confirm()`, `alert()` and `open()` — and opens nothing itself, so it has no open state and
// no overlay verbs. What it owes the beta: its pieces are parts. Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

type Dialog = Record<string, (props?: Record<string, unknown>) => Promise<unknown>>;
type Api = { __gotcha: { mountBound(): void; dialog(): Promise<Dialog> } };

async function mount(page: Page): Promise<void> {
    await page.evaluate(() => (window as unknown as Api).__gotcha.mountBound());
    await page.evaluate(async () => { (await (window as unknown as Api).__gotcha.dialog()).closeAll(); });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Open `dialog.<method>(props)` from code, without waiting for its answer. */
const open = (page: Page, method: string, props: Record<string, unknown>) =>
    page.evaluate(async ([m, p]) => { void (await (window as unknown as Api).__gotcha.dialog())[m as string](p as Record<string, unknown>); }, [method, props] as const);

const OUTLET = '#bound pdx-overlay-outlet';
const parts = (page: Page) => page.locator(OUTLET).evaluate((host) =>
    [...host.querySelectorAll('[data-part]')].map((e) => e.getAttribute('data-part')));

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=overlay-outlet-beta-contract'); });

test('control — a confirm and an alert opened from code are alert dialogs, the alert on top', async ({ page }) => {
    await mount(page);
    await open(page, 'confirm', { title: 'Delete item', message: 'It cannot be undone.' });
    await open(page, 'alert', { title: 'Saved' });
    const dialogs = page.locator(`${OUTLET} [role="alertdialog"]`);
    await expect(dialogs).toHaveCount(2);
    await expect(page.locator(`${OUTLET} .pdx-alert-ok`)).toBeFocused();
});

test.describe('parts', () => {
    test('a confirm: the stack is the root, and the dialog\'s pieces are parts', async ({ page }) => {
        await mount(page);
        await open(page, 'confirm', { title: 'Delete item', message: 'It cannot be undone.', confirmText: 'delete' });
        await expect(page.locator(`${OUTLET} [role="alertdialog"]`)).toBeVisible();
        expect(await parts(page)).toEqual(['root', 'backdrop', 'panel', 'header', 'title', 'body', 'message', 'confirm-input', 'footer', 'cancel', 'confirm']);
    });

    test('an alert has an ok part', async ({ page }) => {
        await mount(page);
        await open(page, 'alert', { title: 'Saved' });
        await expect(page.locator(`${OUTLET} [role="alertdialog"]`)).toBeVisible();
        expect(await parts(page)).toEqual(['root', 'backdrop', 'panel', 'header', 'title', 'body', 'footer', 'ok']);
    });

    test('a dialog has a close part', async ({ page }) => {
        await mount(page);
        await open(page, 'open', { title: 'Details', message: 'Read only.' });
        await expect(page.locator(`${OUTLET} [role="dialog"]`)).toBeVisible();
        expect(await parts(page)).toEqual(['root', 'backdrop', 'panel', 'header', 'title', 'close', 'body', 'message']);
    });
});
