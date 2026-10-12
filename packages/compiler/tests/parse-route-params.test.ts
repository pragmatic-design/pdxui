// parseRouteParams reads `@params { id: number, slug: string }` in linear time (#266).
//
// It ran `/(\w+)\s*:\s*(\w+)/g` in an exec loop over text from a `.pdx` file — CodeQL alert 157,
// js/polynomial-redos: on a long run of word characters with no `:` every start position re-scans the
// whole run. It splits the block into fields and checks each side as one identifier now.

import { describe, it, expect } from 'vitest';
import { parseRouteParams } from '../src/compiler/script-analyzer-helpers';

describe('parseRouteParams', () => {
    it('reads the fields of a block', () => {
        expect(parseRouteParams('{ id: number, slug: string }')).toEqual([
            { name: 'id', type: 'number' },
            { name: 'slug', type: 'string' },
        ]);
    });

    it('without spaces, and over several lines', () => {
        expect(parseRouteParams('{ id:number }')).toEqual([{ name: 'id', type: 'number' }]);
        expect(parseRouteParams('{\n    id: number\n    page: number\n}')).toEqual([
            { name: 'id', type: 'number' },
            { name: 'page', type: 'number' },
        ]);
    });

    it('an empty block has no fields', () => {
        expect(parseRouteParams('{}')).toEqual([]);
        expect(parseRouteParams('{ }')).toEqual([]);
    });

    it('a quoted type is not a field — PDX_ROUTE_FIELD_INVALID names it elsewhere', () => {
        expect(parseRouteParams("{ id: 'number' }")).toEqual([]);
    });

    it('a long run with no colon is no field', () => {
        // Its time is measured where a clock means something: tests/perf/compiler-scans.test.ts.
        expect(parseRouteParams('{ ' + '0'.repeat(1_000) + ' }')).toEqual([]);
    });
});
