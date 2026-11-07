// A helper's block, not built (#160): what a helper returns while its blocks are written elsewhere —
// to a string on the server (server/blocks.ts), or adopted from the server's markup while hydrating
// (hydrate/blocks.ts). The helper only says which call it is, with its arguments: the block holds a
// visit that calls the matching method of whichever visitor reads it. Neither of those is in a page
// that only mounts — this is all the client carries for them.

import { isServerRender } from '../server/mode';
import { isHydrating } from '../hydrate/mode';
import type { TransitionOptions, PortalOptions } from './helpers';
import type { RepeatOptions, RowRenderer } from './list';
import type { DeferOptions } from './defer';
import type { AwaitTiming } from './await';
import type { ErrorBoundaryOptions } from './error-boundary';
import type { DynamicOptions } from './dynamic';

type Content = Node | DocumentFragment;

/** Each helper's call, as a visitor reads it: what the server writes, or what a hydration adopts. */
export interface BlockVisitor<R> {
    when(condition: () => boolean, thenFn: () => Content, elseFn: (() => Content | null) | null | undefined, options: TransitionOptions | undefined): R;
    chain(select: () => number, branches: ReadonlyArray<(() => Content | null) | null>): R;
    match<T extends string | number>(value: () => T, cases: Record<string, () => Content>): R;
    show(condition: () => boolean, content: Content): R;
    list<T>(items: () => T[], keyFn: (item: T, index: number) => unknown, renderer: RowRenderer<T>, options: RepeatOptions | undefined): R;
    defer(options: DeferOptions, loadFn: (() => Promise<unknown>) | null, renderFn: (module?: unknown) => Content): R;
    await<T>(source: () => unknown, thenFn: (value: () => T) => Content, loadingFn: (() => Content | null) | null,
        errorFn: ((error: unknown, retry: () => void) => Content) | null, options: AwaitTiming): R;
    boundary(contentFn: () => Content, fallbackFn: (error: Error, retry: () => void) => Content, options: ErrorBoundaryOptions | undefined): R;
    portal(contentFn: () => Content, target: string | Element, options: PortalOptions | undefined): R;
    snippet(source: () => unknown, args: () => readonly unknown[], fallback: (() => Node | null) | null | undefined): R;
    dynamic(tagFn: () => string, propsFn: (() => Record<string, unknown>) | null | undefined, options: DynamicOptions | undefined): R;
}

/** A helper's block not built: a DocumentFragment, as the helpers return, holding its call. */
export type DeferredBlock = DocumentFragment & {
    visit<R>(visitor: BlockVisitor<R>): R;
};

type Visit = <R>(visitor: BlockVisitor<R>) => R;

let DeferredBlockClass: (new (visit: Visit) => DeferredBlock) | null = null;

/** Whether a helper defers its block: rendering to a string, or hydrating. */
export function isDeferring(): boolean {
    return isServerRender() || isHydrating();
}

/** The block a helper returns while it defers: `visit` calls the visitor's method for this call. */
export function deferredBlock(visit: Visit): DeferredBlock {
    DeferredBlockClass ??= class extends DocumentFragment {
        constructor(readonly visit: Visit) { super(); }
    };
    return new DeferredBlockClass(visit);
}

/** Whether `value` is a DeferredBlock. */
export function isDeferredBlock(value: unknown): value is DeferredBlock {
    return DeferredBlockClass !== null && value instanceof DeferredBlockClass;
}
