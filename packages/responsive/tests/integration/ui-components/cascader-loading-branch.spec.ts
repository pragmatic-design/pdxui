// A branch pdx-cascader is fetching shows it — a spinner and the loading text, in the column its
// children will fill.
//
// The node's arrow turning from «›» to «⋯» is not enough of a sign: the registered
// `cascader.loading` string is rendered, so an app does not have to draw its own role="status" line.
// The unit test (cascader-lazy.test.ts) proves the row exists and says the words; this proves, in
// Chromium and a real layout, that it is drawn: the row and its spinner have a size, are visible,
// the spinner turns, and the rendered text is the string. The tree-select counterpart is
// tree-select-loading-branch.spec.ts.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const BASE = '/gotchas.html?case=cascader-loading-branch';

interface Box { width: number; height: number; visibility: string }
interface Read {
    ready: boolean;
    busy: boolean;
    status: (Box & { text: string }) | null;
    spinner: (Box & { animation: string }) | null;
    children: string[];
}

type Api = { open(): void; expand(): void; resolve(): void; read(): Read };
const read = (page: Page): Promise<Read> => page.evaluate(() => (window as unknown as { __gotcha: Api }).__gotcha.read());

async function openCascader(page: Page): Promise<void> {
    await openPage(page, BASE);
    await page.evaluate(() => (window as unknown as { __gotcha: Api }).__gotcha.open());
    await page.waitForFunction(() => (window as unknown as { __gotcha: Api }).__gotcha.read().ready);
}

test.describe('pdx-cascader, a branch fetched by loadChildren', () => {
    test('control — before a branch is asked for there is no loading row', async ({ page }) => {
        await openCascader(page);
        const r = await read(page);
        expect(r.busy).toBe(false);
        expect(r.status, 'a loading row nobody asked for').toBeNull();
    });

    test('while it is pending, the next column shows a turning spinner and the loading text; once it arrives, both are gone', async ({ page }) => {
        await openCascader(page);
        await page.evaluate(() => (window as unknown as { __gotcha: Api }).__gotcha.expand());
        // The text lands a frame after the row (so the live region announces it): wait for it.
        await page.waitForFunction(() => (window as unknown as { __gotcha: Api }).__gotcha.read().status?.text === 'Loading...');

        const pending = await read(page);
        expect(pending.busy, 'the option being fetched is not aria-busy').toBe(true);
        expect(pending.status!.width, 'the loading row has no width').toBeGreaterThan(0);
        expect(pending.status!.height, 'the loading row has no height').toBeGreaterThan(0);
        expect(pending.status!.visibility).toBe('visible');
        expect(pending.spinner, 'the row has no spinner').not.toBeNull();
        expect(pending.spinner!.width).toBeGreaterThan(0);
        expect(pending.spinner!.height).toBeGreaterThan(0);
        expect(pending.spinner!.visibility).toBe('visible');
        expect(pending.spinner!.animation, 'a still ring does not read as loading').toBe('pdx-spin');

        await page.evaluate(() => (window as unknown as { __gotcha: Api }).__gotcha.resolve());
        await page.waitForFunction(() => !(window as unknown as { __gotcha: Api }).__gotcha.read().busy);

        const done = await read(page);
        expect(done.children, 'the branch did not arrive').toEqual(['Cat']);
        expect(done.status, 'the loading row outlived the load').toBeNull();
    });
});
