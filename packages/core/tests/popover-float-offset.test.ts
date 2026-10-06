// `--pdx-float-offset` is a CSS token for a value only JS can apply.
//
// The token declares the gap between a trigger and its floating element, and no stylesheet can read
// it: that gap is not a CSS property of anything, it is a number handed to the positioning code.
// Read by no code, a theme setting `--pdx-float-offset: 12px` moves nothing, in any component, and
// a component that hardcodes the token's own value (`offset: 4`) beside it hides that.
//
// The reading happens where the floating element is in hand — `usePopover` positions it, so it
// reads the computed value off that element when the caller passed no offset of its own.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { usePopover } from '../src/component/popover';

/**
 * A trigger and a floating element with rects the test decides.
 *
 * The token is set on the FLOATING element itself, not on an ancestor. In a browser a custom
 * property inherits, so a theme declaring it on `:root` reaches here — but happy-dom does not
 * inherit custom properties into a child's computed style (measured: the value reads back on the
 * element that declares it and empty on its child). What is under test is that the floating
 * element's own computed value is what decides the gap; inheritance is the platform's job.
 */
function scene(offsetToken?: string) {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const trigger = document.createElement('button');
    const content = document.createElement('div');
    if (offsetToken) content.style.setProperty('--pdx-float-offset', offsetToken);
    container.append(trigger, content);

    // happy-dom lays nothing out, so the geometry is stated rather than measured.
    trigger.getBoundingClientRect = () => rect(100, 100, 50, 20);
    content.getBoundingClientRect = () => rect(0, 0, 80, 40);

    return { container, trigger, content };
}

function rect(x: number, y: number, w: number, h: number): DOMRect {
    return { x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h,
        toJSON() { return this; } } as DOMRect;
}

/** Open a popover on the scene and return the gap it left below the trigger. */
function gapBelowTrigger(s: ReturnType<typeof scene>, options?: Parameters<typeof usePopover>[0]) {
    const pop = usePopover({ trigger: 'manual', placement: 'bottom-start', ...options });
    pop.setTrigger(s.trigger);
    pop.setContent(s.content);
    pop.open();

    const top = parseFloat(s.content.style.top);
    pop.dispose();
    return top - 120;   // the trigger's bottom edge
}

let scenes: HTMLElement[] = [];
beforeEach(() => { scenes = []; });
afterEach(() => { for (const s of scenes) s.remove(); document.body.innerHTML = ''; });

describe('the floating offset comes from the token', () => {
    it('a theme that sets --pdx-float-offset moves the floating element', () => {
        const s = scene('12px');
        scenes.push(s.container);

        expect(gapBelowTrigger(s), 'the token was declared and the gap ignored it').toBe(12);
    });

    it('a different value moves it differently — the control', () => {
        // Without this, a hardcoded 12 would satisfy the case above.
        const s = scene('20px');
        scenes.push(s.container);

        expect(gapBelowTrigger(s)).toBe(20);
    });

    it('an explicit offset from the caller still wins', () => {
        // The token is the DEFAULT, not an override: a component that asks for a particular gap
        // must keep getting it.
        const s = scene('12px');
        scenes.push(s.container);

        expect(gapBelowTrigger(s, { offset: 3 }), 'the token overrode an explicit request').toBe(3);
    });

    it('falls back to the composable default when no token is declared', () => {
        const s = scene();
        scenes.push(s.container);

        expect(gapBelowTrigger(s), 'with no token the previous default must stand').toBe(8);
    });

    it('a token in rem is resolved, not read as a number', () => {
        // getPropertyValue hands back the declared text. `1rem` is 16px, and treating the string
        // as a number would silently produce NaN — which positions the element at the top left.
        const s = scene('1rem');
        scenes.push(s.container);

        const gap = gapBelowTrigger(s);
        expect(Number.isNaN(gap), 'the offset became NaN').toBe(false);
        expect(gap).toBe(16);
    });

    it('a value it cannot make sense of falls back rather than breaking the position', () => {
        const s = scene('not-a-length');
        scenes.push(s.container);

        expect(gapBelowTrigger(s)).toBe(8);
    });
});
