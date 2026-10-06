// A step's label is the APP's copy, and it moves.
//
// `pdx-wizard` reads each panel's `data-label` once, in `discoverSteps()`, and writes it into the
// stepper button in `buildStepper()` — the visible text and the button's accessible name. Both are
// one-shot.
//
// The label is not a library string, so `uiString`/`uiAttr` never see it: it is the application's
// own copy, arriving through an attribute the template binds — the showcase writes
// `<div data-wizard-step :data-label="$t('intake.steps.details')">`. When the locale changes the
// ATTRIBUTE moves, and a stepper that did not follow would show, in Italian, a step named "Details"
// beside three Italian ones.
//
// ⚠️ What this file measures is the REFRESH — reading the attributes again and writing them into a
// stepper that already exists. What it does NOT measure is the TRIGGER, the MutationObserver that
// calls it, because happy-dom does not deliver a record when any time has passed since `observe()`:
// measured with a probe, install → write in the same tick delivers, install → wait 100 ms → write
// does not, with or without an attributeFilter, inside a rAF or not, and whether or not the observer
// and its callback are kept strongly referenced. The trigger is measured where it happens, in
// `packages/showcase/tests/intake.spec.ts`, by switching the language on a screen that binds those
// labels.
import { describe, it, expect, afterEach } from 'vitest';
import { refreshStepMeta, applyStepLabels, stepName, type StepMeta } from '../../src/wizard/wizard-step-labels';
import '../../src/wizard/pdx-wizard';

/** A stepper of the shape `buildStepper()` produces, which is what the refresh writes into. */
function buildFixture(labels: { label: string; description?: string }[]): {
    stepper: HTMLElement; steps: StepMeta[];
} {
    const stepper = document.createElement('nav');
    const steps: StepMeta[] = [];

    labels.forEach((l, i) => {
        const panel = document.createElement('div');
        panel.setAttribute('data-wizard-step', '');
        panel.setAttribute('data-label', l.label);
        if (l.description) panel.setAttribute('data-description', l.description);
        document.body.appendChild(panel);

        const btn = document.createElement('button');
        btn.setAttribute('data-step-btn', String(i));
        btn.setAttribute('aria-label', stepName({ label: l.label, description: l.description ?? '' }));
        const lbl = document.createElement('span');
        lbl.className = 'pdx-step-label';
        lbl.textContent = l.label;
        btn.appendChild(lbl);
        if (l.description) {
            const desc = document.createElement('span');
            desc.className = 'pdx-step-desc';
            desc.textContent = l.description;
            btn.appendChild(desc);
        }
        stepper.appendChild(btn);

        steps.push({ index: i, label: l.label, description: l.description ?? '', icon: '', el: panel });
    });

    document.body.appendChild(stepper);
    return { stepper, steps };
}

const btn = (stepper: Element, i: number) =>
    stepper.querySelector<HTMLElement>(`[data-step-btn="${i}"]`)!;

afterEach(() => {
    document.body.innerHTML = '';
});

describe('a step label rewritten after the stepper is built', () => {
    it('moves the button’s text and its accessible name', () => {
        const { stepper, steps } = buildFixture([{ label: 'Requester' }, { label: 'Details' }]);
        expect(btn(stepper, 1).getAttribute('aria-label')).toBe('Details');

        // What a bound `:data-label` does when the locale changes.
        steps[1].el.setAttribute('data-label', 'Dettagli');

        expect(refreshStepMeta(steps), 'nothing was seen to have changed').toBe(true);
        applyStepLabels(stepper, steps);

        expect(btn(stepper, 1).querySelector('.pdx-step-label')?.textContent).toBe('Dettagli');
        expect(btn(stepper, 1).getAttribute('aria-label'),
            'the visible text moved and the accessible name did not').toBe('Dettagli');
    });

    it('joins the description into the name exactly as the first build does', () => {
        const { stepper, steps } = buildFixture([
            { label: 'Requester' },
            { label: 'Details', description: 'What we need' },
        ]);
        steps[1].el.setAttribute('data-label', 'Dettagli');
        steps[1].el.setAttribute('data-description', 'Quel che serve');
        refreshStepMeta(steps);
        applyStepLabels(stepper, steps);

        expect(btn(stepper, 1).getAttribute('aria-label')).toBe('Dettagli — Quel che serve');
        expect(btn(stepper, 1).querySelector('.pdx-step-desc')?.textContent).toBe('Quel che serve');
    });

    it('control — a step nobody touched keeps its own label', () => {
        const { stepper, steps } = buildFixture([{ label: 'Requester' }, { label: 'Details' }]);
        steps[1].el.setAttribute('data-label', 'Dettagli');
        refreshStepMeta(steps);
        applyStepLabels(stepper, steps);

        expect(btn(stepper, 0).getAttribute('aria-label'),
            'one step’s change rewrote another’s').toBe('Requester');
        expect(btn(stepper, 0).querySelector('.pdx-step-label')?.textContent).toBe('Requester');
    });

    it('control — a label removed goes back to the numbered default', () => {
        const { stepper, steps } = buildFixture([{ label: 'Requester' }, { label: 'Details' }]);
        steps[1].el.removeAttribute('data-label');
        refreshStepMeta(steps);
        applyStepLabels(stepper, steps);

        expect(btn(stepper, 1).getAttribute('aria-label'),
            'the fallback is the one discoverSteps() applies at build').toBe('Step 2');
    });

    it('control — nothing written means nothing to write, and it says so', () => {
        // The refresh is called on every mutation the observer reports; a step whose attributes did
        // not change must not be rewritten, or an app that touches a panel repaints the stepper.
        const { stepper, steps } = buildFixture([{ label: 'Requester' }, { label: 'Details' }]);
        expect(refreshStepMeta(steps)).toBe(false);
        expect(btn(stepper, 1).getAttribute('aria-label')).toBe('Details');
    });
});
