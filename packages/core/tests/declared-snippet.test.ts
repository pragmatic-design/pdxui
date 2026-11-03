// declaredSnippet (#492, part 3): the template a component draws an entry with is the parent's snippet
// only. `snippetOrSlot` fell back on the alpha scoped slot (`ctx.__slots`); a component moved to
// declaredSnippet does not, so a parent's `<slot name="x" let:…>` draws nothing there any more.

import { describe, it, expect } from 'vitest';
import { declaredSnippet } from '../src/index';

const text = (node: Node) => node.textContent;

describe('declaredSnippet', () => {
    it("calls the parent's snippet with the arguments taken from the scope", () => {
        const ctx = { item: () => (label: string, index: number) => document.createTextNode(`${label}#${index}`) };
        const draw = declaredSnippet(ctx, 'item', (s) => [s.label, s.index]);
        expect(draw && text(draw({ label: 'Ada', index: 2 }) as Node)).toBe('Ada#2');
    });

    it('a snippet that returns nothing draws an empty fragment', () => {
        const ctx = { item: () => () => null };
        const draw = declaredSnippet(ctx, 'item', () => []);
        expect(draw?.({})).toBeInstanceOf(DocumentFragment);
    });

    it('the alpha scoped slot is not read: with only `__slots`, there is nothing to draw', () => {
        const ctx = { item: () => undefined, __slots: { item: () => document.createTextNode('alpha') } };
        expect(declaredSnippet(ctx, 'item', () => [])).toBeUndefined();
    });

    it('control — no snippet and no slot: nothing to draw', () => {
        expect(declaredSnippet({}, 'item', () => [])).toBeUndefined();
    });
});
