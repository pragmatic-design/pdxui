// A slotted child mounts where it is projected — connected, inside its parent's template.
//
// In a browser it can mount DETACHED, before its parent's setup has run: the parent's
// connectedCallback removes its children to project them, that removal is a CEReactions operation,
// and it flushes the child's `connectedCallback` still queued from the insertion — delivered to an
// element that is no longer in the document. The child's setup then runs with `parentNode === null`,
// and `<pdx-error-boundary>` cannot catch a child that fails while mounting: the child mounts
// before the boundary exists.
//
// happy-dom connects children before their parents, so no unit test could see this order. It is
// measured here, in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const BASE = '/gotchas.html?case=slotted-mount';

async function open(page: Page): Promise<void> {
    await openPage(page, BASE);
}

type Entry = { who: string; connected?: boolean; insideParentTemplate?: boolean };

test.describe('a slotted child in a browser', () => {
    test('mounts once, connected, inside its parent\'s template — after the parent set up', async ({ page }) => {
        await open(page);
        const { log, kidRendered } = await page.evaluate(() =>
            (window as unknown as { __gotcha: { mountSlotted(): { log: Entry[]; kidRendered: boolean } } }).__gotcha.mountSlotted());

        const kid = log.filter((e) => e.who === 'kid setup');
        expect(kid, 'the kid set up more or fewer times than once').toHaveLength(1);
        expect(kid[0].connected, 'the kid set up while it was not in the document').toBe(true);
        expect(kid[0].insideParentTemplate, 'the kid set up outside the template it is projected into').toBe(true);
        expect(log.map((e) => e.who), 'the kid set up before its parent').toEqual(['parent setup', 'kid setup']);
        expect(kidRendered, 'the kid is not rendered in its slot').toBe(true);
    });

    test('<pdx-error-boundary> catches a slotted child whose setup throws', async ({ page }) => {
        await open(page);
        const r = await page.evaluate(() =>
            (window as unknown as { __gotcha: { mountInBoundary(): Promise<{ alert: boolean; detail: string | null; inlineSpan: boolean }> } }).__gotcha.mountInBoundary());

        expect(r.alert, 'no fallback — the error went past the boundary').toBe(true);
        expect(r.detail).toBe('config missing');
        expect(r.inlineSpan, 'the child showed its own inline error instead').toBe(false);
    });
});
