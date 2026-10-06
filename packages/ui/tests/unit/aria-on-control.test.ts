// ARIA state on the element that has the role, not on the custom-element host.
//
// pdx-popover sets aria-expanded on the inner <button> of a pdx-button trigger, not on the host (no
// role); focus moves into the popover on opening; hover popovers answer keyboard focus too. pdx-tooltip's
// aria-describedby lands on the inner control, focus shows it, Escape hides it. pdx-progress writes
// aria-valuenow on its role="progressbar" element, not on the host.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';

import '../../src/button/pdx-button';
import '../../src/popover/pdx-popover';
import '../../src/tooltip/pdx-tooltip';
import '../../src/progress/pdx-progress';

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
function key(target: EventTarget, k: string): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

describe('pdx-popover on a pdx-button', () => {
    beforeEach(cleanup);

    async function mountPopover(extra = ''): Promise<{ button: HTMLButtonElement; host: HTMLElement; float: HTMLElement }> {
        document.body.innerHTML = `<div><pdx-button>Click me</pdx-button><pdx-popover ${extra}><p>Body text</p><a href="#x">A link</a></pdx-popover></div>`;
        await tick(30);
        await frame();
        return {
            button: document.querySelector('pdx-button button') as HTMLButtonElement,
            host: document.querySelector('pdx-button') as HTMLElement,
            float: document.querySelector('.pdx-popover-float') as HTMLElement,
        };
    }

    it('the inner button carries haspopup, expanded and controls; the host carries none', async () => {
        const { button, host, float } = await mountPopover();
        expect(button.getAttribute('aria-haspopup')).toBe('dialog');
        expect(button.getAttribute('aria-expanded')).toBe('false');
        button.click();
        await frame();
        expect(button.getAttribute('aria-expanded')).toBe('true');
        expect(document.getElementById(button.getAttribute('aria-controls') ?? '')).toBe(float);
        expect(host.hasAttribute('aria-expanded')).toBe(false);
        expect(host.hasAttribute('aria-haspopup')).toBe(false);
    });

    it('opening moves focus into the popover, Escape brings it back to the button', async () => {
        const { button } = await mountPopover();
        button.focus();
        button.click();
        await frame();
        await frame();
        expect(document.activeElement?.textContent).toBe('A link');
        key(document, 'Escape');
        await tick(10);
        expect(document.activeElement).toBe(button);
    });

    it('a hover popover also opens on keyboard focus, and closes when focus leaves', async () => {
        const { button, float } = await mountPopover('trigger="hover"');
        const other = document.createElement('button');
        document.body.appendChild(other);
        button.focus();
        await tick(10);
        expect(float.style.display).not.toBe('none');
        other.focus();
        await tick(200);
        expect(float.style.display).toBe('none');
    });

    it('is named by its heading when it has no aria-label', async () => {
        document.body.innerHTML = '<div><pdx-button>Info</pdx-button><pdx-popover><h3>Shipping</h3><p>2-3 days</p></pdx-popover></div>';
        await tick(30);
        const float = document.querySelector('.pdx-popover-float') as HTMLElement;
        const heading = document.getElementById(float.getAttribute('aria-labelledby') ?? '');
        expect(heading?.textContent).toBe('Shipping');
        expect(float.hasAttribute('aria-label')).toBe(false);
    });
});

describe('pdx-tooltip on a pdx-button', () => {
    beforeEach(cleanup);

    async function mountTooltip(): Promise<{ button: HTMLButtonElement; host: HTMLElement; float: HTMLElement }> {
        document.body.innerHTML = '<div><pdx-button>Save</pdx-button><pdx-tooltip text="Saves the draft" delay="0"></pdx-tooltip></div>';
        await tick(30);
        await frame();
        return {
            button: document.querySelector('pdx-button button') as HTMLButtonElement,
            host: document.querySelector('pdx-button') as HTMLElement,
            float: document.querySelector('.pdx-tooltip-float') as HTMLElement,
        };
    }

    it('describes the inner button, not the host', async () => {
        const { button, host, float } = await mountTooltip();
        expect(document.getElementById(button.getAttribute('aria-describedby') ?? '')).toBe(float);
        expect(host.hasAttribute('aria-describedby')).toBe(false);
    });

    it('shows on keyboard focus of the inner button, and Escape hides it without moving focus', async () => {
        const { button, float } = await mountTooltip();
        button.focus();
        await tick(20);
        expect(float.style.display).not.toBe('none');
        key(button, 'Escape');
        await tick(10);
        expect(float.style.display).toBe('none');
        expect(document.activeElement).toBe(button);
    });
});

describe('pdx-progress value on the progressbar', () => {
    beforeEach(cleanup);

    it('aria-valuenow is on the role="progressbar" element, not on the host', async () => {
        document.body.innerHTML = '<pdx-progress value="65"></pdx-progress>';
        await tick(30);
        const bar = document.querySelector('[role="progressbar"]')!;
        expect(bar.getAttribute('aria-valuenow')).toBe('65');
        expect(document.querySelector('pdx-progress')!.hasAttribute('aria-valuenow')).toBe(false);
    });

    it('the value is in the bar\'s own range, and the label is its text', async () => {
        document.body.innerHTML = '<pdx-progress value="3" max="5" label="3 of 5 steps"></pdx-progress>';
        await tick(30);
        const bar = document.querySelector('[role="progressbar"]')!;
        expect(bar.getAttribute('aria-valuenow')).toBe('3');
        expect(bar.getAttribute('aria-valuemax')).toBe('5');
        expect(bar.getAttribute('aria-valuetext')).toBe('3 of 5 steps');
    });

    it('indeterminate has no value; circular carries it too', async () => {
        document.body.innerHTML = '<pdx-progress></pdx-progress><pdx-progress circular value="40"></pdx-progress>';
        await tick(30);
        const [linear, ring] = Array.from(document.querySelectorAll('[role="progressbar"]'));
        expect(linear.hasAttribute('aria-valuenow')).toBe(false);
        expect(ring.getAttribute('aria-valuenow')).toBe('40');
    });
});
