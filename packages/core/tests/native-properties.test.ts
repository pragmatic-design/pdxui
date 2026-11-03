// The compiler's table of the properties a native element certainly has (#685) holds for a DOM.
//
// The compiler writes a binding on such a property as the assignment alone, without core's
// `name in el` (packages/compiler/src/compiler/native-properties.ts). An entry the element does not
// have would write an expando where the attribute was meant: every entry is asked here, of a real
// element of its tag.

import { describe, it, expect } from 'vitest';
import { nativePropertyTable } from '../../compiler/src/compiler/native-properties';

describe("the compiler's native property table", () => {
    const table = nativePropertyTable();

    it('lists elements, each with properties (the control: an empty table passes the next test)', () => {
        expect(table.size).toBeGreaterThan(5);
        expect(table.get('input')?.has('checked')).toBe(true);
    });

    it('names, for every tag, only properties an element of that tag has', () => {
        const missing: string[] = [];
        for (const [tag, props] of table) {
            const el = document.createElement(tag);
            for (const prop of props) if (!(prop in el)) missing.push(`<${tag}>.${prop}`);
        }
        expect(missing).toEqual([]);
    });
});
