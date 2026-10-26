// pdx-toggle on the beta contract (#286): pressed and disabled are custom states on the host, its
// button is the root part and carries no state or variant class, `variant` is an axis reflected on
// the host, a form submits it the native way, and the A-rules hold in a browser.
//   - The pressed look keys by the button's aria-pressed, which native markup has too.
//   - Inside a pdx-form-field its button is the control: a button may carry neither aria-required nor
//     aria-invalid, so it is named by the label and its own text, and described by the message.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

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

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=toggle-beta-contract'); });

test('pressed and disabled are custom states on the host; the button carries no state class', async ({ page }) => {
    await mount(page, `
        <pdx-toggle data-k="on" pressed disabled>Bold</pdx-toggle>
        <pdx-toggle data-k="off">Italic</pdx-toggle>`);
    expect(await statesOf(page, '[data-k="on"]', ['pressed', 'disabled'])).toEqual(['pressed', 'disabled']);
    expect(await statesOf(page, '[data-k="off"]', ['pressed', 'disabled'])).toEqual([]);
    const classes = await page.locator('#f [data-k="on"] [data-part="root"]').evaluate((e) => [...e.classList]);
    expect(classes).not.toContain('pdx-toggle-on');
});

test('its button is the root part, and variant is reflected on the host with no class on the button', async ({ page }) => {
    await mount(page, `
        <pdx-toggle data-k="d">A</pdx-toggle>
        <pdx-toggle data-k="g" variant="ghost">B</pdx-toggle>`);
    await expect(page.locator('#f [data-k="d"]')).toHaveAttribute('variant', 'outline');
    const btn = page.locator('#f [data-k="g"] [data-part="root"]');
    await expect(btn).toHaveRole('button');
    expect(await btn.evaluate((e) => [...e.classList])).not.toContain('pdx-ghost');
});

test('the design CSS draws each variant pressed from the host\'s axis and the button\'s aria-pressed', async ({ page }) => {
    await mount(page, `
        <pdx-toggle data-k="o0">O</pdx-toggle><pdx-toggle data-k="o1" pressed>O</pdx-toggle>
        <pdx-toggle data-k="g0" variant="ghost">G</pdx-toggle><pdx-toggle data-k="g1" variant="ghost" pressed>G</pdx-toggle>
        <pdx-toggle data-k="s0" variant="solid">S</pdx-toggle><pdx-toggle data-k="s1" variant="solid" pressed>S</pdx-toggle>
        <span data-k="primary" style="color: var(--pdx-color-primary)"></span>
        <span data-k="ink" style="color: var(--pdx-color-primary-ink)"></span>
        <span data-k="border" style="color: var(--pdx-color-border)"></span>`);
    const s = await page.evaluate(() => {
        const btn = (k: string) => getComputedStyle(document.querySelector(`#f [data-k="${k}"] [data-part="root"]`)!);
        const tok = (k: string) => getComputedStyle(document.querySelector(`#f [data-k="${k}"]`)!).color;
        return {
            o0Border: btn('o0').borderTopColor, o1Border: btn('o1').borderTopColor,
            g0Color: btn('g0').color, g1Color: btn('g1').color,
            s0Bg: btn('s0').backgroundColor, s1Bg: btn('s1').backgroundColor,
            primary: tok('primary'), ink: tok('ink'), border: tok('border'),
        };
    });
    expect(s.o0Border).toBe(s.border);
    expect(s.o1Border).toBe(s.primary);
    expect(s.g1Color).toBe(s.ink);
    expect(s.g0Color).not.toBe(s.ink);
    expect(s.s1Bg).toBe(s.primary);
    expect(s.s0Bg).not.toBe(s.primary);
});

test('a form submits it the native way: its value (or on) when pressed, nothing when not', async ({ page }) => {
    await mount(page, `<form>
        <pdx-toggle name="a" value="bold" pressed>B</pdx-toggle>
        <pdx-toggle name="b" pressed>I</pdx-toggle>
        <pdx-toggle name="c" value="u">U</pdx-toggle>
    </form>`);
    const entries = await page.evaluate(() => [...new FormData(document.querySelector('#f form') as HTMLFormElement).entries()].map(([k, v]) => `${k}=${v}`));
    expect(entries).toEqual(['a=bold', 'b=on']);
});

test('A1 — inside a required pdx-form-field the button is named by the label and its text, and axe allows it', async ({ page }) => {
    await mount(page, '<pdx-form-field label="Alerts" required><pdx-toggle>On</pdx-toggle></pdx-form-field>');
    const btn = page.locator('#f pdx-toggle [data-part="root"]');
    await expect(btn).toHaveAccessibleName(/^Alerts\b.*On/);
    await expect(btn).not.toHaveAttribute('aria-required', /.*/);
    expect(await axe(page)).toEqual([]);
});

test('A2 — inside a pdx-form-field in error the button is described by the message, and axe allows it', async ({ page }) => {
    await mount(page, '<pdx-form-field label="Alerts" error="Turn them on" show-error><pdx-toggle>On</pdx-toggle></pdx-form-field>');
    const btn = page.locator('#f pdx-toggle [data-part="root"]');
    await expect(btn).toHaveAccessibleDescription('Turn them on');
    await expect(btn).not.toHaveAttribute('aria-invalid', /.*/);
    expect(await axe(page)).toEqual([]);
});
