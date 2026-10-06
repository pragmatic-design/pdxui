// usePopover — the headless composable under Tooltip, Dropdown, Select, Combobox, Menu, DatePicker
// and ColorPicker.
//
// These cover the behaviours most likely to regress: the Escape stack, the light-DOM container
// escape hatch, the hover delays that keep a tooltip alive while the pointer crosses the gap.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePopover } from '../src/component/popover';

let trigger: HTMLElement;
let content: HTMLElement;

/** happy-dom returns all-zero rects; positioning has its own tests, so any rect will do here. */
function stubRect(el: HTMLElement, top = 0, left = 0, width = 100, height = 20): void {
    (el as unknown as { getBoundingClientRect: unknown }).getBoundingClientRect = () =>
        ({ top, left, width, height, right: left + width, bottom: top + height, x: left, y: top,
            toJSON: () => ({}) }) as DOMRect;
}

beforeEach(() => {
    document.body.innerHTML = '';
    trigger = document.createElement('button');
    content = document.createElement('div');
    document.body.append(trigger, content);
    stubRect(trigger);
    stubRect(content, 0, 0, 120, 80);
});

afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
});

const pointerdownOn = (el: EventTarget) =>
    el.dispatchEvent(new Event('pointerdown', { bubbles: true }));

const escape = () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

describe('usePopover — opening and closing', () => {
    it('starts closed and says so through aria-expanded', () => {
        const p = usePopover();
        expect(p.isOpen()).toBe(false);
        expect(p.triggerProps['aria-expanded']()).toBe(false);
        expect(p.triggerProps['aria-haspopup']).toBe('true');
        p.dispose();
    });

    it('opens, closes and toggles', () => {
        const p = usePopover();
        p.open();
        expect(p.isOpen()).toBe(true);
        p.close();
        expect(p.isOpen()).toBe(false);
        p.toggle();
        expect(p.isOpen()).toBe(true);
        p.dispose();
    });

    it('reports the change once, not on every call', () => {
        const onOpenChange = vi.fn();
        const p = usePopover({ onOpenChange });
        p.open();
        p.open();
        expect(onOpenChange).toHaveBeenCalledTimes(1);
        expect(onOpenChange).toHaveBeenCalledWith(true);
        p.close();
        p.close();
        expect(onOpenChange).toHaveBeenCalledTimes(2);
        p.dispose();
    });
});

describe('usePopover — triggers', () => {
    it('click toggles', () => {
        const p = usePopover({ trigger: 'click' });
        p.setTrigger(trigger);
        trigger.dispatchEvent(new Event('click', { bubbles: true }));
        expect(p.isOpen()).toBe(true);
        trigger.dispatchEvent(new Event('click', { bubbles: true }));
        expect(p.isOpen()).toBe(false);
        p.dispose();
    });

    it('hover opens after the open delay and closes after the close delay', () => {
        vi.useFakeTimers();
        const p = usePopover({ trigger: 'hover', hoverDelay: { open: 100, close: 200 } });
        p.setTrigger(trigger);

        trigger.dispatchEvent(new Event('mouseenter'));
        expect(p.isOpen(), 'opened before its delay').toBe(false);
        vi.advanceTimersByTime(100);
        expect(p.isOpen()).toBe(true);

        trigger.dispatchEvent(new Event('mouseleave'));
        expect(p.isOpen(), 'closed before its delay').toBe(true);
        vi.advanceTimersByTime(200);
        expect(p.isOpen()).toBe(false);
        p.dispose();
    });

    it('leaving before the open delay cancels the open', () => {
        vi.useFakeTimers();
        const p = usePopover({ trigger: 'hover', hoverDelay: { open: 100, close: 0 } });
        p.setTrigger(trigger);
        trigger.dispatchEvent(new Event('mouseenter'));
        trigger.dispatchEvent(new Event('mouseleave'));
        vi.advanceTimersByTime(500);
        expect(p.isOpen()).toBe(false);
        p.dispose();
    });

    it('moving onto the content keeps it open — that gap is why close is delayed', () => {
        vi.useFakeTimers();
        const p = usePopover({ trigger: 'hover', hoverDelay: { open: 0, close: 150 } });
        p.setTrigger(trigger);
        p.setContent(content);

        trigger.dispatchEvent(new Event('mouseenter'));
        vi.advanceTimersByTime(0);
        trigger.dispatchEvent(new Event('mouseleave'));
        content.dispatchEvent(new Event('mouseenter'));      // the pointer arrived in time
        vi.advanceTimersByTime(500);

        expect(p.isOpen(), 'the tooltip vanished while the pointer was inside it').toBe(true);
        p.dispose();
    });

    it('leaving the content closes it', () => {
        vi.useFakeTimers();
        const p = usePopover({ trigger: 'hover', hoverDelay: { open: 0, close: 50 } });
        p.setTrigger(trigger);
        p.setContent(content);
        p.open();

        content.dispatchEvent(new Event('mouseleave'));
        vi.advanceTimersByTime(50);

        expect(p.isOpen()).toBe(false);
        p.dispose();
    });

    it('focus opens, and blurring out of the whole popover closes', () => {
        const p = usePopover({ trigger: 'focus' });
        p.setTrigger(trigger);
        p.setContent(content);

        trigger.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        expect(p.isOpen()).toBe(true);

        trigger.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
        expect(p.isOpen()).toBe(false);
        p.dispose();
    });

    it('focus moving INTO the content does not close it', () => {
        const inner = document.createElement('input');
        content.appendChild(inner);
        const p = usePopover({ trigger: 'focus' });
        p.setTrigger(trigger);
        p.setContent(content);
        p.open();

        trigger.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: inner }));

        expect(p.isOpen(), 'tabbing into the panel closed it').toBe(true);
        p.dispose();
    });

    it('manual answers to nothing but its own API', () => {
        const p = usePopover({ trigger: 'manual' });
        p.setTrigger(trigger);
        trigger.dispatchEvent(new Event('click', { bubbles: true }));
        expect(p.isOpen()).toBe(false);
        p.open();
        expect(p.isOpen()).toBe(true);
        p.dispose();
    });
});

