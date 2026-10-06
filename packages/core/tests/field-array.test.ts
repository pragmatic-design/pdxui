// createFieldArray — the primitive behind a repeating group of fields, and the page that describes it.
//
// The documentation is held to the real surface: there is no `add`; `replace` takes the whole
// array, not `(index, value)`; and an item is a WRAPPER, `{ __id, value }`, so a template writing
// `item.name` renders empty fields with no error. A reader who trusts a wrong name hits
// `fa.add is not a function` and writes the repeating rows by hand instead.
//
// The doc block on `createFieldArray` is not a comment: `gen-api.mjs` renders it into the site's
// api.md and into the pdxui skill. A name written there is a promise to a reader who cannot
// see the code. So the prose is READ here and checked against the object — the page and the code
// fail together rather than drift.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFieldArray } from '../src/form/field-array';

const SOURCE = join(__dirname, '..', 'src', 'form', 'field-array.ts');

/** The TSDoc block immediately above `export function createFieldArray` — what api.md publishes. */
function publishedDoc(): string {
    const src = readFileSync(SOURCE, 'utf8');
    const at = src.indexOf('export function createFieldArray');
    expect(at, 'createFieldArray is not exported from where this test reads it').toBeGreaterThan(0);
    const before = src.slice(0, at);
    const start = before.lastIndexOf('/**');
    expect(start, 'createFieldArray carries no TSDoc block').toBeGreaterThan(0);
    return before.slice(start);
}

/** Every `name()` the prose writes in backticks — the form a reader copies. */
function methodsNamedInDoc(doc: string): string[] {
    return [...doc.matchAll(/`(\w+)\(\)`/g)].map(m => m[1]);
}

describe('createFieldArray — the prose and the object say the same thing', () => {
    it('the doc block names its methods in a form that can be checked', () => {
        // Not a style rule. "with add, remove, move and swap" — the sentence this test was written
        // for — names four methods as bare words, one of which does not exist, and no reader and no
        // test can tell the difference. Backticked `name()` is the form the check below reads.
        const named = methodsNamedInDoc(publishedDoc());
        expect(named.length, 'the published doc names no method as `name()`').toBeGreaterThanOrEqual(6);
    });

    it('every method the doc names exists on the object', () => {
        const fa = createFieldArray<{ n: string }>([]);
        const missing = methodsNamedInDoc(publishedDoc())
            .filter(name => typeof (fa as unknown as Record<string, unknown>)[name] !== 'function');
        expect(missing, 'the published doc names methods this object does not have').toEqual([]);
    });

    it('the doc says what an item IS, because reading it wrong fails silently', () => {
        // `item.value.name`, not `item.name`. A template that guesses wrong renders empty fields
        // and reports nothing — the worst of the three claims in the bug.
        expect(publishedDoc()).toMatch(/__id/);
        expect(publishedDoc(), 'the doc never shows the wrapper shape').toMatch(/\{\s*__id,\s*value\s*\}/);
    });

    it('does not offer `add`, the name that was documented and never existed', () => {
        const fa = createFieldArray<number>([]);
        expect('add' in (fa as object), 'add() was added as an alias; the doc must then name it').toBe(false);
        expect(publishedDoc()).not.toMatch(/`add\(\)`/);
    });
});

describe('createFieldArray — the surface, measured', () => {
    it('appends, prepends and inserts', () => {
        const fa = createFieldArray<string>(['b']);
        fa.append('c');
        fa.prepend('a');
        fa.insert(1, 'a2');
        expect(fa.getValues()).toEqual(['a', 'a2', 'b', 'c']);
        expect(fa.length()).toBe(4);
    });

    it('an index outside the array changes nothing', () => {
        const fa = createFieldArray<string>(['a', 'b']);
        fa.remove(9);
        fa.move(0, 9);
        fa.swap(-1, 1);
        expect(fa.getValues()).toEqual(['a', 'b']);
    });

    it('insert clamps to the ends instead of leaving a hole', () => {
        const fa = createFieldArray<string>(['a']);
        fa.insert(99, 'z');
        fa.insert(-5, 'first');
        expect(fa.getValues()).toEqual(['first', 'a', 'z']);
    });

    it('replace takes the whole array, not an index and a value', () => {
        const fa = createFieldArray<string>(['a']);
        fa.replace(['x', 'y']);
        expect(fa.getValues()).toEqual(['x', 'y']);
    });

    it('reset returns to the values it was created with', () => {
        const fa = createFieldArray<string>(['a', 'b']);
        fa.append('c');
        fa.remove(0);
        fa.reset();
        expect(fa.getValues()).toEqual(['a', 'b']);
    });
});

describe('createFieldArray — __id, which is the whole point', () => {
    const ids = (fa: { items: () => readonly { __id: number }[] }) => fa.items().map(i => i.__id);

    it('survives a removal: the rows that stay keep their identity', () => {
        const fa = createFieldArray<string>(['a', 'b', 'c']);
        const [, second, third] = ids(fa);
        fa.remove(0);
        expect(ids(fa)).toEqual([second, third]);
    });

    it('survives a move and a swap', () => {
        const fa = createFieldArray<string>(['a', 'b', 'c']);
        const [first, second, third] = ids(fa);
        fa.move(0, 2);
        expect(ids(fa)).toEqual([second, third, first]);
        fa.swap(0, 1);
        expect(ids(fa)).toEqual([third, second, first]);
    });

    it('update writes one row and leaves every __id alone', () => {
        // The question a repeating section asks first: how do you write a single field of one row?
        // Through getValues() + replace() it costs every row its __id — the DOM, the focus and the
        // validation error of every other row — for one keystroke.
        const fa = createFieldArray([{ type: 'kitchen', area: 0 }, { type: 'bath', area: 0 }]);
        const before = ids(fa);
        fa.update(1, { ...fa.getValues()[1], area: 12 });
        expect(fa.getValues()).toEqual([{ type: 'kitchen', area: 0 }, { type: 'bath', area: 12 }]);
        expect(ids(fa), 'update re-keyed the rows').toEqual(before);
    });

    it('update outside the array changes nothing', () => {
        const fa = createFieldArray<string>(['a']);
        fa.update(3, 'z');
        expect(fa.getValues()).toEqual(['a']);
    });

    it('replace, by contrast, re-keys everything — and the doc says so', () => {
        // Not a defect: replace means "these are the items now". It is recorded because the
        // difference between it and update is the reason update exists.
        const fa = createFieldArray<string>(['a', 'b']);
        const before = ids(fa);
        fa.replace(['a', 'b']);
        expect(ids(fa)).not.toEqual(before);
        expect(publishedDoc(), 'the doc does not warn that replace re-keys').toMatch(/replace/);
    });
});
