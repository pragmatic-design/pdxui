// The text fields after pdx-input on the beta contract (#286): pdx-textarea, pdx-password-input,
// pdx-search-input and pdx-masked-input. Each shows its visual states as custom states on the host,
// `:state(name)`, and its frame carries no state class of its own. The A-rules that apply to it hold
// in a browser (docs/language/beta/agents.md):
//   - A1, inside a required pdx-form-field the textbox is aria-required;
//   - A2, inside a field in error it is aria-invalid and described by the message, and a component's
//     own `error` marks it outside a field;
//   - A4, while `loading` the textbox is aria-busy, and the host is not: the busy element is the one
//     that carries the role.
// pdx-input's own spec is input-beta-contract.spec.ts.
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

const ALL_STATES = ['invalid', 'success', 'warning', 'disabled', 'readonly', 'loading', 'over-limit', 'negative', 'positive'];
const STATE_CLASSES = ['error', 'success', 'warning', 'disabled', 'readonly', 'over', 'pdx-number-negative', 'pdx-number-positive'];

/** The first host's custom states, and every state class left on its frame or its counts. */
async function read(page: Page, tag: string): Promise<{ states: string[]; classes: string[] }> {
    return page.locator(`#f ${tag}`).first().evaluate((host, ns) => ({
        states: ns.filter((n) => host.matches(`:state(${n})`)),
        classes: [...host.querySelectorAll('[data-part="root"], [data-part="field"], .pdx-input-count')].flatMap((e) => [...e.classList]),
    }), ALL_STATES);
}

interface Row {
    tag: string;
    /** Each attribute that sets a state, and the state it sets. */
    states: [string, string][];
    /** Markup that renders every part, and the parts it renders. */
    full: string;
    parts: string[];
    ownError: boolean;
    loading: boolean;
}

const ROWS: Row[] = [
    {
        tag: 'pdx-textarea',
        states: [['error', 'invalid'], ['success', 'success'], ['warning', 'warning'], ['disabled', 'disabled'], ['readonly', 'readonly'], ['loading', 'loading']],
        full: '<pdx-textarea show-count word-count value="hi"></pdx-textarea>',
        parts: ['count', 'footer', 'input', 'root', 'word-count'],
        ownError: true,
        loading: true,
    },
    {
        tag: 'pdx-password-input',
        states: [['error', 'invalid'], ['disabled', 'disabled'], ['loading', 'loading']],
        full: '<pdx-password-input show-strength value="abc"></pdx-password-input>',
        parts: ['input', 'root', 'strength', 'toggle'],
        ownError: true,
        loading: true,
    },
    {
        tag: 'pdx-search-input',
        states: [['disabled', 'disabled'], ['loading', 'loading']],
        full: '<pdx-search-input loading value="q"></pdx-search-input><pdx-search-input shortcut="Ctrl+K"></pdx-search-input>',
        parts: ['clear', 'input', 'input', 'prefix', 'prefix', 'root', 'root', 'shortcut', 'spinner'],
        ownError: false,
        loading: true,
    },
    {
        tag: 'pdx-number-input',
        states: [['error', 'invalid'], ['disabled', 'disabled'], ['loading', 'loading']],
        full: '<pdx-number-input allow-negative value="3"></pdx-number-input>',
        parts: ['decrement', 'field', 'increment', 'input', 'root', 'sign'],
        ownError: true,
        loading: true,
    },
    {
        tag: 'pdx-masked-input',
        states: [['error', 'invalid'], ['disabled', 'disabled']],
        full: '<pdx-masked-input mask="phone"></pdx-masked-input>',
        parts: ['input', 'root'],
        ownError: true,
        loading: false,
    },
];

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=text-fields-beta-contract'); });

