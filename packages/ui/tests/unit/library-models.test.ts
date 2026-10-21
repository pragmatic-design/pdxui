// Every value component of the library announces its value through its model, and only so (#125).
//
// The five batches (#478–#482) moved the components one family at a time; this holds the whole
// library. Read from the manifest, which is what the compiler, the form binding and `pdx migrate` read:
// a component with a model announces exactly one `<model>-change` per model, and none of the five alpha
// names. `pdx-pin-input`, the last one, moved with the closing step.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { cleanup, tick } from './helpers';
import '../../src/pin-input/pdx-pin-input';

const ALPHA = ['pdx-change', 'change', 'valuechange', 'pressedchange', 'pdx-pressed-change'];
const kebab = (s: string): string => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

type Decl = { tagName?: string; models?: string[]; events?: { name: string }[]; alphaEvents?: string[] };
const decls = (JSON.parse(readFileSync(join(__dirname, '..', '..', 'custom-elements.json'), 'utf8')) as { modules: { declarations: Decl[] }[] })
    .modules.flatMap((m) => m.declarations).filter((d) => d.tagName);
const withModels = decls.filter((d) => (d.models ?? []).length > 0);

describe('the library\'s models', () => {
    it('finds the components with a model, so the assertions below are not vacuous', () => {
        expect(withModels.length).toBeGreaterThanOrEqual(32);
        expect(withModels.map((d) => d.tagName)).toEqual(expect.arrayContaining(['pdx-input', 'pdx-checkbox', 'pdx-select', 'pdx-rich-text', 'pdx-pin-input']));
    });

    for (const d of withModels) {
        it(`${d.tagName} announces one change event per model, and no alpha name`, () => {
            const events = (d.events ?? []).map((e) => e.name);
            for (const model of d.models!) {
                expect(events.filter((e) => e === `${kebab(model)}-change`), `${d.tagName} ${model}`).toHaveLength(1);
            }
            expect(events.filter((e) => ALPHA.includes(e))).toEqual([]);
        });
    }
});

describe('pdx-pin-input, the last one', () => {
    beforeEach(cleanup);

    it('declares `value` as its model, and records the pdx-input it no longer emits', () => {
        const d = decls.find((x) => x.tagName === 'pdx-pin-input');
        expect(d?.models).toEqual(['value']);
        expect(d?.alphaEvents).toEqual(['pdx-input']);
    });

    it('a digit typed in the inner field announces value-change with the PIN so far, and no pdx-input', async () => {
        document.body.innerHTML = '<pdx-pin-input length="4"></pdx-pin-input>';
        await tick(60);
        const el = document.body.firstElementChild as HTMLElement & { value: string };
        const seen: string[] = [];
        for (const name of ['pdx-input', 'value-change']) {
            el.addEventListener(name, (e) => { if (e.target === el) seen.push(`${name} ${JSON.stringify((e as CustomEvent).detail)}`); });
        }
        const cell = el.querySelector('.pdx-otp-cell') as HTMLInputElement;
        cell.value = '7';
        cell.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();
        expect(seen).toEqual(['value-change {"value":"7"}']);
        expect(el.value).toBe('7');
    });
});
