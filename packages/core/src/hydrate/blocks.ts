// How the helpers' blocks take over what the server wrote for them (#160, part 4). Kept out of the
// helpers so that an app that does not hydrate does not carry it: installHydration registers it
// (hydrate/host.ts), and a helper hydrating calls it through the registry in hydrate/mode.ts.
//
// Each adopts its markers and the content between them in the state the block is in now — the branch
// the condition picks, the case, the rows — in the scope a mount would give it, and hands what it
// adopted to the helper's own follow function, which keeps it current from there as a mounted block.

import { collectDisposers, signal, untracked } from '../reactivity/signal';
import { followWhen, followMatch, showNodes, caseFor } from '../renderer/helpers';
import { followChain } from '../renderer/when-chain';
import { followList, type MappedItem, type RowRenderer, type RowSignals } from '../renderer/list';
import type { Adopter, BlockAdopters } from './mode';

export const blockAdopters: BlockAdopters = {
    when(a, parent, at, condition, thenFn, elseFn, options) {
        const start = a.expect(at, 'when');
        const end = a.close(start, 'when', '/when');
        const show = !!untracked(condition);
        const [, dispose] = collectDisposers(() => a.between(show ? thenFn() : (elseFn?.() ?? null), parent, start, end));
        followWhen(start, end, condition, thenFn, elseFn, options, { show, dispose });
        return end.nextSibling;
    },

    chain(a, parent, at, select, branches) {
        const start = a.expect(at, 'when');
        const end = a.close(start, 'when', '/when');
        const index = untracked(select);
        const branch = branches[index];
        const [, dispose] = collectDisposers(() => a.between(branch ? branch() : null, parent, start, end));
        followChain(start, end, select, branches, { index, dispose });
        return end.nextSibling;
    },

    match(a, parent, at, value, cases) {
        const start = a.expect(at, 'match');
        const end = a.close(start, 'match', '/match');
        const key = String(untracked(value));
        const caseFn = caseFor(cases, key);
        const [, dispose] = collectDisposers(() => a.between(caseFn ? caseFn() : null, parent, start, end));
        followMatch(start, end, value, cases, { key, dispose });
        return end.nextSibling;
    },

    show(a, parent, at, end, condition, content) {
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

    list(a, parent, at, items, keyFn, renderer, options) {
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
};

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
        let content: Node;
        if (renderer.mode === 'getters') {
            const r: RowSignals<T> = { item: signal(item), index: signal(i) };
            row = r;
            content = untracked(() => renderer.render(r.item, r.index));
        } else {
            content = renderer.render(item, i);
        }
        next = a.value(content, parent, at, end);
    });
    const nodes: Node[] = [];
    for (let n = before ? before.nextSibling : parent.firstChild; n && n !== next; n = n.nextSibling) nodes.push(n);
    return { mapped: { key, item, nodes, dispose, row }, next };
}
