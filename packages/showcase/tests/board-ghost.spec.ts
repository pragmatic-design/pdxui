/**
 * What follows the pointer is the CARD, not its text.
 *
 * `useSortable` clones the dragged item onto <body>, and a `.pdx` screen's scoped CSS is a
 * DESCENDANT selector — `[data-pdx-…] .card { padding; border; background }` — so on <body> the
 * clone can match none of it: the box is gone and the words float alone.
 *
 * Driven with dispatched pointer events, for the reason `board.spec.ts` gives.
 */
import { test, expect, type Page, type Locator } from './fixture';

/** Press on a card and walk the pointer to the centre of a target, button still down. */
async function holdOver(page: Page, card: Locator, target: Locator): Promise<void> {
    const from = await card.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error('a drag needs two laid-out elements');
    await page.evaluate(async (p) => {
        const fire = (type: string, node: EventTarget, x: number, y: number) => {
            node.dispatchEvent(new PointerEvent(type, {
                clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse',
                bubbles: true, cancelable: true, isPrimary: true,
            }));
        };
        fire('pointerdown', document.elementFromPoint(p.startX, p.startY) ?? document.body, p.startX, p.startY);
        for (let i = 1; i <= 12; i++) {
            fire('pointermove', document,
                p.startX + (p.endX - p.startX) * (i / 12),
                p.startY + (p.endY - p.startY) * (i / 12));
            await new Promise(r => requestAnimationFrame(() => r(null)));
        }
    }, {
        startX: from.x + from.width / 2, startY: from.y + from.height / 2,
        endX: to.x + to.width / 2, endY: to.y + to.height / 2,
    });
}

/** The box a person sees: what draws the card as a card. */
const box = (el: Element) => {
    const cs = getComputedStyle(el);
    return {
        padding: cs.padding,
        border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
        background: cs.backgroundColor,
        radius: cs.borderTopLeftRadius,
    };
};

/** The `data-test` of the first card of Open, once the board has drawn one. */
async function firstOpen(page: Page): Promise<string> {
    const first = page.locator('[data-test="column-open"] .card').first();
    await expect(first).toBeVisible();
    return (await first.getAttribute('data-test'))!;
}

test('the ghost that follows the pointer is drawn as the card it came from', async ({ page }) => {
    await page.goto('/board');
    // The first card of Open, whichever ticket that is: the board shows the list's tickets,
    // and their seed is not this file's to know.
    const ref = await firstOpen(page);
    const card = page.locator(`[data-test="column-open"] [data-test="${ref}"]`);
    await expect(card).toBeVisible();
    const drawn = await card.evaluate(box);
    const size = await card.boundingBox();

    await holdOver(page, card, page.locator('[data-test="column-closed"]'));

    // The clone the sortable put on <body>, and only it.
    const ghost = page.locator(`body > [data-test="${ref}"]`);
    await expect(ghost, 'no ghost follows the pointer').toHaveCount(1);
    expect(await ghost.evaluate(box), 'the ghost lost the card\'s box: only its text is dragged').toEqual(drawn);
    const g = await ghost.boundingBox();
    expect(Math.round(g!.width)).toBe(Math.round(size!.width));
    expect(Math.round(g!.height)).toBe(Math.round(size!.height));
});

test('control — the card stays in its column while it is dragged, as the placeholder', async ({ page }) => {
    await page.goto('/board');
    const card = page.locator(`[data-test="column-open"] [data-test="${await firstOpen(page)}"]`);
    await expect(card).toBeVisible();

    await holdOver(page, card, page.locator('[data-test="column-closed"]'));

    await expect(card, 'the source left its column mid-drag').toBeVisible();
    const opacity = Number(await card.evaluate((el) => getComputedStyle(el).opacity));
    expect(opacity, 'the placeholder is not told apart from the cards around it').toBeLessThan(1);
});
