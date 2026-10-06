// The six ui props declared `default: () => [...]` read back arrays when unset.
//
// Core calls a factory default for an Array or Object prop; returned as written, each of these
// props would hold the FUNCTION (`el.options` on a pdx-select with no options would be a function).
// This pins the six that declare one.
import { describe, it, expect, afterEach } from 'vitest';
import '../../src/select/pdx-select';
import '../../src/autocomplete/pdx-autocomplete';
import '../../src/color-picker/pdx-color-picker';
import '../../src/page-header/pdx-page-header';
import '../../src/relation-picker/pdx-relation-picker';
import '../../src/bottom-sheet/pdx-bottom-sheet';

const CASES: [tag: string, prop: string, expected: unknown[]][] = [
    ['pdx-select', 'options', []],
    ['pdx-autocomplete', 'suggestions', []],
    ['pdx-color-picker', 'presets', []],
    ['pdx-page-header', 'crumbs', []],
    ['pdx-relation-picker', 'columns', []],
    ['pdx-bottom-sheet', 'detents', [0.4, 0.85]],
];

afterEach(() => { document.body.innerHTML = ''; });

describe('an unset array prop reads back an array', () => {
    for (const [tag, prop, expected] of CASES) {
        it(`${tag}.${prop}`, () => {
            const el = document.createElement(tag) as HTMLElement & Record<string, unknown>;
            document.body.appendChild(el);
            expect(Array.isArray(el[prop]), `${tag}.${prop} is a ${typeof el[prop]}`).toBe(true);
            expect(el[prop]).toEqual(expected);
        });
    }

    it('the control: two selects do not share one default array', () => {
        const a = document.createElement('pdx-select') as HTMLElement & { options: unknown };
        const b = document.createElement('pdx-select') as HTMLElement & { options: unknown };
        document.body.append(a, b);
        expect(a.options).not.toBe(b.options);
    });
});
