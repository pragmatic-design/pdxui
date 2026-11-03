// The form family's second batch on the beta contract (#293): pdx-form-field, pdx-field-group and
// pdx-field-list. Their conditions are states of the host and the design CSS draws them from there; their
// pieces are parts. A1 and A2 are asserted per component (docs/language/beta/agents.md). Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const frames = (page: Page, n = 3) => page.evaluate((count) => new Promise((r) => {
    let left = count;
    const tick = () => (--left <= 0 ? r(null) : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
}), n);

type Gotcha = {
    load(m: string): Promise<void>;
    createForm(cfg: unknown): { validate(): Promise<boolean> };
    required(): unknown;
};

/** A fresh <div id="f"> holding `html`, with the components it names loaded. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: Gotcha }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    await frames(page);
}

/** Hands `#form` (a pdx-form in the markup) a form with these values and required fields, kept as `window.__f`. */
async function giveForm(page: Page, initialValues: unknown, requiredFields: string[]): Promise<void> {
    await page.evaluate(([values, names]) => {
        const g = (window as unknown as { __gotcha: Gotcha }).__gotcha;
        const validators = Object.fromEntries((names as string[]).map((n) => [n, [g.required()]]));
        const form = g.createForm({ initialValues: values, validators });
        (window as unknown as { __f: unknown }).__f = form;
        (document.getElementById('form') as unknown as { form: unknown }).form = form;
    }, [initialValues, requiredFields] as const);
    await frames(page, 4);
}

const validate = (page: Page) => page.evaluate(() => (window as unknown as { __f: { validate(): Promise<boolean> } }).__f.validate());

/** The element's own parts, not those of a component nested in it. */
const ownParts = (page: Page, sel: string) => page.locator(sel).evaluate((h) => [...new Set([...h.querySelectorAll('[data-part]')]
    .filter((e) => { let p = e.parentElement; while (p && !p.tagName.includes('-')) p = p.parentElement; return p === h; })
    .map((e) => e.getAttribute('data-part')))].sort());

const matches = (page: Page, sel: string, state: string) => page.locator(sel).evaluate((h, s) => h.matches(`:state(${s})`), state);
const marker = (page: Page, sel: string) => page.locator(sel).evaluate((l) => getComputedStyle(l, '::after').content);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=form-b-beta-contract'); });

