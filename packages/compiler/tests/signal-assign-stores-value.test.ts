// In a .pdx, assignment stores the value as it is (#187; decisions.md 15 and 17).
//
// `x = e` compiled to `__x.set(e)`, and `set` treats a function as an UPDATER: assigning a handler
// called it once and stored what it returned. `x.setRaw(fn)` compiled to `__x().setRaw(fn)`, a call
// on the current value. The rewrite now stores with `setRaw`; the operators that UPDATE keep `set`.

import { describe, it, expect } from 'vitest';
import { rewriteAst } from '../src/compiler/signal-rewrite-ast';

const ast = (code: string, ...signals: string[]) => rewriteAst(code, new Set(signals), new Set(), 'f.pdx');

describe('a $signal assignment stores its value', () => {
    it('x = e stores e, even a function', () => {
        expect(ast('onSave = () => save();', 'onSave')).toBe('__onSave.setRaw(() => save());');
        expect(ast('count = 5;', 'count')).toBe('__count.setRaw(5);');
    });

    it('x = f(x): the right side reads the current value, untracked, and the result is stored', () => {
        // peek, not a tracked read: inside an effect, `count = count + 1` would otherwise make the
        // effect depend on what it writes and re-run forever. The old `set(prev => …)` did not track.
        expect(ast('items = items.filter(x => x.ok);', 'items')).toBe('__items.setRaw(__items.peek().filter(x => x.ok));');
        expect(ast('count = count + 1;', 'count')).toBe('__count.setRaw(__count.peek() + 1);');
        expect(ast('state = { ...state, a: 1 };', 'state')).toBe('__state.setRaw({ ...__state.peek(), a: 1 });');
        // Another signal on the right side is a normal, tracked read.
        expect(ast('total = total + delta;', 'total', 'delta')).toBe('__total.setRaw(__total.peek() + __delta());');
    });

    it('updates keep the updater form', () => {
        expect(ast('count++;', 'count')).toBe('__count.set(__v => __v + 1);');
        expect(ast('count--;', 'count')).toBe('__count.set(__v => __v - 1);');
        expect(ast('count += 2;', 'count')).toBe('__count.set(__v => __v + 2);');
        expect(ast('mask |= 4;', 'mask')).toBe('__mask.set(__v => __v | 4);');
    });

    it('logical assignments store, and keep their short circuit', () => {
        expect(ast('handler ??= () => 1;', 'handler')).toBe('(__handler() ?? __handler.setRaw(() => 1));');
        expect(ast('count ||= 5;', 'count')).toBe('(__count() || __count.setRaw(5));');
        expect(ast('count &&= 5;', 'count')).toBe('(__count() && __count.setRaw(5));');
    });

    it('x.peek() and x.setRaw(v) reach the signal\'s own methods', () => {
        expect(ast('const v = count.peek();', 'count')).toBe('const v = __count.peek();');
        expect(ast('onSave.setRaw(() => 1);', 'onSave')).toBe('__onSave.setRaw(() => 1);');
    });

    it('a $signal in callee position is read, then called', () => {
        expect(ast('onSave(item);', 'onSave')).toBe('__onSave()(item);');
    });

    it('another member of the value is still read through the value', () => {
        expect(ast('const n = items.length;', 'items')).toBe('const n = __items().length;');
        expect(ast('user.name.trim();', 'user')).toBe('__user().name.trim();');
    });
});
