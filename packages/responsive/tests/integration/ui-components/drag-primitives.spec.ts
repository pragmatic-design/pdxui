// The drag primitives, measured against rects a browser computed.
//
// The unit tests of `useDrag`, `useDropZone` and `useSortable` do not measure a drag. The header of
// `sortable-more.test.ts` says why: "Rects are stubbed: happy-dom lays nothing out." So the index
// arithmetic is verified against numbers the test itself wrote, and everything downstream of
// geometry — which item the pointer is over, how far the others shift, where the ghost goes — is
// verified here or nowhere.
//
// Here the browser lays the list out and Playwright drives real pointer events: mouse.down, a path
// of mouse.move, mouse.up. The rows are 40px tall by explicit CSS, so every expectation below is an
// arithmetic consequence of the layout rather than a number copied from a run.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';
// What `drag-primitives.html` hands a spec, declared once for both specs that drive it.
import './contracts/drag-harness';

const ROW_H = 40;
const LABELS = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];


async function open(page: Page, which: string): Promise<void> {
    await openPage(page, `/drag-primitives.html?case=${which}`);
}

/** The centre of a row, in client coordinates. */
async function rowCentre(page: Page, label: string): Promise<{ x: number; y: number }> {
    const box = await page.locator(`[data-test="${label}"]`).boundingBox();
    if (!box) throw new Error(`${label} has no box`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Press at `from` and walk the pointer to `to`. Leaves the button DOWN. */
async function grabAndMove(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 10): Promise<void> {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
        await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    }
}

test.describe('useSortable, dragged for real', () => {
    test('the list is laid out as the arithmetic below assumes', async ({ page }) => {
        await open(page, 'sortable');
        const boxes = await Promise.all(LABELS.map((l) => page.locator(`[data-test="${l}"]`).boundingBox()));
        for (const box of boxes) expect(box).not.toBeNull();
        for (let i = 0; i < boxes.length; i++) {
            expect(boxes[i]!.height, `${LABELS[i]} is not ${ROW_H}px tall`).toBe(ROW_H);
            if (i > 0) expect(boxes[i]!.y - boxes[i - 1]!.y, 'the rows are not contiguous').toBe(ROW_H);
        }
    });

    test('a row dragged down two places lands two places down', async ({ page }) => {
        await open(page, 'sortable');
        const first = await rowCentre(page, 'alpha');
        // Past charlie's midpoint, short of delta's: the insertion index is 3, and a downward move
        // adjusts it to 2 because the row leaves its own slot on the way.
        await grabAndMove(page, first, { x: first.x, y: first.y + ROW_H * 2 + 15 });
        await page.mouse.up();

        expect(await page.evaluate(() => window.__drag.reorders)).toEqual([[0, 2]]);
        expect(await page.evaluate(() => window.__drag.order())).toEqual(['bravo', 'charlie', 'alpha', 'delta', 'echo']);
        expect(await page.evaluate(() => window.__drag.model())).toEqual(['bravo', 'charlie', 'alpha', 'delta', 'echo']);
    });

    test('a row dragged up two places lands two places up', async ({ page }) => {
        await open(page, 'sortable');
        const last = await rowCentre(page, 'echo');
        // Above charlie's midpoint, below bravo's: insertion index 2, and an upward move is not
        // adjusted — the row has not vacated a slot above the insertion point.
        await grabAndMove(page, last, { x: last.x, y: last.y - ROW_H * 2 - 15 });
        await page.mouse.up();

        expect(await page.evaluate(() => window.__drag.reorders)).toEqual([[4, 2]]);
        expect(await page.evaluate(() => window.__drag.order())).toEqual(['alpha', 'bravo', 'echo', 'charlie', 'delta']);
    });

    test('activeIndex and overIndex follow during the drag, not only after it', async ({ page }) => {
        await open(page, 'sortable');
        const first = await rowCentre(page, 'alpha');
        await grabAndMove(page, first, { x: first.x, y: first.y + ROW_H * 2 + 15 });

        const mid = await page.evaluate(() => window.__drag.state());
        expect(mid.isDragging, 'isDragging is false in the middle of a drag').toBe(true);
        expect(mid.activeIndex).toBe(0);
        expect(mid.overIndex).toBe(3);

        await page.mouse.up();
        const after = await page.evaluate(() => window.__drag.state());
        expect(after).toEqual({ activeIndex: -1, overIndex: -1, isDragging: false });
    });

    test('the rows between the grab and the pointer make room, by exactly one row', async ({ page }) => {
        await open(page, 'sortable');
        const first = await rowCentre(page, 'alpha');
        await grabAndMove(page, first, { x: first.x, y: first.y + ROW_H * 2 + 15 });

        const styles = await page.evaluate(() => window.__drag.styles());
        const byLabel = Object.fromEntries(styles.map((s) => [s.test, s]));
        expect(byLabel.bravo.transform, 'bravo did not move up to make room').toBe(`translateY(-${ROW_H}px)`);
        expect(byLabel.charlie.transform, 'charlie did not move up to make room').toBe(`translateY(-${ROW_H}px)`);
        expect(byLabel.delta.transform, 'delta moved although the pointer never reached it').toBe('');
        expect(byLabel.alpha.opacity, 'the grabbed row was not faded').toBe('0.3');

        await page.mouse.up();
    });

    test('a drop leaves no ghost, no transform and no faded row behind', async ({ page }) => {
        await open(page, 'sortable');
        const first = await rowCentre(page, 'alpha');
        await grabAndMove(page, first, { x: first.x, y: first.y + ROW_H * 2 + 15 });
        expect(await page.evaluate(() => window.__drag.ghosts()), 'no ghost was created').toBe(1);

        await page.mouse.up();
        expect(await page.evaluate(() => window.__drag.ghosts()), 'a ghost outlived the drop').toBe(0);
        const styles = await page.evaluate(() => window.__drag.styles());
        for (const s of styles) {
            expect(s.transform, `${s.test} kept a transform after the drop`).toBe('');
            expect(s.opacity, `${s.test} kept an opacity after the drop`).toBe('');
        }
    });

    test('a row dragged past the last one lands last', async ({ page }) => {
        await open(page, 'sortable');
        const first = await rowCentre(page, 'alpha');
        const last = await rowCentre(page, 'echo');
        // Below every midpoint: the insertion index is the length of the list, 5, and the downward
        // adjustment puts the row at 4 — the boundary where an off-by-one would write past the end.
        await grabAndMove(page, first, { x: first.x, y: last.y + ROW_H });
        await page.mouse.up();

        expect(await page.evaluate(() => window.__drag.reorders)).toEqual([[0, 4]]);
        expect(await page.evaluate(() => window.__drag.order())).toEqual(['bravo', 'charlie', 'delta', 'echo', 'alpha']);
    });

    test('a second drag starts from where the first one left the list', async ({ page }) => {
        await open(page, 'sortable');
        // alpha to the end, then echo — now at index 3 — back to the front.
        const alpha = await rowCentre(page, 'alpha');
        const lastRow = await rowCentre(page, 'echo');
        await grabAndMove(page, alpha, { x: alpha.x, y: lastRow.y + ROW_H });
        await page.mouse.up();
        expect(await page.evaluate(() => window.__drag.order())).toEqual(['bravo', 'charlie', 'delta', 'echo', 'alpha']);

        const echo = await rowCentre(page, 'echo');
        const top = await rowCentre(page, 'bravo');
        await grabAndMove(page, echo, { x: echo.x, y: top.y - ROW_H });
        await page.mouse.up();

        expect(await page.evaluate(() => window.__drag.reorders)).toEqual([[0, 4], [3, 0]]);
        expect(await page.evaluate(() => window.__drag.order())).toEqual(['echo', 'bravo', 'charlie', 'delta', 'alpha']);
    });

    test('a press that does not move past the threshold reorders nothing', async ({ page }) => {
        await open(page, 'sortable');
        const first = await rowCentre(page, 'alpha');
        await grabAndMove(page, first, { x: first.x, y: first.y + 3 }, 3);
        await page.mouse.up();

        expect(await page.evaluate(() => window.__drag.reorders)).toEqual([]);
        expect(await page.evaluate(() => window.__drag.order())).toEqual(LABELS);
    });

    test('after dispose(), a drag moves nothing', async ({ page }) => {
        await open(page, 'sortable');
        await page.evaluate(() => window.__drag.dispose());
        const first = await rowCentre(page, 'alpha');
        await grabAndMove(page, first, { x: first.x, y: first.y + ROW_H * 2 + 15 });
        await page.mouse.up();

        expect(await page.evaluate(() => window.__drag.reorders)).toEqual([]);
        expect(await page.evaluate(() => window.__drag.order())).toEqual(LABELS);
    });
});

test.describe('useSortable with a handle', () => {
    test('a press on the row body starts no drag', async ({ page }) => {
        await open(page, 'sortable-handle');
        const box = await page.locator('[data-test="alpha"]').boundingBox();
        // The far end of the row, well clear of the grip.
        const from = { x: box!.x + box!.width - 20, y: box!.y + box!.height / 2 };
        await grabAndMove(page, from, { x: from.x, y: from.y + ROW_H * 2 + 15 });
        await page.mouse.up();

        expect(await page.evaluate(() => window.__drag.reorders)).toEqual([]);
        expect(await page.evaluate(() => window.__drag.order())).toEqual(LABELS);
    });

    test('a press on the grip drags the row it belongs to', async ({ page }) => {
        await open(page, 'sortable-handle');
        const grip = await page.locator('[data-test="grip-alpha"]').boundingBox();
        const from = { x: grip!.x + grip!.width / 2, y: grip!.y + grip!.height / 2 };
        await grabAndMove(page, from, { x: from.x, y: from.y + ROW_H * 2 + 15 });
        await page.mouse.up();

        expect(await page.evaluate(() => window.__drag.reorders)).toEqual([[0, 2]]);
        expect(await page.evaluate(() => window.__drag.order())).toEqual(['bravo', 'charlie', 'alpha', 'delta', 'echo']);
    });
});

test.describe('useSortable on the horizontal axis', () => {
    const COL_W = 60;

    test('a column dragged right two places lands two places right', async ({ page }) => {
        await open(page, 'sortable-horizontal');
        const first = await rowCentre(page, 'alpha');
        await grabAndMove(page, first, { x: first.x + COL_W * 2 + 20, y: first.y });
        await page.mouse.up();

        expect(await page.evaluate(() => window.__drag.reorders)).toEqual([[0, 2]]);
        expect(await page.evaluate(() => window.__drag.order())).toEqual(['bravo', 'charlie', 'alpha', 'delta', 'echo']);
    });

    test('the columns make room along X, not Y', async ({ page }) => {
        await open(page, 'sortable-horizontal');
        const first = await rowCentre(page, 'alpha');
        await grabAndMove(page, first, { x: first.x + COL_W * 2 + 20, y: first.y });

        const byLabel = Object.fromEntries((await page.evaluate(() => window.__drag.styles())).map((s) => [s.test, s]));
        expect(byLabel.bravo.transform).toBe(`translateX(-${COL_W}px)`);
        expect(byLabel.charlie.transform).toBe(`translateX(-${COL_W}px)`);
        expect(byLabel.delta.transform).toBe('');

        await page.mouse.up();
    });

    test('a vertical wander on a horizontal list does not start a drag', async ({ page }) => {
        await open(page, 'sortable-horizontal');
        const first = await rowCentre(page, 'alpha');
        // 60px down, 2px across: past the threshold on the axis the list does not use.
        await grabAndMove(page, first, { x: first.x + 2, y: first.y + 60 });
        await page.mouse.up();

        expect(await page.evaluate(() => window.__drag.reorders)).toEqual([]);
        expect(await page.evaluate(() => window.__drag.order())).toEqual(LABELS);
    });
});

test.describe('useDrag onto useDropZone', () => {
    test('the pointer entering a zone sets isOver, and the edge follows the pointer', async ({ page }) => {
        await open(page, 'drop-zones');
        const puck = await page.locator('[data-test="puck"]').boundingBox();
        const zone = await page.locator('[data-test="zone-a"]').boundingBox();
        const from = { x: puck!.x + puck!.width / 2, y: puck!.y + puck!.height / 2 };

        await grabAndMove(page, from, { x: zone!.x + zone!.width / 2, y: zone!.y + zone!.height / 2 });
        await page.evaluate(() => window.__drag.frame());
        const centre = await page.evaluate(() => window.__drag.state());
        expect(centre.isDragging).toBe(true);
        expect(centre.overA, 'the pointer is inside zone A and isOver is false').toBe(true);
        expect(centre.edgeA, 'the middle of the zone is not reported as its centre').toBe('center');

        // Into the top tenth of the zone.
        await page.mouse.move(zone!.x + zone!.width / 2, zone!.y + zone!.height * 0.1);
        await page.evaluate(() => window.__drag.frame());
        expect((await page.evaluate(() => window.__drag.state())).edgeA).toBe('top');

        await page.mouse.up();
    });

    test('the drop carries the dragged data and the edge it was dropped on', async ({ page }) => {
        await open(page, 'drop-zones');
        const puck = await page.locator('[data-test="puck"]').boundingBox();
        const zone = await page.locator('[data-test="zone-a"]').boundingBox();
        const from = { x: puck!.x + puck!.width / 2, y: puck!.y + puck!.height / 2 };

        await grabAndMove(page, from, { x: zone!.x + zone!.width / 2, y: zone!.y + zone!.height / 2 });
        await page.evaluate(() => window.__drag.frame());
        await page.mouse.up();

        const events = await page.evaluate(() => window.__drag.events);
        expect(events.filter((e) => e.type === 'enter')).toEqual([{ zone: 'a', type: 'enter', data: { id: 'puck' } }]);
        expect(events.filter((e) => e.type === 'drop')).toEqual([{ zone: 'a', type: 'drop', data: { id: 'puck' }, edge: 'center' }]);
        expect((await page.evaluate(() => window.__drag.state())).overA, 'the zone stayed lit after the drop').toBe(false);
    });

    test('a zone whose accept() refuses never lights up and never receives', async ({ page }) => {
        await open(page, 'drop-zones');
        const puck = await page.locator('[data-test="puck"]').boundingBox();
        const zone = await page.locator('[data-test="zone-b"]').boundingBox();
        const from = { x: puck!.x + puck!.width / 2, y: puck!.y + puck!.height / 2 };

        await grabAndMove(page, from, { x: zone!.x + zone!.width / 2, y: zone!.y + zone!.height / 2 });
        await page.evaluate(() => window.__drag.frame());
        expect((await page.evaluate(() => window.__drag.state())).overB).toBe(false);

        await page.mouse.up();
        expect(await page.evaluate(() => window.__drag.events)).toEqual([]);
    });

    test('position tracks the pointer, and is cleared to nothing on release', async ({ page }) => {
        await open(page, 'drop-zones');
        const puck = await page.locator('[data-test="puck"]').boundingBox();
        const from = { x: puck!.x + puck!.width / 2, y: puck!.y + puck!.height / 2 };

        await grabAndMove(page, from, { x: from.x - 120, y: from.y + 60 });
        await page.evaluate(() => window.__drag.frame());
        const during = await page.evaluate(() => window.__drag.state());
        expect(during.position).toEqual({ x: -120, y: 60 });

        await page.mouse.up();
        expect((await page.evaluate(() => window.__drag.state())).isDragging).toBe(false);
    });
});

// ── Reordering a list without a pointer ───────────────────────────────────────
//
// `useSortable` has its own keyboard path: without it, a list a mouse user can reorder is a list a
// keyboard user cannot, and `<pdx-sortable-list>` has to build its own reorder on top rather than
// getting it from the composable underneath.
//
// Same keys as `useDrag`, because a user who learned one should know the other — but the arrows
// move by ITEM, which is the difference between a list and a free drag, and what is announced is
// the POSITION, which is what a reorder means to somebody who cannot see it.
test.describe('a list reordered from the keyboard', () => {
    const announcer = (page: Page) => page.locator('body > [aria-live][role="status"]');
    const row = (page: Page, label: string) => page.locator(`#sortable-list [data-test="${label}"]`);

    test('Space lifts, an arrow moves by one row, Enter drops', async ({ page }) => {
        await open(page, 'sortable');
        await row(page, 'alpha').focus();
        await page.keyboard.press('Space');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');

        expect(await page.evaluate(() => window.__drag.order()),
            'the list did not reorder from the keyboard')
            .toEqual(['bravo', 'charlie', 'alpha', 'delta', 'echo']);
        expect(await page.evaluate(() => window.__drag.reorders), 'onReorder was not called once')
            .toEqual([[0, 2]]);
    });

    test('Escape puts it back, and says so', async ({ page }) => {
        await open(page, 'sortable');
        await row(page, 'alpha').focus();
        await page.keyboard.press('Space');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Escape');

        expect(await page.evaluate(() => window.__drag.order()), 'Escape reordered the list')
            .toEqual(['alpha', 'bravo', 'charlie', 'delta', 'echo']);
        expect(await page.evaluate(() => window.__drag.reorders), 'a cancelled lift still reordered')
            .toEqual([]);
        await expect(announcer(page), 'the cancel said nothing').toContainText(/cancel/i);
    });

    test('every step is announced by position, not by index', async ({ page }) => {
        // dnd-kit's rule, and `<pdx-sortable-list>` already follows it: "position 3 of 5" is what
        // a reorder means to somebody who cannot see it. An index is an implementation detail.
        await open(page, 'sortable');
        const region = announcer(page);
        await row(page, 'alpha').focus();

        await page.keyboard.press('Space');
        await expect(region, 'the lift said nothing').toContainText(/1 of 5/);
        await page.keyboard.press('ArrowDown');
        await expect(region, 'the move did not say where it went').toContainText(/2 of 5/);
        await page.keyboard.press('Enter');
        await expect(region, 'the drop said nothing').toContainText(/2 of 5/);
    });

    test('the row says it is draggable and points at instructions that exist', async ({ page }) => {
        await open(page, 'sortable');
        const described = await page.evaluate(() => {
            const el = document.querySelector('#sortable-list [data-test="alpha"]')!;
            const id = el.getAttribute('aria-describedby');
            return {
                roleDescription: el.getAttribute('aria-roledescription'),
                text: id ? document.getElementById(id)?.textContent?.trim() ?? null : null,
            };
        });
        expect(described.roleDescription).toBe('draggable');
        expect(described.text, 'aria-describedby resolves to no element').toBeTruthy();
        expect(described.text ?? '').toMatch(/Space/);
    });

    test('a11y: false leaves the markup alone, for a component with its own keyboard', async ({ page }) => {
        // `<pdx-sortable-list>` builds its reorder on a real button handle and announces by
        // position itself. It must be able to say "not mine" — otherwise two keyboard paths lift
        // the same row twice and announce it twice.
        await open(page, 'sortable&a11y=off');
        const el = await page.evaluate(() => {
            const n = document.querySelector('#sortable-list [data-test="alpha"]')!;
            return { role: n.getAttribute('aria-roledescription'), desc: n.getAttribute('aria-describedby') };
        });
        expect(el.role, 'the opt-out still wrote a role description').toBeNull();
        expect(el.desc).toBeNull();

        await row(page, 'alpha').focus();
        await page.keyboard.press('Space');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        expect(await page.evaluate(() => window.__drag.order()), 'the opt-out still reordered')
            .toEqual(['alpha', 'bravo', 'charlie', 'delta', 'echo']);
    });
});

// ── Two lists, one group ──────────────────────────────────────────────────────
//
// Lists that share a `group` hand items to each other: `onReceive`/`onRemove` fire, so a kanban
// can use `useSortable`, gap included — the space that opens is the sortable's.
//
// What is measured here is the half that makes it worth having: the space opens in the list the
// pointer moved INTO.
test.describe('an item dragged from one list to another', () => {
    const A = '#group-a', B = '#group-b';

    /** Centre of a row, scoped to a list — the ghost is a clone and shares its `data-test`. */
    async function rowIn(page: Page, list: string, label: string): Promise<{ x: number; y: number }> {
        const box = await page.locator(`${list} [data-test="${label}"]`).boundingBox();
        if (!box) throw new Error(`${label} is not in ${list}`);
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }

    test('the space opens in the list it was dragged into, and closes in the one it left', async ({ page }) => {
        await open(page, 'sortable-groups');
        const from = await rowIn(page, A, 'alpha');
        const onto = await rowIn(page, B, 'echo');
        await grabAndMove(page, from, { x: onto.x, y: onto.y - 4 });

        const styles = Object.fromEntries(
            (await page.evaluate(() => window.__drag.styles())).map((r) => [r.test, r]));

        // B made room: `echo` is the row the pointer is above, so it moves down by a row.
        expect(styles.echo.transform, 'the receiving list did not make room')
            .toBe(`translateY(${ROW_H}px)`);
        // A closed up behind it — its rows are back where they belong.
        expect(styles.bravo.transform, 'the source list still holds a gap it no longer needs')
            .toBe('');
        expect(styles.charlie.transform).toBe('');

        await page.mouse.up();
    });

    test('releasing tells both lists, once each, with the indices', async ({ page }) => {
        await open(page, 'sortable-groups');
        const from = await rowIn(page, A, 'alpha');
        const onto = await rowIn(page, B, 'echo');
        await grabAndMove(page, from, { x: onto.x, y: onto.y - 4 });
        await page.mouse.up();

        const removed = await page.evaluate(() => window.__drag.removed());
        const received = await page.evaluate(() => window.__drag.received());
        expect(removed, 'the list it left was never told').toEqual([{ list: 'a', item: 'alpha', from: 0 }]);
        expect(received, 'the list it landed in was never told')
            .toEqual([{ list: 'b', item: 'alpha', from: 0, to: 1 }]);

        // And the models agree with what was announced.
        expect(await page.evaluate(() => window.__drag.model()))
            .toEqual({ a: ['bravo', 'charlie'], b: ['delta', 'alpha', 'echo'] });
    });

    test('a release outside both lists hands the item to nobody', async ({ page }) => {
        // The control. Without it, a rule that fires the pair on every release would pass the two
        // tests above and lose an item on any stray drag.
        await open(page, 'sortable-groups');
        const from = await rowIn(page, A, 'alpha');
        await grabAndMove(page, from, { x: from.x + 600, y: from.y + 400 });
        await page.mouse.up();

        expect(await page.evaluate(() => window.__drag.removed()), 'the source was told it lost an item')
            .toEqual([]);
        expect(await page.evaluate(() => window.__drag.received()), 'a list nobody was over received one')
            .toEqual([]);
        // The other list is untouched, which is the half that matters here.
        expect((await page.evaluate(() => window.__drag.model())).b).toEqual(['delta', 'echo']);
        // Its OWN list still reorders to the end, and that is unchanged rather than intended
        // here: `computeInsertIndex` clamps a pointer past the last row to the end, on one axis,
        // with or without groups. Asserted so a change to it is a decision.
        expect((await page.evaluate(() => window.__drag.model())).a)
            .toEqual(['bravo', 'charlie', 'alpha']);
    });

    test('a move that is only sideways still starts the drag', async ({ page }) => {
        // The three tests above all move DOWN a row on their way across, so they never ask
        // whether a purely horizontal move begins at all. A threshold measured on the drag axis,
        // `Math.abs(dy)` for a vertical list, would not start it: two columns of a board sit
        // side by side — the first card of one onto the first card of the next is ~400px of x
        // and no y. With a `group` the threshold is the distance.
        await open(page, 'sortable-groups');
        const from = await rowIn(page, A, 'alpha');
        const onto = await rowIn(page, B, 'delta');
        expect(Math.abs(onto.y - from.y), 'the two rows are not level, so this measures nothing')
            .toBeLessThan(2);

        await grabAndMove(page, from, { x: onto.x, y: from.y });
        expect(await page.evaluate(() => window.__drag.state().isDragging),
            'a sideways move never armed the drag').toBe(true);

        await page.mouse.up();
        // The index is deliberately not pinned: the pointer is level with `delta`'s midpoint, so
        // which side of it the item lands on is a rounding question and not this test's subject.
        const model = await page.evaluate(() => window.__drag.model());
        expect(model.a, 'the item never left the list it was dragged out of').toEqual(['bravo', 'charlie']);
        expect(model.b, 'the item never arrived in the list it was dragged into').toContain('alpha');
    });

    test('a drag that stays inside its own list still reorders it, and tells nobody else', async ({ page }) => {
        // The other control: cross-list must not swallow the within-list case.
        await open(page, 'sortable-groups');
        const from = await rowIn(page, A, 'alpha');
        await grabAndMove(page, from, { x: from.x, y: from.y + ROW_H * 2 + 2 });
        await page.mouse.up();

        expect(await page.evaluate(() => window.__drag.received())).toEqual([]);
        expect(await page.evaluate(() => window.__drag.removed())).toEqual([]);
        expect((await page.evaluate(() => window.__drag.model())).a)
            .toEqual(['bravo', 'charlie', 'alpha']);
    });
});

// ── What the LIST shows while one of its items is dragged ─────────────────────
//
// The gap itself is measured above — `bravo did not move up to make room`. What is measured here:
// a way to turn it off, and the variant where the dragged item is shown IN the space rather than
// floating over the list, so the final arrangement is on screen before the release.
test.describe('the list, while one of its own items is dragged', () => {
    /** Grab a row and hold it two rows down, button still pressed. */
    async function liftTwoDown(page: Page): Promise<void> {
        const from = await rowCentre(page, 'alpha');
        await grabAndMove(page, from, { x: from.x, y: from.y + ROW_H * 2 + 2 });
    }

    test('feedback: false leaves every row exactly where it was', async ({ page }) => {
        await open(page, 'sortable&feedback=none');
        await liftTwoDown(page);
        const styles = await page.evaluate(() => window.__drag.styles());
        for (const s of styles) {
            expect(s.transform, `${s.test} moved although the list was told to paint nothing`)
                .toBe('');
        }
        // The control: the drag IS happening — a list that never started would also not move.
        expect((await page.evaluate(() => window.__drag.state())).isDragging,
            'nothing was being dragged, so this measured nothing').toBe(true);
        await page.mouse.up();
    });

    test("gap: 'preview' puts the dragged row in the space, not over the pointer", async ({ page }) => {
        await open(page, 'sortable&feedback=preview');
        // Scoped to the list: the ghost is a clone and carries the same `data-test`, so a bare
        // selector matches two elements once the drag is under way.
        const alphaRow = page.locator('#sortable-list [data-test="alpha"]');
        const startTop = (await alphaRow.boundingBox())!.y;
        await liftTwoDown(page);

        // The row it will land on, measured before asserting about it.
        const styles = await page.evaluate(() => window.__drag.styles());
        const byLabel = Object.fromEntries(styles.map((row) => [row.test, row]));
        expect(byLabel.bravo.transform, 'the gap did not open').toBe(`translateY(-${ROW_H}px)`);

        // …and the dragged row moved INTO it: two rows down, by its own height each time.
        expect(byLabel.alpha.transform, 'the dragged row stayed in its old slot')
            .toBe(`translateY(${ROW_H * 2}px)`);
        // Polled, not measured once: the shift is animated (`transition: transform 200ms`), and
        // reading the rect straight away catches the row mid-flight — measured, 28px of the 80.
        await expect.poll(async () => Math.round((await alphaRow.boundingBox())!.y - startTop),
            { timeout: 3_000 })
            .toBe(ROW_H * 2);

        await page.mouse.up();
        expect((await page.evaluate(() => window.__drag.styles())).every((row) => row.transform === ''),
            'a transform survived the drop').toBe(true);
    });

    test('the default is unchanged: the row stays put and only its neighbours move', async ({ page }) => {
        // The control for the two above. Without it, `preview` could be doing nothing new and
        // `false` could be the default having quietly become a no-op.
        await open(page, 'sortable');
        await liftTwoDown(page);
        const byLabel = Object.fromEntries(
            (await page.evaluate(() => window.__drag.styles())).map((row) => [row.test, row]));
        expect(byLabel.bravo.transform).toBe(`translateY(-${ROW_H}px)`);
        expect(byLabel.alpha.transform, 'the default moved the dragged row, which is preview').toBe('');
        await page.mouse.up();
    });
});

// ── What the DESTINATION says while you hold something over it ────────────────
//
// `useDropZone` puts `isOver()` and `edge()` on the element. Without that a drop is a leap of
// faith: no highlight, no line, and a zone that refuses the data simply does not react.
//
// The refusal is the part worth naming. react-beautiful-dnd has the same hole open as issue #1712
// — a droppable that is disabled is never even told it is being dragged over, so it cannot say
// anything — and Atlassian's own guidance handles it by omission ("only colour when a drop is
// possible"). Saying no out loud is more informative than saying nothing.
test.describe('the destination, while something is held over it', () => {
    /** Hold the puck over a zone's centre and leave the button down. */
    async function holdOver(page: Page, zone: 'zone-a' | 'zone-b'): Promise<void> {
        const puck = await page.locator('[data-test="puck"]').boundingBox();
        const target = await page.locator(`[data-test="${zone}"]`).boundingBox();
        if (!puck || !target) throw new Error('the harness did not lay out');
        await page.mouse.move(puck.x + puck.width / 2, puck.y + puck.height / 2);
        await page.mouse.down();
        for (let i = 1; i <= 8; i++) {
            await page.mouse.move(
                puck.x + puck.width / 2 + ((target.x + target.width / 2 - puck.x - puck.width / 2) * i) / 8,
                puck.y + puck.height / 2 + ((target.y + target.height / 2 - puck.y - puck.height / 2) * i) / 8,
            );
        }
    }

    test('an accepting zone marks itself, and stops when the pointer leaves', async ({ page }) => {
        await open(page, 'drop-zones');
        expect((await page.evaluate(() => window.__drag.state())).dropA,
            'the zone was already marked before anything was dragged').toBeNull();

        await holdOver(page, 'zone-a');
        const over = await page.evaluate(() => window.__drag.state());
        expect(over.overA, 'the control failed: the pointer is not over zone A').toBe(true);
        expect(over.dropA, 'the zone knows it is being dragged over and does not say so').toBe('over');

        await page.mouse.up();
        expect((await page.evaluate(() => window.__drag.state())).dropA,
            'the mark outlived the drop').toBeNull();
    });

    test('a zone that asked for the line says which edge', async ({ page }) => {
        // The one normative rule anybody has written, and it is Atlassian's: a line means RELATIVE
        // placement — before or after — and must not be shown where no relative placement exists.
        // So it is opt-in, and zone A is the one that opted in.
        await open(page, 'drop-zones');
        await holdOver(page, 'zone-a');
        const s = await page.evaluate(() => window.__drag.state());
        expect(s.dropEdgeA, 'the zone asked for an insertion line and reports no edge').toBeTruthy();
        expect(['top', 'bottom', 'left', 'right', 'center']).toContain(s.dropEdgeA);
        await page.mouse.up();
    });

    test('a zone that refuses says no, instead of not reacting', async ({ page }) => {
        await open(page, 'drop-zones');
        await holdOver(page, 'zone-b');
        const s = await page.evaluate(() => window.__drag.state());

        // It still must NOT read as a valid target — that half already worked and is the control.
        expect(s.overB, 'a refusing zone reported itself as a drop target').toBe(false);
        // …and this is the half that did not exist: it is told, and it says so.
        expect(s.rejectedB, 'the refusing zone was never even told it was being dragged over')
            .toBe(true);
        expect(s.dropB, 'the refusal is invisible to the design system').toBe('rejected');

        await page.mouse.up();
        expect((await page.evaluate(() => window.__drag.state())).dropB,
            'the refusal outlived the drag').toBeNull();
    });

    test('the design system paints it, so a theme can change it', async ({ page }) => {
        // The attribute is the contract; the appearance is the design system's. Measured rather
        // than assumed: the zone has to LOOK different, or the attribute is bookkeeping.
        await open(page, 'drop-zones');
        // The OUTLINE and the inset shadow, not the background — measured, an application's own
        // unlayered `background` beats every layer the design system paints in, so a highlight
        // made of background is one any app silently cancels.
        const markOf = (test: string) => page.evaluate((t) => {
            const cs = getComputedStyle(document.querySelector(`[data-test="${t}"]`)!);
            return `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} | ${cs.boxShadow}`;
        }, test);
        const before = await markOf('zone-a');
        await holdOver(page, 'zone-a');
        const during = await markOf('zone-a');
        expect(during, `the zone looks identical while hovered (${before})`).not.toBe(before);
        await page.mouse.up();
        expect(await markOf('zone-a'), 'the highlight outlived the drop').toBe(before);
    });
});

// The keyboard drag, and what it tells assistive technology.
//
// Not `aria-grabbed`, which WAI-ARIA 1.1 deprecated. The replacement that was planned — drag and
// drop in the native accessibility APIs — never arrived, and the guidance settled on the other
// answer: expose the operation through what a screen reader still reads. So a role description,
// instructions the user can reach, and an announcement at every step, the same shape as
// `<pdx-sortable-list>`.
test.describe('useDrag from the keyboard', () => {
    /** The announcer's own region. `body >` because components have live regions of their own. */
    const announcer = (page: Page) => page.locator('body > [aria-live][role="status"]');

    test('Space grabs, an arrow moves, Escape puts it back', async ({ page }) => {
        await open(page, 'drop-zones');
        await page.locator('[data-test="puck"]').focus();

        await page.keyboard.press('Space');
        let state = await page.evaluate(() => window.__drag.state());
        expect(state.isDragging, 'Space did not grab').toBe(true);

        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowDown');
        state = await page.evaluate(() => window.__drag.state());
        expect(state.position).toEqual({ x: 20, y: 10 });

        await page.keyboard.press('Escape');
        state = await page.evaluate(() => window.__drag.state());
        expect(state.isDragging).toBe(false);
        expect(state.position).toEqual({ x: 0, y: 0 });
    });

    test('nothing sets aria-grabbed, at any point in the drag', async ({ page }) => {
        await open(page, 'drop-zones');
        await page.locator('[data-test="puck"]').focus();

        const grabbed = () => page.evaluate(() => window.__drag.state().grabbed);
        expect(await grabbed(), 'aria-grabbed before the drag').toBeNull();

        await page.keyboard.press('Space');
        // The control: it IS lifted, so the nulls below are not "null because nothing happened".
        expect((await page.evaluate(() => window.__drag.state())).isDragging).toBe(true);
        expect(await grabbed(), 'aria-grabbed while lifted — deprecated in WAI-ARIA 1.1').toBeNull();

        await page.keyboard.press('ArrowRight');
        expect(await grabbed(), 'aria-grabbed while moving').toBeNull();
        await page.keyboard.press('Escape');
        expect(await grabbed(), 'aria-grabbed after the cancel').toBeNull();

        // And nowhere else on the page either, so it cannot come back through another component.
        expect(await page.locator('[aria-grabbed]').count(), 'something here still uses aria-grabbed')
            .toBe(0);
    });

    test('the draggable says what it is, and points at instructions that exist', async ({ page }) => {
        await open(page, 'drop-zones');
        const state = await page.evaluate(() => window.__drag.state());

        expect(state.roleDescription, 'a screen reader announces a generic element or nothing')
            .toBe('draggable');
        expect(state.describedBy, 'a keyboard drag nobody is told about is not discoverable')
            .toBeTruthy();
        // Following the id is the point: an aria-describedby pointing at nothing is worse than none.
        expect(state.describedText, 'aria-describedby resolves to no element').toBeTruthy();
        expect(state.describedText ?? '', 'the instructions do not name the keys').toMatch(/Space/);
        expect(state.describedText ?? '').toMatch(/arrow keys/i);
        expect(state.describedText ?? '').toMatch(/Escape/);
    });

    test('the lift, the target it reaches, the drop and the cancel are each announced', async ({ page }) => {
        await open(page, 'drop-zones');
        const region = announcer(page);
        await page.locator('[data-test="puck"]').focus();

        await page.keyboard.press('Space');
        await expect(region, 'the lift said nothing').toContainText('lifted');

        // Walk left until the puck is over zone A, which calls itself "Inbox".
        let reached = false;
        for (let i = 0; i < 80 && !reached; i++) {
            await page.keyboard.press('ArrowLeft');
            reached = await page.evaluate(() => window.__drag.state().overA);
        }
        expect(reached, 'the puck never reached zone A: this test measured nothing').toBe(true);
        await expect(region, 'reaching a drop target said nothing').toContainText('Inbox');

        await page.keyboard.press('Enter');
        await expect(region, 'the drop said nothing').toContainText('dropped');
        await expect(region, 'the drop did not say where').toContainText('Inbox');

        // And a cancel says so, rather than going quiet.
        await page.keyboard.press('Space');
        await expect(region).toContainText('lifted');
        await page.keyboard.press('Escape');
        await expect(region, 'the cancel said nothing').toContainText(/cancelled/i);
    });
});