test.describe('pdx-form-field', () => {
    test('required, horizontal and disabled are states, drawn from there; the wrapper and its label keep their base classes', async ({ page }) => {
        await mount(page, '<pdx-form-field id="a" label="Email" hint="Work address" required horizontal disabled><input></pdx-form-field>'
            + '<pdx-form-field id="b" label="Phone" optional><input></pdx-form-field>');
        for (const s of ['required', 'horizontal', 'disabled']) expect(await matches(page, '#a', s), s).toBe(true);
        expect(await matches(page, '#a', 'invalid')).toBe(false);
        expect(await matches(page, '#b', 'optional')).toBe(true);
        const root = page.locator('#a [data-part="root"]');
        expect(await root.getAttribute('class')).toBe('pdx-form-field');
        expect(await page.locator('#a [data-part="label"]').getAttribute('class')).toBe('pdx-field-label');
        expect(await root.evaluate((r) => getComputedStyle(r).flexDirection)).toBe('row');
        expect(Number(await root.evaluate((r) => getComputedStyle(r).opacity))).toBeLessThan(1);
        expect(await marker(page, '#a [data-part="label"]')).toContain('*');
        expect(await marker(page, '#b [data-part="label"]')).toContain('optional');
        expect(await ownParts(page, '#a')).toEqual(['control', 'hint', 'label', 'root']);
    });

    test('the message it shows is a state, one at a time: invalid over warning over success', async ({ page }) => {
        await mount(page, '<pdx-form-field id="e" label="Email" error="Enter a valid email." warning="Unusual domain" show-error><input></pdx-form-field>'
            + '<pdx-form-field id="w" label="Email" warning="Unusual domain"><pdx-input></pdx-input></pdx-form-field>'
            + '<pdx-form-field id="s" label="Email" success="Looks good"><input></pdx-form-field>'
            + '<pdx-form-field id="n" label="Email"><pdx-input></pdx-input></pdx-form-field>');
        expect([await matches(page, '#e', 'invalid'), await matches(page, '#e', 'warning')]).toEqual([true, false]);
        expect([await matches(page, '#w', 'warning'), await matches(page, '#w', 'success')]).toEqual([true, false]);
        expect(await matches(page, '#s', 'success')).toBe(true);
        expect(await ownParts(page, '#e')).toEqual(['control', 'error', 'label', 'root']);
        expect(await ownParts(page, '#w')).toEqual(['control', 'label', 'root', 'warning']);
        expect(await ownParts(page, '#s')).toEqual(['control', 'label', 'root', 'success']);
        // The label of a field in error turns to the danger ink, from the state.
        const color = (sel: string) => page.locator(sel).evaluate((l) => getComputedStyle(l).color);
        expect(await color('#e [data-part="label"]')).not.toBe(await color('#n [data-part="label"]'));
        // A field with a warning draws its control's border in the warning colour.
        expect(await page.locator('#w .pdx-input-wrap').evaluate((i) => getComputedStyle(i).borderTopColor))
            .not.toBe(await page.locator('#n .pdx-input-wrap').evaluate((i) => getComputedStyle(i).borderTopColor));
    });

    test('A1: required by its prop or by its form, the control is aria-required and the label shows the marker; turned off, aria-required stays', async ({ page }) => {
        await mount(page, '<pdx-form id="form" aria-label="Contact">'
            + '<pdx-form-field id="byForm" name="email" label="Email"><input></pdx-form-field>'
            + '<pdx-form-field id="byProp" label="Name" required><input></pdx-form-field>'
            + '<pdx-form-field id="neither" name="phone" label="Phone"><input></pdx-form-field></pdx-form>');
        await giveForm(page, { email: '', phone: '' }, ['email']);
        for (const id of ['byForm', 'byProp']) {
            await expect(page.locator(`#${id} input`), id).toHaveAttribute('aria-required', 'true');
            expect(await matches(page, `#${id}`, 'required'), id).toBe(true);
            expect(await marker(page, `#${id} [data-part="label"]`), id).toContain('*');
        }
        await expect(page.locator('#neither input')).not.toHaveAttribute('aria-required', /.*/);
        expect(await matches(page, '#neither', 'required')).toBe(false);

        await page.locator('#form').evaluate((f) => (f as HTMLElement).style.setProperty('--pdx-field-required-marker', 'none'));
        for (const id of ['byForm', 'byProp']) {
            expect(await marker(page, `#${id} [data-part="label"]`), id).not.toContain('*');
            await expect(page.locator(`#${id} input`), id).toHaveAttribute('aria-required', 'true');
        }
    });

    test('A2: in error, the control is aria-invalid and its accessible description is the message shown', async ({ page }) => {
        await mount(page, '<pdx-form-field id="e" label="Email" hint="Work address" error="Enter a valid email." show-error><input></pdx-form-field>');
        const input = page.locator('#e input');
        await expect(input).toHaveAttribute('aria-invalid', 'true');
        const shown = await page.locator('#e [data-part="error"]').textContent();
        expect(shown?.trim()).toBe('Enter a valid email.');
        await expect(input).toHaveAccessibleDescription('Enter a valid email.');
    });
});

test.describe('pdx-form, through its fields', () => {
    test('a failed submit focuses the first control in error, found by what its field marks', async ({ page }) => {
        await mount(page, '<pdx-form id="form" aria-label="Contact">'
            + '<pdx-form-field name="name" label="Name"><input></pdx-form-field>'
            + '<pdx-form-field id="mail" name="email" label="Email"><input></pdx-form-field>'
            + '<button type="submit">Save</button></pdx-form>');
        await giveForm(page, { name: 'Ada', email: '' }, ['email']);
        await page.getByRole('button', { name: 'Save' }).click();
        await expect(page.locator('#mail input')).toBeFocused();
    });
});

