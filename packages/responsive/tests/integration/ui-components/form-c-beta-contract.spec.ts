// The form family's third batch on the beta contract (#293): pdx-fieldset, pdx-form and pdx-auto-form.
// Their conditions are states of the host and the design CSS draws them from there; their pieces are
// parts; a fieldset in error is described by its message (A2). Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const frames = (page: Page, n = 3) => page.evaluate((count) => new Promise((r) => {
    let left = count;
    const tick = () => (--left <= 0 ? r(null) : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
}), n);

type Form = {
    validate(): Promise<boolean>;
    handleSubmit(fn: () => Promise<void>): (e: Event) => Promise<void>;
    email: { onChange(v: unknown): void };
};
type Gotcha = { load(m: string): Promise<void>; createForm(cfg: unknown): Form; required(): unknown };
type Win = { __gotcha: Gotcha; __f: Form; __events: unknown[]; __settle: () => void };

/** A fresh <div id="f"> holding `html`, with the components it names loaded. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as Win).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    await frames(page);
}

/** The element's own parts, not those of a component nested in it. */
const ownParts = (page: Page, sel: string) => page.locator(sel).evaluate((h) => [...new Set([...h.querySelectorAll('[data-part]')]
    .filter((e) => { let p = e.parentElement; while (p && !p.tagName.includes('-')) p = p.parentElement; return p === h; })
    .map((e) => e.getAttribute('data-part')))].sort());

const matches = (page: Page, sel: string, state: string) => page.locator(sel).evaluate((h, s) => h.matches(`:state(${s})`), state);

/** Records the events named on `sel` in `window.__events`, as `[name, detail]`. */
const listen = (page: Page, sel: string, names: string[]) => page.locator(sel).evaluate((h, ns) => {
    (window as unknown as Win).__events = [];
    for (const n of ns) h.addEventListener(n, (e) => (window as unknown as Win).__events.push([n, (e as CustomEvent).detail]));
}, names);
const events = (page: Page) => page.evaluate(() => (window as unknown as Win).__events);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=form-b-beta-contract'); });

test.describe('pdx-fieldset', () => {
    test('invalid, collapsible and disabled are states, drawn from there; its fieldset keeps its base class; its pieces are parts', async ({ page }) => {
        await mount(page, '<pdx-fieldset id="a" legend="Payment" description="Card details" collapsible invalid disabled><input aria-label="Card"></pdx-fieldset>'
            + '<pdx-fieldset id="b" legend="Contact"><input aria-label="Email"></pdx-fieldset>');
        for (const s of ['invalid', 'collapsible', 'disabled']) expect(await matches(page, '#a', s), s).toBe(true);
        expect(await matches(page, '#b', 'invalid')).toBe(false);
        const root = page.locator('#a [data-part="root"]');
        expect(await root.getAttribute('class')).toBe('pdx-fieldset');
        const border = (sel: string) => page.locator(sel).evaluate((r) => getComputedStyle(r).borderTopColor);
        expect(await border('#a [data-part="root"]')).not.toBe(await border('#b [data-part="root"]'));
        expect(await page.locator('#a [data-part="legend"]').evaluate((l) => getComputedStyle(l).cursor)).toBe('pointer');
        expect(await ownParts(page, '#a')).toEqual(['content', 'description', 'error', 'legend', 'root', 'toggle']);
    });

    test('collapsed is a model: the toggle writes it and announces collapsed-change, never `toggle`; the parent\'s write announces nothing', async ({ page }) => {
        await mount(page, '<pdx-fieldset id="c" legend="Advanced" collapsible><input aria-label="Timeout"></pdx-fieldset>');
        await listen(page, '#c', ['collapsed-change', 'toggle']);
        await page.locator('#c [data-part="toggle"]').click();
        await frames(page);
        expect(await page.locator('#c').evaluate((h) => (h as unknown as { collapsed: boolean }).collapsed)).toBe(true);
        expect(await matches(page, '#c', 'collapsed')).toBe(true);
        await expect(page.locator('#c [data-part="content"]')).toBeHidden();
        await expect(page.locator('#c [data-part="toggle"]')).toHaveAttribute('aria-expanded', 'false');
        expect(await events(page)).toEqual([['collapsed-change', { value: true }]]);

        await page.locator('#c').evaluate((h) => { (h as unknown as { collapsed: boolean }).collapsed = false; });
        await frames(page);
        await expect(page.locator('#c [data-part="content"]')).toBeVisible();
        expect(await matches(page, '#c', 'collapsed')).toBe(false);
        expect(await events(page)).toHaveLength(1);
    });

    test('A2: a fieldset in error has its message as its description', async ({ page }) => {
        await mount(page, '<pdx-fieldset id="e" legend="Payment" error="Please fill all required fields."><input aria-label="Card"></pdx-fieldset>');
        const group = page.getByRole('group', { name: 'Payment' });
        await expect(group).toHaveAccessibleDescription('Please fill all required fields.');
        await expect(page.locator('#e [data-part="error"]')).toHaveText('Please fill all required fields.');
        // The message gone, the description goes with it.
        await page.locator('#e').evaluate((h) => { (h as unknown as { error: string }).error = ''; });
        await frames(page);
        await expect(group).toHaveAccessibleDescription('');
    });
});

