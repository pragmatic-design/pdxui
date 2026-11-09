// The helpers' blocks while hydrating (#160, part 4): how each takes over what the server wrote for it,
// read from the call a helper defers (renderer/deferred-block.ts). Only hydrate/adopt.ts reads it, so a
// page that does not hydrate carries none of it.
//
// A block that can adopts its markers and the content between them in the state it is in now — the
// branch the condition picks, the case, the rows — in the scope a mount would give it, and hands what it
// adopted to the helper's own follow function, which keeps it current from there as a mounted block.
// The others are built as the client builds them and put in place of the server's copy.

import { collectDisposers, signal, untracked } from '../reactivity/signal';
import { when, match, show, portal, followWhen, followMatch, showNodes, caseFor } from '../renderer/helpers';
import { whenChain, followChain } from '../renderer/when-chain';
import { followList, mountList, type MappedItem, type RowRenderer, type RowSignals } from '../renderer/list';
import { defer, followDefer } from '../renderer/defer';
import { awaitBlock, followAwait } from '../renderer/await';
import { errorBoundary, followBoundary } from '../renderer/error-boundary';
import { pushErrorHandler, popErrorHandler } from '../reactivity/signal';
import { renderSnippet, followSnippet, snippetContent } from '../renderer/snippet';
import { dynamic, followDynamic } from '../renderer/dynamic';
import type { BlockVisitor } from '../renderer/deferred-block';
import { hydrateOn } from '../renderer/hydrate-on';
import { eachVirtual, followVirtual, type VirtualCall, type VirtualRow } from '../renderer/virtual-list';
import { listOf, isPaged, type PagedSource } from '../renderer/virtual-set';
import { withoutHydration, type Adopter } from './mode';
import { takeOverLater } from './later';
import { offerRange } from './compiled';

/** A block's adoption: from `at` on in `parent`, before `end`; returns the node after what it took. */
export type BlockAdopt = (a: Adopter, parent: Node, at: Node | null, end: Node | null) => Node | null;

