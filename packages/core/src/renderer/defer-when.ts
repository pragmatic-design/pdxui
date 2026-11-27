// `@defer (when (x)) { … }` with nothing else: the body the first time the condition holds (#1287).
//
// defer() carries every trigger, the prefetch phase, the permission, the placeholder, loading and error
// states and the hydration's take-over, about 2.7 KB gzip. A block whose only trigger is a `when` uses
// none of them: `pdx-statistic`'s icon behind `@defer (when (icon))` brought all of it into every app
// with the library, and the component kept building its icon by hand. The compiler emits this for such
// a block, and defer() for any other — on the server and when hydrating too.
//
// The same rules as defer() for it: the condition fires once and the body is never removed by it;
// code that has arrived renders in the task the condition fires in (defer-code.ts); code still to load
// is an urgent load, ahead of the prefetches; a load that fails renders nothing, there being no
// `@error` to show. The body renders in its own scope, disposed with the block.

import { signal, effect, collectDisposers, untracked } from '../reactivity/signal';
import { placePartNode } from './part-nodes';
import { trackUrgentLoad } from './load-queue';
import { DEV } from '../utils/env';
import type { DeferCode } from './defer-code';

/**
 * A block that renders `render()` before its end marker the first time `when()` is truthy, once `code`
 * — the block's components, or null when it has none — has arrived.
 */
export function deferWhen(when: () => unknown, code: DeferCode | null, render: () => Node | DocumentFragment): DocumentFragment {
    const frag = document.createDocumentFragment();
    const end = document.createComment('/defer');
    frag.appendChild(end);
    const ready = signal(false);
    let fired = false;
    effect(() => {
        if (fired || !when()) return;
        fired = true;
        if (!code || code.arrived) { ready.set(true); return; }
        untracked(() => trackUrgentLoad(code()).then(
            () => ready.set(true),
            // No `@error` to render: the block stays empty, as defer() leaves it. Said in development,
            // where defer() would have rendered an `@error` had there been one.
            (err: unknown) => { if (DEV) console.warn('[pdx] A @defer block\'s code did not load, and it renders nothing:', err); },
        ));
    });
    effect(() => {
        const parent = end.parentNode;
        if (!ready() || !parent) return;
        // Built untracked, as defer() builds a state: this effect follows `ready` and nothing else.
        return untracked(() => {
            const [content, dispose] = collectDisposers(render);
            const nodes = content instanceof DocumentFragment ? Array.from(content.childNodes) : [content];
            for (const n of nodes) placePartNode(parent, n, end);
            return () => { for (const n of nodes) n.parentNode?.removeChild(n); dispose(); };
        });
    });
    return frag;
}
