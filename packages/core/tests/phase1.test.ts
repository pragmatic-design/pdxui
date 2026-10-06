// Phase 1 tests: Popover headless, shallowStore, dev guardrails.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { signal, computed, effect, enableDevMode } from '../src/reactivity/signal';
import { shallowStore } from '../src/reactivity/store';
import { usePopover } from '../src/component/popover';

// ═══════════════════════════════════════════════════════════════
// 1.1: Popover headless
// ═══════════════════════════════════════════════════════════════

describe('usePopover()', () => {
    it('starts closed', () => {
        const pop = usePopover();
        expect(pop.isOpen()).toBe(false);
        pop.dispose();
    });

    it('open/close/toggle work', () => {
        const pop = usePopover();
        pop.open();
        expect(pop.isOpen()).toBe(true);
        pop.close();
        expect(pop.isOpen()).toBe(false);
        pop.toggle();
        expect(pop.isOpen()).toBe(true);
        pop.toggle();
        expect(pop.isOpen()).toBe(false);
        pop.dispose();
    });

    it('calls onOpenChange callback', () => {
        const changes: boolean[] = [];
        const pop = usePopover({ onOpenChange: (v) => changes.push(v) });
        pop.open();
        pop.close();
        expect(changes).toEqual([true, false]);
        pop.dispose();
    });

    it('triggerProps has correct ARIA', () => {
        const pop = usePopover();
        expect(pop.triggerProps['aria-haspopup']).toBe('true');
        expect(pop.triggerProps['aria-expanded']()).toBe(false);
        pop.open();
        expect(pop.triggerProps['aria-expanded']()).toBe(true);
        pop.dispose();
    });

    it('setTrigger binds click handler', () => {
        const pop = usePopover({ trigger: 'click' });
        const btn = document.createElement('button');
        document.body.appendChild(btn);
        pop.setTrigger(btn);

        btn.click();
        expect(pop.isOpen()).toBe(true);
        btn.click();
        expect(pop.isOpen()).toBe(false);

        pop.dispose();
        btn.remove();
    });

    it('Escape closes and restores focus to trigger', () => {
        const pop = usePopover({ trigger: 'manual' });
        const btn = document.createElement('button');
        const content = document.createElement('div');
        document.body.appendChild(btn);
        document.body.appendChild(content);

        pop.setTrigger(btn);
        pop.setContent(content);
        pop.open();

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(pop.isOpen()).toBe(false);

        pop.dispose();
        btn.remove();
        content.remove();
    });

    it('dispose cleans up everything', () => {
        const pop = usePopover();
        const btn = document.createElement('button');
        pop.setTrigger(btn);
        pop.dispose(); // should not throw

        btn.click(); // should not open (listener removed)
        expect(pop.isOpen()).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════
// 1.2: shallowStore
// ═══════════════════════════════════════════════════════════════

describe('shallowStore()', () => {
    it('tracks top-level property changes', () => {
        const s = shallowStore({ count: 0, name: 'test' });
        let readCount = 0;

        const dispose = effect(() => { s.count; readCount++; });
        expect(readCount).toBe(1);

        s.count = 5;
        expect(readCount).toBe(2);
        expect(s.count).toBe(5);
        dispose();
    });

    it('does NOT deep-proxy nested objects', () => {
        const s = shallowStore({ data: { items: [1, 2, 3] } });
        let readCount = 0;

        const dispose = effect(() => { s.data; readCount++; });
        expect(readCount).toBe(1);

        // Mutate nested — should NOT trigger (no deep proxy)
        s.data.items.push(4);
        expect(readCount).toBe(1); // unchanged!

        // Reassign top-level — SHOULD trigger
        s.data = { items: [1, 2, 3, 4, 5] };
        expect(readCount).toBe(2);
        dispose();
    });

    it('works with large arrays without overhead', () => {
        const big = Array.from({ length: 10_000 }, (_, i) => ({ id: i }));
        const s = shallowStore({ items: big });

        let len = 0;
        const dispose = effect(() => { len = s.items.length; });
        expect(len).toBe(10_000);

        // Reassign whole array
        s.items = big.slice(0, 100);
        expect(len).toBe(100);
        dispose();
    });
});

// ═══════════════════════════════════════════════════════════════
// 1.3: Dev guardrails
// ═══════════════════════════════════════════════════════════════

describe('dev guardrails', () => {
    afterEach(() => enableDevMode(false));

    it('warns on signal read outside tracking context', () => {
        enableDevMode(true);
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const count = signal(0, { name: 'devGuardCount' });
        count(); // read outside effect/computed

        expect(spy).toHaveBeenCalledWith(expect.stringContaining('devGuardCount'));
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('outside reactive context'));
        spy.mockRestore();
    });

    it('warns on signal write inside computed', () => {
        enableDevMode(true);
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const a = signal(0, { name: 'devA' });
        const b = signal(0, { name: 'devB' });

        // Writing b inside computed(a) is a dev mistake. The guardrail fires when the computed
        // RUNS — at its first read, since computeds are lazy.
        const c = computed(() => { b.set(a() + 1); return a(); });
        c();

        expect(spy).toHaveBeenCalledWith(expect.stringContaining('written inside computed'));
        spy.mockRestore();
    });

    it('does NOT warn when dev mode is off', () => {
        enableDevMode(false);
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const count = signal(0, { name: 'noWarnCount' });
        count(); // read outside — no warning expected

        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it('does NOT warn for reads inside effect()', () => {
        enableDevMode(true);
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const count = signal(0, { name: 'effectRead' });
        const dispose = effect(() => { count(); }); // inside tracking — no warning

        // The warn should NOT have been called for 'effectRead'
        const effectWarnings = spy.mock.calls.filter(c => String(c[0]).includes('effectRead'));
        expect(effectWarnings.length).toBe(0);

        spy.mockRestore();
        dispose();
    });
});
