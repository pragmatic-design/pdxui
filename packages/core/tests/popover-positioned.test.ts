// usePopover's `positioned` option: one positioning system at a time.
//
// pdx-date-picker's panel is a bottom sheet below 640px, positioned by its stylesheet. A composable
// that still writes an inline left/top on it runs the sheet 8px off a phone screen, and inside a
// dialog the size observer chases the composable's own writes (38+ ResizeObserver loop errors per
// open). `positioned: () => false` hands the element back to the stylesheet: what was written is
// cleared, and nothing is written while it stays false. It is asked on every update, so a resize
// across the breakpoint switches between the two.
import { describe, it, expect, afterEach } from 'vitest';
import { usePopover } from '../src/component/popover';

function rect(x: number, y: number, w: number, h: number): DOMRect {
    return { x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h,
        toJSON() { return this; } } as DOMRect;
}

function scene() {
    const trigger = document.createElement('button');
    const content = document.createElement('div');
    document.body.append(trigger, content);
    // happy-dom lays nothing out, so the geometry is stated rather than measured.
    trigger.getBoundingClientRect = () => rect(100, 100, 50, 20);
    content.getBoundingClientRect = () => rect(0, 0, 80, 40);
    return { trigger, content };
}

const nextFrame = (): Promise<void> => new Promise(r => requestAnimationFrame(() => r()));

afterEach(() => { document.body.innerHTML = ''; });

describe('usePopover positioned', () => {
    it('while it returns false, no inline position is written', async () => {
        const { trigger, content } = scene();
        const pop = usePopover({ trigger: 'manual', positioned: () => false });
        pop.setTrigger(trigger);
        pop.setContent(content);
        pop.open();
        await nextFrame();
        expect(content.style.left).toBe('');
        expect(content.style.top).toBe('');
        expect(content.style.position).toBe('');
        pop.dispose();
    });

    it('a resize across the breakpoint switches: positioned, then handed back and cleared', async () => {
        const { trigger, content } = scene();
        let wide = true;
        const pop = usePopover({ trigger: 'manual', placement: 'bottom-start', positioned: () => wide });
        pop.setTrigger(trigger);
        pop.setContent(content);
        pop.open();
        await nextFrame();
        expect(content.style.left, 'above the breakpoint the popover positions').toBe('100px');
        expect(content.getAttribute('data-placement')).toBe('bottom-start');

        wide = false;
        window.dispatchEvent(new Event('resize'));
        expect(content.style.left, 'the inline left survived the switch to the sheet').toBe('');
        expect(content.style.top).toBe('');
        expect(content.style.position).toBe('');
        expect(content.hasAttribute('data-placement')).toBe(false);

        wide = true;
        window.dispatchEvent(new Event('resize'));
        expect(content.style.left).toBe('100px');
        pop.dispose();
    });

    it('the control: without the option the popover positions, as before', async () => {
        const { trigger, content } = scene();
        const pop = usePopover({ trigger: 'manual', placement: 'bottom-start' });
        pop.setTrigger(trigger);
        pop.setContent(content);
        pop.open();
        await nextFrame();
        expect(content.style.position).toBe('fixed');
        expect(content.style.left).toBe('100px');
        pop.dispose();
    });
});
