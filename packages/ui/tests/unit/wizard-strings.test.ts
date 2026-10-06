// pdx-wizard's Next and Complete come from its component strings.
//
// It registers `next: 'Next'` and `complete: 'Complete'` and reads them: a footer button written
// `isLast ? 'Complete' : 'Next'` would show «Next» in an app that translated wizard.next, and the
// literal-string guard does not see a textContent assigned a conditional of two literals.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { setComponentStrings, clearComponentStrings } from '@pdxui/core';
import '../../src/wizard/pdx-wizard';

function mountWizard(steps = 2): HTMLElement {
    const el = document.createElement('pdx-wizard');
    for (let i = 0; i < steps; i++) {
        const step = document.createElement('div');
        step.setAttribute('data-wizard-step', '');
        step.setAttribute('data-label', `Passo ${i + 1}`);
        el.appendChild(step);
    }
    document.body.appendChild(el);
    return el;
}

async function nextText(el: HTMLElement, expected: string): Promise<void> {
    await vi.waitFor(() => {
        expect(el.querySelector('[data-wizard-next]')?.textContent).toBe(expected);
    }, { timeout: 2000 });
}

afterEach(() => {
    document.body.innerHTML = '';
    clearComponentStrings();
});

describe('pdx-wizard — the footer button is translatable', () => {
    it('reads wizard.next, and wizard.complete on the last step', async () => {
        setComponentStrings('wizard', { next: 'Avanti', complete: 'Fine' });
        const el = mountWizard();
        await nextText(el, 'Avanti');
        el.querySelector<HTMLButtonElement>('[data-wizard-next]')!.click();
        await nextText(el, 'Fine');
    });

    it('the control: with no override it is the English default, Next then Complete', async () => {
        const el = mountWizard();
        await nextText(el, 'Next');
        el.querySelector<HTMLButtonElement>('[data-wizard-next]')!.click();
        await nextText(el, 'Complete');
    });
});
