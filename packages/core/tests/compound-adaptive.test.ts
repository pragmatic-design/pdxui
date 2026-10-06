import { describe, it, expect } from 'vitest';
import { createCompoundParent, discoverChildren } from '../src/component/compound';
import { createSlotManager } from '../src/component/typed-slots';
import { useAdaptive, adaptiveValue } from '../src/component/adaptive';
import { showSkeleton } from '../src/component/auto-skeleton';

describe('CompoundParent', () => {
    it('registers and unregisters children', () => {
        const parent = createCompoundParent<{ label: string }>();
        expect(parent.children().length).toBe(0);
        const dispose1 = parent.register({ label: 'Tab 1' });
        const dispose2 = parent.register({ label: 'Tab 2' });
        expect(parent.children().length).toBe(2);
        dispose1();
        expect(parent.children().length).toBe(1);
        expect(parent.children()[0].label).toBe('Tab 2');
        dispose2();
        expect(parent.children().length).toBe(0);
    });

    it('calls onChildAdded/onChildRemoved callbacks', () => {
        const added: string[] = [];
        const removed: string[] = [];
        const parent = createCompoundParent<string>({
            onChildAdded: (child) => added.push(child),
            onChildRemoved: (child) => removed.push(child),
        });
        const d = parent.register('A');
        expect(added).toEqual(['A']);
        d();
        expect(removed).toEqual(['A']);
    });

    it('notify calls onNotify', () => {
        let received: string | null = null;
        const parent = createCompoundParent({ onNotify: (event) => { received = event; } });
        parent.notify('tab-change');
        expect(received).toBe('tab-change');
    });
});

describe('discoverChildren', () => {
    it('finds children by selector', () => {
        const container = document.createElement('div');
        container.innerHTML = '<span class="item">A</span><span class="item">B</span><div>Not</div>';
        document.body.appendChild(container);
        const result = discoverChildren(() => container, { selector: '.item' });
        expect(result.items().length).toBe(2);
        result.dispose();
        container.remove();
    });
});

describe('SlotManager', () => {
    it('discovers named slots', () => {
        const host = document.createElement('div');
        host.innerHTML = '<div slot="header">H</div><div slot="footer">F</div><div>Default</div>';
        const slots = createSlotManager(host);
        expect(slots.hasSlot('header')).toBe(true);
        expect(slots.hasSlot('footer')).toBe(true);
        expect(slots.hasSlot('default')).toBe(true);
        expect(slots.hasSlot('nonexistent')).toBe(false);
    });

    it('renders fallback when slot is empty', () => {
        const host = document.createElement('div');
        const slots = createSlotManager(host);
        const result = slots.renderSlot('missing', undefined, () => 'Fallback text');
        expect(result).not.toBeNull();
        expect((result as HTMLElement).textContent).toBe('Fallback text');
    });
});

describe('useAdaptive', () => {
    it('returns forced mode', () => {
        const a = useAdaptive({ forceMode: 'mobile' });
        expect(a.mode()).toBe('mobile');
        expect(a.isMobile()).toBe(true);
        expect(a.isDesktop()).toBe(false);
    });

    it('adaptiveValue maps per mode', () => {
        const a = useAdaptive({ forceMode: 'desktop' });
        const val = adaptiveValue(a, { desktop: 'popover', mobile: 'bottomsheet' });
        expect(val()).toBe('popover');

        const m = useAdaptive({ forceMode: 'mobile' });
        const val2 = adaptiveValue(m, { desktop: 'popover', mobile: 'bottomsheet' });
        expect(val2()).toBe('bottomsheet');
    });
});

describe('AutoSkeleton', () => {
    it('shows and hides skeleton', () => {
        const el = document.createElement('div');
        el.innerHTML = '<h3>Title</h3><p>Text content</p>';
        document.body.appendChild(el);
        const dispose = showSkeleton(el);
        expect(el.querySelector('.pdx-skeleton')).not.toBeNull();
        expect(el.hasAttribute('data-pdx-skeleton')).toBe(true);
        dispose();
        expect(el.querySelector('.pdx-skeleton')).toBeNull();
        expect(el.hasAttribute('data-pdx-skeleton')).toBe(false);
        expect(el.innerHTML).toContain('Title');
        el.remove();
    });
});
