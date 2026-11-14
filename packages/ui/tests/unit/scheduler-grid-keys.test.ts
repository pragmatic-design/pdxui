// The keys of pdx-scheduler's grid (#1020, part 3), as the WAI-ARIA grid pattern has them: the arrows
// move one cell and stop at the edges, Home and End go to the row's first and last cell, Ctrl+Home and
// Ctrl+End to the grid's, and PageUp / PageDown page through periods.
import { describe, it, expect } from 'vitest';
import { gridKeyTarget } from '../../src/scheduler/grid-keys';

const size = { rows: 4, cols: 3 };
const at = { row: 1, col: 1 };
const key = (k: string, mods: { ctrlKey?: boolean; metaKey?: boolean } = {}) => ({ key: k, ctrlKey: false, metaKey: false, ...mods });

describe('gridKeyTarget', () => {
    it('the arrows move one cell', () => {
        expect(gridKeyTarget(key('ArrowUp'), at, size)).toEqual({ cell: { row: 0, col: 1 } });
        expect(gridKeyTarget(key('ArrowDown'), at, size)).toEqual({ cell: { row: 2, col: 1 } });
        expect(gridKeyTarget(key('ArrowLeft'), at, size)).toEqual({ cell: { row: 1, col: 0 } });
        expect(gridKeyTarget(key('ArrowRight'), at, size)).toEqual({ cell: { row: 1, col: 2 } });
    });

    it('and stop at the edges, without wrapping', () => {
        expect(gridKeyTarget(key('ArrowUp'), { row: 0, col: 0 }, size)).toEqual({ cell: { row: 0, col: 0 } });
        expect(gridKeyTarget(key('ArrowRight'), { row: 3, col: 2 }, size)).toEqual({ cell: { row: 3, col: 2 } });
    });

    it('Home and End: the row\'s first and last cell; with Ctrl (or ⌘), the grid\'s', () => {
        expect(gridKeyTarget(key('Home'), at, size)).toEqual({ cell: { row: 1, col: 0 } });
        expect(gridKeyTarget(key('End'), at, size)).toEqual({ cell: { row: 1, col: 2 } });
        expect(gridKeyTarget(key('Home', { ctrlKey: true }), at, size)).toEqual({ cell: { row: 0, col: 0 } });
        expect(gridKeyTarget(key('End', { metaKey: true }), at, size)).toEqual({ cell: { row: 3, col: 2 } });
    });

    it('PageUp and PageDown: the previous and next period', () => {
        expect(gridKeyTarget(key('PageUp'), at, size)).toEqual({ period: -1 });
        expect(gridKeyTarget(key('PageDown'), at, size)).toEqual({ period: 1 });
    });

    it('any other key is not the grid\'s', () => {
        expect(gridKeyTarget(key('a'), at, size)).toBeNull();
        expect(gridKeyTarget(key('Enter'), at, size)).toBeNull();
    });
});
