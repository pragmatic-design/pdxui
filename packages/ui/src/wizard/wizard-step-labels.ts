// A step's label belongs to the APPLICATION, and it moves.
//
// `pdx-wizard` reads `data-label`, `data-description` and `data-icon` off each panel once, in
// `discoverSteps()`, and writes them into the stepper once, in `buildStepper()`. That holds for a
// label written in the markup and not for one the template binds:
//
//     <div data-wizard-step :data-label="$t('intake.steps.details')">
//
// The binding moves the ATTRIBUTE when the locale changes; the stepper, built before it, would keep
// the word it was built with — a step named «Details» between three Italian ones.
//
// There is no signal to track here: the attribute is written from outside the component, by whoever
// owns the panel. What the component can do is notice the write, which is what a MutationObserver
// with an attribute filter is for. It watches the three attributes and nothing else, so a panel's
// own re-render does not wake it.

/** What the wizard knows about one step: its panel and the three attributes its chrome reads. */
export interface StepMeta {
    index: number;
    label: string;
    description: string;
    icon: string;
    el: HTMLElement;
}

/** The attributes a step's chrome is built from. Anything else on a panel is the app's business. */
const WATCHED = ['data-label', 'data-description', 'data-icon'];

/**
 * Call `onChange` whenever one of a step panel's label attributes is written, wherever the panel
 * sits under `root` — a step nested inside a `<pdx-form>` or a `@for` is still a step. Returns the
 * function that stops watching; the caller ties it to its own teardown.
 */
export function watchStepLabels(root: Element, onChange: () => void): () => void {
    const observer = new MutationObserver(records => {
        for (const r of records) {
            if (r.type === 'attributes' && (r.target as Element).hasAttribute?.('data-wizard-step')) {
                onChange();
                return;
            }
        }
    });
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: WATCHED });
    return () => observer.disconnect();
}

/**
 * Re-read the three attributes into `steps`, in place. In place because the array is shared with the
 * component's stepper, its panels and its navigation, all of which index into it — and because a
 * panel added or removed is a different question from a label that changed, one this does not
 * pretend to answer: the steps it knows about are the steps it refreshes.
 *
 * Returns true when something actually changed, so a caller can skip the DOM work.
 */
export function refreshStepMeta(steps: StepMeta[]): boolean {
    let moved = false;
    for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const label = s.el.getAttribute('data-label') || `Step ${i + 1}`;
        const description = s.el.getAttribute('data-description') || '';
        const icon = s.el.getAttribute('data-icon') || '';
        if (label === s.label && description === s.description && icon === s.icon) continue;
        s.label = label;
        s.description = description;
        s.icon = icon;
        moved = true;
    }
    return moved;
}

/**
 * Write the labels into the stepper's buttons: the visible word, the description beside it when the
 * layout shows one, and the accessible name, which is the two of them joined exactly as
 * `buildStepper()` joins them — one rule for the name, not two that drift.
 */
export function applyStepLabels(stepper: Element, steps: StepMeta[]): void {
    const buttons = stepper.querySelectorAll<HTMLElement>('[data-step-btn]');
    buttons.forEach((btn, i) => {
        const s = steps[i];
        if (!s) return;
        btn.setAttribute('aria-label', stepName(s));

        const lbl = btn.querySelector('.pdx-step-label');
        if (lbl) lbl.textContent = s.label;

        // The description has an element only in the vertical layout, and only when the step had one
        // at build time. One that appears later joins the name above either way.
        const desc = btn.querySelector('.pdx-step-desc');
        if (desc) desc.textContent = s.description;
    });
}

/** The accessible name of a step: its label, and its description after an em dash when it has one. */
export function stepName(s: Pick<StepMeta, 'label' | 'description'>): string {
    return `${s.label}${s.description ? ' — ' + s.description : ''}`;
}
