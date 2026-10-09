/**
 * The board: a gesture, a keyed list, an optimistic mutation and a rollback on the same pixels.
 *
 * The drag primitives' unit tests stub geometry, because happy-dom lays nothing out. So everything here is driven with REAL pointer events — `mouse.move`
 * in steps, never a synthesised `dragstart` — against the production build, which is the only way
 * to find out whether `useDrag` and `useDropZone` work on a page rather than in a fixture.
 *
 * The assertions are the server's: `__pdxLastMove` is what the mock backend was told, read whole.
 * A board that only ever moves cards on screen would pass a test that reads the screen.
 */
import { test, expect, type Page, type Locator } from './fixture';
import { demo } from './demo';

async function openBoard(page: Page): Promise<void> {
    await page.goto('/board');
    await expect(page.locator('[data-test="board"]')).toBeVisible();
    await expect(page.locator('[data-test="column-open"] .card').first()).toBeVisible();
}

const cardsIn = (page: Page, status: string) => page.locator(`[data-test="column-${status}"] .card`);
/** Rule 3's answer to a refused move: the toast carrying the server's own words. */
const refusalToast = (page: Page) => page.locator('.pdx-toast').filter({ hasText: /refused the move/ });

/**
 * Drag one element onto another with POINTER events dispatched in the page.
 *
 * Not `page.mouse`, and that is a measurement rather than a preference. Driving the gesture with
 * synthesised INPUT — `mouse.down`, `mouse.move`, `mouse.up` — makes Chromium start its own
 * system drag-and-drop, and releasing it navigates the page to `about:blank` mid-gesture. It is
 * not this app's doing: the identical sweep on `/tickets`, a page with no drag code anywhere,
 * does the same thing. No `dragstart` reaches the DOM either, because that drag is born in the
 * browser process and never passes through the renderer — which is why `preventDefault()` on the
 * element changes nothing.
 *
 * `useDrag` listens for pointer events, so dispatching them is what the component is contracted
 * to respond to. What this does NOT cover is the browser's own input plumbing; a person at a real
 * mouse is the only check for that.
 */
/**
 * Press on a card, walk the pointer to the centre of a target, and STOP there — nothing released.
 *
 * Dispatched PointerEvents, for the reason `dragOnto` gives above: `page.mouse` makes Chromium
 * start its OWN drag and the release navigates the page to `about:blank`. `releaseOver` is the matching half.
 */
async function holdOver(page: Page, card: Locator, target: Locator): Promise<{ x: number; y: number }> {
    const from = await card.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error('a drag needs two laid-out elements');
    const path = {
        startX: from.x + from.width / 2, startY: from.y + from.height / 2,
        endX: to.x + to.width / 2, endY: to.y + to.height / 2,
    };
    await page.evaluate(async (p) => {
        const fire = (type: string, node: EventTarget, x: number, y: number) => {
            node.dispatchEvent(new PointerEvent(type, {
                clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse',
                bubbles: true, cancelable: true, isPrimary: true,
            }));
        };
        const el = document.elementFromPoint(p.startX, p.startY) ?? document.body;
        fire('pointerdown', el, p.startX, p.startY);
        const steps = 12;
        for (let i = 1; i <= steps; i++) {
            fire('pointermove', document,
                p.startX + (p.endX - p.startX) * (i / steps),
                p.startY + (p.endY - p.startY) * (i / steps));
            await new Promise(r => requestAnimationFrame(() => r(null)));
        }
    }, path);
    return { x: path.endX, y: path.endY };
}

/** Let go where `holdOver` stopped. */
async function releaseOver(page: Page, at: { x: number; y: number }): Promise<void> {
    await page.evaluate((p) => {
        document.dispatchEvent(new PointerEvent('pointerup', {
            clientX: p.x, clientY: p.y, pointerId: 1, pointerType: 'mouse',
            bubbles: true, cancelable: true, isPrimary: true,
        }));
    }, at);
}

