// What the skill tells an agent, checked against what the framework does.
//
// `marketplace/plugins/pdxui/skills/pdxui/references/gotchas.md` is the file an agent
// reads BEFORE writing any `.pdx`. An entry that describes a defect the framework no longer has makes
// an agent write workarounds for bugs that are already fixed, and the result then reads as "the bugs
// are still there". The skill is both the variable under measurement and a source of noise.
//
// Every test here is named after the claim it settles, and the claim is quoted. Two kinds:
//
//   · a claim that is GONE — the test asserts the correct behaviour, so the line cannot quietly
//     come back into the skill;
//   · a claim that is STILL TRUE — the test asserts the DEFECT, with the issue that tracks it. When
//     that issue is fixed the test fails, which is the point: it is the tripwire that tells us to
//     rewrite the skill entry instead of discovering the drift two months later.
//
// The harness is `packages/ui/tests/scenarios/gotchas.html` (one case per `?case=`), and it removes
// every other section from the document: with them merely hidden, a document-wide selector for a
// drawer's panel returns the first one in document order — a drawer belonging to a case that was
// never opened.

import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const BASE = '/gotchas.html?case=';

async function openCase(page: Page, name: string): Promise<string[]> {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await openPage(page, BASE + name);
    return errors;
}

/** What the case exposes for measurement. Shapes differ per case; each test knows its own. */
function read<T>(page: Page): Promise<T> {
    return page.evaluate(() => (window as unknown as { __gotcha: { read(): unknown } }).__gotcha.read()) as Promise<T>;
}

function openDrawer(page: Page): Promise<void> {
    return page.evaluate(() => (window as unknown as { __gotcha: { openIt(): void } }).__gotcha.openIt());
}

