// Regression: usePopover must expose the resolved placement as data-placement on the content
// element, so arrow CSS (e.g. .pdx-tooltip-float[data-placement^="bottom"] .arrow) can position.

import { describe, it, expect, afterEach } from 'vitest';
import { usePopover } from '../src/component/popover';

function tick(): Promise<void> {
    return new Promise(res => { queueMicrotask(() => queueMicrotask(() => res())); });
}

let toCleanup: Array<() => void> = [];
afterEach(() => { toCleanup.forEach(fn => fn()); toCleanup = []; });

describe('usePopover data-placement', () => {
    it('sets data-placement on the content element after opening', async () => {
        const trigger = document.createElement('button');
        const content = document.createElement('div');
        document.body.append(trigger, content);

        const pop = usePopover({ trigger: 'manual', placement: 'bottom' });
        toCleanup.push(() => { pop.dispose(); trigger.remove(); content.remove(); });

        pop.setTrigger(trigger);
        pop.setContent(content);
        pop.open();
        await tick();

        const dp = content.getAttribute('data-placement');
        expect(dp).toBeTruthy();
        expect(dp).toMatch(/^bottom/);
    });
});

// Escape closes only the topmost popover (stack-aware)

describe('Escape stack-aware', () => {
    it('with two popovers open, Escape closes only the last one', () => {
        const p1 = usePopover({ trigger: 'manual' });
        const p2 = usePopover({ trigger: 'manual' });
        const t1 = document.createElement('button');
        const c1 = document.createElement('div');
        const t2 = document.createElement('button');
        const c2 = document.createElement('div');
        document.body.append(t1, c1, t2, c2);
        p1.setTrigger(t1); p1.setContent(c1);
        p2.setTrigger(t2); p2.setContent(c2);

        p1.open();
        p2.open();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(p2.isOpen()).toBe(false); // the top one closes
        expect(p1.isOpen()).toBe(true);  // the one beneath does NOT (without the fix it closed too)

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(p1.isOpen()).toBe(false);
        p1.dispose(); p2.dispose();
    });
});