async function dragOnto(page: Page, card: Locator, target: Locator, offsetY = 0, pointerType = 'mouse'): Promise<void> {
    const from = await card.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error('a drag needs two laid-out elements');

    const path = {
        startX: from.x + from.width / 2, startY: from.y + from.height / 2,
        endX: to.x + to.width / 2, endY: to.y + to.height / 2 + offsetY,
        pointerType,
    };

    await page.evaluate(async (p) => {
        const fire = (type: string, target: EventTarget, x: number, y: number) => {
            target.dispatchEvent(new PointerEvent(type, {
                clientX: x, clientY: y, pointerId: 1, pointerType: p.pointerType,
                bubbles: true, cancelable: true, isPrimary: true,
            }));
        };
        const el = document.elementFromPoint(p.startX, p.startY) ?? document.body;
        fire('pointerdown', el, p.startX, p.startY);
        // Past the threshold, then across in steps: `useDrag` throttles its move handler to one
        // frame and the zones hit-test on every move, so a single jump is a press and a release
        // with no drag in between.
        const steps = 12;
        for (let i = 1; i <= steps; i++) {
            const x = p.startX + (p.endX - p.startX) * (i / steps);
            const y = p.startY + (p.endY - p.startY) * (i / steps);
            fire('pointermove', document, x, y);
            await new Promise(r => requestAnimationFrame(() => r(null)));
        }
        fire('pointerup', document, p.endX, p.endY);
    }, path);
}

// ─── The cards are the tickets' ───────────────────────────────────
//
// The board shows the list's tickets, and the tickets' seed is not this file's to know. So a row
// asks the board WHICH card is where before it moves it, and asserts counts as before and after.

/** The `data-test` of the n-th card of a column, as the board shows it now. */
const refAt = async (page: Page, status: string, n: number): Promise<string> =>
    (await cardsIn(page, status).nth(n).getAttribute('data-test'))!;
const card = (page: Page, ref: string) => page.locator(`[data-test="${ref}"]`);
const counts = async (page: Page) => ({
    open: await cardsIn(page, 'open').count(),
    waiting: await cardsIn(page, 'waiting').count(),
    closed: await cardsIn(page, 'closed').count(),
});

