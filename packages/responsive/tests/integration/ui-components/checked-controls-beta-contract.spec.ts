// pdx-checkbox, pdx-radio and pdx-switch on the beta contract (#286): their visual states are custom
// states on the host, their inner elements carry no state class, they declare their parts, a form
// submits them the native way, and the A-rules hold in a browser.
//   - The native control keeps the `root` part #664 gave it (the size variants key by it); the label
//     and the description are parts of their own.
//   - pdx-switch's own `error` marked nothing aria-invalid, and its `loading` nothing aria-busy.
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

/** The states the first `sel` inside #f matches, of `names`. */
const statesOf = (page: Page, sel: string, names: string[]) =>
    page.locator(`#f ${sel}`).first().evaluate((h, ns) => ns.filter((n) => h.matches(`:state(${n})`)), names);

/** Every class inside the first `sel`, its own included. */
const classesIn = (page: Page, sel: string) =>
    page.locator(`#f ${sel}`).first().evaluate((h) => [...h.querySelectorAll('*')].flatMap((e) => [...e.classList]));

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=checked-controls-beta-contract'); });

const CONTROLS = [
    { tag: 'pdx-checkbox', role: 'checkbox', errorClass: 'pdx-checkbox-error' },
    { tag: 'pdx-radio', role: 'radio', errorClass: 'pdx-radio-error' },
    { tag: 'pdx-switch', role: 'switch', errorClass: 'pdx-toggle-error' },
] as const;

for (const c of CONTROLS) {
    test.describe(c.tag, () => {
        test('checked, invalid and disabled are custom states on the host; no inner element carries a state class', async ({ page }) => {
            await mount(page, `
                <${c.tag} data-k="on" label="A" checked error disabled></${c.tag}>
                <${c.tag} data-k="off" label="B"></${c.tag}>`);
            expect(await statesOf(page, '[data-k="on"]', ['checked', 'invalid', 'disabled'])).toEqual(['checked', 'invalid', 'disabled']);
            expect(await statesOf(page, '[data-k="off"]', ['checked', 'invalid', 'disabled'])).toEqual([]);
            const classes = await classesIn(page, '[data-k="on"]');
            expect(classes).not.toContain(c.errorClass);
            expect(classes).not.toContain('disabled');
        });

        test('its parts: the native control (root), the label and the description', async ({ page }) => {
            await mount(page, `<${c.tag} label="Terms" description="Read them first"></${c.tag}>`);
            await expect(page.locator(`#f [data-part="root"]`)).toHaveAttribute('type', /checkbox|radio/);
            await expect(page.locator('#f [data-part="label"]')).toHaveText('Terms');
            await expect(page.locator('#f [data-part="description"]')).toHaveText('Read them first');
        });

        test('the design CSS draws invalid and disabled from the host', async ({ page }) => {
            await mount(page, `
                <${c.tag} data-k="plain" label="A"></${c.tag}>
                <${c.tag} data-k="error" label="B" error></${c.tag}>
                <${c.tag} data-k="off" label="C" disabled></${c.tag}>`);
            const box = (k: string) => page.locator(`#f [data-k="${k}"] [data-part="root"]`).evaluate((e) => {
                const s = getComputedStyle(e);
                return `${s.borderTopColor}|${s.backgroundColor}`;
            });
            expect(await box('error')).not.toBe(await box('plain'));
            const opacity = (k: string) => page.locator(`#f [data-k="${k}"] label`).evaluate((e) => Number(getComputedStyle(e).opacity));
            expect(await opacity('off')).toBeLessThan(1);
            expect(await opacity('plain')).toBe(1);
        });

        test('A2 — its own error marks the control aria-invalid, and the mark goes with it', async ({ page }) => {
            await mount(page, `<${c.tag} label="Terms" error></${c.tag}>`);
            const control = page.getByRole(c.role, { name: 'Terms' });
            await expect(control).toHaveAttribute('aria-invalid', 'true');
            await page.locator(`#f ${c.tag}`).evaluate((el) => el.removeAttribute('error'));
            await expect(control).not.toHaveAttribute('aria-invalid', /.*/);
        });

        test('a form submits it the native way: its value (or on) when checked, nothing when not', async ({ page }) => {
            await mount(page, `<form>
                <${c.tag} name="a" value="yes" label="A" checked></${c.tag}>
                <${c.tag} name="b" label="B" checked></${c.tag}>
                <${c.tag} name="c" value="no" label="C"></${c.tag}>
            </form>`);
            const entries = await page.evaluate(() => [...new FormData(document.querySelector('#f form') as HTMLFormElement).entries()].map(([k, v]) => `${k}=${v}`));
            expect(entries).toEqual(['a=yes', 'b=on']);
        });
    });
}

test.describe('pdx-checkbox', () => {
    test('indeterminate is a custom state, and the box is aria-checked="mixed"', async ({ page }) => {
        await mount(page, '<pdx-checkbox label="All"></pdx-checkbox>');
        await page.locator('#f pdx-checkbox').evaluate((el) => { (el as unknown as { indeterminate: boolean }).indeterminate = true; });
        await expect(page.getByRole('checkbox', { name: 'All' })).toHaveAttribute('aria-checked', 'mixed');
        expect(await statesOf(page, 'pdx-checkbox', ['indeterminate'])).toEqual(['indeterminate']);
    });

    test('A1 — inside a required pdx-form-field the box is aria-required, and axe allows it', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Consent" required><pdx-checkbox label="I agree"></pdx-checkbox></pdx-form-field>');
        await expect(page.getByRole('checkbox')).toHaveAttribute('aria-required', 'true');
        expect(await axe(page)).toEqual([]);
    });

    test('A2 — inside a pdx-form-field in error the box is aria-invalid and described by the message', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Consent" error="Agree to continue" show-error><pdx-checkbox label="I agree"></pdx-checkbox></pdx-form-field>');
        const box = page.getByRole('checkbox');
        await expect(box).toHaveAttribute('aria-invalid', 'true');
        await expect(box).toHaveAccessibleDescription('Agree to continue');
        expect(await axe(page)).toEqual([]);
    });
});

test.describe('pdx-switch', () => {
    test('loading is a custom state; the switch is aria-busy while loading and not otherwise', async ({ page }) => {
        await mount(page, '<pdx-switch label="Sync" loading></pdx-switch>');
        const sw = page.getByRole('switch', { name: 'Sync' });
        await expect(sw).toHaveAttribute('aria-busy', 'true');
        expect(await statesOf(page, 'pdx-switch', ['loading'])).toEqual(['loading']);
        await page.locator('#f pdx-switch').evaluate((el) => el.removeAttribute('loading'));
        await expect(sw).not.toHaveAttribute('aria-busy', /.*/);
        expect(await statesOf(page, 'pdx-switch', ['loading'])).toEqual([]);
    });

    test('the design CSS draws loading from the host: the thumb spins, and the switch is dimmed', async ({ page }) => {
        await mount(page, `
            <pdx-switch data-k="plain" label="A"></pdx-switch>
            <pdx-switch data-k="busy" label="B" loading></pdx-switch>`);
        const spin = (k: string) => page.locator(`#f [data-k="${k}"] [data-part="root"]`).evaluate((e) => getComputedStyle(e, '::before').animationName);
        expect(await spin('busy')).toBe('pdx-input-spin');
        expect(await spin('plain')).toBe('none');
        const opacity = (k: string) => page.locator(`#f [data-k="${k}"] label`).evaluate((e) => Number(getComputedStyle(e).opacity));
        expect(await opacity('busy')).toBeLessThan(1);
    });
});
