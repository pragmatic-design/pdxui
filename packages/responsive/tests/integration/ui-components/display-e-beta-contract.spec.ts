// pdx-chip on the beta contract (#291). `selected` is a model: a click writes it and announces
// `selected-change` `{ value }` in place of `pdx-toggle`, which is gone; a parent's write changes it and
// announces nothing. Selected and disabled are the host's custom states, and a coloured chip draws its
// selected look from the state — the old rule keyed on a `selected` attribute the component never wrote.
// Its pieces are named parts, and `pdx-remove` stays on the chip. Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait for the components to build. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
}

/** The element's own parts: not those of a component nested in it. */
const parts = (page: Page, sel: string) => page.locator(sel).evaluate((h) => {
    const owner = (e: Element): Element | null => {
        let p = e.parentElement;
        while (p && !p.tagName.includes('-')) p = p.parentElement;
        return p;
    };
    return [...new Set([...h.querySelectorAll('[data-part]')].filter((e) => owner(e) === h).map((e) => e.getAttribute('data-part')))].sort();
});

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=display-e-beta-contract'); });

test('pdx-chip: a click writes the selected model and announces selected-change { value }; no pdx-toggle, nothing bubbles', async ({ page }) => {
    await mount(page, '<pdx-chip selectable value="a">Alpha</pdx-chip>');
    const chip = page.locator('#f pdx-chip');
    await expect(chip.locator('[data-part="root"]')).toHaveCount(1);
    await chip.evaluate((h) => {
        const log = { values: [] as unknown[], alpha: 0, parent: 0 };
        (window as unknown as { __log: typeof log }).__log = log;
        h.addEventListener('selected-change', (e) => log.values.push((e as CustomEvent).detail?.value));
        h.addEventListener('pdx-toggle', () => { log.alpha++; });
        h.parentElement!.addEventListener('selected-change', () => { log.parent++; });
    });
    await page.getByRole('button', { name: 'Alpha' }).click();
    expect(await page.evaluate(() => (window as unknown as { __log: unknown }).__log)).toEqual({ values: [true], alpha: 0, parent: 0 });
    expect(await chip.evaluate((h) => ({ selected: (h as unknown as { selected: boolean }).selected, state: h.matches(':state(selected)') })))
        .toEqual({ selected: true, state: true });
    await expect(page.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-pressed', 'true');

    // A parent's write changes it and announces nothing.
    await chip.evaluate((h) => { (h as unknown as { selected: boolean }).selected = false; });
    await expect.poll(() => chip.evaluate((h) => h.matches(':state(selected)'))).toBe(false);
    expect(await page.evaluate(() => (window as unknown as { __log: { values: unknown[] } }).__log.values)).toEqual([true]);
});

test('pdx-chip: a coloured chip, selected, is filled with its own colour', async ({ page }) => {
    await mount(page, `<pdx-chip variant="success" selected>Done</pdx-chip><pdx-chip variant="danger" selected>Failed</pdx-chip>
        <span id="probe-success" style="background: var(--pdx-color-success)"></span><span id="probe-danger" style="background: var(--pdx-color-danger)"></span>`);
    await expect(page.locator('#f [data-part="root"]')).toHaveCount(2);
    const fill = (sel: string) => page.locator(sel).evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(await fill('#f pdx-chip[variant="success"] [data-part="root"]')).toBe(await fill('#probe-success'));
    expect(await fill('#f pdx-chip[variant="danger"] [data-part="root"]')).toBe(await fill('#probe-danger'));
});

test('pdx-chip: disabled is a state; the remove button is a part, and pdx-remove stays on the chip', async ({ page }) => {
    await mount(page, '<pdx-chip removable value="b">Beta</pdx-chip><pdx-chip disabled>Gamma</pdx-chip>');
    await expect(page.locator('#f [data-part="remove"]')).toHaveCount(1);
    const off = page.locator('#f pdx-chip[disabled]');
    expect(await off.evaluate((h) => ({ state: h.matches(':state(disabled)'), opacity: Number(getComputedStyle(h.querySelector('[data-part="root"]')!).opacity) })))
        .toMatchObject({ state: true });
    expect(await off.evaluate((h) => Number(getComputedStyle(h.querySelector('[data-part="root"]')!).opacity))).toBeLessThan(1);
    // The root's own class list is the CSS-only chip's: no state classes written on it.
    expect(await page.locator('#f pdx-chip').evaluateAll((cs) => cs.map((c) => c.querySelector('[data-part="root"]')!.className)))
        .toEqual(['pdx-chip', 'pdx-chip']);

    const removable = page.locator('#f pdx-chip[removable]');
    await removable.evaluate((h) => {
        const log = { own: [] as unknown[], parent: 0 };
        (window as unknown as { __log: typeof log }).__log = log;
        h.addEventListener('pdx-remove', (e) => log.own.push((e as CustomEvent).detail));
        h.parentElement!.addEventListener('pdx-remove', () => { log.parent++; });
    });
    await page.getByRole('button', { name: 'Remove Beta' }).click();
    expect(await page.evaluate(() => (window as unknown as { __log: unknown }).__log)).toEqual({ own: [{ value: 'b', label: '' }], parent: 0 });
    expect(await parts(page, '#f pdx-chip[removable]')).toEqual(['body', 'remove', 'root']);
});
