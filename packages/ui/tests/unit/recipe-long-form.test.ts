// The "long form" recipe does what it says.
//
// The best form path — `<pdx-form :form>` + `<pdx-form-field name>` + a control with the same name — is
// wired by the compiler (codegen-form-binding.ts), and the recipe teaches it. This takes the recipe's own block out of
// recipes.md, compiles it with the real compiler, runs it against the real core and components, and
// checks each promise the recipe makes: a draft restored into mounted controls, the error shown
// while typing, the field not recreated as it is typed into.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import '../../src/index';
import { tick, cleanup } from './helpers';

const RECIPES = join(__dirname, '../../../../marketplace/plugins/pdxui/skills/pdxui/references/recipes.md');

/** The block fenced ```html recipe:long-form, or null. */
function recipeBlock(): string | null {
    const text = readFileSync(RECIPES, 'utf8').replace(/\r\n/g, '\n');
    const m = text.match(/^```html recipe:long-form\n([\s\S]*?)^```[ \t]*$/m);
    return m ? m[1] : null;
}

const DRAFT_KEY = 'shipment-draft';
let tag = '';

beforeAll(() => {
    const block = recipeBlock();
    if (!block) return;
    const { code } = compile(block, 'shipment-form.pdx', [], undefined, {});
    tag = 'pdx-shipment-form';
    const body = code
        .replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/g, 'const {$1} = __core;')
        .replace(/^import\s+'@pdxui\/ui[^']*';?$/gm, ''); // the components are registered above
    new Function('__core', body)(core);
});
afterEach(() => { cleanup(); localStorage.clear(); });

async function mount(): Promise<HTMLElement> {
    const el = document.createElement(tag);
    document.body.appendChild(el);
    await tick(); await tick();
    return el;
}

function typeInto(el: HTMLElement, name: string, value: string): HTMLInputElement {
    const input = el.querySelector<HTMLInputElement>(`pdx-input[name="${name}"] input`)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input;
}

describe('recipe: a long form filled in more than one sitting', () => {
    it('exists and names the path it teaches', () => {
        const block = recipeBlock();
        expect(block, 'recipes.md has no ```html recipe:long-form block').not.toBeNull();
        expect(block).toContain('<pdx-form :form');
        expect(block).toContain('<pdx-form-field');
        expect(block).toMatch(/setValues\(/);
    });

    it('restores a saved draft into the controls already on screen, the select included', async () => {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ shipper: 'Adriatica Srl', service: 'exp', weight: 12 }));
        const el = await mount();
        await tick();
        expect(el.querySelector<HTMLInputElement>('pdx-input[name="shipper"] input')!.value).toBe('Adriatica Srl');
        const select = el.querySelector('pdx-select[name="service"]') as HTMLElement & { value?: unknown };
        expect(select.value, 'the select did not receive the draft').toBe('exp');
    });

    it('validates while typing, and shows the error as an alert on the field before any blur', async () => {
        // With validateOn 'onChange' the field shows the error while typing, by reading the form from
        // <pdx-form>'s context. happy-dom sets children up before their parent, so the field has to
        // find the form even when it is set up first, or this could only be checked after a blur.
        const el = await mount();
        const field = el.querySelector('pdx-form-field[name="shipper"]') as HTMLElement & { error: unknown };
        typeInto(el, 'shipper', 'Ad');
        await tick();
        expect(field.error, 'the validator did not run on typing').toBe('At least 3 characters');
        expect(field.querySelector('[role="alert"]')?.textContent ?? '', 'no error under the field while typing').toContain('At least 3 characters');
        expect(field.querySelector('input')!.getAttribute('aria-invalid')).toBe('true');

        typeInto(el, 'shipper', 'Adriatica');
        await tick();
        expect(field.querySelector('[role="alert"]')?.textContent ?? '', 'the error stayed after the value became valid').not.toContain('At least 3');
    });

    it('does not recreate the field as it is typed into — so it keeps focus', async () => {
        const el = await mount();
        const before = el.querySelector('pdx-input[name="shipper"] input');
        typeInto(el, 'shipper', 'Adr');
        await tick();
        typeInto(el, 'shipper', 'Adria');
        await tick();
        expect(el.querySelector('pdx-input[name="shipper"] input'), 'the input was replaced').toBe(before);
        expect((before as HTMLInputElement).value).toBe('Adria');
    });

    it('saves the draft from what was typed', async () => {
        const el = await mount();
        typeInto(el, 'shipper', 'Porto di Bari');
        await tick();
        el.querySelector<HTMLElement>('.save-draft')!.click();
        expect(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}').shipper).toBe('Porto di Bari');
    });
});