export const hydrationBlocks: BlockVisitor<BlockAdopt> = {
    when: (condition, thenFn, elseFn, options) => (a, parent, at) => {
        const start = a.expect(at, 'when');
        const end = a.close(start, 'when', '/when');
        const shown = !!untracked(condition);
        const [, dispose] = collectDisposers(() => a.between(() => (shown ? thenFn() : (elseFn?.() ?? null)), parent, start, end));
        followWhen(start, end, condition, thenFn, elseFn, options, { show: shown, dispose });
        return end.nextSibling;
    },

    chain: (select, branches) => (a, parent, at) => {
        const start = a.expect(at, 'when');
        const end = a.close(start, 'when', '/when');
        const index = untracked(select);
        const branch = branches[index];
        const [, dispose] = collectDisposers(() => a.between(() => (branch ? branch() : null), parent, start, end));
        followChain(start, end, select, branches, { index, dispose });
        return end.nextSibling;
    },

    match: (value, cases) => (a, parent, at) => {
        const start = a.expect(at, 'match');
        const end = a.close(start, 'match', '/match');
        const key = String(untracked(value));
        const caseFn = caseFor(cases, key);
        const [, dispose] = collectDisposers(() => a.between(() => (caseFn ? caseFn() : null), parent, start, end));
        followMatch(start, end, value, cases, { key, dispose });
        return end.nextSibling;
    },

    show: (condition, content) => (a, parent, at, end) => {
        // Hidden, the server wrote each top-level text as the `show` comment that keeps its place.
        const hidden = untracked(condition) ? undefined : new Map<Text, Comment>();
        const before = at ? at.previousSibling : (end ? end.previousSibling : parent.lastChild);
        const next = a.value(content, parent, at, end, hidden);
        // The content's top-level nodes, with each hidden text in the place its comment keeps.
        const byPlaceholder = new Map<Node, Text>();
        for (const [text, placeholder] of hidden ?? []) byPlaceholder.set(placeholder, text);
        const nodes: Node[] = [];
        for (let n = before ? before.nextSibling : parent.firstChild; n && n !== next; n = n.nextSibling) nodes.push(byPlaceholder.get(n) ?? n);
        const placeholders = new Map<Text, Comment>(hidden);
        for (const n of nodes) if (n instanceof Text && !placeholders.has(n)) placeholders.set(n, document.createComment('show'));
        showNodes(nodes, condition, placeholders);
        return next;
    },

    list: (items, keyFn, renderer, options) => (a, parent, at) => {
        const start = a.expect(at, 'repeat-start');
        const end = a.close(start, 'repeat-start', 'repeat-end');
        const list = untracked(items);
        const keys = list.map((item, i) => keyFn(item, i));
        let next: Node | null = start.nextSibling;
        const mapped = list.map((item, i) => {
            const row = adoptRow(a, renderer, keys[i], item, i, parent, next, end);
            next = row.next;
            return row.mapped;
        });
        if (next !== end) a.fail('the list has markup its rows do not');
        followList(start, end, items, keyFn, renderer, options, { mapped, keys });
        return end.nextSibling;
    },

    virtual: (call) => (a, parent, at) => adoptVirtual(a, parent, at, call),

    defer: (options, loadFn, renderFn) => (a, parent, at) => {
        const start = a.expect(at, 'defer');
        const end = a.close(start, 'defer', '/defer');
        // The span the server writes for a viewport trigger, first: the trigger takes it.
        const first = start.nextSibling;
        const sentinel = first instanceof HTMLElement && first.localName === 'span' && first.style.visibility === 'hidden'
            && (options.trigger ?? '').split('|').some((t) => t.trim() === 'viewport') ? first : null;
        followDefer(start, end, options, loadFn, renderFn, { sentinel, adopt: (render) => a.between(render, parent, sentinel ?? start, end) });
        return end.nextSibling;
    },
    await: (source, thenFn, loadingFn, errorFn, options) => (a, parent, at) => {
        const start = a.expect(at, 'await');
        const end = a.close(start, 'await', '/await');
        followAwait(start, end, source, thenFn, loadingFn, errorFn, options, (render) => a.between(render, parent, start, end));
        return end.nextSibling;
    },
    boundary: (contentFn, fallbackFn, options) => (a, parent, at) => {
        const start = a.expect(at, 'error-boundary');
        const end = a.close(start, 'error-boundary', '/error-boundary');
        // The server marks a fallback `pdx-caught`: the markup would not tell it from the content.
        const mark = start.nextSibling;
        let caught: Error | null = null;
        if (mark && mark.nodeType === 8 && (mark as Comment).data === CAUGHT) {
            parent.removeChild(mark);
            caught = errorOf(contentFn);
            // The content renders here, where it threw on the server: the client renders it afresh.
            if (!caught) {
                for (let n = start.nextSibling; n && n !== end; n = start.nextSibling) parent.removeChild(n);
                withoutHydration(() => followBoundary(start, end, contentFn, fallbackFn, options, null));
                return end.nextSibling;
            }
        }
        followBoundary(start, end, contentFn, fallbackFn, options, { caught, adopt: (render) => a.between(render, parent, start, end) });
        return end.nextSibling;
    },
    portal: (contentFn, target, options) => built('portal', null, () => portal(contentFn, target, options)),
    snippet: (source, args, fallback) => (a, parent, at) => {
        const start = a.expect(at, 'snippet');
        const end = a.close(start, 'snippet', '/snippet');
        // What the snippet renders now, as the client's first run renders it: a node, or nothing.
        const [, dispose] = collectDisposers(() => a.between(() => {
            const content = untracked(() => snippetContent(source(), args(), fallback));
            return content instanceof Node ? content : null;
        }, parent, start, end));
        followSnippet(start, end, source, args, fallback, { dispose });
        return end.nextSibling;
    },
    hydrateOn: (options, renderFn) => (a, parent, at) => {
        const start = a.expect(at, 'hydrate');
        const end = a.close(start, 'hydrate', '/hydrate');
        takeOverLater(start, end, options, renderFn, (render) => a.between(render, parent, start, end));
        return end.nextSibling;
    },
    dynamic: (tagFn, propsFn, options) => (a, _parent, at) => {
        const start = a.expect(at, 'dynamic');
        const end = a.close(start, 'dynamic', '/dynamic');
        // The element the server wrote for the tag named now, or nothing for no tag.
        const tag = untracked(tagFn);
        const el = start.nextSibling;
        if (tag ? !(el instanceof Element) || el.localName !== tag || el.nextSibling !== end : el !== end) {
            a.fail(`<component :is> expected ${tag ? `<${tag}>` : 'nothing'} in its place`);
        }
        followDynamic(end, tagFn, propsFn, options, tag ? (el as Element) : null);
        return end.nextSibling;
    },
};

