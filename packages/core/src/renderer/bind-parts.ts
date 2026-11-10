// A part on several elements (#988): `data-part="option"` on every row of an `@for`, beside the rows,
// on two siblings. The script's `option` is then the array of the rendered elements, as the
// platform's `part` attribute names every element that carries it.

import { onDispose } from '../reactivity/signal';
import type { Signal } from '../utils/types';

/** What one array signal holds, the array being filled in this turn, and whether a settle is queued. */
interface Members { els: Set<Element>; draft: Element[] | null; queued: boolean }

const membersOf = new WeakMap<Signal<unknown>, Members>();

/** Document order: `a` before `b`, for two elements of the document. */
function byDocumentOrder(a: Element, b: Element): number {
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

/**
 * The members, settled: those in the document in document order, then those not in it in the order
 * they came. The same array again notifies nobody.
 */
function settle(sig: Signal<unknown>, m: Members): void {
    m.queued = false;
    m.draft = null;
    const placed: Element[] = [], pending: Element[] = [];
    for (const el of m.els) (el.isConnected ? placed : pending).push(el);
    const next = [...placed.sort(byDocumentOrder), ...pending];
    const now = sig.peek();
    if (Array.isArray(now) && now.length === next.length && now.every((el, i) => el === next[i])) return;
    sig.set(next);
}

function queueSettle(sig: Signal<unknown>, m: Members): void {
    if (m.queued) return;
    m.queued = true;
    queueMicrotask(() => settle(sig, m));
}

/**
 * Add `el` to the array the signal `value` holds, and take it out when the scope that rendered it is
 * disposed. A value that is not a signal is ignored, as by `bindRef`.
 *
 * A row is bound while it is being built, before it is in the document, and an `@for` binds a
 * thousand in one turn. So an added element is in the array at once, at its end — what `onMount`
 * reads, which runs in the same turn — and one microtask later the array is settled: document
 * order, and the elements whose scope was disposed taken out. One copy and one sort per turn, not
 * one per row. A row that only moves, as a keyed `@for` moves one, keeps its place in the array
 * until an element comes or goes.
 */
export function bindParts(el: Element, value: unknown): void {
    const sig = value as Signal<unknown>;
    if (typeof sig !== 'function' || typeof sig.set !== 'function') return;
    let m = membersOf.get(sig);
    if (!m) membersOf.set(sig, m = { els: new Set(), draft: null, queued: false });
    const members = m;
    members.els.add(el);
    if (members.draft) {
        members.draft.push(el);
    } else {
        // A new array for this turn: one already handed out is never changed under its reader.
        const now = sig.peek();
        members.draft = [...(Array.isArray(now) ? now as Element[] : []).filter((e) => members.els.has(e)), el];
        sig.set(members.draft);
    }
    queueSettle(sig, members);
    onDispose(() => {
        if (members.els.delete(el)) queueSettle(sig, members);
    });
}
