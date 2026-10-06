// What a keyboard drag tells assistive technology.
//
// Not `aria-grabbed`, deprecated in WAI-ARIA 1.1: the native accessibility-API drag and drop that
// was meant to replace it never arrived, and the guidance settled on exposing the operation
// through what a screen reader still reads. So a role description, reachable instructions, and an
// announcement at each step — the same shape as `<pdx-sortable-list>`.
//
// The browser half is `drag-primitives.spec.ts`, which drives real keys and reads the live region.
// This is the fast half: the attributes, the opt-outs, and that the description points at an
// element that exists.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useDrag } from '../src/component/drag';

let el: HTMLElement;

beforeEach(() => {
    el = document.createElement('div');
    el.textContent = 'Invoice 42';
    document.body.appendChild(el);
});

afterEach(() => {
    el.remove();
    document.getElementById('pdx-drag-instructions')?.remove();
});

describe('useDrag: what it tells assistive technology', () => {
    it('never sets aria-grabbed, lifted or not', () => {
        const drag = useDrag(() => el);
        expect(el.hasAttribute('aria-grabbed')).toBe(false);

        el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        // The control: the key did something, so the absence below is not an inert element.
        expect(drag.isDragging(), 'Space did not lift it — this test is measuring nothing').toBe(true);
        expect(el.hasAttribute('aria-grabbed'), 'aria-grabbed is deprecated in WAI-ARIA 1.1').toBe(false);

        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(el.hasAttribute('aria-grabbed')).toBe(false);
        drag.dispose();
    });

    it('says it is draggable, and describes how', () => {
        const drag = useDrag(() => el);
        expect(el.getAttribute('aria-roledescription')).toBe('draggable');

        const id = el.getAttribute('aria-describedby');
        expect(id, 'a keyboard drag nobody is told about is not discoverable').toBeTruthy();
        const help = document.getElementById(id!);
        expect(help, 'aria-describedby points at no element').not.toBeNull();
        expect(help!.textContent).toMatch(/Space/);
        expect(help!.textContent).toMatch(/Escape/);
        drag.dispose();
    });

    it('keeps a description the caller had already written', () => {
        // Appended, not assigned: an element that already describes itself does not lose that.
        el.setAttribute('aria-describedby', 'caller-note');
        const drag = useDrag(() => el);
        const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/);
        expect(ids, 'the caller\'s own description was overwritten').toContain('caller-note');
        expect(ids.length).toBe(2);
        drag.dispose();
    });

    it('shares one instructions element between draggables', () => {
        const other = document.createElement('div');
        document.body.appendChild(other);
        const a = useDrag(() => el);
        const b = useDrag(() => other);
        expect(document.querySelectorAll('#pdx-drag-instructions')).toHaveLength(1);
        expect(el.getAttribute('aria-describedby')).toBe(other.getAttribute('aria-describedby'));
        a.dispose(); b.dispose(); other.remove();
    });

    it('a11y: false leaves the element alone, for a component that speaks for itself', () => {
        // `<pdx-sortable-list>` announces "position 3 of 7", which this cannot know: a caller that
        // has better words must be able to stop these.
        const drag = useDrag(() => el, { a11y: false });
        expect(el.hasAttribute('aria-roledescription')).toBe(false);
        expect(el.hasAttribute('aria-describedby')).toBe(false);
        drag.dispose();
    });

    it('takes the caller\'s own wording', () => {
        const drag = useDrag(() => el, {
            a11y: { roleDescription: 'trascinabile', instructions: 'Premi Spazio per sollevare.' },
        });
        expect(el.getAttribute('aria-roledescription')).toBe('trascinabile');
        expect(document.getElementById('pdx-drag-instructions')!.textContent)
            .toBe('Premi Spazio per sollevare.');
        drag.dispose();
    });
});
