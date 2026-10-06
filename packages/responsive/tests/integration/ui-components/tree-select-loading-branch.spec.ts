// A branch that is loading shows it, on the row — not only in the accessibility tree.
//
// pdx-tree-select fetches a branch through `loadChildren` and sets `aria-busy="true"` on the row
// while it is in flight. Without a rule in the design package that renders aria-busy, nobody who can
// see the screen sees anything: with lazy loading working and a handful of nodes in the DOM, an app
// would put its own "loading…" next to the control because the component does not say the branch is
// coming.
//
// Measured here in Chromium, in a real layout: while the branch is pending, the row's toggle shows a
// spinner that has a size and is visible; once it resolves, the spinner is gone.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const BASE = '/gotchas.html?case=tree-loading-branch';

interface Read {
    ready: boolean;
    busy: boolean;
    toggle: { width: number; height: number; visibility: string };
    ring: { content: string; width: number; height: number; visibility: string; animation: string };
    children: string[];
}

type Api = { open(): void; expand(): void; resolve(): void; read(): Read };
const read = (page: Page): Promise<Read> => page.evaluate(() => (window as unknown as { __gotcha: Api }).__gotcha.read());

async function openTree(page: Page): Promise<void> {
    await openPage(page, BASE);
    await page.evaluate(() => (window as unknown as { __gotcha: Api }).__gotcha.open());
    await page.waitForFunction(() => (window as unknown as { __gotcha: Api }).__gotcha.read().ready);
}

test.describe('pdx-tree-select, a branch fetched by loadChildren', () => {
    test('control — a closed branch shows no spinner', async ({ page }) => {
        await openTree(page);
        const r = await read(page);
        expect(r.busy).toBe(false);
        expect(r.ring.content, 'a spinner on a branch nobody asked for').toBe('none');
    });

    test('while it is pending, the row shows a visible spinner; once it arrives, the spinner is gone', async ({ page }) => {
        await openTree(page);
        await page.evaluate(() => (window as unknown as { __gotcha: Api }).__gotcha.expand());
        await page.waitForFunction(() => (window as unknown as { __gotcha: Api }).__gotcha.read().busy);

        const pending = await read(page);
        expect(pending.ring.content, 'aria-busy is set and nothing is drawn').not.toBe('none');
        expect(pending.ring.width, 'the spinner has no width').toBeGreaterThan(0);
        expect(pending.ring.height, 'the spinner has no height').toBeGreaterThan(0);
        expect(pending.ring.visibility).toBe('visible');
        expect(pending.ring.animation, 'a still ring does not read as loading').toBe('pdx-spin');
        expect(pending.toggle.width).toBeGreaterThan(0);
        expect(pending.toggle.visibility).toBe('visible');

        await page.evaluate(() => (window as unknown as { __gotcha: Api }).__gotcha.resolve());
        await page.waitForFunction(() => !(window as unknown as { __gotcha: Api }).__gotcha.read().busy);

        const done = await read(page);
        expect(done.children, 'the branch did not arrive').toContain('Apple');
        expect(done.ring.content, 'the spinner outlived the load').toBe('none');
    });
});
