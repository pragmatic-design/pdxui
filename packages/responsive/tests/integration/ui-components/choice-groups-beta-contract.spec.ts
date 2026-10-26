// pdx-radio-group and pdx-checkbox-group on the beta contract (#286): their states are custom states
// on the host, their role and ARIA are host bindings, `orientation` is a variant axis reflected on the
// host (no `horizontal` class), a form submits and resets them, and the A-rules hold in a browser.
//   - A radiogroup takes aria-invalid itself in a field (#708). A checkbox group is a `group`, which
//     may carry neither aria-invalid nor aria-required: its boxes carry the error, the group is described
//     by the message, and the label's marker says it is required.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait for its components to render. */
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

/** axe's violations inside #f, with the axe runner's tags. */
async function axe(page: Page): Promise<string[]> {
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .include('#f')
        .disableRules(['color-contrast'])
        .analyze();
    return results.violations.map((v) => `${v.id} (${v.nodes.length})`);
}

const statesOf = (page: Page, sel: string, names: string[]) =>
    page.locator(`#f ${sel}`).first().evaluate((h, ns) => ns.filter((n) => h.matches(`:state(${n})`)), names);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=choice-groups-beta-contract'); });

// `aria-orientation` is allowed on a radiogroup, not on a group (axe's aria-allowed-attr).
const GROUPS = [
    { tag: 'pdx-radio-group', item: 'pdx-radio', role: 'radiogroup', orientation: true },
    { tag: 'pdx-checkbox-group', item: 'pdx-checkbox', role: 'group', orientation: false },
] as const;

for (const g of GROUPS) {
    const items = (extra = '') => `<${g.item} value="a" label="Alpha"${extra}></${g.item}><${g.item} value="b" label="Beta"${extra}></${g.item}>`;

    test.describe(g.tag, () => {
        test('invalid and disabled are custom states on the host', async ({ page }) => {
            await mount(page, `
                <${g.tag} data-k="on" label="Pick" error disabled>${items()}</${g.tag}>
                <${g.tag} data-k="off" label="Pick">${items()}</${g.tag}>`);
            expect(await statesOf(page, '[data-k="on"]', ['invalid', 'disabled'])).toEqual(['invalid', 'disabled']);
            expect(await statesOf(page, '[data-k="off"]', ['invalid', 'disabled'])).toEqual([]);
        });

        test('its role and ARIA follow its props, and orientation is reflected with no class', async ({ page }) => {
            await mount(page, `<${g.tag} label="Pick" orientation="horizontal" disabled>${items()}</${g.tag}>`);
            const group = page.getByRole(g.role, { name: 'Pick' });
            if (g.orientation) await expect(group).toHaveAttribute('aria-orientation', 'horizontal');
            else await expect(group).not.toHaveAttribute('aria-orientation', /.*/);
            await expect(group).toHaveAttribute('aria-disabled', 'true');
            await expect(group).toHaveAttribute('orientation', 'horizontal');
            expect(await group.evaluate((e) => [...e.classList])).not.toContain('horizontal');
            await group.evaluate((e) => { e.removeAttribute('disabled'); (e as unknown as { orientation: string }).orientation = 'vertical'; });
            if (g.orientation) await expect(group).toHaveAttribute('aria-orientation', 'vertical');
            await expect(group).toHaveAttribute('orientation', 'vertical');
            await expect(group).not.toHaveAttribute('aria-disabled', /.*/);
            expect(await axe(page)).toEqual([]);
        });

        test('the design CSS lays the items out by orientation: a column, or a row', async ({ page }) => {
            await mount(page, `
                <${g.tag} data-k="v" label="V">${items()}</${g.tag}>
                <${g.tag} data-k="h" label="H" orientation="horizontal">${items()}</${g.tag}>`);
            const rects = (k: string) => page.locator(`#f [data-k="${k}"] ${g.item}`).evaluateAll((els) => els.map((e) => {
                const r = e.getBoundingClientRect();
                return { left: r.left, top: r.top, bottom: r.bottom, right: r.right };
            }));
            const [v1, v2] = await rects('v');
            expect(v2.top).toBeGreaterThanOrEqual(v1.bottom);
            const [h1, h2] = await rects('h');
            expect(h2.left).toBeGreaterThanOrEqual(h1.right);
            expect(Math.abs(h2.top - h1.top)).toBeLessThanOrEqual(1);
        });

        test('its own error marks every item aria-invalid, and the mark goes with it', async ({ page }) => {
            await mount(page, `<${g.tag} label="Pick" error>${items()}</${g.tag}>`);
            const marks = () => page.locator(`#f ${g.item} [data-part="root"]`).evaluateAll((els) => els.map((e) => e.getAttribute('aria-invalid')));
            await expect.poll(marks).toEqual(['true', 'true']);
            await page.locator(`#f ${g.tag}`).evaluate((e) => e.removeAttribute('error'));
            await expect.poll(marks).toEqual([null, null]);
        });
    });
}

