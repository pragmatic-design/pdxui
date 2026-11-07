// The helpers' blocks rendered to a string (#160): what each writes on the server, read from the call a
// helper defers (renderer/deferred-block.ts). Each renders what its client side shows when it has just
// mounted, between the comment markers the client brackets it with, so that hydration finds it there.

import { DEV } from '../utils/env';
import { caseFor } from '../renderer/helpers';
import { arrivedCode } from '../renderer/defer';
import { outcomeOf, asError } from '../renderer/await';
import { errorBoundary } from '../renderer/error-boundary';
import { snippetContent } from '../renderer/snippet';
import type { BlockVisitor } from '../renderer/deferred-block';
import { serverBlock, serverElement, type ServerBlock } from './mode';

/** The triggers that fire later: the others — `immediate`, and a trigger unknown — fire at once. */
const LATER_TRIGGER = /^(viewport|interaction|idle(\(\d+\))?|timer\(\d+\))$/;

export const serverBlocks: BlockVisitor<ServerBlock> = {
    /** The branch the condition picks now. */
    when: (condition, thenFn, elseFn) => serverBlock('when', '/when', () => [condition() ? thenFn() : (elseFn?.() ?? null)]),

    /** The branch picked now, between the markers when() uses too. */
    chain: (select, branches) => serverBlock('when', '/when', () => {
        const branch = branches[select()];
        return branch ? [branch()] : [];
    }),

    /** The case the value picks now, or the default. */
    match: (value, cases) => serverBlock('match', '/match', () => {
        const caseFn = caseFor(cases, String(value()));
        return caseFn ? [caseFn()] : [];
    }),

    /** The content, hidden as the client hides it when the condition is false. */
    show: (condition, content) => serverBlock(null, null, () => [content], condition() ? null : { item: false, hidden: true }),

    /**
     * Every row of the list as it is now, each marked as list.ts `createRow` marks it. A sliced append
     * ends in the same rows, so slices do not apply.
     */
    list: (items, _keyFn, renderer) => serverBlock('repeat-start', 'repeat-end', () => items().map((item, i) => renderer.mode === 'getters'
        ? renderer.render(() => item, () => i)
        : renderer.render(item, i)), DEV ? { item: true, hidden: false } : null),

    /**
     * A trigger that fires at once — `immediate`, an unknown one, a `when` already true — renders the
     * body if its code needs no load or has arrived, `@loading` (or the placeholder) while it loads;
     * otherwise the placeholder, after the sentinel a `viewport` trigger puts there.
     */
    defer: (options, loadFn, renderFn) => serverBlock('defer', '/defer', () => {
        const triggers = (options.trigger ?? '').split('|').map((t) => t.trim()).filter(Boolean);
        const fires = triggers.some((t) => !LATER_TRIGGER.test(t)) || Boolean(options.when?.());
        if (fires) {
            if (!loadFn) return [renderFn(undefined)];
            const arrived = arrivedCode(loadFn);
            if (arrived) return [renderFn(arrived.module)];
            return [options.loading?.() ?? options.placeholder?.() ?? null];
        }
        const sentinel = triggers.includes('viewport')
            ? [serverElement('span', { style: 'display: block; height: 1px; visibility: hidden;' })]
            : [];
        return [...sentinel, options.placeholder?.() ?? null];
    }),

    /**
     * The body with the result there is now, `@error` for a failure, and while it waits `@loading`
     * (with no `minMs`) or the pending comment.
     */
    await<T>(source: () => unknown, thenFn: (value: () => T) => Node | DocumentFragment, loadingFn: (() => Node | DocumentFragment | null) | null,
        errorFn: ((error: unknown, retry: () => void) => Node | DocumentFragment) | null, options: { minMs?: number }): ServerBlock {
        return serverBlock('await', '/await', () => {
            const o = outcomeOf(source());
            if (o.kind === 'result') {
                // The result as the client's block hands it on: `outcomeOf` reads any source, typed by the block.
                const value = (): T => o.value as T;
                return [errorFn ? errorBoundary(() => thenFn(value), errorFn) : thenFn(value)];
            }
            if (o.kind === 'error') {
                if (!errorFn) throw asError(o.error);
                return [errorFn(o.error, () => {})];
            }
            if ((options.minMs ?? 0) > 0) return [serverBlock('await-pending', null, () => [])];
            return [loadingFn?.() ?? serverBlock('await-loading', null, () => [])];
        });
    },

    /** The content, or — when rendering it throws — the fallback with the error. A retry has nothing to do. */
    boundary: (contentFn, fallbackFn) => serverBlock('error-boundary', '/error-boundary', () => [contentFn()], null,
        (err) => [fallbackFn(asError(err), () => {})]),

    /** The marker it leaves in place: the content goes to another part of the document, on the client. */
    portal: () => serverBlock('portal', null, () => []),

    /** The snippet called with its arguments now, or the fallback; what is not a fragment renders nothing. */
    snippet: (source, args, fallback) => serverBlock('snippet', '/snippet', () => {
        const content = snippetContent(source(), args(), fallback);
        return content instanceof DocumentFragment ? [content] : [];
    }),

    /** The element of the tag there is now, with the props applyProps gives it. */
    dynamic: (tagFn, propsFn) => serverBlock('dynamic', '/dynamic', () => {
        const tag = tagFn();
        if (!tag) return [];
        const attributes: Record<string, string> = {};
        const props: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(propsFn?.() ?? {})) {
            if (value === null || value === undefined) continue;
            if (typeof value === 'function' || typeof value === 'object') props[key] = value;
            else attributes[key] = String(value);
        }
        return [serverElement(tag, attributes, props)];
    }),
};
