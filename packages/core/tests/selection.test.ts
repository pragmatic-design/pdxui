import { describe, it, expect, vi } from 'vitest';
import { createSelection } from '../src/component/selection';

describe('createSelection', () => {
    describe('single mode', () => {
        it('selects a single key', () => {
            const sel = createSelection<string>();
            sel.select('a');
            expect(sel.selected().has('a')).toBe(true);
            expect(sel.selected().size).toBe(1);
        });

        it('replaces previous selection', () => {
            const sel = createSelection<string>();
            sel.select('a');
            sel.select('b');
            expect(sel.selected().has('a')).toBe(false);
            expect(sel.selected().has('b')).toBe(true);
        });

        it('isSelected works', () => {
            const sel = createSelection<string>();
            sel.select('a');
            expect(sel.isSelected('a')).toBe(true);
            expect(sel.isSelected('b')).toBe(false);
        });

        it('toggle works', () => {
            const sel = createSelection<string>();
            sel.toggle('a');
            expect(sel.isSelected('a')).toBe(true);
            sel.toggle('a');
            expect(sel.isSelected('a')).toBe(false);
        });

        it('deselect works', () => {
            const sel = createSelection<string>();
            sel.select('a');
            sel.deselect('a');
            expect(sel.selected().size).toBe(0);
        });

        it('clear removes all', () => {
            const sel = createSelection<string>();
            sel.select('a');
            sel.clear();
            expect(sel.selected().size).toBe(0);
        });
    });

    describe('multiple mode', () => {
        it('adds multiple keys with toggle behavior', () => {
            const sel = createSelection<string>({ mode: 'multiple', behavior: 'toggle' });
            sel.select('a');
            sel.select('b');
            expect(sel.selected().size).toBe(2);
            expect(sel.isSelected('a')).toBe(true);
            expect(sel.isSelected('b')).toBe(true);
        });

        it('replaces with replace behavior', () => {
            const sel = createSelection<string>({ mode: 'multiple', behavior: 'replace' });
            sel.select('a');
            sel.select('b');
            expect(sel.selected().size).toBe(1);
            expect(sel.isSelected('b')).toBe(true);
        });

        it('selectAll selects provided keys', () => {
            const sel = createSelection<string>({ mode: 'multiple' });
            sel.selectAll(['a', 'b', 'c']);
            expect(sel.selected().size).toBe(3);
        });

        it('toggle adds and removes', () => {
            const sel = createSelection<string>({ mode: 'multiple' });
            sel.toggle('a');
            sel.toggle('b');
            expect(sel.selected().size).toBe(2);
            sel.toggle('a');
            expect(sel.selected().size).toBe(1);
            expect(sel.isSelected('b')).toBe(true);
        });
    });

    describe('none mode', () => {
        it('ignores all selection operations', () => {
            const sel = createSelection<string>({ mode: 'none' });
            sel.select('a');
            sel.toggle('b');
            expect(sel.selected().size).toBe(0);
        });
    });

    describe('disabled keys', () => {
        it('prevents selecting disabled keys', () => {
            const disabled = new Set(['b']);
            const sel = createSelection<string>({
                mode: 'multiple',
                disabledKeys: () => disabled,
            });
            sel.select('a');
            sel.select('b');
            expect(sel.isSelected('a')).toBe(true);
            expect(sel.isSelected('b')).toBe(false);
        });

        it('skips disabled in selectAll', () => {
            const disabled = new Set(['b']);
            const sel = createSelection<string>({
                mode: 'multiple',
                disabledKeys: () => disabled,
            });
            sel.selectAll(['a', 'b', 'c']);
            expect(sel.selected().size).toBe(2);
            expect(sel.isSelected('b')).toBe(false);
        });

        it('skips disabled in toggle', () => {
            const disabled = new Set(['a']);
            const sel = createSelection<string>({
                disabledKeys: () => disabled,
            });
            sel.toggle('a');
            expect(sel.isSelected('a')).toBe(false);
        });
    });

    describe('range select (extendTo)', () => {
        it('selects range from anchor to target', () => {
            const allKeys = ['a', 'b', 'c', 'd', 'e'];
            const sel = createSelection<string>({ mode: 'multiple' });
            sel.select('b'); // sets anchor
            sel.extendTo('d', allKeys);
            expect(sel.selected().size).toBe(3);
            expect(sel.isSelected('b')).toBe(true);
            expect(sel.isSelected('c')).toBe(true);
            expect(sel.isSelected('d')).toBe(true);
        });

        it('selects backwards range', () => {
            const allKeys = ['a', 'b', 'c', 'd', 'e'];
            const sel = createSelection<string>({ mode: 'multiple' });
            sel.select('d');
            sel.extendTo('b', allKeys);
            expect(sel.selected().size).toBe(3);
            expect(sel.isSelected('b')).toBe(true);
            expect(sel.isSelected('c')).toBe(true);
            expect(sel.isSelected('d')).toBe(true);
        });

        it('skips disabled keys in range', () => {
            const allKeys = ['a', 'b', 'c', 'd', 'e'];
            const sel = createSelection<string>({
                mode: 'multiple',
                disabledKeys: () => new Set(['c']),
            });
            sel.select('b');
            sel.extendTo('d', allKeys);
            expect(sel.isSelected('c')).toBe(false);
            expect(sel.selected().size).toBe(2);
        });

        it('ignores in single mode', () => {
            const sel = createSelection<string>({ mode: 'single' });
            sel.select('a');
            sel.extendTo('c', ['a', 'b', 'c']);
            expect(sel.selected().size).toBe(1);
        });

        it('falls back to select when no anchor', () => {
            const sel = createSelection<string>({ mode: 'multiple' });
            sel.extendTo('c', ['a', 'b', 'c']);
            expect(sel.isSelected('c')).toBe(true);
        });
    });

    describe('anchor', () => {
        it('tracks the last selected key', () => {
            const sel = createSelection<string>();
            expect(sel.anchor()).toBeNull();
            sel.select('a');
            expect(sel.anchor()).toBe('a');
            sel.select('b');
            expect(sel.anchor()).toBe('b');
        });

        it('updates on toggle', () => {
            const sel = createSelection<string>({ mode: 'multiple' });
            sel.toggle('x');
            expect(sel.anchor()).toBe('x');
        });

        it('clears on clear()', () => {
            const sel = createSelection<string>();
            sel.select('a');
            sel.clear();
            expect(sel.anchor()).toBeNull();
        });
    });

    describe('defaultSelected', () => {
        it('initializes with default selection', () => {
            const sel = createSelection<string>({
                defaultSelected: new Set(['a', 'b']),
                mode: 'multiple',
            });
            expect(sel.selected().size).toBe(2);
            expect(sel.isSelected('a')).toBe(true);
        });
    });

    describe('onSelectionChange', () => {
        it('fires on select', () => {
            const onChange = vi.fn();
            const sel = createSelection<string>({ onSelectionChange: onChange });
            sel.select('a');
            expect(onChange).toHaveBeenCalledTimes(1);
            expect(onChange.mock.calls[0][0]).toEqual(new Set(['a']));
        });

        it('fires on toggle', () => {
            const onChange = vi.fn();
            const sel = createSelection<string>({ onSelectionChange: onChange });
            sel.toggle('a');
            expect(onChange).toHaveBeenCalledTimes(1);
        });

        it('fires on clear', () => {
            const onChange = vi.fn();
            const sel = createSelection<string>({ onSelectionChange: onChange });
            sel.select('a');
            sel.clear();
            expect(onChange).toHaveBeenCalledTimes(2);
        });

        it('does not fire on clear when already empty', () => {
            const onChange = vi.fn();
            const sel = createSelection<string>({ onSelectionChange: onChange });
            sel.clear();
            expect(onChange).not.toHaveBeenCalled();
        });
    });

    describe('dispose', () => {
        it('clears state', () => {
            const sel = createSelection<string>({ mode: 'multiple' });
            sel.selectAll(['a', 'b', 'c']);
            sel.dispose();
            expect(sel.selected().size).toBe(0);
            expect(sel.anchor()).toBeNull();
        });
    });

    describe('numeric keys', () => {
        it('works with number keys', () => {
            const sel = createSelection<number>({ mode: 'multiple', behavior: 'toggle' });
            sel.select(1);
            sel.select(2);
            sel.select(3);
            expect(sel.selected().size).toBe(3);
            sel.toggle(2);
            expect(sel.selected().size).toBe(2);
            expect(sel.isSelected(2)).toBe(false);
        });
    });
});
