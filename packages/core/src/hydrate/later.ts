// A part taken over later (#160, part 4d): `@hydrate (trigger) { … }` in a template, and `@hydrate
// trigger;` in a script, for the component's whole host (hydrate/host.ts). Until its trigger fires,
// the server's markup stands as it was written — no binding, no handler. Then it is adopted as any
// block's content is, in the scope of the component that holds it, so it is disposed with it.
//
// The triggers are `@defer`'s, read by `@defer`'s own code — but `viewport` watches the part's own
// elements, not a sentinel: the markup here is the content, and a span put in it would be one more
// node than a mount has. `interaction` is the pointer coming over the part or the focus going in.
//
// The first event on the part does not wait: it hydrates the part at once and is dispatched again on
// the same element, once the handlers are there. A click and a submit are held until then — their
// default runs with the replay, so a link the part has not taken over yet still navigates, and a
// button still submits, through the handlers the part now has. Typing is not held: the field has its
// value, and the replayed `input` hands it to the binding.

import { collectDisposers, currentScope, onDispose, runInScope, type OwnerScope } from '../reactivity/signal';
import { activateTrigger, activateWhen } from '../renderer/defer';
import type { HydrateOnOptions } from '../renderer/hydrate-on';
import { DEV } from '../utils/env';
import { withHydration, withoutHydration, withLateAdoption } from './mode';

/** The events that hydrate the part at once, and are dispatched again once it is live. */
const REPLAYED = ['click', 'submit', 'input', 'change', 'keydown'] as const;
/** Of those, the ones whose default waits for the replay. */
const HELD: ReadonlySet<string> = new Set(['click', 'submit']);
/** What `interaction` means here: the pointer over the part, the focus in it. */
const INTERACTION = ['pointerover', 'focusin'] as const;

/** A part waiting for its trigger: where its events are heard, which of them are its, what shows it. */
export interface WaitingPart {
    /** The element whose descendants the part's events reach. */
    readonly listener: Element;
    /** Whether an event's target is in the part. */
    inPart(target: EventTarget | null): boolean;
    /** The elements `viewport` watches. */
    elements(): Element[];
}

/**
 * Wait for a trigger in `options`, or for the first event on `part`: `fire` runs once, with that
 * event or null. Returns what stops the wait. A trigger that fires at once (`immediate`, an unknown
 * one) fires before this returns.
 */
export function waitForTrigger(
    part: WaitingPart,
    options: HydrateOnOptions,
    scope: OwnerScope | null,
    fire: (first: Event | null) => void,
): () => void {
    const disarm: (() => void)[] = [];
    let done = false;
    const stop = (): void => {
        done = true;
        for (const off of disarm.splice(0)) off();
    };
    const fireOnce = (first: Event | null): void => {
        if (done) return;
        stop();
        fire(first);
    };

    const onEvent = (e: Event): void => {
        if (done || !part.inPart(e.target)) return;
        if (HELD.has(e.type)) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
        fireOnce(e);
    };
    for (const type of REPLAYED) {
        part.listener.addEventListener(type, onEvent, true);
        disarm.push(() => part.listener.removeEventListener(type, onEvent, true));
    }

    for (const trigger of (options.trigger ?? '').split('|').map((t) => t.trim()).filter(Boolean)) {
        if (done) break;
        if (trigger === 'viewport') disarm.push(watchViewport(part, () => fireOnce(null)));
        else if (trigger === 'interaction') disarm.push(watchInteraction(part, () => fireOnce(null)));
        else {
            const off = activateTrigger(trigger, part.listener, part.listener.lastChild ?? part.listener, scope, () => fireOnce(null));
            if (off) disarm.push(off);
        }
    }
    if (options.when && !done) disarm.push(activateWhen(options.when, () => fireOnce(null)));
    return stop;
}

/**
 * Take over the content between `start` and `end` when a trigger in `options` fires, or at the first
 * event on it: `adopt` takes it over from what `renderFn` makes. A markup that is not the render, or
 * a render that throws, is rendered afresh in its place, which shows a real error again.
 */
export function takeOverLater(
    start: Comment,
    end: Comment,
    options: HydrateOnOptions,
    renderFn: () => Node | DocumentFragment,
    adopt: (render: () => unknown) => void,
): void {
    const parent = end.parentNode;
    const scope = currentScope();

    const takeOver = (): void => {
        const [adopted, dispose] = collectDisposers(() => {
            try {
                withHydration(() => withLateAdoption(() => adopt(renderFn)));
                return true;
            } catch (error) {
                if (DEV) console.warn(`[pdx] a @hydrate part renders afresh: ${error instanceof Error ? error.message : String(error)}`);
                return false;
            }
        });
        if (adopted) {
            onDispose(dispose);
            return;
        }
        dispose();
        for (let n = start.nextSibling; n && n !== end; n = start.nextSibling) n.parentNode?.removeChild(n);
        withoutHydration(() => end.parentNode?.insertBefore(renderFn(), end));
    };
    const fire = (first: Event | null): void => {
        if (scope) runInScope(scope, takeOver);
        else takeOver();
        if (first) replay(first);
    };

    // Not in an element (a fragment the page never placed): nothing to watch, nothing to put off.
    if (!(parent instanceof Element)) {
        fire(null);
        return;
    }
    const nodes = (): Node[] => {
        const list: Node[] = [];
        for (let n = start.nextSibling; n && n !== end; n = n.nextSibling) list.push(n);
        return list;
    };
    const stop = waitForTrigger({
        listener: parent,
        inPart: (target) => {
            if (!(target instanceof Node)) return false;
            let top: Node | null = target;
            while (top && top.parentNode !== parent) top = top.parentNode;
            return top !== null && nodes().includes(top);
        },
        elements: () => nodes().filter((n): n is Element => n instanceof Element),
    }, options, scope, fire);
    // Taken from the page with the component before it fired: nothing waits for it any more.
    onDispose(stop);
}

/** Fire when any element of the part comes near the viewport; the listener when it has none. */
function watchViewport(part: WaitingPart, fire: () => void): () => void {
    const observer = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) fire();
    }, { rootMargin: '100px' });
    const elements = part.elements();
    for (const el of elements.length > 0 ? elements : [part.listener]) observer.observe(el);
    return () => observer.disconnect();
}

/** Fire when the pointer comes over the part or the focus goes into it. */
function watchInteraction(part: WaitingPart, fire: () => void): () => void {
    const onEvent = (e: Event): void => { if (part.inPart(e.target)) fire(); };
    for (const type of INTERACTION) part.listener.addEventListener(type, onEvent, true);
    return () => { for (const type of INTERACTION) part.listener.removeEventListener(type, onEvent, true); };
}

/** The first event again, on the element it happened on, now that the part has its handlers. */
export function replay(e: Event): void {
    const target = e.target;
    // Rendered afresh, the element is gone: the event had no part left to reach.
    if (!(target instanceof Element) || !target.isConnected) return;
    // A submit runs as a form's own does, with its submitter, default included.
    if (e.type === 'submit' && target instanceof HTMLFormElement) {
        target.requestSubmit(e instanceof SubmitEvent ? e.submitter : null);
        return;
    }
    target.dispatchEvent(copyOf(e));
}

/** An event of the same kind and the same fields as `e`, to dispatch again. */
function copyOf(e: Event): Event {
    if (e instanceof MouseEvent) return new MouseEvent(e.type, e);
    if (e instanceof KeyboardEvent) return new KeyboardEvent(e.type, e);
    if (e instanceof InputEvent) return new InputEvent(e.type, e);
    return new Event(e.type, e);
}