describe('usePopover — dismissing', () => {
    it('closes on a press outside', () => {
        const p = usePopover();
        p.setTrigger(trigger);
        p.setContent(content);
        p.open();

        pointerdownOn(document.body);

        expect(p.isOpen()).toBe(false);
        p.dispose();
    });

    it('ignores a press on the trigger or inside the content', () => {
        const inner = document.createElement('span');
        content.appendChild(inner);
        const p = usePopover();
        p.setTrigger(trigger);
        p.setContent(content);

        p.open();
        pointerdownOn(inner);
        expect(p.isOpen()).toBe(true);

        pointerdownOn(trigger);
        expect(p.isOpen()).toBe(true);
        p.dispose();
    });

    it('treats a press inside the container as inside — light DOM siblings', () => {
        // In a light-DOM custom element the trigger and the panel are siblings under the host, so
        // "outside the content" is not the same as "outside the component".
        const host = document.createElement('div');
        document.body.appendChild(host);
        const sibling = document.createElement('span');
        host.append(trigger, content, sibling);

        const p = usePopover({ container: host });
        p.setTrigger(trigger);
        p.setContent(content);
        p.open();

        pointerdownOn(sibling);

        expect(p.isOpen()).toBe(true);
        p.dispose();
    });

    it('accepts the container as a function, for a ref resolved later', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const sibling = document.createElement('span');
        host.append(trigger, content, sibling);

        const p = usePopover({ container: () => host });
        p.setTrigger(trigger);
        p.setContent(content);
        p.open();
        pointerdownOn(sibling);
        expect(p.isOpen()).toBe(true);
        p.dispose();
    });

    it('does not dismiss on outside press when told not to', () => {
        const p = usePopover({ dismissOnOutside: false });
        p.setTrigger(trigger);
        p.setContent(content);
        p.open();
        pointerdownOn(document.body);
        expect(p.isOpen()).toBe(true);
        p.dispose();
    });

    it('closes on Escape and gives focus back to the trigger', () => {
        const focusSpy = vi.spyOn(trigger, 'focus');
        const p = usePopover();
        p.setTrigger(trigger);
        p.setContent(content);
        p.open();

        escape();

        expect(p.isOpen()).toBe(false);
        expect(focusSpy, 'focus was left nowhere after the panel closed').toHaveBeenCalled();
        p.dispose();
    });

    it('Escape closes only the popover opened last', () => {
        // Nested menus: each instance has its own document listener, so without the stack every
        // open popover would close on one Escape.
        const outerContent = document.createElement('div');
        const innerContent = document.createElement('div');
        document.body.append(outerContent, innerContent);

        const outer = usePopover();
        outer.setTrigger(trigger);
        outer.setContent(outerContent);
        const inner = usePopover();
        inner.setContent(innerContent);

        outer.open();
        inner.open();
        escape();

        expect(inner.isOpen()).toBe(false);
        expect(outer.isOpen(), 'one Escape closed the whole nest').toBe(true);

        escape();
        expect(outer.isOpen()).toBe(false);

        outer.dispose();
        inner.dispose();
    });

    it('does not dismiss on Escape when told not to', () => {
        const p = usePopover({ dismissOnEscape: false });
        p.setTrigger(trigger);
        p.setContent(content);
        p.open();
        escape();
        expect(p.isOpen()).toBe(true);
        p.dispose();
    });

    it('ignores a key that is not Escape', () => {
        const p = usePopover();
        p.setTrigger(trigger);
        p.setContent(content);
        p.open();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
        expect(p.isOpen()).toBe(true);
        p.dispose();
    });
});

