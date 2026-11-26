// `@await`'s timing block is recognised by its shape and read strictly (#1369).
//
// It was recognised by its words: a block containing `minMs` or `maxMs`. `{ minMs: 200, maxMS: 5000 }`
// kept minMs and dropped the misspelt key; `{ maxMS: 5000 }` was not a timing block at all, and
// rendered as the body; a value that was not digits was skipped. Now, as `@try`'s options (#1365), a
// block right after `@await (…)` that another block follows is the timing block, and what it holds is
// minMs and maxMs, each at most once, each a non-negative integer.

import { describe, it, expect } from 'vitest';
import { parseTemplate } from '../src/parser/template';
import type { AwaitNode } from '../src/parser/template';

const awaitOf = (src: string): AwaitNode => parseTemplate(src).find((n) => n.type === 'await') as AwaitNode;

describe('a timing block that holds what @await does not take', () => {
    it('an unknown key beside a known one stops the compile, naming the key and its line', () => {
        expect(() => parseTemplate('<div>\n@await (x) { minMs: 200, maxMS: 5000 } { <p>a</p> }\n</div>'))
            .toThrow(/'maxMS' at line 2[\s\S]*minMs, maxMs/);
    });

    it('a block of unknown keys alone is the same error, not the body', () => {
        expect(() => parseTemplate('@await (x) { maxMS: 5000 } { <p>a</p> }')).toThrow(/'maxMS'[\s\S]*minMs, maxMs/);
    });

    it('a value that is not a non-negative integer stops the compile', () => {
        expect(() => parseTemplate('@await (x) { maxMs: soon } { <p>a</p> }')).toThrow(/maxMs[\s\S]*soon/);
        expect(() => parseTemplate('@await (x) { maxMs: 5_000 } { <p>a</p> }')).toThrow(/maxMs[\s\S]*5_000/);
        expect(() => parseTemplate('@await (x) { minMs: -1 } { <p>a</p> }')).toThrow(/minMs[\s\S]*-1/);
    });

    it('a key twice, and a key with no value, stop the compile', () => {
        expect(() => parseTemplate('@await (x) { minMs: 1, minMs: 2 } { <p>a</p> }')).toThrow(/'minMs' is given twice/);
        expect(() => parseTemplate('@await (x) { minMs } { <p>a</p> }')).toThrow(/'minMs'[\s\S]*no value/);
        expect(() => parseTemplate('@await (x) { minMs: } { <p>a</p> }')).toThrow(/'minMs'[\s\S]*no value/);
    });
});

describe('controls', () => {
    it('a timing block of both keys is read', () => {
        const n = awaitOf('@await (x) { minMs: 200, maxMs: 5000 } { <p>a</p> } @loading { <p>…</p> }');
        expect([n.minMs, n.maxMs]).toEqual([200, 5000]);
        expect(n.loading).toBeDefined();
    });

    it('a block that no block follows is the body, whatever it holds', () => {
        const n = awaitOf('@await (x) { <p>{{ a }}</p> } @loading { <p>wait</p> }');
        expect([n.minMs, n.maxMs]).toEqual([undefined, undefined]);
        expect(JSON.stringify(n.body)).toContain('p');
    });

    it('a body whose text names minMs is still the body', () => {
        const n = awaitOf('@await (x) { <p>minMs is a delay</p> }');
        expect(n.minMs).toBeUndefined();
        expect(JSON.stringify(n.body)).toContain('minMs is a delay');
    });
});