for (const row of ROWS) {
    test.describe(row.tag, () => {
        test('control — with no attribute it is in none of its states', async ({ page }) => {
            await mount(page, `<${row.tag}></${row.tag}>`);
            expect((await read(page, row.tag)).states).toEqual([]);
        });

        for (const [attr, state] of row.states) {
            test(`${attr} is :state(${state}), and no class on the frame`, async ({ page }) => {
                await mount(page, `<${row.tag} ${attr}></${row.tag}>`);
                const r = await read(page, row.tag);
                expect(r.states).toEqual([state]);
                expect(r.classes.filter((c) => STATE_CLASSES.includes(c))).toEqual([]);
            });
        }

        test('its parts are reached by data-part, and the input part is the textbox', async ({ page }) => {
            await mount(page, row.full);
            const parts = await page.locator('#f [data-part]').evaluateAll((els) => els.map((e) => e.getAttribute('data-part')).sort());
            expect(parts).toEqual(row.parts);
            const tagName = await page.locator(`#f ${row.tag} [data-part="input"]`).first().evaluate((e) => e.tagName);
            expect(['INPUT', 'TEXTAREA']).toContain(tagName);
        });

        test('A1 — inside a required pdx-form-field the textbox is aria-required', async ({ page }) => {
            await mount(page, `<pdx-form-field label="Field" required><${row.tag}></${row.tag}></pdx-form-field>`);
            await expect(page.locator(`#f ${row.tag} [data-part="input"]`)).toHaveAttribute('aria-required', 'true');
        });

        test('A2 — inside a pdx-form-field in error the textbox is aria-invalid and described by the message', async ({ page }) => {
            await mount(page, `<pdx-form-field label="Field" error="Fix this" show-error><${row.tag}></${row.tag}></pdx-form-field>`);
            const box = page.locator(`#f ${row.tag} [data-part="input"]`);
            await expect(box).toHaveAttribute('aria-invalid', 'true');
            await expect(box).toHaveAccessibleDescription('Fix this');
        });

        if (row.ownError) {
            test('A2 — its own error marks the textbox aria-invalid outside a field, and only while set', async ({ page }) => {
                await mount(page, `<${row.tag} error></${row.tag}>`);
                const box = page.locator(`#f ${row.tag} [data-part="input"]`);
                await expect(box).toHaveAttribute('aria-invalid', 'true');
                await page.locator(`#f ${row.tag}`).evaluate((el) => el.removeAttribute('error'));
                await expect(box).not.toHaveAttribute('aria-invalid', 'true');
            });
        }

        if (row.loading) {
            test('A4 — while loading the textbox is aria-busy and the host is not; after, neither', async ({ page }) => {
                await mount(page, `<${row.tag} loading></${row.tag}>`);
                const host = page.locator(`#f ${row.tag}`);
                const box = page.locator(`#f ${row.tag} [data-part="input"]`);
                await expect(box).toHaveAttribute('aria-busy', 'true');
                await expect(host).not.toHaveAttribute('aria-busy', /.*/);
                await host.evaluate((el) => el.removeAttribute('loading'));
                await expect(box).not.toHaveAttribute('aria-busy', 'true');
            });
        }
    });
}

