// pdx-card on the beta contract (#290): the app writes `selected` — a click announces `pdx-click`, the
// card never selects itself — so it stays a prop; the looks it drew from classes on its box become
// custom states on the host, drawn from them, and the box carries none of those classes; while loading
// the card is `aria-busy` (A4); its box and its link overlay are parts. CSS-only markup keeps the classes.
// Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait for it to render. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const STATES = ['horizontal', 'compact', 'hoverable', 'clickable', 'selected', 'disabled', 'loading'];
const card = (page: Page, k: string) => page.locator(`#f [data-k="${k}"]`);
const box = (page: Page, k: string) => page.locator(`#f [data-k="${k}"] > [data-part="root"]`);
const states = (page: Page, k: string) => card(page, k).evaluate((h, names) => names.filter((s) => h.matches(`:state(${s})`)), STATES);
const look = (page: Page, k: string) => box(page, k).evaluate((b) => {
    const s = getComputedStyle(b);
    // Compact pads the card's sections less, not its box.
    const body = getComputedStyle(b.querySelector('.pdx-card-body')!);
    return { display: s.display, padding: body.paddingTop, cursor: s.cursor, shadow: s.boxShadow, opacity: s.opacity, pointer: s.pointerEvents };
});

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=card-beta-contract'); });

test('each look is a custom state that follows its prop, and the box carries no class for it', async ({ page }) => {
    await mount(page, `<pdx-card data-k="plain"><div class="pdx-card-body">Plain</div></pdx-card>`
        + `<pdx-card data-k="all" horizontal compact clickable selected><div class="pdx-card-body">All</div></pdx-card>`
        + `<pdx-card data-k="off" clickable disabled><div class="pdx-card-body">Off</div></pdx-card>`
        + `<pdx-card data-k="link" href="#x"><div class="pdx-card-body">Link</div></pdx-card>`);
    // Written by the card once it has run: wait on it, not on a visible box.
    await expect(card(page, 'all')).toHaveAttribute('role', 'button');
    expect(await states(page, 'plain')).toEqual([]);
    expect(await states(page, 'all')).toEqual(['horizontal', 'compact', 'hoverable', 'clickable', 'selected']);
    expect(await states(page, 'off')).toEqual(['hoverable', 'clickable', 'disabled']);
    // A link is clickable and hoverable as a clickable card is.
    expect(await states(page, 'link')).toEqual(['hoverable', 'clickable']);
    for (const k of ['plain', 'all', 'off', 'link']) {
        expect(await box(page, k).getAttribute('class'), k).toBe('pdx-surface pdx-surface-card');
    }
    // They follow the props.
    await card(page, 'all').evaluate((h) => { Object.assign(h, { selected: false, compact: false }); });
    await expect.poll(() => states(page, 'all')).toEqual(['horizontal', 'hoverable', 'clickable']);
});

test('and each state is drawn from the state, as its class drew it', async ({ page }) => {
    await mount(page, `<pdx-card data-k="plain"><div class="pdx-card-body">Plain</div></pdx-card>`
        + `<pdx-card data-k="all" horizontal compact clickable selected><div class="pdx-card-body">All</div></pdx-card>`
        + `<pdx-card data-k="off" clickable disabled><div class="pdx-card-body">Off</div></pdx-card>`);
    await expect(card(page, 'all')).toHaveAttribute('role', 'button');
    const plain = await look(page, 'plain');
    const all = await look(page, 'all');
    const off = await look(page, 'off');
    expect(all.display, 'horizontal: media beside the body').toBe('flex');
    expect(all.padding, 'compact: less padding').not.toBe(plain.padding);
    expect(all.cursor, 'clickable: a pointer').toBe('pointer');
    expect(all.shadow, 'selected: the primary ring').not.toBe(plain.shadow);
    expect(Number(off.opacity), 'disabled: faded').toBeLessThan(1);
    expect(off.pointer, 'disabled: no pointer').toBe('none');
});

test('loading is :state(loading), its skeleton drawn as the class draws it, and the card is aria-busy only while loading (A4)', async ({ page }) => {
    await mount(page, `<pdx-card data-k="busy" loading><div class="pdx-card-body">Body</div></pdx-card>`
        + `<div class="pdx-surface pdx-surface-card pdx-card-loading"><div class="pdx-skeleton" data-k="native"></div></div>`);
    const host = card(page, 'busy');
    await expect(host).toHaveAttribute('aria-busy', 'true');
    expect(await states(page, 'busy')).toEqual(['loading']);
    const skeleton = (sel: string) => page.locator(sel).first().evaluate((s) => {
        const c = getComputedStyle(s);
        return { animation: c.animationName, radius: c.borderTopLeftRadius, background: c.backgroundColor };
    });
    expect(await skeleton('#f [data-k="busy"] .pdx-skeleton')).toEqual(await skeleton('#f [data-k="native"]'));
    await host.evaluate((h) => { (h as HTMLElement & { loading: boolean }).loading = false; });
    await expect(host).not.toHaveAttribute('aria-busy');
    expect(await states(page, 'busy')).toEqual([]);
});

test('its box and its link overlay are parts; pdx-click stays on the card', async ({ page }) => {
    await mount(page, `<pdx-card data-k="link" href="#x"><div class="pdx-card-body">Link</div></pdx-card>`
        + `<pdx-card data-k="click" clickable><div class="pdx-card-body">Click</div></pdx-card>`);
    await expect(card(page, 'click')).toHaveAttribute('role', 'button');
    await expect(page.locator('#f [data-k="link"] [data-part="link"]')).toHaveAttribute('href', /#x$/);
    await expect(page.locator('#f [data-part="root"]')).toHaveCount(2);
    const heard = await card(page, 'click').evaluate((h) => {
        const seen = { card: 0, parent: 0 };
        h.parentElement!.addEventListener('pdx-click', () => { seen.parent++; });
        h.addEventListener('pdx-click', () => { seen.card++; });
        (h as HTMLElement).click();
        return seen;
    });
    expect(heard).toEqual({ card: 1, parent: 0 });
});
