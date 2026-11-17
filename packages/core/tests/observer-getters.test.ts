// The DOM bridges take the element or a getter for it, and a getter is followed (#1158).
//
// The docs promise that a bridge given `() => box()` "attaches when a :ref fills at mount". The
// observer bridges called the getter once, at creation — in a component's setup, where a :ref is
// still empty — so `fromResize(() => card)` observed nothing, ever. `fromEvents` took no getter at
// all. Each case here starts with the getter empty and fills it afterwards.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { fromEvents } from '../src/reactivity/from-event';
import { fromIntersection, fromResize, fromMutation } from '../src/reactivity/from-observer';

/** A stand-in for ResizeObserver / IntersectionObserver: records what it observes, and can emit. */
class FakeObserver {
    static instances: FakeObserver[] = [];
    observed: Element[] = [];
    disconnected = false;
    constructor(public readonly callback: (entries: unknown[]) => void) { FakeObserver.instances.push(this); }
    observe(el: Element): void { this.observed.push(el); }
    unobserve(): void { /* not used by the bridges */ }
    disconnect(): void { this.disconnected = true; }
    /** The live observer watching `el`, if one is. */
    static watching(el: Element): FakeObserver | undefined {
        return FakeObserver.instances.find((o) => !o.disconnected && o.observed.includes(el));
    }
}

afterEach(() => {
    vi.unstubAllGlobals();
    FakeObserver.instances = [];
});

describe('fromResize follows a getter', () => {
    it('observes the element once the getter yields it, and reports its size', () => {
        vi.stubGlobal('ResizeObserver', FakeObserver);
        const el = signal<Element | null>(null);
        const size = fromResize(() => el());
        const card = document.createElement('div');
        el.set(card);

        const observer = FakeObserver.watching(card);
        expect(observer, 'nothing observes the element the getter yielded').toBeDefined();
        observer!.callback([{ contentRect: { width: 120, height: 40 } }]);
        expect(size().width).toBe(120);
        size.dispose();
    });

    it('moves to a new element, lets go on null, and stops on dispose', () => {
        vi.stubGlobal('ResizeObserver', FakeObserver);
        const el = signal<Element | null>(null);
        const size = fromResize(() => el());
        const a = document.createElement('div');
        const b = document.createElement('div');
        el.set(a);
        el.set(b);
        expect(FakeObserver.watching(a)).toBeUndefined();
        expect(FakeObserver.watching(b)).toBeDefined();
        el.set(null);
        expect(FakeObserver.watching(b)).toBeUndefined();
        size.dispose();
        el.set(a);
        expect(FakeObserver.watching(a), 'a disposed bridge observed again').toBeUndefined();
    });
});

describe('fromIntersection follows a getter', () => {
    it('observes the element once the getter yields it, and reports its intersection', () => {
        vi.stubGlobal('IntersectionObserver', FakeObserver);
        const el = signal<Element | null>(null);
        const seen = fromIntersection(() => el());
        const box = document.createElement('div');
        el.set(box);

        const observer = FakeObserver.watching(box);
        expect(observer, 'nothing observes the element the getter yielded').toBeDefined();
        observer!.callback([{ isIntersecting: true, intersectionRatio: 0.5 }]);
        expect(seen().isIntersecting).toBe(true);
        seen.dispose();
    });
});

describe('fromMutation follows a getter', () => {
    it('counts the mutations of the node the getter yields', async () => {
        const node = signal<Node | null>(null);
        const changes = fromMutation(() => node());
        const list = document.createElement('ul');
        document.body.appendChild(list);
        node.set(list);
        list.appendChild(document.createElement('li'));
        await new Promise((r) => setTimeout(r, 0));
        expect(changes().count).toBe(1);
        changes.dispose();
        list.remove();
    });
});

describe('fromEvents takes a getter too', () => {
    it('listens on the target once the getter yields it, and lets go on dispose', () => {
        const target = signal<EventTarget | null>(null);
        const last = fromEvents<string>(() => target(), ['focus', 'blur'], { transform: (e) => e.type });
        const input = document.createElement('input');
        target.set(input);
        input.dispatchEvent(new Event('blur'));
        expect(last()).toBe('blur');
        last.dispose();
        input.dispatchEvent(new Event('focus'));
        expect(last(), 'a disposed bridge still listened').toBe('blur');
    });
});