test('a form submits the radio group\'s choice and resets it', async ({ page }) => {
    await mount(page, '<form><pdx-radio-group name="size" label="Size" value="a"><pdx-radio value="a" label="A"></pdx-radio><pdx-radio value="b" label="B"></pdx-radio></pdx-radio-group></form>');
    const read = () => page.evaluate(() => [...new FormData(document.querySelector('#f form') as HTMLFormElement).entries()].map(([k, v]) => `${k}=${v}`));
    await expect.poll(read).toEqual(['size=a']);
    await page.getByRole('radio', { name: 'B' }).check();
    await expect.poll(read).toEqual(['size=b']);
    await page.evaluate(() => (document.querySelector('#f form') as HTMLFormElement).reset());
    await expect.poll(read).toEqual(['size=a']);
});

test('a form submits one entry per checked box of the checkbox group, and resets it', async ({ page }) => {
    await mount(page, '<form><pdx-checkbox-group name="tags" label="Tags" value="a"><pdx-checkbox value="a" label="A"></pdx-checkbox><pdx-checkbox value="b" label="B"></pdx-checkbox></pdx-checkbox-group></form>');
    const read = () => page.evaluate(() => [...new FormData(document.querySelector('#f form') as HTMLFormElement).entries()].map(([k, v]) => `${k}=${v}`));
    await expect.poll(read).toEqual(['tags=a']);
    await page.getByRole('checkbox', { name: 'B' }).check();
    await expect.poll(read).toEqual(['tags=a', 'tags=b']);
    await page.evaluate(() => (document.querySelector('#f form') as HTMLFormElement).reset());
    await expect.poll(read).toEqual(['tags=a']);
});

test('A1 — a checkbox group in a required pdx-form-field is named by the label, and axe allows it', async ({ page }) => {
    await mount(page, '<pdx-form-field label="Tags" required><pdx-checkbox-group><pdx-checkbox value="a" label="A"></pdx-checkbox></pdx-checkbox-group></pdx-form-field>');
    // A group may not carry aria-required: the label's marker says it.
    const group = page.getByRole('group', { name: 'Tags' });
    await expect(group).toHaveCount(1);
    await expect(group).not.toHaveAttribute('aria-required', /.*/);
    expect(await axe(page)).toEqual([]);
});

test('A2 — a checkbox group in a pdx-form-field in error: its boxes are aria-invalid, the group is described by the message', async ({ page }) => {
    await mount(page, '<pdx-form-field label="Tags" error="Pick one" show-error><pdx-checkbox-group><pdx-checkbox value="a" label="A"></pdx-checkbox><pdx-checkbox value="b" label="B"></pdx-checkbox></pdx-checkbox-group></pdx-form-field>');
    await expect(page.getByRole('group', { name: 'Tags' })).toHaveAccessibleDescription('Pick one');
    await expect.poll(() => page.locator('#f pdx-checkbox [data-part="root"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-invalid')))).toEqual(['true', 'true']);
    expect(await axe(page)).toEqual([]);
});