test.describe('claims that are no longer true — the skill must not teach these workarounds', () => {
    test('gotchas.md:27 — "pdx-select does NOT reflect the choice onto .value" — it does now', async ({ page }) => {
        // The workaround was to stash the value yourself: `el.__val = e.detail.value`. `reflectValue()`
        // (packages/ui/src/select/pdx-select.ts:222) writes the selection back through the prop signal.
        const errors = await openCase(page, 'select-value');
        await page.click('pdx-select .pdx-select-trigger, pdx-select [role="combobox"]');
        await expect(page.locator('[role="option"]')).toHaveCount(3);
        await page.locator('[role="option"]').nth(1).click();
        const m = await read<{ value: string; detail: string }>(page);
        expect(m.value, 'el.value after a selection').toBe('b');
        expect(m.detail, 'and the event still carries it').toBe('b');
        expect(errors).toEqual([]);
    });

    test('gotchas.md:95 — "a static createDataSource({data}) does NOT render the rows" — it does now', async ({ page }) => {
        // The workaround was a fake transport for local arrays. `resolveSource()`
        // (packages/ui/src/data-grid/pdx-data-grid.ts:215) builds a source from static `data`.
        const errors = await openCase(page, 'grid-static-source');
        await expect.poll(async () => (await read<{ rows: number }>(page)).rows,
            { message: 'grid cells rendered from a static source' }).toBe(6);   // 3 rows x 2 columns
        expect(errors).toEqual([]);
    });

    test('gotchas.md:77 — "a pdx-drawer does NOT open when you set .open from JS" — it does now', async ({ page }) => {
        // The workaround was to drive `[data-open]` by hand on the panel AND the backdrop, and to copy
        // `position`/`size` across, or the panel landed on the left.
        const errors = await openCase(page, 'drawer-open');
        await openDrawer(page);
        const m = await expect.poll(async () => read<{ dataOpen: boolean; onScreen: boolean; left: number; viewport: number }>(page),
            { message: 'the drawer opens from the property alone' })
            .toMatchObject({ dataOpen: true, onScreen: true }).then(() => read<{ left: number; viewport: number }>(page));
        // `position="right"` honoured: the panel sits in the right half, not on the left.
        expect(m.left, 'a right-positioned drawer must not land on the left').toBeGreaterThan(m.viewport / 2);
        expect(errors).toEqual([]);
    });

    test('gotchas.md:81 — "inside app-layout the drawer stays UNDER the chrome" — nothing covers it now', async ({ page }) => {
        // The workaround was to reparent the drawer onto <body> on every open. The component portals
        // by itself, and ONLY when an ancestor actually traps fixed positioning (pdx-drawer.ts:50).
        const errors = await openCase(page, 'drawer-in-layout');
        await openDrawer(page);
        await expect.poll(async () => (await read<{ coveredBy: string | null }>(page)).coveredBy,
            { message: 'what paints over the drawer panel' }).toBe(null);
        expect(errors).toEqual([]);
    });

    test('gotchas.md:87 — "the drawer\'s own X emits pdx-close but does not close it" — it closes now', async ({ page }) => {
        // The workaround was to wire your own pdx-close listener with a loop guard.
        const errors = await openCase(page, 'drawer-close-x');
        await openDrawer(page);
        await expect.poll(async () => (await read<{ dataOpen: boolean }>(page)).dataOpen).toBe(true);
        await page.locator('.pdx-drawer [aria-label="Close"]').click();
        // Polled, not read once: closing is animated, so a single read right after the click races the
        // slide-out under the full parallel suite. The assertion is exact all the same — it has to
        // reach exactly this state, or the poll times out.
        await expect.poll(async () => read<{ closeEvents: number; openProp: boolean; dataOpen: boolean }>(page),
            { message: 'the X closes it AND still emits the event' })
            .toMatchObject({ closeEvents: 1, openProp: false, dataOpen: false });
        expect(errors).toEqual([]);
    });

    test('gotchas.md:84 — "a transform on the panel traps fixed children" — the panel rests at none now', async ({ page }) => {
        // An open panel that settles at `transform: matrix(1,0,0,1,0,0)` still carries an ACTIVE
        // transform, so it becomes the containing block for its position:fixed descendants and a
        // select dropdown inside the drawer lands at left 1826 on a 1280 viewport. The workaround was
        // `panel.style.transform = 'none'` in every app; the CSS rests the four open states at `none`.
        const errors = await openCase(page, 'drawer-select-inside');
        await openDrawer(page);
        await expect.poll(async () => (await read<{ transform: string }>(page)).transform,
            { message: 'an open panel must not keep an active transform' }).toBe('none');

        await page.click('pdx-select .pdx-select-trigger, pdx-select [role="combobox"]');
        const m = await read<{ menuLeft: number; menuRight: number; viewport: number }>(page);
        expect(m.menuLeft, 'the dropdown starts inside the viewport').toBeGreaterThanOrEqual(0);
        expect(m.menuRight, 'and ends inside it').toBeLessThanOrEqual(m.viewport);
        expect(errors).toEqual([]);
    });

    test('and the drawer still animates — `none` must not have cost the slide-in', async ({ page }) => {
        // `transform: none` and `translateX(0)` look interchangeable, and the reason `none` is safe is
        // that CSS interpolates it as the identity, so the transition still runs. Asserted through the
        // DECLARED transition rather than by sampling positions over time: a timing measurement in a
        // parallel suite reads the machine's load, and what must not regress is the declaration.
        await openCase(page, 'drawer-open');
        await openDrawer(page);
        // Wait for the panel to actually BE open before reading its computed style. Without this the
        // read races the open under a full parallel run and picks up the initial values — a failure of
        // this assertion, not of the framework.
        await expect.poll(async () => (await read<{ dataOpen: boolean }>(page)).dataOpen).toBe(true);
        const anim = await page.evaluate(() => {
            const panel = document.querySelector('.pdx-drawer') as HTMLElement;
            const cs = getComputedStyle(panel);
            return { property: cs.transitionProperty, duration: cs.transitionDuration };
        });
        expect(anim.property, 'the panel still transitions its transform').toContain('transform');
        expect(anim.duration, 'and over a non-zero duration').not.toMatch(/^0s(,|$)/);
    });

    test('gotchas.md:98 — "No data is not vertically centred, it ends up at the bottom" — it does not', async ({ page }) => {
        // The workaround was a global `pdx-data-grid .pdx-dg-empty { flex: 999 1 auto }`. Measured: the
        // block sits ABOVE the middle, not below it — the claim as written is false. It is not exactly
        // centred either (headers take the top), so the assertion is "in the upper half, near the
        // middle", which is what a reader sees, rather than a number pretending to be a spec.
        const errors = await openCase(page, 'grid-empty');
        const m = await read<{ found: boolean; offset: number }>(page);
        expect(m.found, 'the empty block is rendered').toBe(true);
        expect(m.offset, 'positive would mean pushed towards the bottom, as the skill claimed')
            .toBeLessThan(0.05);
        expect(m.offset, 'and it is not banished to the top either').toBeGreaterThan(-0.35);
        expect(errors).toEqual([]);
    });
});