test.describe('pdx-field-group', () => {
    test('a panel\'s collapsed is a model and a state: the click writes it and announces it, the parent\'s write does not', async ({ page }) => {
        await mount(page, '<pdx-field-group id="g" label="Address" display="panel" collapsed><input aria-label="Street"></pdx-field-group>');
        const g = page.locator('#g');
        expect(await matches(page, '#g', 'collapsed')).toBe(true);
        const root = page.locator('#g [data-part="root"]');
        expect(await root.getAttribute('class')).toBe('pdx-field-group pdx-field-group-panel');
        // Collapsed, the panel is its legend line: no block padding, drawn from the state.
        expect(await root.evaluate((r) => getComputedStyle(r).paddingTop)).toBe('0px');
        await expect(page.locator('#g [data-part="content"]')).toBeHidden();

        await g.evaluate((h) => {
            (window as unknown as { __events: unknown[] }).__events = [];
            h.addEventListener('collapsed-change', (e) => (window as unknown as { __events: unknown[] }).__events.push((e as CustomEvent).detail));
        });
        await page.locator('#g [data-part="toggle"]').click();
        await frames(page);
        expect(await g.evaluate((h) => (h as unknown as { collapsed: boolean }).collapsed)).toBe(false);
        expect(await matches(page, '#g', 'collapsed')).toBe(false);
        await expect(page.locator('#g [data-part="content"]')).toBeVisible();
        expect(await page.evaluate(() => (window as unknown as { __events: unknown[] }).__events)).toEqual([{ value: false }]);

        // The parent's write collapses it again, and announces nothing.
        await g.evaluate((h) => { (h as unknown as { collapsed: boolean }).collapsed = true; });
        await frames(page);
        await expect(page.locator('#g [data-part="content"]')).toBeHidden();
        await expect(page.locator('#g [data-part="toggle"]')).toHaveAttribute('aria-expanded', 'false');
        expect(await page.evaluate(() => (window as unknown as { __events: unknown[] }).__events)).toHaveLength(1);
        expect(await ownParts(page, '#g')).toEqual(['content', 'legend', 'root', 'toggle']);
    });

    test('each display mode has its parts, and the inline and dialog ones are never collapsed', async ({ page }) => {
        await mount(page, '<pdx-field-group id="i" label="Customer" collapsed><input aria-label="Name"></pdx-field-group>'
            + '<pdx-field-group id="d" label="Customer" display="dialog"><input aria-label="Name"></pdx-field-group>');
        expect(await ownParts(page, '#i')).toEqual(['content', 'legend', 'root']);
        expect(await matches(page, '#i', 'collapsed')).toBe(false);
        const border = (sel: string) => page.locator(sel).evaluate((r) => getComputedStyle(r).borderTopStyle);
        expect(await border('#i [data-part="root"]')).toBe('solid');
        expect(await border('#d [data-part="root"]')).toBe('none');
        expect(await ownParts(page, '#d')).toEqual(['root', 'trigger']);
    });

    test('A2 through its fields: a field at the group\'s path in error is aria-invalid and described by its message', async ({ page }) => {
        await mount(page, '<pdx-form id="form" aria-label="Order"><pdx-field-group name="customer" label="Customer">'
            + '<pdx-form-field id="ff" name="email" label="Email"><input></pdx-form-field></pdx-field-group></pdx-form>');
        await giveForm(page, { customer: { email: '' } }, ['customer.email']);
        await validate(page);
        await frames(page);
        const input = page.locator('#ff input');
        await expect(input).toHaveAttribute('aria-invalid', 'true');
        const shown = (await page.locator('#ff [data-part="error"]').textContent())?.trim();
        expect(shown).toBeTruthy();
        await expect(input).toHaveAccessibleDescription(shown!);
    });
});

test.describe('pdx-field-list', () => {
    const LIST = '<pdx-form id="form" aria-label="Order"></pdx-form><pdx-field-list name="items" label="Items"></pdx-field-list>';

    /** The form first, then the list inside it: the list counts the form's rows when it is set up. */
    async function giveList(page: Page, rows: unknown[]): Promise<void> {
        await giveForm(page, { items: rows }, []);
        await page.evaluate(() => {
            const l = document.querySelector('pdx-field-list') as HTMLElement & { itemFields: unknown };
            l.remove();
            l.id = 'l';
            l.itemFields = [{ name: 'product', label: 'Product', required: true }, { name: 'qty', label: 'Quantity', type: 'number' }];
            document.querySelector('#form form')!.appendChild(l);
        });
        await frames(page, 6);
    }

    test('its pieces are parts; with no rows it is empty, a state', async ({ page }) => {
        await mount(page, LIST);
        await giveList(page, []);
        expect(await matches(page, '#l', 'empty')).toBe(true);
        expect(await ownParts(page, '#l')).toEqual(['add', 'empty', 'header', 'label', 'root', 'rows']);
        await page.locator('#l [data-part="add"]').first().click();
        await frames(page, 4);
        expect(await matches(page, '#l', 'empty')).toBe(false);
        expect(await ownParts(page, '#l')).toEqual(['actions', 'add', 'cell', 'columns', 'footer', 'header', 'label', 'root', 'row', 'rows']);
    });

    test('A1 and A2 in its cells: a required cell is aria-required, named by its column, and in error described by its message', async ({ page }) => {
        await mount(page, LIST);
        await giveList(page, [{ product: '', qty: 1 }]);
        const cell = page.getByRole('textbox', { name: 'Product', exact: true });
        await expect(cell).toHaveAttribute('aria-required', 'true');
        await validate(page);
        await frames(page, 4);
        await expect(cell).toHaveAttribute('aria-invalid', 'true');
        const shown = (await page.locator('#l [data-part="cell"] [data-part="error"]').first().textContent())?.trim();
        expect(shown).toBeTruthy();
        await expect(cell).toHaveAccessibleDescription(shown!);
    });
});
