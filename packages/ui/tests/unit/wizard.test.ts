// Tests for pdx-wizard component.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';

import '../../src/wizard/pdx-wizard';

describe('pdx-wizard', () => {
    beforeEach(cleanup);

    async function mountWizard(attrs: Record<string, string> = {}, stepCount = 3): Promise<HTMLElement> {
        const el = document.createElement('pdx-wizard');
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);

        for (let i = 0; i < stepCount; i++) {
            const step = document.createElement('div');
            step.setAttribute('data-wizard-step', '');
            step.setAttribute('data-label', `Step ${i + 1}`);
            if (i === 1) step.setAttribute('data-description', 'Extra info');
            step.textContent = `Content ${i + 1}`;
            el.appendChild(step);
        }

        document.body.appendChild(el);
        await tick(100);
        return el;
    }

    // ─── Rendering ───────────────────────────────────────

    it('renders stepper header', async () => {
        const el = await mountWizard();
        const stepper = el.querySelector('.pdx-stepper');
        expect(stepper).toBeTruthy();
    });

    it('renders correct number of step buttons', async () => {
        const el = await mountWizard({}, 4);
        const buttons = el.querySelectorAll('[data-step-btn]');
        expect(buttons.length).toBe(4);
    });

    it('renders navigation footer', async () => {
        const el = await mountWizard();
        const nav = el.querySelector('.pdx-wizard-nav');
        expect(nav).toBeTruthy();
    });

    it('shows first step content by default', async () => {
        const el = await mountWizard();
        const steps = el.querySelectorAll('[data-wizard-step]');
        expect(steps[0].getAttribute('aria-hidden')).toBe('false');
        expect(steps[1].getAttribute('aria-hidden')).toBe('true');
        expect(steps[2].getAttribute('aria-hidden')).toBe('true');
    });

    it('hides nav when hide-nav set', async () => {
        const el = await mountWizard({ 'hidenav': '' });
        const nav = el.querySelector('.pdx-wizard-nav');
        expect(nav).toBeNull();
    });

    it('hides stepper when hide-stepper set', async () => {
        const el = await mountWizard({ 'hidestepper': '' });
        const stepper = el.querySelector('.pdx-stepper');
        expect(stepper).toBeNull();
    });

    // ─── Navigation ──────────────────────────────────────

    it('advances to next step via Next button', async () => {
        const el = await mountWizard();
        const nextBtn = el.querySelector<HTMLButtonElement>('[data-wizard-next]')!;
        nextBtn.click();
        await tick(100);

        const steps = el.querySelectorAll('[data-wizard-step]');
        expect(steps[0].getAttribute('aria-hidden')).toBe('true');
        expect(steps[1].getAttribute('aria-hidden')).toBe('false');
    });

    it('goes back via Back button', async () => {
        const el = await mountWizard();
        // Go to step 2
        const nextBtn = el.querySelector<HTMLButtonElement>('[data-wizard-next]')!;
        nextBtn.click();
        await tick(100);

        // Go back
        const backBtn = el.querySelector<HTMLButtonElement>('[data-wizard-back]')!;
        backBtn.click();
        await tick(100);

        const steps = el.querySelectorAll('[data-wizard-step]');
        expect(steps[0].getAttribute('aria-hidden')).toBe('false');
    });

    it('hides Back button on first step', async () => {
        const el = await mountWizard();
        const backBtn = el.querySelector<HTMLButtonElement>('[data-wizard-back]')!;
        expect(backBtn.style.visibility).toBe('hidden');
    });

    it('shows Complete on last step', async () => {
        const el = await mountWizard({}, 2);
        const nextBtn = el.querySelector<HTMLButtonElement>('[data-wizard-next]')!;
        nextBtn.click();
        await tick(100);

        expect(nextBtn.textContent).toBe('Complete');
    });

    // ─── Linear mode ─────────────────────────────────────

    it('prevents clicking ahead in linear mode', async () => {
        const el = await mountWizard();
        // Try clicking step 3 directly
        const btn3 = el.querySelector<HTMLButtonElement>('[data-step-btn="2"]')!;
        btn3.click();
        await tick(100);

        const steps = el.querySelectorAll('[data-wizard-step]');
        // Should still be on step 1
        expect(steps[0].getAttribute('aria-hidden')).toBe('false');
    });

    it('allows clicking any step in free mode', async () => {
        // Set linear=false via property (boolean attr 'false' is truthy)
        const el = document.createElement('pdx-wizard');
        (el as any).linear = false;
        for (let i = 0; i < 3; i++) {
            const step = document.createElement('div');
            step.setAttribute('data-wizard-step', '');
            step.setAttribute('data-label', `Step ${i + 1}`);
            step.textContent = `Content ${i + 1}`;
            el.appendChild(step);
        }
        document.body.appendChild(el);
        await tick(100);

        const btn3 = el.querySelector<HTMLButtonElement>('[data-step-btn="2"]')!;
        btn3.click();
        await tick(100);

        const steps = el.querySelectorAll('[data-wizard-step]');
        expect(steps[2].getAttribute('aria-hidden')).toBe('false');
    });

    it('allows clicking back to visited steps in linear mode', async () => {
        const el = await mountWizard();
        // Advance to step 2
        const nextBtn = el.querySelector<HTMLButtonElement>('[data-wizard-next]')!;
        nextBtn.click();
        await tick(100);

        // Click step 1
        const btn1 = el.querySelector<HTMLButtonElement>('[data-step-btn="0"]')!;
        btn1.click();
        await tick(100);

        const steps = el.querySelectorAll('[data-wizard-step]');
        expect(steps[0].getAttribute('aria-hidden')).toBe('false');
    });

    // ─── Stepper states ──────────────────────────────────

    it('marks completed steps as done', async () => {
        const el = await mountWizard();
        const nextBtn = el.querySelector<HTMLButtonElement>('[data-wizard-next]')!;
        nextBtn.click();
        await tick(100);

        const btn1 = el.querySelector<HTMLButtonElement>('[data-step-btn="0"]')!;
        expect(btn1.getAttribute('data-status')).toBe('done');
    });

    it('marks current step as active', async () => {
        const el = await mountWizard();
        const btn1 = el.querySelector<HTMLButtonElement>('[data-step-btn="0"]')!;
        expect(btn1.getAttribute('data-status')).toBe('active');
    });

    it('shows checkmark on completed step', async () => {
        const el = await mountWizard();
        const nextBtn = el.querySelector<HTMLButtonElement>('[data-wizard-next]')!;
        nextBtn.click();
        await tick(100);

        const num = el.querySelector('[data-step-btn="0"] .pdx-step-number')!;
        expect(num.textContent).toBe('✓');
    });

    // ─── ARIA ────────────────────────────────────────────

    it('sets role=tablist on stepper', async () => {
        const el = await mountWizard();
        const stepper = el.querySelector('.pdx-stepper')!;
        expect(stepper.getAttribute('role')).toBe('tablist');
    });

    it('sets role=tab on step buttons', async () => {
        const el = await mountWizard();
        const btn = el.querySelector('[data-step-btn="0"]')!;
        expect(btn.getAttribute('role')).toBe('tab');
    });

    it('sets role=tabpanel on step content', async () => {
        const el = await mountWizard();
        const step = el.querySelector('[data-wizard-step]')!;
        expect(step.getAttribute('role')).toBe('tabpanel');
    });

    it('sets aria-selected on active tab', async () => {
        const el = await mountWizard();
        const btn1 = el.querySelector('[data-step-btn="0"]')!;
        expect(btn1.getAttribute('aria-selected')).toBe('true');
        const btn2 = el.querySelector('[data-step-btn="1"]')!;
        expect(btn2.getAttribute('aria-selected')).toBe('false');
    });

    it('sets aria-controls linking tab to panel', async () => {
        const el = await mountWizard();
        const btn = el.querySelector('[data-step-btn="0"]')!;
        // The id carries a per-instance uid: what matters is that it resolves to step 0.
        const panel = document.getElementById(btn.getAttribute('aria-controls')!);
        expect(panel).toBe(el.querySelector('[data-wizard-step]'));
    });

    // ─── Events ──────────────────────────────────────────

    it('emits pdx-change when navigating', async () => {
        const el = await mountWizard();
        let detail: any = null;
        el.addEventListener('pdx-change', (e: any) => { detail = e.detail; });

        const nextBtn = el.querySelector<HTMLButtonElement>('[data-wizard-next]')!;
        nextBtn.click();
        await tick(100);

        expect(detail).toEqual({ value: 1, previous: 0 });
    });

    it('emits pdx-complete on last step', async () => {
        const el = await mountWizard({}, 2);
        let completed = false;
        el.addEventListener('pdx-complete', () => { completed = true; });

        // Advance to last step
        const nextBtn = el.querySelector<HTMLButtonElement>('[data-wizard-next]')!;
        nextBtn.click();
        await tick(100);
        // Click Complete
        nextBtn.click();
        await tick(100);

        expect(completed).toBe(true);
    });

    it('pdx-before-change is cancelable', async () => {
        const el = await mountWizard();
        el.addEventListener('pdx-before-change', (e: Event) => { e.preventDefault(); });

        const nextBtn = el.querySelector<HTMLButtonElement>('[data-wizard-next]')!;
        nextBtn.click();
        await tick(100);

        // Should still be on step 1
        const steps = el.querySelectorAll('[data-wizard-step]');
        expect(steps[0].getAttribute('aria-hidden')).toBe('false');
    });

    it('a refused change leaves the panel on screen, not only the step marked current', async () => {
        // The wizard does not hide the panel of the step it refused to leave \u2014 otherwise the
        // user presses Next, is told they cannot go on, and the field they must fix is gone.
        // `aria-hidden` above is a different claim from what is DRAWN: it is `style.display` that
        // decides whether the correction can be reached.
        const el = await mountWizard();
        el.addEventListener('pdx-before-change', (e: Event) => { e.preventDefault(); });
        const panels = [...el.querySelectorAll<HTMLElement>('[data-wizard-step]')];
        const shown = () => panels.map(p => p.style.display || 'shown');
        expect(shown()[0], 'the first panel is not on screen to begin with').toBe('shown');

        el.querySelector<HTMLButtonElement>('[data-wizard-next]')!.click();
        await tick(100);

        expect(shown(), 'the refused step went off screen with nothing to replace it')
            .toEqual(['shown', ...panels.slice(1).map(() => 'none')]);
    });

    // ─── Orientation ─────────────────────────────────────

    it('adds vertical class and stepper-vertical', async () => {
        const el = await mountWizard({ orientation: 'vertical' });
        expect(el.classList.contains('pdx-wizard-vertical')).toBe(true);
        const stepper = el.querySelector('.pdx-stepper-vertical');
        expect(stepper).toBeTruthy();
    });

    // ─── Size ────────────────────────────────────────────

    it('adds sm class on stepper', async () => {
        const el = await mountWizard({ size: 'sm' });
        const stepper = el.querySelector('.pdx-stepper-sm');
        expect(stepper).toBeTruthy();
    });

    // ─── Disabled ────────────────────────────────────────

    it('adds disabled class when disabled', async () => {
        const el = await mountWizard({ disabled: '' });
        expect(el.classList.contains('pdx-wizard-disabled')).toBe(true);
    });

    // ─── Step indicator ──────────────────────────────────

    it('shows step indicator text', async () => {
        const el = await mountWizard({}, 3);
        const indicator = el.querySelector('[data-wizard-indicator]')!;
        expect(indicator.textContent).toContain('Step 1 of 3');
    });

    it('updates indicator on navigation', async () => {
        const el = await mountWizard({}, 3);
        const nextBtn = el.querySelector<HTMLButtonElement>('[data-wizard-next]')!;
        nextBtn.click();
        await tick(100);

        const indicator = el.querySelector('[data-wizard-indicator]')!;
        expect(indicator.textContent).toContain('Step 2 of 3');
    });

    // ─── Description attribute ───────────────────────────

    it('shows description in vertical mode', async () => {
        const el = await mountWizard({ orientation: 'vertical' });
        const desc = el.querySelector('.pdx-step-desc');
        expect(desc).toBeTruthy();
        expect(desc!.textContent).toBe('Extra info');
    });

    // ─── Connectors ──────────────────────────────────────

    it('renders connectors between steps (horizontal)', async () => {
        const el = await mountWizard({}, 3);
        const connectors = el.querySelectorAll('.pdx-step-connector');
        expect(connectors.length).toBe(2); // 3 steps = 2 connectors
    });

    it('marks connector as done when step completed', async () => {
        const el = await mountWizard({}, 3);
        const nextBtn = el.querySelector<HTMLButtonElement>('[data-wizard-next]')!;
        nextBtn.click();
        await tick(100);

        const conn = el.querySelector('[data-connector="0"]')!;
        expect(conn.getAttribute('data-status')).toBe('done');
    });
});
