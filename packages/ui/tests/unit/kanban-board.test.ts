// The model of pdx-kanban (#1021): which column an item is in is a field of the item, and the order
// inside a column is the order of the array. A move returns a new array — the component writes it to
// its `items` model — with the item's field set to the column and the item placed at the index.
import { describe, it, expect } from 'vitest';
import { arrange, moveItem } from '../../src/kanban/board';

type Card = { id: string; status: string };
const items: Card[] = [
    { id: 'a', status: 'todo' },
    { id: 'c', status: 'doing' },
    { id: 'b', status: 'todo' },
    { id: 'x', status: 'archived' },
];
const ids = (list: Card[]) => list.map((i) => `${i.id}:${i.status}`);

describe('arrange', () => {
    it('puts each item in the column its field names, in array order, and every column is there', () => {
        const by = arrange(items, ['todo', 'doing', 'done'], 'status');
        expect(Object.fromEntries([...by].map(([k, v]) => [k, v.map((i) => i.id)]))).toEqual({ todo: ['a', 'b'], doing: ['c'], done: [] });
    });
});

describe('moveItem', () => {
    it('to another column, at an index: the field changes and the item lands before the one there', () => {
        const out = moveItem(items, items[0], 'doing', 0, 'status');
        expect(ids(out)).toEqual(['a:doing', 'c:doing', 'b:todo', 'x:archived']);
        expect(items[0].status, 'the input was changed').toBe('todo');
    });

    it('past the end of a column: after its last item', () => {
        expect(ids(moveItem(items, items[0], 'doing', 5, 'status'))).toEqual(['c:doing', 'a:doing', 'b:todo', 'x:archived']);
    });

    it('into an empty column: at the end of the array', () => {
        expect(ids(moveItem(items, items[2], 'done', 0, 'status'))).toEqual(['a:todo', 'c:doing', 'x:archived', 'b:done']);
    });

    it('within its column: down and up by the index it ends at', () => {
        expect(ids(moveItem(items, items[0], 'todo', 1, 'status'))).toEqual(['c:doing', 'b:todo', 'a:todo', 'x:archived']);
        expect(ids(moveItem(items, items[2], 'todo', 0, 'status'))).toEqual(['b:todo', 'a:todo', 'c:doing', 'x:archived']);
    });

    it('an item a column does not show keeps its place', () => {
        const out = moveItem(items, items[1], 'todo', 0, 'status');
        expect(out[out.length - 1]).toEqual({ id: 'x', status: 'archived' });
    });
});
