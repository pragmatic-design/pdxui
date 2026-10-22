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

    // It submits its model (#135): for a picked suggestion its value, the code, not the label shown;
    // free text is the model once committed, and is submitted before that too — a submit button
    // clicked right after typing comes before the commit the blur schedules.
    test('pdx-autocomplete: free text, as typed', async ({ page }) => {
        await form(page, '<pdx-autocomplete name="t"></pdx-autocomplete>');
        await page.locator('#f pdx-autocomplete input:not([type="hidden"])').fill('Rome');
        expect(await submitted(page, 't')).toEqual(['Rome']);
    });

    test('pdx-autocomplete: a picked suggestion submits its value, not its label', async ({ page }) => {
        await form(page, `<pdx-autocomplete name="t" suggestions='[{"label":"Italy","value":"IT"},{"label":"France","value":"FR"}]'></pdx-autocomplete>`);
        await page.locator('#f pdx-autocomplete input:not([type="hidden"])').fill('Ita');
        await page.getByRole('option', { name: 'Italy' }).click();
        expect(await submitted(page, 't')).toEqual(['IT']);
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

    test('pdx-tag-input: one entry per tag, as a native multi-select (#135)', async ({ page }) => {
        await form(page, '<pdx-tag-input name="t"></pdx-tag-input>');
        const input = page.locator('#f pdx-tag-input input:not([type="hidden"])');
        await input.fill('urgent');
        await input.press('Enter');
        await input.fill('later');
        await input.press('Enter');
        expect(await submitted(page, 't')).toEqual(['urgent', 'later']);
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

// The value components declare their model `{ form }` (#135): what the form submits follows the
// model, and `form.reset()` writes back the value each one mounted with. Before, a reset left
// every one of these as it was.
test.describe('the form model: a reset gives back the value each control mounted with', () => {
    // [markup, the model's name, a value written to it, submitted at mount, submitted after the write]
    const CASES: [string, string, unknown, string[], string[]][] = [
        ['<pdx-checkbox name="n" value="yes" label="C"></pdx-checkbox>', 'checked', true, [], ['yes']],
        ['<pdx-switch name="n" value="yes" label="S"></pdx-switch>', 'checked', true, [], ['yes']],
        ['<pdx-toggle name="n" value="bold">B</pdx-toggle>', 'pressed', true, [], ['bold']],
        ['<pdx-radio name="n" value="a" label="A"></pdx-radio>', 'checked', true, [], ['a']],
        ['<pdx-tag-input name="n"></pdx-tag-input>', 'value', ['a', 'b'], [], ['a', 'b']],
        ['<pdx-autocomplete name="n" value="IT"></pdx-autocomplete>', 'value', 'FR', ['IT'], ['FR']],
        ['<pdx-rating name="n" value="2"></pdx-rating>', 'value', 4, ['2'], ['4']],
        ['<pdx-pin-input name="n" value="1234"></pdx-pin-input>', 'value', '9876', ['1234'], ['9876']],
        ['<pdx-otp-input name="n" value="123456"></pdx-otp-input>', 'value', '654321', ['123456'], ['654321']],
        ['<pdx-masked-input name="n" mask="phone" value="5551234567"></pdx-masked-input>', 'value', '5559876543', ['5551234567'], ['5559876543']],
        ['<pdx-color-picker name="n" value="#ff0000"></pdx-color-picker>', 'value', '#00ff00', ['#ff0000'], ['#00ff00']],
        ['<pdx-checkbox-group name="n" value="a"><pdx-checkbox value="a" label="A"></pdx-checkbox><pdx-checkbox value="b" label="B"></pdx-checkbox></pdx-checkbox-group>', 'value', 'a,b', ['a'], ['a', 'b']],
        ['<pdx-number-input name="n" value="5"></pdx-number-input>', 'value', 7, ['5'], ['7']],
        ['<pdx-slider name="n" value="10"></pdx-slider>', 'value', 30, ['10'], ['30']],
        ['<pdx-radio-group name="n" value="p"><pdx-radio value="p" label="P"></pdx-radio><pdx-radio value="q" label="Q"></pdx-radio></pdx-radio-group>', 'value', 'q', ['p'], ['q']],
        [`<pdx-segmented name="n" options='["Day","Week"]' value="Day"></pdx-segmented>`, 'value', 'Week', ['Day'], ['Week']],
        ['<pdx-mention name="n" value="hello"></pdx-mention>', 'value', 'goodbye', ['hello'], ['goodbye']],
    ];

    for (const [markup, model, next, atMount, afterWrite] of CASES) {
        const tag = markup.match(/^<([a-z-]+)/)![1];
        test(tag, async ({ page }) => {
            await form(page, markup);
            const host = page.locator(`#f > ${tag}`);
            const modelValue = () => host.evaluate((el, m) => (el as unknown as Record<string, unknown>)[m], model);
            const mounted = await modelValue();
            expect(await submitted(page, 'n'), 'as mounted').toEqual(atMount);
            await host.evaluate((el, [m, v]) => { (el as unknown as Record<string, unknown>)[m as string] = v; }, [model, next] as const);
            await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
            expect(await submitted(page, 'n'), 'after the model is written').toEqual(afterWrite);
            await page.evaluate(() => (document.getElementById('f') as HTMLFormElement).reset());
            await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
            expect(await submitted(page, 'n'), 'after form.reset()').toEqual(atMount);
            expect(await modelValue(), 'the model is back too').toEqual(mounted);
        });
    }
});

// The rest of the library (#135, part 3): the pickers that submitted through a hidden input of their
// own, and the editors that did not take part at all. Each submits its model once — the host, no
// hidden input beside it — and a reset gives the mounted value back.
test.describe('the form model, the rest of the library: once, and reset', () => {
    const OPTS = `options='[{"label":"Italy","value":"it"},{"label":"France","value":"fr"}]'`;
    const TREE = `options='[{"value":"fruit","label":"Fruit","children":[{"value":"apple","label":"Apple"},{"value":"pear","label":"Pear"}]}]'`;
    const PATHS = `options='[{"value":"it","label":"Italy","children":[{"value":"lz","label":"Lazio"}]},{"value":"fr","label":"France","children":[{"value":"idf","label":"Ile-de-France"}]}]'`;
    const ITEMS = `items='[{"value":"a","label":"A"},{"value":"b","label":"B"},{"value":"c","label":"C"}]'`;
    // [markup, a value written to the model, submitted at mount, submitted after the write]
    const CASES: [string, unknown, string[], string[]][] = [
        [`<pdx-select name="n" ${OPTS} value="it"></pdx-select>`, 'fr', ['it'], ['fr']],
        [`<pdx-select name="n" ${OPTS} multiple value="it"></pdx-select>`, ['it', 'fr'], ['it'], ['it', 'fr']],
        ['<pdx-date-picker name="n" value="2026-01-15"></pdx-date-picker>', '2026-02-01', ['2026-01-15'], ['2026-02-01']],
        ['<pdx-date-picker name="n" mode="daterange"></pdx-date-picker>', ['2026-01-01', '2026-01-31'], [''], ['2026-01-01', '2026-01-31']],
        ['<pdx-time-picker name="n" value="09:30"></pdx-time-picker>', '14:00', ['09:30'], ['14:00']],
        [`<pdx-cascader name="n" ${PATHS} value='["it","lz"]'></pdx-cascader>`, ['fr', 'idf'], ['it', 'lz'], ['fr', 'idf']],
        [`<pdx-tree-select name="n" ${TREE} value="apple"></pdx-tree-select>`, 'pear', ['apple'], ['pear']],
        [`<pdx-tree-select name="n" ${TREE} multiple value='["apple"]'></pdx-tree-select>`, ['apple', 'pear'], ['apple'], ['apple', 'pear']],
        ['<pdx-inline-edit name="n" type="text" value="Jane"></pdx-inline-edit>', 'Joan', ['Jane'], ['Joan']],
        [`<pdx-transfer name="n" ${ITEMS} value='["a"]'></pdx-transfer>`, ['a', 'c'], ['a'], ['a', 'c']],
        [`<pdx-json-editor name="n" value='{"a":1}'></pdx-json-editor>`, { a: 2 }, ['{"a":1}'], ['{"a":2}']],
    ];

    for (const [markup, next, atMount, afterWrite] of CASES) {
        const tag = markup.match(/^<([a-z-]+)/)![1];
        const variant = /\bmultiple\b|daterange/.test(markup) ? ' (several values)' : '';
        test(tag + variant, async ({ page }) => {
            await form(page, markup);
            const host = page.locator(`#f > ${tag}`);
            const modelValue = () => host.evaluate((el) => (el as unknown as { value: unknown }).value);
            const mounted = await modelValue();
            expect(await submitted(page, 'n'), 'as mounted, once').toEqual(atMount);
            await host.evaluate((el, v) => { (el as unknown as { value: unknown }).value = v; }, next);
            await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
            expect(await submitted(page, 'n'), 'after the model is written').toEqual(afterWrite);
            await page.evaluate(() => (document.getElementById('f') as HTMLFormElement).reset());
            await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
            expect(await submitted(page, 'n'), 'after form.reset()').toEqual(atMount);
            expect(await modelValue(), 'the model is back too').toEqual(mounted);
        });
    }

    test('pdx-select with nothing chosen submits an empty entry, as a native select with an empty placeholder', async ({ page }) => {
        await form(page, `<pdx-select name="n" ${OPTS}></pdx-select>`);
        expect(await submitted(page, 'n')).toEqual(['']);
    });

    test('pdx-inline-edit submits a number as its string and an object as JSON', async ({ page }) => {
        await form(page, '<pdx-inline-edit name="n" type="number"></pdx-inline-edit>');
        const host = page.locator('#f > pdx-inline-edit');
        expect(await submitted(page, 'n')).toEqual([]);
        await host.evaluate((el) => { (el as unknown as { value: unknown }).value = 42; });
        expect(await submitted(page, 'n')).toEqual(['42']);
        await host.evaluate((el) => { (el as unknown as { value: unknown }).value = { x: 1 }; });
        expect(await submitted(page, 'n')).toEqual(['{"x":1}']);
    });

    test('pdx-rich-text submits its document as JSON', async ({ page }) => {
        await form(page, '<pdx-rich-text name="n"></pdx-rich-text>');
        const host = page.locator('#f > pdx-rich-text');
        const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] };
        await host.evaluate((el, d) => { (el as unknown as { value: unknown }).value = d; }, doc);
        await expect.poll(() => submitted(page, 'n')).toHaveLength(1);
        const [json] = await submitted(page, 'n');
        expect(JSON.parse(json), 'the model, as JSON').toEqual(await host.evaluate((el) => (el as unknown as { value: unknown }).value));
    });

    test('pdx-file-upload submits the files it holds, a dropped one too, and a reset empties it', async ({ page }) => {
        // Before #135 the files came from the inner input alone: a dropped file was never submitted.
        await form(page, '<pdx-file-upload name="cv" multiple></pdx-file-upload>');
        await page.locator('#f pdx-file-upload input[type="file"]').setInputFiles({ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') });
        // A file dropped on the zone reaches the model, not the inner input.
        await page.locator('#f > pdx-file-upload').evaluate((el) => {
            const host = el as unknown as { value: File[] };
            host.value = [...host.value, new File(['y'], 'photo.png', { type: 'image/png' })];
        });
        const names = () => page.evaluate(() => new FormData(document.getElementById('f') as HTMLFormElement)
            .getAll('cv').map((v) => (v as File).name));
        expect(await names()).toEqual(['cv.pdf', 'photo.png']);
        await page.evaluate(() => (document.getElementById('f') as HTMLFormElement).reset());
        // Empty, it sends what an empty native file input sends: one file with no name.
        expect(await names()).toEqual(['']);
    });
});

// The issue's acceptance test: a form of library controls gives the FormData a native form with the
// same controls would, a reset restores them, and a required empty one makes the form invalid.
test.describe('acceptance (#135): library controls in a native form', () => {
    const LIBRARY = `
        <pdx-input name="title" value="Report"></pdx-input>
        <pdx-select name="country" options='[{"label":"Italy","value":"it"},{"label":"France","value":"fr"}]' value="fr"></pdx-select>
        <pdx-checkbox name="agree" label="Agree" checked></pdx-checkbox>
        <pdx-checkbox name="news" label="News" value="yes"></pdx-checkbox>
        <pdx-tag-input name="tags"></pdx-tag-input>
        <pdx-file-upload name="cv"></pdx-file-upload>`;
    const NATIVE = `
        <input name="title" value="Report">
        <select name="country"><option value="it">Italy</option><option value="fr" selected>France</option></select>
        <input type="checkbox" name="agree" checked>
        <input type="checkbox" name="news" value="yes">
        <select name="tags" multiple><option value="urgent">urgent</option><option value="later">later</option></select>
        <input type="file" name="cv">`;

    const entries = (page: Page, id: string) => page.evaluate((formId) =>
        [...new FormData(document.getElementById(formId) as HTMLFormElement).entries()]
            .map(([k, v]) => `${k}=${typeof v === 'string' ? v : (v as File).name}`), id);

    test('the FormData a native form gives, a reset, and a required empty control', async ({ page }) => {
        await form(page, LIBRARY);
        await page.evaluate((markup) => {
            const n = document.createElement('form');
            n.id = 'native';
            n.innerHTML = markup;
            document.body.appendChild(n);
        }, NATIVE);

        expect(await entries(page, 'f'), 'as mounted').toEqual(await entries(page, 'native'));

        // The same edits on both: two tags, one file.
        const tags = page.locator('#f pdx-tag-input input:not([type="hidden"])');
        for (const t of ['urgent', 'later']) { await tags.fill(t); await tags.press('Enter'); }
        await page.locator('#native select[name="tags"]').selectOption(['urgent', 'later']);
        const file = { name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') };
        await page.locator('#f pdx-file-upload input[type="file"]').setInputFiles(file);
        await page.locator('#native input[type="file"]').setInputFiles(file);
        expect(await entries(page, 'f'), 'after the edits').toEqual(await entries(page, 'native'));

        for (const id of ['f', 'native']) await page.evaluate((i) => (document.getElementById(i) as HTMLFormElement).reset(), id);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        expect(await entries(page, 'f'), 'after form.reset()').toEqual(await entries(page, 'native'));

        const valid = () => page.evaluate(() => (document.getElementById('f') as HTMLFormElement).checkValidity());
        expect(await valid()).toBe(true);
        await page.locator('#f > pdx-input').evaluate((el) => el.setAttribute('required', ''));
        await page.locator('#f > pdx-input input').fill('');
        expect(await valid(), 'a required pdx-input left empty').toBe(false);
    });
    // A .pdx component with `@model value: string { form }`, compiled and submitted, is
    // packages/showcase/tests/form-model.spec.ts.

    // The text fields submit through their inner native field, which keeps the name for autofill and
    // password managers. A reset puts the field back to the value the component mounted with — read
    // in the same task as the reset, before any frame.
    for (const [tag, field] of [['pdx-input', 'input'], ['pdx-password-input', 'input'], ['pdx-search-input', 'input'], ['pdx-textarea', 'textarea']] as const) {
        test(`${tag}: a reset gives back the mounted text, at once, and the model with it`, async ({ page }) => {
            await form(page, `<${tag} name="t" value="init"></${tag}>`);
            await page.locator(`#f ${tag} ${field}`).fill('typed');
            const afterReset = await page.evaluate(() => {
                const f = document.getElementById('f') as HTMLFormElement;
                f.reset();
                return new FormData(f).getAll('t');
            });
            expect(afterReset).toEqual(['init']);
            await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
            expect(await page.locator(`#f > ${tag}`).evaluate((el) => (el as unknown as { value: unknown }).value)).toBe('init');
            expect(await page.locator(`#f ${tag} ${field}`).inputValue()).toBe('init');
        });
    }
});

test.describe('the form model: a group owns its children', () => {
    // A child resetting itself after its group, to the unchecked state it mounted with, would undo
    // the group: the boxes and radios show what the group's value says.
    const checkedOf = (page: Page) => page.evaluate(() => [...document.querySelectorAll('#f pdx-checkbox, #f pdx-radio')]
        .map((el) => `${el.getAttribute('value')}:${(el as HTMLElement & { checked: boolean }).checked}`));

    test('pdx-checkbox-group', async ({ page }) => {
        await form(page, '<pdx-checkbox-group name="g" value="a"><pdx-checkbox value="a" label="A"></pdx-checkbox><pdx-checkbox value="b" label="B"></pdx-checkbox></pdx-checkbox-group>');
        await page.locator('#f pdx-checkbox[value="b"] label').click();
        await page.locator('#f pdx-checkbox[value="a"] label').click();
        expect(await checkedOf(page)).toEqual(['a:false', 'b:true']);
        await page.evaluate(() => (document.getElementById('f') as HTMLFormElement).reset());
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        expect(await submitted(page, 'g')).toEqual(['a']);
        expect(await checkedOf(page)).toEqual(['a:true', 'b:false']);
    });

    test('pdx-radio-group', async ({ page }) => {
        await form(page, '<pdx-radio-group name="r" value="p"><pdx-radio value="p" label="P"></pdx-radio><pdx-radio value="q" label="Q"></pdx-radio></pdx-radio-group>');
        await page.locator('#f pdx-radio[value="q"] label').click();
        expect(await checkedOf(page)).toEqual(['p:false', 'q:true']);
        await page.evaluate(() => (document.getElementById('f') as HTMLFormElement).reset());
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        expect(await submitted(page, 'r')).toEqual(['p']);
        expect(await checkedOf(page)).toEqual(['p:true', 'q:false']);
    });
});

test.describe('the form model: what is submitted, entry by entry (#135)', () => {
    test('pdx-checkbox-group: one entry per checked box, not one JSON entry', async ({ page }) => {
        await form(page, '<pdx-checkbox-group name="g"><pdx-checkbox value="a" label="A"></pdx-checkbox><pdx-checkbox value="b" label="B"></pdx-checkbox></pdx-checkbox-group>');
        await page.locator('#f pdx-checkbox[value="a"] label').click();
        await page.locator('#f pdx-checkbox[value="b"] label').click();
        expect(await submitted(page, 'g')).toEqual(['a', 'b']);
    });

    test('pdx-slider in range mode: two entries, the low and the high', async ({ page }) => {
        await form(page, '<pdx-slider name="s" range value="20,80"></pdx-slider>');
        expect(await submitted(page, 's')).toEqual(['20', '80']);
    });

    test('pdx-number-input submits the value clamped into its range, not the raw one', async ({ page }) => {
        await form(page, '<pdx-number-input name="t" value="500" max="100"></pdx-number-input>');
        expect(await submitted(page, 't')).toEqual(['100']);
    });

    for (const tag of ['pdx-pin-input', 'pdx-otp-input']) {
        test(`an empty ${tag} submits an empty entry, as a native text input does`, async ({ page }) => {
            await form(page, `<${tag} name="p"></${tag}>`);
            expect(await submitted(page, 'p')).toEqual(['']);
        });
    }

    test('pdx-radio-group and pdx-segmented with no choice submit nothing, as a native radio group', async ({ page }) => {
        await form(page, `
            <pdx-radio-group name="r"><pdx-radio value="p" label="P"></pdx-radio></pdx-radio-group>
            <pdx-segmented name="s" options='["Day","Week"]'></pdx-segmented>`);
        expect(await submitted(page, 'r')).toEqual([]);
        expect(await submitted(page, 's')).toEqual([]);
    });

    test('a required pdx-checkbox makes the form invalid until it is checked', async ({ page }) => {
        await form(page, '<pdx-checkbox name="c" label="Agree" required></pdx-checkbox>');
        const valid = () => page.evaluate(() => (document.getElementById('f') as HTMLFormElement).checkValidity());
        expect(await valid()).toBe(false);
        await page.locator('#f pdx-checkbox label').click();
        expect(await valid()).toBe(true);
    });
});
