// Reveal-on-scroll and the FLIP helper.
//
// IntersectionObserver and Element.animate are the two browser APIs this file is built on, and
// happy-dom has neither in a usable form. Both are stubbed, which is not a compromise here: the
// point of these tests is what the module DECIDES when an entry arrives, and a stub is the only way
// to deliver an entry on demand instead of waiting for a scroll that will never happen.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useScrollAnimation, captureRect, animateSharedElement } from '../src/renderer/scroll-animation';

type Cb = (entries: { isIntersecting: boolean; intersectionRatio: number }[]) => void;

/** The observers created during a test, in creation order, with their callback exposed. */
let observers: {
    callback: Cb;
    options: { threshold?: number | number[]; rootMargin?: string };
    observed: Element[];
    unobserved: Element[];
    disconnected: boolean;
}[];

let el: HTMLElement;

beforeEach(() => {
    observers = [];
    document.body.innerHTML = '';
    el = document.createElement('div');
    document.body.appendChild(el);

    vi.stubGlobal('IntersectionObserver', class {
        constructor(cb: Cb, options: Record<string, unknown>) {
            const rec = { callback: cb, options, observed: [] as Element[], unobserved: [] as Element[], disconnected: false };
            observers.push(rec as never);
            Object.assign(this, { _rec: rec });
        }
        observe(target: Element) { (this as never as { _rec: { observed: Element[] } })._rec.observed.push(target); }
        unobserve(target: Element) { (this as never as { _rec: { unobserved: Element[] } })._rec.unobserved.push(target); }
        disconnect() { (this as never as { _rec: { disconnected: boolean } })._rec.disconnected = true; }
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

/** Deliver an intersection entry to the observer under test. */
function intersect(inView: boolean, ratio = inView ? 1 : 0, which = 0): void {
    observers[which].callback([{ isIntersecting: inView, intersectionRatio: ratio }]);
}

describe('useScrollAnimation — before anything has scrolled', () => {
    it('starts out of view, with the out-view class already on the element', () => {
        const a = useScrollAnimation(() => el);
        expect(a.isInView()).toBe(false);
        expect(a.ratio()).toBe(0);
        expect(a.hasTriggered()).toBe(false);
        expect(el.classList.contains('pdx-out-view'),
            'the element must be styled as hidden before the first frame, or it flashes').toBe(true);
        a.dispose();
    });

    it('observes the element with the options it was given', () => {
        const a = useScrollAnimation(() => el, { threshold: [0, 0.5, 1], rootMargin: '100px' });
        expect(observers[0].observed).toEqual([el]);
        expect(observers[0].options.threshold).toEqual([0, 0.5, 1]);
        expect(observers[0].options.rootMargin).toBe('100px');
        a.dispose();
    });

    it('defaults to a tenth visible and no margin', () => {
        const a = useScrollAnimation(() => el);
        expect(observers[0].options.threshold).toBe(0.1);
        expect(observers[0].options.rootMargin).toBe('0px');
        a.dispose();
    });

    it('observes nothing when there is no element', () => {
        const a = useScrollAnimation(() => null);
        expect(observers).toHaveLength(0);
        expect(a.isInView()).toBe(false);
        a.dispose();
    });
});

describe('useScrollAnimation — entering and leaving', () => {
    it('swaps the classes and reports the ratio on the way in', () => {
        const a = useScrollAnimation(() => el);
        intersect(true, 0.42);

        expect(a.isInView()).toBe(true);
        expect(a.ratio()).toBe(0.42);
        expect(a.hasTriggered()).toBe(true);
        expect(el.classList.contains('pdx-in-view')).toBe(true);
        expect(el.classList.contains('pdx-out-view')).toBe(false);
        a.dispose();
    });

    it('swaps them back on the way out', () => {
        const a = useScrollAnimation(() => el);
        intersect(true);
        intersect(false);

        expect(a.isInView()).toBe(false);
        expect(el.classList.contains('pdx-in-view')).toBe(false);
        expect(el.classList.contains('pdx-out-view')).toBe(true);
        a.dispose();
    });

    it('keeps hasTriggered true after leaving — it records history, not state', () => {
        const a = useScrollAnimation(() => el);
        intersect(true);
        intersect(false);
        expect(a.isInView()).toBe(false);
        expect(a.hasTriggered()).toBe(true);
        a.dispose();
    });

    it('uses the class names it was given', () => {
        const a = useScrollAnimation(() => el, { inViewClass: 'shown', outViewClass: 'hidden' });
        expect(el.classList.contains('hidden')).toBe(true);
        intersect(true);
        expect(el.classList.contains('shown')).toBe(true);
        expect(el.classList.contains('hidden')).toBe(false);
        a.dispose();
    });
});

describe('useScrollAnimation — once', () => {
    it('stops observing after the first entry', () => {
        const a = useScrollAnimation(() => el, { once: true });
        intersect(true);
        expect(observers[0].unobserved).toEqual([el]);
        a.dispose();
    });

    it('keeps the in-view class if a late entry says it left', () => {
        // The point of `once`: a reveal that has happened stays happened. An entry can still arrive
        // between the intersection and the unobserve, and it must not undo the reveal.
        const a = useScrollAnimation(() => el, { once: true });
        intersect(true);
        intersect(false);
        expect(el.classList.contains('pdx-in-view'),
            'a one-shot reveal was un-revealed by a trailing entry').toBe(true);
        expect(el.classList.contains('pdx-out-view')).toBe(false);
        a.dispose();
    });

    it('still applies the out-view class if it leaves before ever entering', () => {
        // The control on the case above: `once` must not mean "never react to leaving", only
        // "never un-reveal". Before the first reveal the element is still a normal one.
        const a = useScrollAnimation(() => el, { once: true });
        el.classList.add('pdx-in-view');    // as if something else had set it
        intersect(false);
        expect(el.classList.contains('pdx-out-view')).toBe(true);
        expect(el.classList.contains('pdx-in-view')).toBe(false);
        a.dispose();
    });

    it('keeps observing when once is off', () => {
        const a = useScrollAnimation(() => el);
        intersect(true);
        expect(observers[0].unobserved).toEqual([]);
        a.dispose();
    });
});

describe('useScrollAnimation — teardown', () => {
    it('disconnects the observer', () => {
        const a = useScrollAnimation(() => el);
        a.dispose();
        expect(observers[0].disconnected).toBe(true);
    });

    it('can be disposed twice', () => {
        const a = useScrollAnimation(() => el);
        a.dispose();
        expect(() => a.dispose()).not.toThrow();
    });
});

describe('captureRect / animateSharedElement — FLIP', () => {
    /** Element.animate does not exist in happy-dom; this records what it was asked to play. */
    function stubAnimate(target: HTMLElement) {
        const calls: { keyframes: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
        (target as unknown as { animate: unknown }).animate = (k: Keyframe[], o: KeyframeAnimationOptions) => {
            calls.push({ keyframes: k, options: o });
            return { finished: Promise.resolve() } as unknown as Animation;
        };
        return calls;
    }

    function rect(x: number, y: number, w: number, h: number): DOMRect {
        return { left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, x, y,
            toJSON: () => ({}) } as DOMRect;
    }

    it('captureRect asks the element where it is', () => {
        const target = document.createElement('div');
        (target as unknown as { getBoundingClientRect: unknown }).getBoundingClientRect = () => rect(5, 6, 7, 8);
        expect(captureRect(target).left).toBe(5);
    });

    it('animates from the delta between the two positions, and lands at identity', async () => {
        const target = document.createElement('div');
        (target as unknown as { getBoundingClientRect: unknown }).getBoundingClientRect = () => rect(100, 200, 50, 20);
        const calls = stubAnimate(target);

        await animateSharedElement(target, rect(0, 0, 100, 40));

        const [from, to] = calls[0].keyframes as unknown as { transform: string; transformOrigin: string }[];
        // was at 0,0 and 100x40; is at 100,200 and 50x20 → travel back -100,-200 and scale 2x
        expect(from.transform).toBe('translate(-100px, -200px) scale(2, 2)');
        expect(from.transformOrigin, 'a centred origin would scale about the wrong point').toBe('top left');
        expect(to.transform).toBe('translate(0, 0) scale(1, 1)');
    });

    it('defaults to 300ms ease, and does not leave the transform behind', async () => {
        const target = document.createElement('div');
        (target as unknown as { getBoundingClientRect: unknown }).getBoundingClientRect = () => rect(0, 0, 10, 10);
        const calls = stubAnimate(target);

        await animateSharedElement(target, rect(0, 0, 10, 10));

        expect(calls[0].options.duration).toBe(300);
        expect(calls[0].options.easing).toBe('ease');
        expect(calls[0].options.fill,
            'a filled animation pins the element to its final keyframe forever').toBe('none');
    });

    it('takes the duration and easing it is given', async () => {
        const target = document.createElement('div');
        (target as unknown as { getBoundingClientRect: unknown }).getBoundingClientRect = () => rect(0, 0, 10, 10);
        const calls = stubAnimate(target);

        await animateSharedElement(target, rect(0, 0, 10, 10), { duration: 40, easing: 'linear' });

        expect(calls[0].options.duration).toBe(40);
        expect(calls[0].options.easing).toBe('linear');
    });
});
