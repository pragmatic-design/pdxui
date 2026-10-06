// A form control submits its value once.
//
// There are three candidate submitters where there should be one: the form-associated HOST
// (ElementInternals.setFormValue), the named inner native control or hidden input in its light DOM,
// and — for radios — the host of a radio the browser has unchecked, which fires no event. When more
// than one submits, a <form> receives a value two or more times — `i = init, init` for a pdx-input,
// `y = q, p, q, q` for a radio group after two clicks.
//
// It needs a real browser: happy-dom has no ElementInternals, so a unit test sees only the inner
// inputs and cannot count the duplicate. Every assertion is `toEqual([...])`, never `contains`:
// "contains the chosen value" is exactly what a duplicated or stale list also satisfies.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

async function open(page: Page): Promise<void> {
    // An unknown case: the page removes every section and leaves a blank body, with the whole
    // library registered.
    await openPage(page, '/gotchas.html?case=form-value-once');
}

/** Put `html` in a fresh <form id="f"> and wait for its components to build. */
async function form(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        // The page registers only what a case builds; this markup is the spec's own.
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('form');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function submitted(page: Page, name: string, formId = 'f'): Promise<string[]> {
    return page.evaluate(([n, id]) => new FormData(document.getElementById(id) as HTMLFormElement).getAll(n).map(String), [name, formId]);
}

test.beforeEach(async ({ page }) => { await open(page); });

test.describe('text controls: the typed text, once', () => {
    for (const tag of ['pdx-input', 'pdx-password-input', 'pdx-search-input']) {
        test(tag, async ({ page }) => {
            await form(page, `<${tag} name="t"></${tag}>`);
            await page.locator(`#f ${tag} input`).first().fill('typed');
            expect(await submitted(page, 't')).toEqual(['typed']);
        });
    }

    test('pdx-textarea', async ({ page }) => {
        await form(page, '<pdx-textarea name="t"></pdx-textarea>');
        await page.locator('#f pdx-textarea textarea').fill('two lines');
        expect(await submitted(page, 't')).toEqual(['two lines']);
    });

    test('pdx-input with a value it was given and never touched', async ({ page }) => {
        await form(page, '<pdx-input name="t" value="init"></pdx-input>');
        expect(await submitted(page, 't')).toEqual(['init']);
    });

    test('pdx-masked-input submits the unmasked value, not the formatted text', async ({ page }) => {
        await form(page, '<pdx-masked-input name="t" mask="phone"></pdx-masked-input>');
        await page.locator('#f pdx-masked-input input').pressSequentially('5551234567');
        expect(await submitted(page, 't')).toEqual(['5551234567']);
    });

    test('pdx-number-input submits the number, not the formatted text', async ({ page }) => {
        await form(page, '<pdx-number-input name="t" max="100000"></pdx-number-input>');
        const input = page.locator('#f pdx-number-input input');
        await input.fill('12345');
        await input.press('Tab');
        expect(await submitted(page, 't')).toEqual(['12345']);
    });

    test('pdx-autocomplete', async ({ page }) => {
        await form(page, '<pdx-autocomplete name="t"></pdx-autocomplete>');
        await page.locator('#f pdx-autocomplete input:not([type="hidden"])').fill('Rome');
        expect(await submitted(page, 't')).toEqual(['Rome']);
    });

    test('pdx-mention submits its markup once', async ({ page }) => {
        await form(page, '<pdx-mention name="t"></pdx-mention>');
        await page.locator('#f pdx-mention textarea').fill('hello');
        expect(await submitted(page, 't')).toEqual(['hello']);
    });
});

test.describe('choice controls', () => {
    test('pdx-checkbox submits its value once when checked, nothing when not', async ({ page }) => {
        await form(page, '<pdx-checkbox name="c" value="yes" label="C"></pdx-checkbox>');
        expect(await submitted(page, 'c')).toEqual([]);
        await page.locator('#f pdx-checkbox label').click();
        expect(await submitted(page, 'c')).toEqual(['yes']);
    });

    test('pdx-switch', async ({ page }) => {
        await form(page, '<pdx-switch name="s" value="on" label="S"></pdx-switch>');
        await page.locator('#f pdx-switch label').click();
        expect(await submitted(page, 's')).toEqual(['on']);
    });

    test('pdx-segmented', async ({ page }) => {
        await form(page, `<pdx-segmented name="s" options='["Day","Week"]' value="Day"></pdx-segmented>`);
        await page.locator('#f .pdx-segmented-item').nth(1).click();
        expect(await submitted(page, 's')).toEqual(['Week']);
    });

    test('pdx-rating', async ({ page }) => {
        await form(page, '<pdx-rating name="r" value="2"></pdx-rating>');
        await page.locator('#f .pdx-rating').focus();
        await page.keyboard.press('ArrowRight');
        expect(await submitted(page, 'r')).toEqual(['3']);
    });

    test('pdx-tag-input', async ({ page }) => {
        await form(page, '<pdx-tag-input name="t"></pdx-tag-input>');
        const input = page.locator('#f pdx-tag-input input:not([type="hidden"])');
        await input.fill('urgent');
        await input.press('Enter');
        expect(await submitted(page, 't')).toEqual(['["urgent"]']);
    });
});

test.describe('a name given as a property', () => {
    // A parent binding `:name="field"` sets the PROPERTY, and a form-associated element is in the
    // form under its name ATTRIBUTE. With the host as the one submitter, an unreflected property
    // would drop the field.
    for (const [tag, act, expected] of [
        ['pdx-masked-input', 'type', '5551234567'],
        ['pdx-checkbox', 'click', 'on'],
    ] as const) {
        test(tag, async ({ page }) => {
            await form(page, `<${tag} label="L" ${tag === 'pdx-masked-input' ? 'mask="phone"' : ''}></${tag}>`);
            await page.locator(`#f ${tag}`).evaluate((el) => { (el as HTMLElement & { name: string }).name = 'bound'; });
            if (act === 'type') await page.locator(`#f ${tag} input`).pressSequentially('5551234567');
            else await page.locator(`#f ${tag} label`).click();
            expect(await submitted(page, 'bound')).toEqual([expected]);
        });
    }
});

test.describe('value pickers', () => {
    test('pdx-slider', async ({ page }) => {
        await form(page, '<pdx-slider name="s" value="10" min="0" max="100"></pdx-slider>');
        await page.locator('#f pdx-slider [role="slider"]').first().focus();
        await page.keyboard.press('ArrowRight');
        expect(await submitted(page, 's')).toEqual(['11']);
    });

    test('pdx-color-picker', async ({ page }) => {
        await form(page, '<pdx-color-picker name="c" value="#ff0000" inline></pdx-color-picker>');
        const hex = page.locator('#f .pdx-color-hex-input');
        await hex.fill('#00ff00');
        await hex.dispatchEvent('change');
        expect(await submitted(page, 'c')).toEqual(['#00ff00']);
    });
});

test.describe('radios', () => {
    test('two standalone radios: the last one chosen, alone', async ({ page }) => {
        await form(page, `
            <pdx-radio name="x" value="a" label="A"></pdx-radio>
            <pdx-radio name="x" value="b" label="B"></pdx-radio>`);
        await page.locator('#f pdx-radio[value="a"] label').click();
        await page.locator('#f pdx-radio[value="b"] label').click();
        expect(await submitted(page, 'x')).toEqual(['b']);
        // The unchecked radio's own state follows the browser's, not its last click.
        expect(await page.locator('#f pdx-radio[value="a"]').evaluate((r) => (r as HTMLElement & { checked: boolean }).checked)).toBe(false);
    });

    test('a radio checked from code unchecks the one the user chose', async ({ page }) => {
        await form(page, `
            <pdx-radio name="x" value="a" label="A"></pdx-radio>
            <pdx-radio name="x" value="b" label="B"></pdx-radio>`);
        await page.locator('#f pdx-radio[value="a"] label').click();
        await page.locator('#f pdx-radio[value="b"]').evaluate((r) => { (r as HTMLElement & { checked: boolean }).checked = true; });
        expect(await submitted(page, 'x')).toEqual(['b']);
    });

    test('a radio group submits the group value, once', async ({ page }) => {
        await form(page, `
            <pdx-radio-group name="y">
                <pdx-radio value="p" label="P"></pdx-radio>
                <pdx-radio value="q" label="Q"></pdx-radio>
            </pdx-radio-group>`);
        await page.locator('#f pdx-radio[value="p"] label').click();
        await page.locator('#f pdx-radio[value="q"] label').click();
        expect(await submitted(page, 'y')).toEqual(['q']);
    });

    test('two forms with the same radio name do not uncheck each other', async ({ page }) => {
        await page.evaluate(async () => {
            await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load('<pdx-radio>');
            for (const id of ['f1', 'f2']) {
                const f = document.createElement('form');
                f.id = id;
                f.innerHTML = `<pdx-radio name="x" value="${id}-a" label="A"></pdx-radio><pdx-radio name="x" value="${id}-b" label="B"></pdx-radio>`;
                document.body.appendChild(f);
            }
        });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await page.locator('#f1 pdx-radio[value="f1-a"] label').click();
        await page.locator('#f2 pdx-radio[value="f2-b"] label').click();
        expect(await submitted(page, 'x', 'f1')).toEqual(['f1-a']);
        expect(await submitted(page, 'x', 'f2')).toEqual(['f2-b']);
    });

    test('the radio group keeps its keyboard: Tab to the checked radio, arrows move and check', async ({ page }) => {
        await form(page, `
            <pdx-radio-group name="k" value="q">
                <pdx-radio value="p" label="P"></pdx-radio>
                <pdx-radio value="q" label="Q"></pdx-radio>
                <pdx-radio value="r" label="R"></pdx-radio>
            </pdx-radio-group>`);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => (document.activeElement as HTMLInputElement).value)).toBe('q');
        await page.keyboard.press('ArrowDown');
        expect(await page.evaluate(() => (document.activeElement as HTMLInputElement).value)).toBe('r');
        expect(await submitted(page, 'k')).toEqual(['r']);
    });
});