test.describe('claims that are STILL true — each one has an issue, and this is its tripwire', () => {
    test('gotchas.md:54 — a source that never opted in is left alone', async ({ page }) => {
        // The grid's selection reaches a source that asks for it; this case asserts the other half of
        // that rule — the source here is built WITHOUT `selection`, and a source that did not ask for selection state must not
        // acquire it. Feeding it unconditionally would pass the bound case below and quietly make
        // `options.selection` meaningless.
        const errors = await openCase(page, 'grid-selection');
        await page.locator('pdx-data-grid input[type="checkbox"]').nth(1).click();
        const m = await read<{ fromEvent: { selected: unknown[]; count: number } | null; dsCount: number }>(page);
        expect(m.fromEvent, 'the grid reports the selection through its event').toMatchObject({ count: 1 });
        expect(m.dsCount, 'and an opt-out source stays at zero').toBe(0);
        expect(errors).toEqual([]);
    });

    test('a source that DID opt in mirrors what the user ticked', async ({ page }) => {
        const errors = await openCase(page, 'grid-selection-bound');
        const m0 = await read<{ enabled: boolean }>(page);
        expect(m0.enabled, 'the harness must build a source that keeps a selection').toBe(true);

        await page.locator('pdx-data-grid input[type="checkbox"]').nth(1).click();
        const m = await read<{ dsCount: number; dsIds: unknown[]; dsNames: string[] }>(page);
        expect(m.dsCount, 'the source counts what the user can see').toBe(1);
        expect(m.dsIds).toEqual([1]);
        expect(m.dsNames, 'and resolves it to the item').toEqual(['Ada']);
        expect(errors).toEqual([]);
    });

    test('gotchas.md:54 — but the API it names does not exist: it is FLAT on the host, not on __dataGrid', async ({ page }) => {
        // The skill says `el.__dataGrid.getSelectedIds()` / `.clearSelection()`. There is no
        // `__dataGrid`: `ctx.expose()` puts both straight on the element (pdx-data-grid.ts:499).
        // An agent following that line gets `undefined` and concludes the grid has no selection API.
        await openCase(page, 'grid-selection');
        await page.locator('pdx-data-grid input[type="checkbox"]').nth(1).click();
        const api = await page.evaluate(() => {
            const g = document.querySelector('pdx-data-grid') as unknown as {
                getSelectedIds?: () => unknown[]; clearSelection?: () => void; __dataGrid?: unknown;
            };
            return {
                flat: typeof g.getSelectedIds === 'function' ? g.getSelectedIds() : 'absent',
                clear: typeof g.clearSelection,
                dunder: typeof g.__dataGrid,
            };
        });
        expect(api.flat, 'el.getSelectedIds() works').toEqual([1]);
        expect(api.clear).toBe('function');
        expect(api.dunder, 'el.__dataGrid does NOT exist').toBe('undefined');
    });
});

test.describe('claims no page makes at all — measured so they can be written down', () => {
    test('in an app with pdx-app-layout the scroller is .pdx-app-main, not the window', async ({ page }) => {
        // This costs time: pdx-affix and pdx-scroll-spy default to the window, every
        // `position: sticky` resolves against the container that actually scrolls, and a check that
        // scrolls `window` moves nothing. No other page says so — the skills describe `fill-height`
        // for the grid and stop there.
        await openCase(page, 'who-scrolls');
        const before = await read<{ pageScrolls: boolean; mainExists: boolean; mainScrolls: boolean; mainOverflowY: string; shellOverflow: string }>(page);

        expect(before.mainExists, 'the shell renders main.pdx-app-main').toBe(true);
        expect(before.pageScrolls, 'the page itself scrolls — the claim is wrong').toBe(false);
        expect(before.mainScrolls, 'main does not scroll — the claim is wrong').toBe(true);
        expect(before.shellOverflow).toBe('hidden');
        expect(before.mainOverflowY).toBe('auto');

        // And the consequence, which is the part that costs the time: scrolling the window does
        // nothing at all.
        await page.evaluate(() => (window as unknown as { __gotcha: { scrollWindow(): void } }).__gotcha.scrollWindow());
        expect((await read<{ mainTop: number }>(page)).mainTop, 'window.scrollTo moved the main region').toBe(0);

        await page.evaluate(() => (window as unknown as { __gotcha: { scrollMain(): void } }).__gotcha.scrollMain());
        expect((await read<{ mainTop: number }>(page)).mainTop, 'scrolling main did nothing').toBeGreaterThan(0);
    });

    test('useScroll can be pointed at the region that scrolls, and the window state stays put', async ({ page }) => {
        // The consequence of the test above, on the composable: a `useScroll()` that watches the
        // window reports, in this shell — the one the framework ships — a y that never moves and a
        // direction permanently 'idle'. Silently. The two use cases the docs give it, a header that
        // hides on scroll down and a back-to-top, need it pointed at the region that scrolls.
        await openCase(page, 'who-scrolls');
        await page.evaluate(() => (window as unknown as { __gotcha: { watch(): void } }).__gotcha.watch());

        const m = await page.evaluate(() =>
            (window as unknown as { __gotcha: { scrollAndCapture(top: number): Promise<unknown> } })
                .__gotcha.scrollAndCapture(600)) as
            { regionY: number; regionDirection: string; pageY: number; pageDirection: string };

        expect(m.regionY, 'useScroll(main) did not follow the region that scrolled').toBe(600);
        expect(m.regionDirection, 'the direction of the region').toBe('down');
        expect(m.pageY, 'the window state moved, and the window did not').toBe(0);
        expect(m.pageDirection, 'the window state reported a direction it could not have seen').toBe('idle');
    });
});
