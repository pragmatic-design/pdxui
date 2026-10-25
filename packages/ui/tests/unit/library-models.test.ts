// Every value component of the library announces its value through its model, and only so (#125).
//
// The five batches (#478–#482) moved the components one family at a time; this holds the whole
// library. Read from the manifest, which is what the compiler, the form binding and `pdx migrate` read:
// a component with a model announces exactly one `<model>-change` per model, and none of the five alpha
// names.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ALPHA = ['pdx-change', 'change', 'valuechange', 'pressedchange', 'pdx-pressed-change'];
const kebab = (s: string): string => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

type Decl = { tagName?: string; models?: string[]; events?: { name: string }[]; alphaEvents?: string[] };
const decls = (JSON.parse(readFileSync(join(__dirname, '..', '..', 'custom-elements.json'), 'utf8')) as { modules: { declarations: Decl[] }[] })
    .modules.flatMap((m) => m.declarations).filter((d) => d.tagName);
const withModels = decls.filter((d) => (d.models ?? []).length > 0);

describe('the library\'s models', () => {
    it('finds the components with a model, so the assertions below are not vacuous', () => {
        // 31 since pdx-pin-input, which had one, was removed (#286).
        expect(withModels.length).toBeGreaterThanOrEqual(31);
        expect(withModels.map((d) => d.tagName)).toEqual(expect.arrayContaining(['pdx-input', 'pdx-checkbox', 'pdx-select', 'pdx-rich-text', 'pdx-otp-input']));
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