describe('usePopover — positioning the panel', () => {
    it('places the content and records the resolved placement', async () => {
        const p = usePopover({ placement: 'bottom-start' });
        p.setTrigger(trigger);
        p.setContent(content);
        p.open();
        await new Promise(r => requestAnimationFrame(() => r(null)));

        expect(content.style.position).toBe('fixed');
        expect(content.style.top).toMatch(/px$/);
        expect(content.getAttribute('data-placement'),
            'the arrow CSS keys off this attribute').toBeTruthy();
        p.dispose();
    });

    it('does not position anything while closed', () => {
        const p = usePopover();
        p.setTrigger(trigger);
        p.setContent(content);
        expect(content.style.position).toBe('');
        p.dispose();
    });

    it('repositions on scroll while open', async () => {
        const p = usePopover();
        p.setTrigger(trigger);
        p.setContent(content);
        p.open();
        await new Promise(r => requestAnimationFrame(() => r(null)));

        stubRect(trigger, 500, 0);          // the page scrolled under it
        window.dispatchEvent(new Event('scroll'));

        expect(content.style.top, 'the panel stayed where the trigger used to be').not.toBe('0px');
        p.dispose();
    });
});

describe('usePopover — refs and teardown', () => {
    it('unbinds the previous trigger when a new one is set', () => {
        const other = document.createElement('button');
        document.body.appendChild(other);
        const p = usePopover();
        p.setTrigger(trigger);
        p.setTrigger(other);

        trigger.dispatchEvent(new Event('click', { bubbles: true }));
        expect(p.isOpen(), 'the old trigger is still wired').toBe(false);

        other.dispatchEvent(new Event('click', { bubbles: true }));
        expect(p.isOpen()).toBe(true);
        p.dispose();
    });

    it('accepts null to unbind', () => {
        const p = usePopover();
        p.setTrigger(trigger);
        p.setTrigger(null);
        trigger.dispatchEvent(new Event('click', { bubbles: true }));
        expect(p.isOpen()).toBe(false);
        p.dispose();
    });

    it('takes its document listeners with it on dispose', () => {
        const p = usePopover();
        p.setTrigger(trigger);
        p.setContent(content);
        p.open();
        p.dispose();

        pointerdownOn(document.body);
        escape();

        // Nothing to assert on the closed popover beyond "it did not throw and did not react":
        // the listeners live on `document`, so a leak here outlives every component on the page.
        expect(p.isOpen()).toBe(true);
    });

    it('leaves no hover timer behind', () => {
        vi.useFakeTimers();
        const p = usePopover({ trigger: 'hover', hoverDelay: { open: 100, close: 100 } });
        p.setTrigger(trigger);
        trigger.dispatchEvent(new Event('mouseenter'));
        p.dispose();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('leaves the Escape stack as it found it', () => {
        // A disposed instance that stayed in the stack would swallow Escape for everyone after it.
        const first = usePopover();
        first.setContent(content);
        first.open();
        first.dispose();

        const otherContent = document.createElement('div');
        document.body.appendChild(otherContent);
        const second = usePopover();
        second.setContent(otherContent);
        second.open();

        escape();

        expect(second.isOpen(), 'a disposed popover was still holding the top of the stack').toBe(false);
        second.dispose();
    });
});