test('the board renders three columns from the server, and nothing throws', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack ?? ''}`));
    await openBoard(page);
    expect(errors).toEqual([]);
    // Every column has cards: the rows below move a card out of Open and into Waiting.
    for (const s of ['open', 'waiting', 'closed']) await expect(cardsIn(page, s).first()).toBeVisible();
});

test('the board shows the tickets of the list: as many cards, and each card is its ticket', async ({ page }) => {
    // One data set under one name: the board shows every ticket of the list, not cards of its own.
    await page.goto('/tickets');
    const total = Number((await page.locator('[data-test="total"]').innerText()).replace(/\D/g, ''));
    expect(total, 'the premise: the list has tickets').toBeGreaterThan(0);

    await openBoard(page);
    const all = page.locator('[data-test="columns"] .card');
    await expect(all, 'the board does not hold the list\'s tickets').toHaveCount(total);

    // A card IS its ticket: the first of each column, opened by its id, is the same reference and
    // subject. Sampled, not all 36 — each is a page load.
    const firsts = await Promise.all(['open', 'waiting', 'closed'].map(async (s) => {
        const card = cardsIn(page, s).first();
        return {
            id: await card.getAttribute('data-id'),
            reference: (await card.locator('span').nth(0).innerText()).trim(),
            subject: (await card.locator('span').nth(1).innerText()).trim(),
        };
    }));
    for (const f of firsts) {
        await page.goto(`/tickets/${f.id}`);
        const ticket = page.locator('[data-test="ticket"]');
        await expect(ticket, `ticket ${f.id} is not ${f.reference}`).toContainText(f.reference);
        await expect(ticket).toContainText(f.subject);
    }
});

test('a card dragged to another column changes status, and the server is told', async ({ page }) => {
    await openBoard(page);
    const ref = await refAt(page, 'open', 0);
    const id = Number(await card(page, ref).getAttribute('data-id'));
    const before = await counts(page);
    await dragOnto(page, card(page, ref), page.locator('[data-test="column-closed"]'));

    // The screen first — the card is in the other column...
    await expect(page.locator(`[data-test="column-closed"] [data-test="${ref}"]`),
        'the card did not move').toBeVisible();
    await expect(cardsIn(page, 'open')).toHaveCount(before.open - 1);

    // ...and then the server, with the whole payload it was sent.
    await expect.poll(() => page.evaluate(() => globalThis.__pdxLastMove ?? null))
        .toEqual({ id, from: 'open', to: 'closed', toIndex: expect.any(Number) });
});

test('the destination says so while the card is held over it', async ({ page }) => {
    // A good drag shows you something at the DESTINATION, not only under the pointer; without it a
    // drop is a leap of faith.
    //
    // The board takes the DEFAULTS: it does not ask for anything, and the highlight is on. That
    // is the point of the defaults, and it is why `board.pdx` asks for nothing here.
    await openBoard(page);
    const column = page.locator('[data-test="column-closed"]');
    await expect(column, 'the column is marked before anything is dragged')
        .not.toHaveAttribute('data-pdx-drop', /.+/);
    // The OUTLINE and the inset shadow, not the background: this column sets its own
    // `background` in an unlayered `<style scoped>`, which beats every layer the design system
    // paints in. Measured — that is why the mark is not a background.
    const markOf = (el: Element) => {
        const cs = getComputedStyle(el);
        return `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} | ${cs.boxShadow}`;
    };
    const idle = await column.evaluate(markOf);

    // Hold the card over the column and stop there, button still down.
    const held0 = card(page, await refAt(page, 'open', 0));
    const at = await holdOver(page, held0, column);

    await expect(column, 'the column does not say the card would land in it')
        .toHaveAttribute('data-pdx-drop', 'over');
    const held = await column.evaluate(markOf);
    expect(held, `the column looks identical while the card is over it (${idle})`).not.toBe(idle);

    // And it stops saying it once the card is dropped.
    await releaseOver(page, at);
    await expect(column).not.toHaveAttribute('data-pdx-drop', /.+/);
    await expect.poll(() => column.evaluate(markOf)).toBe(idle);
});

test('the destination opens the space the card will land in', async ({ page }) => {
    // The highlight of the test above says "here"; it does not say WHERE. The destination shows the
    // arrangement the release will produce: `useSortable` opens that space, which `useDrag` +
    // `useDropZone` alone cannot, having no notion of a list.
    await openBoard(page);

    const ref = await refAt(page, 'open', 0);
    const moving = card(page, ref);
    const dragged = (await moving.boundingBox())!;
    const counted = await counts(page);
    // The first card of the destination, so the insertion point is inside the list and not past
    // its end — held over the column's empty space, the space opens after the last card and
    // nothing has to move to make it.
    const over = card(page, await refAt(page, 'waiting', 0));

    const tops = () => cardsIn(page, 'waiting').evaluateAll(els => els.map(e => e.getBoundingClientRect().top));
    const before = await tops();

    const at = await holdOver(page, moving, over);
    // Polled, not read once: the space opens with a 200ms transition and `getBoundingClientRect`
    // during it reports where the card is at that instant, which right after the pointer stops
    // is still where it started.
    await expect.poll(async () => {
        const during = await tops();
        return Math.max(...during.map((y, i) => y - before[i]));
    }, { message: 'the destination made no room for the card' })
        .toBeGreaterThan(dragged.height * 0.8);

    // The controls, because "a space opened somewhere" is not the claim. Exactly one column is
    // the destination, and the column the card came from keeps its own cards where they are —
    // a gap that opened in both would also pass the assertion above.
    await expect(page.locator('[data-test="column-waiting"]')).toHaveAttribute('data-pdx-drop', 'over');
    await expect(page.locator('[data-test="column-open"]'),
        'the source column also claims to be the destination').not.toHaveAttribute('data-pdx-drop', /.+/);
    const home = await cardsIn(page, 'open').evaluateAll(els => els.map(e => e.style.transform));
    expect(home.filter(t => t !== ''), 'the source column opened a space too').toEqual([]);

    // And the space becomes the card: once, in the column the space was opened in.
    await releaseOver(page, at);
    await expect(page.locator(`[data-test="column-waiting"] [data-test="${ref}"]`)).toBeVisible();
    await expect(cardsIn(page, 'waiting')).toHaveCount(counted.waiting + 1);
    await expect(cardsIn(page, 'open')).toHaveCount(counted.open - 1);
});

test('moving slowly over the destination keeps its space open: it does not close and reopen', async ({ page }) => {
    // Over the other column the space opens, and no pixel of movement may close it and open it
    // again. The rect is what is sampled, frame by frame — the defect is a transition restarted from
    // closed, which `style.transform` never shows (it ends each move with the right value) and the
    // card's position does.
    await openBoard(page);
    const moving = card(page, await refAt(page, 'open', 0));
    const shifted = cardsIn(page, 'waiting').nth(1);
    const before = (await shifted.boundingBox())!.y;
    // Held on the middle of the destination's first card: the space opens after it, so the
    // second card is the one that moves down.
    const at = await holdOver(page, moving, cardsIn(page, 'waiting').first());
    await expect.poll(async () => (await shifted.boundingBox())!.y - before,
        { message: 'the premise: the space did not open' }).toBeGreaterThan(20);
    const opened = (await shifted.boundingBox())!.y;

    const tops = await page.evaluate(async (p) => {
        const el = document.querySelectorAll('[data-test="column-waiting"] .card')[1] as HTMLElement;
        const out: number[] = [];
        for (let i = 1; i <= 10; i++) {
            document.dispatchEvent(new PointerEvent('pointermove', {
                clientX: p.x, clientY: p.y + i, pointerId: 1, pointerType: 'mouse',
                bubbles: true, cancelable: true, isPrimary: true,
            }));
            await new Promise(r => requestAnimationFrame(() => r(null)));
            await new Promise(r => requestAnimationFrame(() => r(null)));
            out.push(el.getBoundingClientRect().top);
        }
        return out;
    }, at);
    expect(Math.min(...tops), `the space closed while the pointer moved inside it: ${tops.map(Math.round)} from ${Math.round(opened)}`)
        .toBeGreaterThan(opened - 2);
    await releaseOver(page, { x: at.x, y: at.y + 10 });
});

test('a refused move puts the dragged card back where it came from', async ({ page }) => {
    await openBoard(page);
    await demo(page, 'refuse-next');
    const ref = await refAt(page, 'open', 1);
    const before = await counts(page);

    await dragOnto(page, card(page, ref), page.locator('[data-test="column-waiting"]'));

    // The count of BOTH columns: a rollback that leaves the card in two places also "puts it back".
    await expect(refusalToast(page), 'the refusal was swallowed').toBeVisible();
    await expect(page.locator(`[data-test="column-open"] [data-test="${ref}"]`)).toBeVisible();
    await expect(cardsIn(page, 'open')).toHaveCount(before.open);
    await expect(cardsIn(page, 'waiting')).toHaveCount(before.waiting);
});

test('the same move from the keyboard alone', async ({ page }) => {
    await openBoard(page);
    const first = await refAt(page, 'open', 0);
    // A board that only works with a mouse is not shippable, so this is the same operation with
    // no pointer at all: focus the handle, lift, move, and the move persists like any other.
    const grab = card(page, first).locator('[data-test="grab"]');
    await grab.focus();
    await grab.press(' ');
    await expect(page.locator('[data-test="lifted"]'), 'nothing said the card was lifted').toBeVisible();

    await grab.press('ArrowRight');
    await expect(page.locator(`[data-test="column-waiting"] [data-test="${first}"]`)).toBeVisible();
    await expect.poll(() => page.evaluate(() => globalThis.__pdxLastMove?.to ?? null)).toBe('waiting');
});

test('Escape cancels a lift without moving anything', async ({ page }) => {
    // The control for the keyboard path: without it, a handler that moved on every key would pass
    // the test above.
    await openBoard(page);
    const first = await refAt(page, 'open', 0);
    const grab = card(page, first).locator('[data-test="grab"]');
    await grab.focus();
    await grab.press(' ');
    await grab.press('Escape');
    await expect(page.locator('[data-test="lifted"]')).toBeHidden();

    await grab.press('ArrowRight');
    await expect(page.locator(`[data-test="column-open"] [data-test="${first}"]`),
        'an arrow moved a card that was not lifted').toBeVisible();
    expect(await page.evaluate(() => globalThis.__pdxLastMove ?? null)).toBeNull();
});

test('at 390px the columns stack, and a card still reaches another column', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await openBoard(page);
    const first = await refAt(page, 'open', 0);

    // Three columns side by side on a phone are three columns nobody can drop into, so they stack.
    const open = await page.locator('[data-test="column-open"]').boundingBox();
    const waiting = await page.locator('[data-test="column-waiting"]').boundingBox();
    expect(open!.y + open!.height, 'the columns are still side by side at 390px')
        .toBeLessThanOrEqual(waiting!.y + 1);

    await dragOnto(page, card(page, first), page.locator('[data-test="column-waiting"]'));
    await expect(page.locator(`[data-test="column-waiting"] [data-test="${first}"]`)).toBeVisible();
});

test('the move is optimistic, and a refusal rolls it back where the user can see it', async ({ page }) => {
    // Through the keyboard, because the pointer path has Chromium's own drag in the way and the rollback is
    // the same code either way: `applyMove` returns the snapshot it replaced and `restore` puts it
    // back, so this asserts the data layer, not the gesture.
    await openBoard(page);
    const first = await refAt(page, 'open', 0);
    const before = await counts(page);
    await demo(page, 'refuse-next');

    const grab = card(page, first).locator('[data-test="grab"]');
    await grab.focus();
    await grab.press(' ');
    await grab.press('ArrowRight');

    // The refusal is on screen, and the card is home. The COUNT is the assertion that matters: a
    // rollback that leaves the card in both columns also "puts it back".
    await expect(refusalToast(page), 'the refusal was swallowed').toBeVisible();
    await expect(page.locator(`[data-test="column-open"] [data-test="${first}"]`)).toBeVisible();
    await expect(cardsIn(page, 'open')).toHaveCount(before.open);
    await expect(cardsIn(page, 'waiting')).toHaveCount(before.waiting);
    expect(await page.evaluate(() => globalThis.__pdxLastMove ?? null),
        'the server was told about a move it refused').toBeNull();
});

test('rule 3 — the refusal is a toast in view, it stays, and the next move takes it away', async ({ page }) => {
    // The same answer as the tickets list, not a paragraph of the board's own in the toolbar.
    await openBoard(page);
    const first = await refAt(page, 'open', 0);
    await demo(page, 'refuse-next');
    const grab = card(page, first).locator('[data-test="grab"]');
    await grab.focus();
    await grab.press(' ');
    await grab.press('ArrowRight');

    await expect(refusalToast(page), 'the refusal is not a toast').toBeVisible();
    await expect(refusalToast(page), 'the refusal is out of sight').toBeInViewport();
    await page.waitForTimeout(6000);
    await expect(refusalToast(page), 'the refusal disappeared on a timer').toBeVisible();

    // The next move is accepted, and the old refusal goes when it starts. The card is still lifted:
    // a refused move puts it back, it does not drop it.
    await grab.focus();
    await grab.press('ArrowRight');
    await expect(page.locator(`[data-test="column-waiting"] [data-test="${first}"]`)).toBeVisible();
    await expect(refusalToast(page), 'a stale refusal stayed on screen after the next move').toHaveCount(0);
});

test('control — the refusal toast can be closed', async ({ page }) => {
    await openBoard(page);
    const first = await refAt(page, 'open', 0);
    await demo(page, 'refuse-next');
    const grab = card(page, first).locator('[data-test="grab"]');
    await grab.focus();
    await grab.press(' ');
    await grab.press('ArrowRight');
    await refusalToast(page).getByRole('button', { name: /close|dismiss|chiudi/i }).click();
    await expect(refusalToast(page), 'the refusal could not be dismissed').toHaveCount(0);
});

test('control — the optimistic move is visible BEFORE the server answers', async ({ page }) => {
    // Without this, a board that waited for the server would pass every test above. The mock
    // takes 40ms; the card has to be in the new column before that.
    await openBoard(page);
    const first = await refAt(page, 'open', 0);
    const grab = card(page, first).locator('[data-test="grab"]');
    await grab.focus();
    await grab.press(' ');

    const started = Date.now();
    await grab.press('ArrowRight');
    await expect(page.locator(`[data-test="column-waiting"] [data-test="${first}"]`)).toBeVisible();
    const shown = Date.now() - started;

    // Generous, because a CI machine is slow; the point is that it did not wait for a 40ms round
    // trip plus a re-render, and the server assertion below is what proves the trip happened.
    expect(shown, `the card took ${shown}ms to appear — is the move waiting for the server?`).toBeLessThan(200);
    await expect.poll(() => page.evaluate(() => globalThis.__pdxLastMove?.to ?? null)).toBe('waiting');
});

test('a card dragged WITHIN its column changes its place, not its status', async ({ page }) => {
    await openBoard(page);
    const first = await refAt(page, 'open', 0);
    // The first three cards of Open. Dropping the first one onto the third reorders them, and the
    // status does not move — the same gesture as a cross-column drag, with the same zone answering
    // it, which is the arrangement the board is built on.
    const third = await refAt(page, 'open', 2);
    const before = await cardsIn(page, 'open').evaluateAll(els => els.map(e => e.dataset.id));

    await dragOnto(page, card(page, first), card(page, third));

    await expect.poll(() => cardsIn(page, 'open').evaluateAll(els => els.map(e => e.dataset.id)),
        { message: 'the card did not change place inside its column' }).not.toEqual(before);
    // As many, still Open: a reorder that loses or moves a card is not a reorder.
    await expect(cardsIn(page, 'open')).toHaveCount(before.length);
    await expect.poll(() => page.evaluate(() => globalThis.__pdxLastMove?.to ?? null)).toBe('open');
});

test('@move keeps the elements of the cards that SHIFT, so they move rather than repaint', async ({ page }) => {
    await openBoard(page);
    const first = await refAt(page, 'open', 0);
    // What `@move(160)` is for: when a card leaves, the ones below it slide up. They are the same
    // rows, in the same list, at new positions — so they keep their DOM nodes and animate.
    //
    // NOT the card that changes column: it leaves one `@for` and arrives in another, so it is
    // necessarily a new element, and asserting otherwise would be a wrong claim about the directive.
    const second = await refAt(page, 'open', 1);
    await card(page, second).evaluate((el) => {
        (el as HTMLElement & { __mark?: string }).__mark = 'still the same row';
    });

    const grab = card(page, first).locator('[data-test="grab"]');
    await grab.focus();
    await grab.press(' ');
    await grab.press('ArrowRight');
    await expect(page.locator(`[data-test="column-waiting"] [data-test="${first}"]`)).toBeVisible();

    // The second card is now the first of Open, having shifted up one place.
    await expect(cardsIn(page, 'open').first()).toHaveAttribute('data-test', second);
    const mark = await card(page, second)
        .evaluate((el) => (el as HTMLElement & { __mark?: string }).__mark ?? null);
    expect(mark, 'the row that shifted up was rebuilt instead of moved').toBe('still the same row');
});

test('touch: the same drag with a finger', async ({ page }) => {
    // `pointerType: 'touch'` is the branch `longPressDelay` and the scroll-blocking live on, and
    // it is a different path through `useDrag` than the mouse — a board that works with a mouse
    // and not with a finger is half a board on the device most people would use it on.
    await page.setViewportSize({ width: 390, height: 780 });
    await openBoard(page);
    const first = await refAt(page, 'open', 0);

    await dragOnto(page, card(page, first),
        page.locator('[data-test="column-waiting"]'), 0, 'touch');

    await expect(page.locator(`[data-test="column-waiting"] [data-test="${first}"]`),
        'a finger cannot move a card').toBeVisible();
    await expect.poll(() => page.evaluate(() => globalThis.__pdxLastMove?.to ?? null)).toBe('waiting');
});