/**
 * Each helper's call made as the client makes it, out of a hydration: what a value adopted while
 * hydrating becomes when it has to be built. `build` builds the content a call holds already made —
 * `show()`'s.
 */
export function builders(build: (node: Node) => Node): BlockVisitor<DocumentFragment> {
    return {
        when: (condition, thenFn, elseFn, options) => when(condition, thenFn, elseFn, options),
        chain: (select, branches) => whenChain(select, branches),
        match: (value, cases) => match(value, cases),
        show: (condition, content) => show(condition, build(content)),
        list: (items, keyFn, renderer, options) => mountList(items, keyFn, renderer, options),
        virtual: (call) => eachVirtual(call.items, call.keyFn, call.render, call.options),
        defer: (options, loadFn, renderFn) => defer(options, loadFn, renderFn),
        await: (source, thenFn, loadingFn, errorFn, options) => awaitBlock(source, thenFn, loadingFn, errorFn, options),
        boundary: (contentFn, fallbackFn, options) => errorBoundary(contentFn, fallbackFn, options),
        portal: (contentFn, target, options) => portal(contentFn, target, options),
        snippet: (source, args, fallback) => renderSnippet(source, args, fallback),
        dynamic: (tagFn, propsFn, options) => dynamic(tagFn, propsFn, options),
        hydrateOn: (options, renderFn) => hydrateOn(options, renderFn),
    };
}

/**
 * A block that does not adopt: built as the client builds it, out of the hydration, and put where the
 * server's copy was, between its markers `open` and `close` (null for a single marker).
 */
function built(open: string, close: string | null, build: () => DocumentFragment): BlockAdopt {
    return (a, parent, at) => {
        const start = a.expect(at, open);
        const last = close === null ? start : a.close(start, open, close);
        const next = last.nextSibling;
        // Built and put in out of the hydration: a component in it connects there, and mounts.
        withoutHydration(() => {
            const fresh = build();
            for (let n: Node | null = start; n && n !== next;) {
                const following: Node | null = n.nextSibling;
                parent.removeChild(n);
                n = following;
            }
            parent.insertBefore(fresh, next);
        });
        return next;
    };
}

/**
 * A virtual list the server wrote (#930): its markers, the spacer before, the rows of its first window —
 * each marked with its index —, the spacer after, and `@empty` when there was nothing to show. Each row
 * is adopted as a list row is, in its own scope, and handed to the list with the spacers: the list keeps
 * those its first window holds, by key, and builds or drops the others. A window that starts at 0, as a
 * page that has not scrolled does, keeps the rows the server wrote.
 */