test.describe('the states the CSS draws', () => {
    test('pdx-textarea: error, success and warning colour the frame from :state()', async ({ page }) => {
        await mount(page, `
            <pdx-textarea data-k="plain"></pdx-textarea>
            <pdx-textarea data-k="error" error></pdx-textarea>
            <pdx-textarea data-k="success" success></pdx-textarea>
            <pdx-textarea data-k="warning" warning></pdx-textarea>
            <span data-k="danger" style="color: var(--pdx-color-danger)"></span>
            <span data-k="ok" style="color: var(--pdx-color-success)"></span>
            <span data-k="warn" style="color: var(--pdx-color-warning)"></span>`);
        const c = await page.evaluate(() => {
            const at = (k: string) => document.querySelector(`#f [data-k="${k}"]`)!;
            const frame = (k: string) => getComputedStyle(at(k).querySelector('[data-part="root"]')!).borderTopColor;
            const ink = (k: string) => getComputedStyle(at(k)).color;
            return { plain: frame('plain'), error: frame('error'), success: frame('success'), warning: frame('warning'), danger: ink('danger'), ok: ink('ok'), warn: ink('warn') };
        });
        expect(c.error).toBe(c.danger);
        expect(c.success).toBe(c.ok);
        expect(c.warning).toBe(c.warn);
        expect(c.plain).not.toBe(c.danger);
    });

    test('pdx-textarea past maxlength: :state(over-limit) colours the character count, not the word count', async ({ page }) => {
        await mount(page, `
            <pdx-textarea show-count word-count maxlength="3" value="abcd"></pdx-textarea>
            <span data-k="ink" style="color: var(--pdx-color-danger-ink)"></span>`);
        const r = await page.evaluate(() => {
            const host = document.querySelector('#f pdx-textarea')!;
            const colour = (p: string) => getComputedStyle(host.querySelector(`[data-part="${p}"]`)!).color;
            return { over: host.matches(':state(over-limit)'), count: colour('count'), words: colour('word-count'), ink: getComputedStyle(document.querySelector('#f [data-k="ink"]')!).color };
        });
        expect(r.over).toBe(true);
        expect(r.count).toBe(r.ink);
        expect(r.words).not.toBe(r.ink);
    });

    test('pdx-number-input: disabled dims its field, which is not the host\'s child but the group\'s', async ({ page }) => {
        await mount(page, '<pdx-number-input data-k="on" value="3"></pdx-number-input><pdx-number-input data-k="off" disabled value="3"></pdx-number-input>');
        const opacity = await page.evaluate(() => {
            const field = (k: string) => document.querySelector(`#f [data-k="${k}"] [data-part="field"]`)!;
            return { on: Number(getComputedStyle(field('on')).opacity), off: Number(getComputedStyle(field('off')).opacity) };
        });
        expect(opacity.on).toBe(1);
        expect(opacity.off).toBeLessThan(1);
    });

    test('pdx-number-input: error colours its field from :state(invalid)', async ({ page }) => {
        await mount(page, `
            <pdx-number-input error value="3"></pdx-number-input>
            <span data-k="danger" style="color: var(--pdx-color-danger)"></span>`);
        const r = await page.evaluate(() => ({
            border: getComputedStyle(document.querySelector('#f pdx-number-input [data-part="field"]')!).borderTopColor,
            danger: getComputedStyle(document.querySelector('#f [data-k="danger"]')!).color,
        }));
        expect(r.border).toBe(r.danger);
    });

    test('pdx-number-input with color-by-sign: the sign is :state(negative) or :state(positive), and colours the number', async ({ page }) => {
        await mount(page, `
            <pdx-number-input data-k="neg" color-by-sign allow-negative value="-4"></pdx-number-input>
            <pdx-number-input data-k="pos" color-by-sign value="4"></pdx-number-input>
            <pdx-number-input data-k="zero" color-by-sign value="0"></pdx-number-input>
            <span data-k="bad" style="color: var(--pdx-color-danger-ink)"></span>
            <span data-k="good" style="color: var(--pdx-color-success-ink)"></span>`);
        const r = await page.evaluate(() => {
            const at = (k: string) => document.querySelector(`#f [data-k="${k}"]`)!;
            const states = (k: string) => ['negative', 'positive'].filter((s) => at(k).matches(`:state(${s})`));
            const ink = (k: string) => getComputedStyle(at(k).querySelector('[data-part="field"]') ?? at(k)).color;
            return {
                neg: states('neg'), pos: states('pos'), zero: states('zero'),
                negInk: ink('neg'), posInk: ink('pos'), bad: ink('bad'), good: ink('good'),
            };
        });
        expect(r.neg).toEqual(['negative']);
        expect(r.pos).toEqual(['positive']);
        expect(r.zero).toEqual([]);
        expect(r.negInk).toBe(r.bad);
        expect(r.posInk).toBe(r.good);
    });

    test('pdx-number-input: its name is on the host, which submits the number unformatted', async ({ page }) => {
        await mount(page, '<form id="nf"><pdx-number-input name="qty" value="12345"></pdx-number-input></form>');
        const host = page.locator('#f pdx-number-input');
        await expect(host).toHaveAttribute('name', 'qty');
        const entries = await page.evaluate(() => new FormData(document.getElementById('nf') as HTMLFormElement).getAll('qty').map(String));
        expect(entries).toEqual(['12345']);
        await host.evaluate((el) => { (el as unknown as { name: string }).name = ''; });
        await expect(host).not.toHaveAttribute('name', /.*/);
    });

    test('pdx-masked-input: a complete date out of range is :state(invalid) and drawn in danger', async ({ page }) => {
        await mount(page, `
            <pdx-masked-input mask="date" value="13452020"></pdx-masked-input>
            <span data-k="danger" style="color: var(--pdx-color-danger)"></span>`);
        const r = await page.evaluate(() => {
            const host = document.querySelector('#f pdx-masked-input')!;
            return {
                invalid: host.matches(':state(invalid)'),
                border: getComputedStyle(host.querySelector('[data-part="root"]')!).borderTopColor,
                danger: getComputedStyle(document.querySelector('#f [data-k="danger"]')!).color,
            };
        });
        expect(r.invalid).toBe(true);
        expect(r.border).toBe(r.danger);
    });

    test('pdx-masked-input: its name is on the host, which submits the unmasked value', async ({ page }) => {
        await mount(page, '<form id="mf"><pdx-masked-input mask="phone" name="tel" value="5551234567"></pdx-masked-input></form>');
        const host = page.locator('#f pdx-masked-input');
        await expect(host).toHaveAttribute('name', 'tel');
        const entries = await page.evaluate(() => new FormData(document.getElementById('mf') as HTMLFormElement).getAll('tel').map(String));
        expect(entries).toEqual(['5551234567']);
        await host.evaluate((el) => { (el as unknown as { name: string }).name = ''; });
        await expect(host).not.toHaveAttribute('name', /.*/);
    });
});
