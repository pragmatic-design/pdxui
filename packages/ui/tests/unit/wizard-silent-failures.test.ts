// Two ways a `<pdx-wizard>` could render a page with no wizard in it, and say nothing.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/wizard/pdx-wizard';

/** A wizard whose panels are children of `el`, the arrangement that always worked. */
function flatWizard(stepCount = 3): HTMLElement {
    const el = document.createElement('pdx-wizard');
    for (let i = 0; i < stepCount; i++) el.appendChild(panel(i));
    return el;
}

/** A wizard whose panels sit one level down, inside a wrapper. */
function nestedWizard(stepCount = 3): HTMLElement {
    const el = document.createElement('pdx-wizard');
    const wrapper = document.createElement('div');
    wrapper.className = 'group';
    for (let i = 0; i < stepCount; i++) wrapper.appendChild(panel(i));
    el.appendChild(wrapper);
    return el;
}

function panel(i: number): HTMLElement {
    const step = document.createElement('div');
    step.setAttribute('data-wizard-step', '');
    step.setAttribute('data-label', `Step ${i + 1}`);
    step.textContent = `Content ${i + 1}`;
    return step;
}

async function place(el: HTMLElement): Promise<HTMLElement> {
    document.body.appendChild(el);
    await tick(100);
    return el;
}

/** Which panels are showing, as a string — `updatePanels` writes inline `display`. */
const panels = (el: HTMLElement) =>
    [...el.querySelectorAll<HTMLElement>('[data-wizard-step]')]
        .map(p => p.style.display || 'block').join(',');

let errors: string[];
beforeEach(() => {
    cleanup();
    errors = [];
    vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a.join(' ')); });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('a wizard whose panels are one level down', () => {
    // `discoverSteps()` searches with `querySelectorAll`, which is DEEP, so a nested panel is
    // found — and then `el.insertBefore(stepper, panel)` throws NotFoundError, because
    // insertBefore needs the reference node to be a child of `el`. The throw happens inside the
    // component's own requestAnimationFrame, so the console stayed empty: the class was applied,
    // nothing else was, and four steps rendered stacked with no way to move between them.
    //
    // Nesting is the natural shape when the steps belong to two different forms: a <form> inside
    // a <form> is invalid HTML, so grouping the panels by form is the obvious arrangement — and
    // it was the one that failed.
    it('still builds its stepper', async () => {
        const el = await place(nestedWizard());
        expect(el.querySelector('.pdx-stepper'), 'no stepper: the build threw and said nothing').toBeTruthy();
    });

    it('and its footer, and shows one panel at a time', async () => {
        const el = await place(nestedWizard(4));
        expect(el.querySelector('.pdx-wizard-nav')).toBeTruthy();
        expect(el.querySelectorAll('[data-step-btn]').length).toBe(4);
        expect(panels(el), 'every panel is visible — the component never took over').toBe('block,none,none,none');
    });

    it('and the stepper comes before the content, not after it', async () => {
        // Where it goes is the point: `insertBefore` was used to put it above the panels, and a
        // fix that appends it would pass "a stepper exists" while rendering the steps first.
        const el = await place(nestedWizard());
        const stepper = el.querySelector('.pdx-stepper')!;
        const wrapper = el.querySelector('.group')!;
        expect(stepper.compareDocumentPosition(wrapper) & Node.DOCUMENT_POSITION_FOLLOWING,
            'the stepper is not above the panels').toBeTruthy();
    });

    it('and nothing was thrown where nobody could see it', async () => {
        await place(nestedWizard());
        expect(errors, `the build threw: ${errors.join(' | ')}`).toEqual([]);
    });

    it('and a flat wizard is unchanged', async () => {
        // The control: the arrangement that always worked has to keep working, stepper first.
        const el = await place(flatWizard(3));
        expect(el.querySelector('.pdx-stepper')).toBeTruthy();
        expect(panels(el)).toBe('block,none,none');
        expect(el.firstElementChild!.classList.contains('pdx-stepper')).toBe(true);
    });
});

describe('a wizard given a non-finite value', () => {
    // `Math.min(NaN, 3)` is NaN, `Math.max(0, NaN)` is NaN, and `updatePanels(NaN)` matches no
    // index — so every panel got `display: none` and the screen went blank. Measured on the
    // production build: `value` went from 0 to NaN on an update that had nothing to do with the
    // wizard (typing in a field of the current step).
    it('keeps the panel it was showing', async () => {
        const el = await place(flatWizard(3)) as HTMLElement & { value: unknown };
        expect(panels(el)).toBe('block,none,none');

        el.value = NaN;
        await tick(50);
        expect(panels(el), 'a NaN blanked the whole component').toBe('block,none,none');
    });

    it('and still follows a real one', async () => {
        // The control: ignoring a bad value must not mean ignoring the prop.
        const el = await place(flatWizard(3)) as HTMLElement & { value: unknown };

        el.value = 2;
        await tick(50);
        expect(panels(el)).toBe('none,none,block');
    });
});