function adoptVirtual<T>(a: Adopter, parent: Node, at: Node | null, call: VirtualCall<T>): Node | null {
    const start = a.expect(at, 'virtual');
    const end = a.close(start, 'virtual', '/virtual');
    const isSpacer = (n: Node | null): n is HTMLElement => n instanceof HTMLElement && n.getAttribute('aria-hidden') === 'true' && !('virtualIndex' in n.dataset);
    const before = start.nextSibling;
    if (!isSpacer(before)) a.fail('a virtual list without the spacer before its rows');
    const source = untracked(call.items);
    const data = listOf(source);
    const renderer = (call.options.getters
        ? { mode: 'getters', render: call.render }
        : { mode: 'value', render: call.render }) as RowRenderer<T>;
    const rows: VirtualRow<T>[] = [];
    let next: Node | null = before.nextSibling;
    while (next instanceof HTMLElement && 'virtualIndex' in next.dataset) {
        const index = Number(next.dataset.virtualIndex);
        if (index !== rows.length || index >= data.length) a.fail(`a virtual list's row ${index}, where its data has row ${rows.length} of ${data.length}`);
        const node = next;
        const item = data[index];
        const key = call.keyFn(item, index);
        const row = adoptRow(a, renderer, key, item, index, parent, node, end);
        rows.push({ key, node, dispose: row.mapped.dispose ?? (() => {}), item: row.mapped.row?.item, index: row.mapped.row?.index });
        next = row.next;
    }
    if (!isSpacer(next)) a.fail('a virtual list without the spacer after its rows');
    const after = next;
    // `@empty`, as the server wrote it with nothing to show: adopted as one node, which the list removes
    // when rows come, as it removes the one it builds.
    let empty: Node | null = null;
    if (after.nextSibling !== end) {
        const loading = isPaged<T>(source) && ((source as PagedSource<T>).isLoading?.() ?? false);
        if (data.length > 0 || loading || !call.options.empty) a.fail('a virtual list has markup after its rows that is not its @empty');
        empty = after.nextSibling;
        // A compiled `@empty` takes its run over itself, as a compiled row does (hydrate/compiled.ts).
        const emptyFn = call.options.empty;
        const content = offerRange({ parent, at: empty, next: null }, () => emptyFn());
        if (a.value(content, parent, empty, end) !== end) a.fail('a virtual list has markup after its @empty');
    }
    // Out of the hydration: the list's first run builds the rows its window holds that the server did not
    // write, as a mount builds them.
    withoutHydration(() => followVirtual(call, { start, end, before, after }, { rows, empty }));
    return end.nextSibling;
}

/** The comment the server starts a boundary's fallback with (server/render-string.ts). */
const CAUGHT = 'pdx-caught';

/**
 * The error the content throws when it renders, for a fallback the server rendered: it is rendered out of
 * the hydration and dropped, what it threw kept — thrown, or reported by one of its effects.
 */
function errorOf(contentFn: () => Node | DocumentFragment): Error | null {
    let caught: Error | null = null;
    const keep = (err: unknown): void => { caught ??= err instanceof Error ? err : new Error(String(err)); };
    pushErrorHandler(keep);
    try {
        const [, dispose] = collectDisposers(() => withoutHydration(contentFn));
        dispose();
    } catch (err) {
        keep(err);
    } finally {
        popErrorHandler();
    }
    return caught;
}

/**
 * A row the server rendered, adopted from `at` on as list.ts `createRow` would have made it: in its
 * own scope, with its signals in row mode. Returns the row and the node after it.
 */
function adoptRow<T>(
    a: Adopter,
    renderer: RowRenderer<T>,
    key: unknown,
    item: T,
    i: number,
    parent: Node,
    at: Node | null,
    end: Node,
): { mapped: MappedItem<T>; next: Node | null } {
    // What the adoption puts in before `at` — an empty text — is the row's too.
    const before = (at ?? end).previousSibling;
    let row: RowSignals<T> | undefined;
    let next: Node | null = at;
    const [, dispose] = collectDisposers(() => {
        // A compiled row takes over its run itself (hydrate/compiled.ts).
        const range = { parent, at, next: null };
        let content: Node;
        if (renderer.mode === 'getters') {
            const r: RowSignals<T> = { item: signal(item), index: signal(i) };
            row = r;
            content = offerRange(range, () => untracked(() => renderer.render(r.item, r.index)));
        } else {
            content = offerRange(range, () => renderer.render(item, i));
        }
        next = a.value(content, parent, at, end);
    });
    const nodes: Node[] = [];
    for (let n = before ? before.nextSibling : parent.firstChild; n && n !== next; n = n.nextSibling) nodes.push(n);
    return { mapped: { key, item, nodes, dispose, row }, next };
}
