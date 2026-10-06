import { describe, it, expect, beforeEach } from 'vitest';
import { createLiveRegion } from '../src/a11y/live-region';
import { useRovingTabindex } from '../src/a11y/roving-tabindex';

describe('LiveRegion', () => {
    it('creates polite and assertive regions in DOM', () => {
        const live = createLiveRegion();
        live.announce('hello', 'polite');
        const polite = document.querySelector('[aria-live="polite"]');
        expect(polite).not.toBeNull();
        live.announce('urgent', 'assertive');
        const assertive = document.querySelector('[aria-live="assertive"]');
        expect(assertive).not.toBeNull();
        live.dispose();
    });

    it('clears content', () => {
        const live = createLiveRegion();
        live.announce('msg', 'polite');
        live.clear();
        const polite = document.querySelector('[aria-live="polite"]') as HTMLElement;
        expect(polite?.textContent).toBe('');
        live.dispose();
    });

    it('removes elements on dispose', () => {
        const live = createLiveRegion();
        live.announce('a', 'polite');
        live.announce('b', 'assertive');
        live.dispose();
        expect(document.querySelector('[aria-live="polite"]')).toBeNull();
        expect(document.querySelector('[aria-live="assertive"]')).toBeNull();
    });
});

describe('RovingTabindex', () => {
    let container: HTMLDivElement;

    beforeEach(() => {
        container = document.createElement('div');
        container.setAttribute('role', 'toolbar');
        for (let i = 0; i < 4; i++) {
            const btn = document.createElement('button');
            btn.setAttribute('role', 'tab');
            btn.textContent = `Tab ${i}`;
            container.appendChild(btn);
        }
        document.body.appendChild(container);
    });

    it('sets tabindex=0 on first item, -1 on others', () => {
        const roving = useRovingTabindex(() => container);
        // Need to trigger effect
        expect(roving.activeIndex()).toBe(0);
        const buttons = container.querySelectorAll('button');
        expect(buttons[0].getAttribute('tabindex')).toBe('0');
        expect(buttons[1].getAttribute('tabindex')).toBe('-1');
        expect(buttons[2].getAttribute('tabindex')).toBe('-1');
        roving.dispose();
        container.remove();
    });

    it('focusNext moves to next item', () => {
        const roving = useRovingTabindex(() => container);
        roving.focusNext();
        expect(roving.activeIndex()).toBe(1);
        roving.focusNext();
        expect(roving.activeIndex()).toBe(2);
        roving.dispose();
        container.remove();
    });

    it('wraps around', () => {
        const roving = useRovingTabindex(() => container);
        roving.focusItem(3);
        roving.focusNext();
        expect(roving.activeIndex()).toBe(0); // wrapped
        roving.dispose();
        container.remove();
    });
});
