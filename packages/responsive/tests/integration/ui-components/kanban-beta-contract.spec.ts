// pdx-kanban (#1021), measured in a browser. The board places its items in columns by a field, keeps
// their order, and moves a card three ways, each through the same cancellable `before-move`:
// - the keyboard (Space lifts, the arrows carry, Space drops, Escape cancels), with what happens announced;
// - the card's "Move" menu, the single-pointer alternative to dragging (WCAG 2.2 2.5.7);
// - the pointer.
// A refused move leaves `items` as it was. The count says the limit a column is over.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const COLUMNS = JSON.stringify([
    { key: 'todo', label: 'To do' },
    { key: 'doing', label: 'Doing', limit: 1 },
    { key: 'done', label: 'Done' },
]);
const ITEMS = JSON.stringify([
    { id: 'a', title: 'Write spec', status: 'todo' },
    { id: 'b', title: 'Fix bug', status: 'todo' },
    { id: 'c', title: 'Review', status: 'doing' },
]);

/** Put a board in a fresh <div id="f"> with the columns and items above, and wait for it to render. */
async function mount(page: Page, attrs = ''): Promise<void> {
    await page.evaluate(async ({ columns, items, attrs }) => {
        const markup = `<pdx-kanban label="Sprint" ${attrs}></pdx-kanban>`;
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        const board = f.firstElementChild as HTMLElement & { columns: unknown; items: unknown };
        board.columns = JSON.parse(columns);
        board.items = JSON.parse(items);
        document.body.appendChild(f);
    }, { columns: COLUMNS, items: ITEMS, attrs });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Each column's titles, in order. */
const board = (page: Page) => page.locator('#f pdx-kanban').evaluate((h) =>
    Object.fromEntries([...h.querySelectorAll('[data-part="column"]')].map((c) => [
        c.getAttribute('data-column'),
        [...c.querySelectorAll('[data-part="card"]')].map((card) => card.getAttribute('data-key')),
    ])));

/** The model as the component last wrote it: id → status, in array order. */
const model = (page: Page) => page.locator('#f pdx-kanban').evaluate((h) =>
    ((h as unknown as { items: Array<{ id: string; status: string }> }).items).map((i) => `${i.id}:${i.status}`));

const announced = (page: Page) => page.evaluate(() => document.querySelector('body > [role="status"][aria-atomic="true"]')?.textContent ?? '');

const card = (page: Page, key: string) => page.locator(`#f [data-part="card"][data-key="${key}"]`);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=kanban-beta-contract'); });

test('each column is a list named by its header, each card a list item in the column its field names', async ({ page }) => {
    await mount(page);
    expect(await board(page)).toEqual({ todo: ['a', 'b'], doing: ['c'], done: [] });
    await expect(page.getByRole('list', { name: 'To do' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'To do' }).getByRole('listitem')).toHaveCount(2);
    await expect(page.locator('#f [data-column="doing"] [data-part="count"]')).toHaveText('1 of 1');
});

test('the board is one tab stop, and the arrows walk the cards', async ({ page }) => {
    await mount(page);
    await page.keyboard.press('Tab');
    await expect(card(page, 'a')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(card(page, 'b')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(card(page, 'c')).toBeFocused();
    const tabbable = await page.locator('#f [data-part="card"][tabindex="0"]').count();
    expect(tabbable).toBe(1);
});

test('Space lifts, the arrows carry, Space drops: the model moves, and each step is announced', async ({ page }) => {
    await mount(page);
    const moves: unknown[] = [];
    await page.exposeFunction('onMove', (d: unknown) => moves.push(d));
    await page.locator('#f pdx-kanban').evaluate((h) => h.addEventListener('move', (e) => (window as unknown as { onMove(d: unknown): void }).onMove((e as CustomEvent).detail)));
    await card(page, 'b').focus();
    await page.keyboard.press('Space');
    await expect.poll(() => announced(page)).toContain('Fix bug lifted');
    expect(await page.locator('#f pdx-kanban').evaluate((h) => h.matches(':state(lifted)'))).toBe(true);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(card(page, 'b')).toBeFocused();
    await expect.poll(() => announced(page)).toContain('Done');
    await page.keyboard.press('Space');
    await expect.poll(() => model(page)).toEqual(['a:todo', 'c:doing', 'b:done']);
    expect(await board(page)).toEqual({ todo: ['a'], doing: ['c'], done: ['b'] });
    await expect.poll(() => announced(page)).toContain('Fix bug dropped');
    expect(moves).toEqual([{ item: { id: 'b', title: 'Fix bug', status: 'done' }, from: { column: 'todo', index: 1 }, to: { column: 'done', index: 0 } }]);
    await expect(card(page, 'b')).toBeFocused();
});

test('Escape puts a lifted card back where it was, and nothing is written', async ({ page }) => {
    await mount(page);
    await card(page, 'a').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    expect(await board(page)).toEqual({ todo: ['b', 'a'], doing: ['c'], done: [] });
    await page.keyboard.press('Escape');
    expect(await board(page)).toEqual({ todo: ['a', 'b'], doing: ['c'], done: [] });
    expect(await model(page)).toEqual(['a:todo', 'b:todo', 'c:doing']);
    await expect.poll(() => announced(page)).toContain('cancelled');
});

test('a before-move the app refuses leaves the board as it was, and says so', async ({ page }) => {
    await mount(page);
    await page.locator('#f pdx-kanban').evaluate((h) => h.addEventListener('before-move', (e) => {
        if ((e as CustomEvent).detail.to.column === 'done') e.preventDefault();
    }));
    await card(page, 'a').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect.poll(() => announced(page)).toContain('refused');
    expect(await model(page)).toEqual(['a:todo', 'b:todo', 'c:doing']);
    expect(await board(page)).toEqual({ todo: ['a', 'b'], doing: ['c'], done: [] });
});

test('the Move menu moves a card with single clicks, through the same before-move', async ({ page }) => {
    await mount(page);
    let asked = 0;
    await page.exposeFunction('onAsk', () => { asked++; });
    await page.locator('#f pdx-kanban').evaluate((h) => h.addEventListener('before-move', () => (window as unknown as { onAsk(): void }).onAsk()));
    await page.getByRole('button', { name: 'Move Write spec' }).click();
    await page.getByRole('menuitem', { name: 'Move to Done' }).click();
    await expect.poll(() => model(page)).toEqual(['b:todo', 'c:doing', 'a:done']);
    expect(asked).toBe(1);
    // The menu offers only the moves there are: `b` is alone in its column, so neither up nor down,
    // and never its own column.
    await page.getByRole('button', { name: 'Move Fix bug' }).click();
    await expect(page.getByRole('menuitem', { name: 'Move to Done' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Move down' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Move to To do' })).toHaveCount(0);
});

test('a pointer drag carries a card to another column', async ({ page }) => {
    await mount(page);
    const from = await card(page, 'a').boundingBox();
    const to = await page.locator('#f [data-column="done"] [data-part="list"]').boundingBox();
    if (!from || !to) throw new Error('no box');
    await page.mouse.move(from.x + 20, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 20, to.y + 10, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => model(page)).toEqual(['b:todo', 'c:doing', 'a:done']);
});

test('a column over its limit says so in its count, and is marked', async ({ page }) => {
    await mount(page);
    await card(page, 'a').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect.poll(() => model(page)).toContain('a:doing');
    await expect(page.locator('#f [data-column="doing"] [data-part="count"]')).toHaveText('2 of 1');
    await expect(page.locator('#f [data-column="doing"]')).toHaveAttribute('data-over', '');
});

test('a disabled board lifts nothing and drags nothing', async ({ page }) => {
    await mount(page, 'disabled');
    await card(page, 'a').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    expect(await model(page)).toEqual(['a:todo', 'b:todo', 'c:doing']);
    await expect(page.getByRole('button', { name: 'Move Write spec' })).toBeDisabled();
});

test('a card snippet set as a property draws each card', async ({ page }) => {
    await mount(page);
    await page.locator('#f pdx-kanban').evaluate((h) => {
        (h as unknown as { cardContent: (item: { title: string }) => Node }).cardContent = (item) => {
            const b = document.createElement('b');
            b.className = 'custom';
            b.textContent = item.title.toUpperCase();
            return b;
        };
    });
    await expect(page.locator('#f .custom')).toHaveText(['WRITE SPEC', 'FIX BUG', 'REVIEW']);
});

test('axe finds nothing, at rest and with a card lifted', async ({ page }) => {
    await mount(page);
    const axe = async () => (await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .include('#f')
        .disableRules(['color-contrast'])
        .analyze()).violations.map((v) => `${v.id} (${v.nodes.length})`);
    expect(await axe()).toEqual([]);
    await card(page, 'a').focus();
    await page.keyboard.press('Space');
    expect(await axe()).toEqual([]);
});
