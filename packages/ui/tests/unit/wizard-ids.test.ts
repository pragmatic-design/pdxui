// pdx-wizard's generated ids are unique per wizard, not per step index.
//
// As `pdx-wizard-panel-${i}` and `pdx-wizard-step-${i}`, two wizards on one page (the scenario page
// renders a horizontal and a vertical one) would repeat them, and the second wizard's step buttons
// would control the first one's panels. axe files duplicate-id-aria under «incomplete», not among
// the violations, so this test is the guard.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/wizard/pdx-wizard';

function wizardHtml(prefix: string, panelIds: string[] = []): string {
    return `<pdx-wizard>${['One', 'Two', 'Three'].map((label, i) =>
        `<div data-wizard-step data-label="${prefix} ${label}"${panelIds[i] ? ` id="${panelIds[i]}"` : ''}>${label}</div>`,
    ).join('')}</pdx-wizard>`;
}

beforeEach(cleanup);

describe('pdx-wizard ids', () => {
    it('two wizards on one page generate distinct ids, each step button controlling its own panel', async () => {
        document.body.innerHTML = wizardHtml('A') + wizardHtml('B');
        await tick(100);

        const wizards = [...document.querySelectorAll('pdx-wizard')];
        const ids = [...document.querySelectorAll('pdx-wizard [id]')].map(e => e.id);
        expect(ids.length, 'the wizards generated no ids').toBe(12);
        expect(new Set(ids).size, `ids collide between the two wizards: ${ids.join(', ')}`).toBe(12);

        for (const w of wizards) {
            const buttons = [...w.querySelectorAll('[data-step-btn]')];
            const panels = [...w.querySelectorAll('[data-wizard-step]')];
            buttons.forEach((btn, i) => {
                const controlled = document.getElementById(btn.getAttribute('aria-controls')!);
                expect(controlled, `${btn.getAttribute('aria-label')} controls a panel of the other wizard`).toBe(panels[i]);
            });
            const active = panels.find(p => p.getAttribute('aria-hidden') === 'false')!;
            expect(document.getElementById(active.getAttribute('aria-labelledby')!)).toBe(buttons[panels.indexOf(active)]);
        }
    });

    it('a panel id the author wrote is kept, and the step button points at it', async () => {
        document.body.innerHTML = wizardHtml('A', ['account', 'profile', 'confirm']);
        await tick(100);
        const btn = document.querySelector('[data-step-btn="1"]')!;
        expect(document.getElementById('profile')?.hasAttribute('data-wizard-step'), 'the author id was overwritten').toBe(true);
        expect(btn.getAttribute('aria-controls')).toBe('profile');
    });
});