test.describe('pdx-form', () => {
    const FORM = '<pdx-form id="form" aria-label="Contact"><pdx-form-field name="email" label="Email"><input></pdx-form-field>'
        + '<button type="submit">Save</button></pdx-form>';

    async function giveForm(page: Page): Promise<void> {
        await page.evaluate(() => {
            const w = window as unknown as Win;
            w.__f = w.__gotcha.createForm({ initialValues: { email: '' }, validators: { email: [w.__gotcha.required()] } });
            (document.getElementById('form') as unknown as { form: unknown }).form = w.__f;
        });
        await frames(page, 4);
    }

    test('dirty, valid, invalid and submitting are states of the host; its <form> is its root part', async ({ page }) => {
        await mount(page, FORM);
        await giveForm(page);
        const state = async () => Object.fromEntries(await Promise.all(['dirty', 'valid', 'invalid', 'submitting']
            .map(async (s) => [s, await matches(page, '#form', s)] as const)));
        // `valid` is the form's `valid()`: no error among the validations run so far, none yet.
        expect(await state()).toEqual({ dirty: false, valid: true, invalid: false, submitting: false });

        // A refused submit: the form is invalid until its error is fixed.
        await page.getByRole('button', { name: 'Save' }).click();
        await frames(page, 4);
        expect(await state()).toEqual({ dirty: false, valid: false, invalid: true, submitting: false });
        await page.evaluate(() => (window as unknown as Win).__f.email.onChange('ada@example.com'));
        await frames(page);
        expect(await state()).toEqual({ dirty: true, valid: true, invalid: false, submitting: false });

        // A submit that runs.
        await page.evaluate(() => {
            const w = window as unknown as Win;
            void w.__f.handleSubmit(() => new Promise<void>((r) => { w.__settle = r; }))(new Event('submit'));
        });
        await expect.poll(() => matches(page, '#form', 'submitting')).toBe(true);
        await page.evaluate(() => (window as unknown as Win).__settle());
        await expect.poll(() => matches(page, '#form', 'submitting')).toBe(false);

        expect(await ownParts(page, '#form')).toEqual(['root']);
        expect(await page.locator('#form > [data-part="root"]').evaluate((r) => r.tagName)).toBe('FORM');
    });

    test('pdx-submit carries the values, and stays on the host', async ({ page }) => {
        await mount(page, FORM);
        await giveForm(page);
        await page.evaluate(() => (window as unknown as Win).__f.email.onChange('ada@example.com'));
        await page.evaluate(() => {
            const w = window as unknown as Win;
            w.__events = [];
            document.getElementById('f')!.addEventListener('pdx-submit', () => w.__events.push('bubbled'));
            document.getElementById('form')!.addEventListener('pdx-submit', (e) => w.__events.push((e as CustomEvent).detail));
        });
        await page.getByRole('button', { name: 'Save' }).click();
        await expect.poll(() => events(page)).toEqual([{ values: { email: 'ada@example.com' } }]);
    });
});

test.describe('pdx-auto-form', () => {
    test('its wrapper, its actions bar and its two buttons are parts; Save announces pdx-submit with the values', async ({ page }) => {
        await mount(page, '<pdx-auto-form id="a"></pdx-auto-form>');
        await page.locator('#a').evaluate((h) => {
            (h as unknown as { fields: unknown }).fields = [{ field: 'name', label: 'Name' }];
        });
        await expect(page.locator('#a [data-part="submit"]')).toBeVisible();
        expect(await ownParts(page, '#a')).toEqual(['actions', 'reset', 'root', 'submit']);
        await listen(page, '#a', ['pdx-submit']);
        await page.locator('#a').evaluate((h) => { (h as unknown as { form: { name: { onChange(v: string): void } } }).form.name.onChange('Ada'); });
        await page.locator('#a [data-part="submit"] button').click();
        await expect.poll(() => events(page)).toEqual([['pdx-submit', { values: { name: 'Ada' }, valid: true }]]);
    });
});
