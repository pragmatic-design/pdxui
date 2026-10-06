// Back reaches the saved offset in a real browser, when the page renders after the restore.
//
// A restore that runs once, one frame after the route resolves, comes too early. The page arrives
// later — a lazy import, then its components — so the container is still short and Chromium clamps
// the offset: a page left at 600 comes back at 495, and stays there. The clamping is layout, which
// happy-dom does not have; the core unit test (scroll-restore-late-content.test.ts) stubs it, this
// one measures it.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const BASE = '/gotchas.html?case=scroll-restore-late-content';

type Read = { top: number; max: number };
type Step = 'save' | 'leave' | 'back' | 'forward' | 'render' | 'userScroll' | 'frames' | 'read';

/** Call one of the case's steps in the page (window.__gotcha) and return what it returns. */
function call<T = unknown>(page: Page, name: Step, ...args: unknown[]): Promise<T> {
    return page.evaluate(([n, a]) => {
        const api = (window as unknown as { __gotcha: Record<string, (...x: unknown[]) => unknown> }).__gotcha;
        return api[n](...a);
    }, [name, args] as [string, unknown[]]) as Promise<T>;
}

async function leftAt600ThenBack(page: Page): Promise<void> {
    await openPage(page, BASE);
    expect(await call<number>(page, 'save')).toBe(600);
    await call(page, 'leave');
    await call(page, 'back');
    await call(page, 'frames', 2);
    const early = await call<Read>(page, 'read');
    // Only a measurement of the setup: the list is not there yet, so the browser clamps.
    expect(early.max, 'the short page is not short: this case measures nothing').toBeLessThan(600);
    expect(early.top).toBe(early.max);
}

test.describe('Back, when the page renders after the restore', () => {
    test('the saved offset is reached once the content is tall enough', async ({ page }) => {
        await leftAt600ThenBack(page);
        await call(page, 'render');
        await expect.poll(() => call<Read>(page, 'read').then(r => r.top), { message: 'Back stopped at the clamped offset' })
            .toBe(600);
    });

    test('the user scrolling during the wait wins', async ({ page }) => {
        await leftAt600ThenBack(page);
        await call(page, 'userScroll', 40);
        await call(page, 'render');
        await call(page, 'frames', 3);
        expect((await call<Read>(page, 'read')).top, 'the restore overrode the user').toBe(40);
    });

    test('the control: a new navigation during the wait starts at the top and stays there', async ({ page }) => {
        await leftAt600ThenBack(page);
        await call(page, 'forward');
        await call(page, 'render');
        await call(page, 'frames', 3);
        expect((await call<Read>(page, 'read')).top, 'the old restore pulled the new page down').toBe(0);
    });
});
