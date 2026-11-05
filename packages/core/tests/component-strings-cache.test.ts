// One computed per library string, not one per read (#889).
//
// `uiString()` in @pdxui/ui reads `getComponentString(component, key)` every time a component asks for
// a string. A new computed per call, read outside a component's ownership scope — a frame's build, an
// event handler — belonged to nothing, and the registry's signals kept it forever: `pdx-rich-text`
// grew the heap by 7.6 KB per mounted instance, 14 computeds a mount.

import { describe, it, expect } from 'vitest';
import { collectDisposers } from '../src/reactivity/signal';
import { registerComponentStrings, setComponentStrings, getComponentString } from '../src/i18n/component-strings';

let n = 0;
const fresh = (base: string) => `${base}-cache-${n++}`;

describe('getComponentString — one computed per string', () => {
    it('gives the same computed for the same component, key and fallback', () => {
        const c = fresh('select');
        registerComponentStrings(c, { clear: 'Clear' });
        const first = getComponentString(c, 'clear');
        for (let i = 0; i < 1000; i++) {
            expect(getComponentString(c, 'clear'), 'a read created a computed of its own').toBe(first);
        }
        expect(getComponentString(c, 'clear', 'Fallback'), 'a different fallback is a different string').not.toBe(first);
        expect(getComponentString(c, 'other')).not.toBe(first);
    });

    it('still follows the locale after the scope of its first reader is disposed', () => {
        const c = fresh('dialog');
        registerComponentStrings(c, { close: 'Close' });
        const [, dispose] = collectDisposers(() => {
            expect(getComponentString(c, 'close')()).toBe('Close');
        });
        // The first reader's component is removed: the cached computed must not go with it.
        dispose();
        setComponentStrings(c, { close: 'Chiudi' });
        expect(getComponentString(c, 'close')(), 'the cached computed was disposed with its first reader').toBe('Chiudi');
    });
});
