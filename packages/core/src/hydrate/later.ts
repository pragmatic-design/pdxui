// A part taken over later (#160, part 4d): `@hydrate (trigger) { … }` on a generated page. Until its
// trigger fires, the server's markup stands as it was written — no binding, no handler. Then it is
// adopted as any block's content is, in the scope of the component that holds it, so it is disposed
// with it.
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

import { collectDisposers, currentScope, onDispose, runInScope } from '../reactivity/signal';
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
    const disarm: (() => void)[] = [];
    let done = false;
    let first: Event | null = null;

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

    const fire = (): void => {
        if (done) return;
        done = true;
        for (const off of disarm.splice(0)) off();
        if (scope) runInScope(scope, takeOver);
        else takeOver();
        if (first) replay(first);
    };

    // Taken from the page with the component before it fired: nothing waits for it any more.
    onDispose(() => {
        done = true;
        for (const off of disarm.splice(0)) off();
    });

    if (!(parent instanceof Element)) {
        // Not in an element (a fragment the page never placed): nothing to watch, nothing to put off.
        fire();
        return;
    }

    const inPart = (target: EventTarget | null): boolean => {
        if (!(target instanceof Node)) return false;
        let top: Node | null = target;
        while (top && top.parentNode !== parent) top = top.parentNode;
        for (let n = start.nextSibling; n && n !== end; n = n.nextSibling) if (n === top) return true;
        return false;
    };

    const onEvent = (e: Event): void => {
        if (done || !inPart(e.target)) return;
        if (HELD.has(e.type)) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
        first = e;
        fire();
    };
    for (const type of REPLAYED) {
        parent.addEventListener(type, onEvent, true);
        disarm.push(() => parent.removeEventListener(type, onEvent, true));
    }

    for (const trigger of (options.trigger ?? '').split('|').map((t) => t.trim()).filter(Boolean)) {
        if (done) return;
        if (trigger === 'viewport') disarm.push(watchViewport(start, end, parent, fire));
        else if (trigger === 'interaction') disarm.push(watchInteraction(parent, inPart, fire));
        else {
            const off = activateTrigger(trigger, parent, end, scope, fire);
            if (off) disarm.push(off);
        }
    }
    if (options.when && !done) disarm.push(activateWhen(options.when, fire));
}

/** Fire when any element of the part comes near the viewport; the part's container when it has none. */
function watchViewport(start: Comment, end: Comment, parent: Element, fire: () => void): () => void {
    const observer = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) fire();
    }, { rootMargin: '100px' });
    let watched = 0;
    for (let n = start.nextSibling; n && n !== end; n = n.nextSibling) {
        if (n instanceof Element) { observer.observe(n); watched++; }
    }
    if (watched === 0) observer.observe(parent);
    return () => observer.disconnect();
}

/** Fire when the pointer comes over the part or the focus goes into it. */
function watchInteraction(parent: Element, inPart: (target: EventTarget | null) => boolean, fire: () => void): () => void {
    const onEvent = (e: Event): void => { if (inPart(e.target)) fire(); };
    for (const type of INTERACTION) parent.addEventListener(type, onEvent, true);
    return () => { for (const type of INTERACTION) parent.removeEventListener(type, onEvent, true); };
}

/** The first event again, on the element it happened on, now that the part has its handlers. */
function replay(e: Event): void {
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
