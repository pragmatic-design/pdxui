// Whether a pre-rendered component is being hydrated (#160, part 4). The client path reads only this:
// while it is set, html`` returns a template not built (DeferredTemplate) and each helper a
// HydrationBlock, because a template's values are evaluated before the template that holds them, and
// built at once there would be nothing left to adopt. adopt.ts walks the server's nodes against them.

let depth = 0;

/** True while a pre-rendered component's render is being adopted. */
export function isHydrating(): boolean {
    return depth > 0;
}

/** Run `fn` with templates and helpers deferred for adoption. */
export function withHydration<T>(fn: () => T): T {
    depth++;
    try {
        return fn();
    } finally {
        depth--;
    }
}

/**
 * Run `fn` with the client's ordinary rendering, inside a hydration: what builds the DOM itself — a
 * block that cannot adopt, a later run of a binding — builds it, templates and helpers included.
 */
export function withoutHydration<T>(fn: () => T): T {
    const saved = depth;
    depth = 0;
    try {
        return fn();
    } finally {
        depth = saved;
    }
}

/**
 * What a block's adoption is handed: the adopter's own walk, so that a helper adopts its content with
 * it without importing it — the adopter is in a page's bundle only when the page hydrates.
 */
export interface Adopter {
    /**
     * Adopt `value` from `at` on in `parent`, before `end`; return the node after what it took.
     * `hidden`: the content of a false `show()`, whose top-level texts the server wrote as `show`
     * comments — each text is made and paired with the comment that keeps its place.
     */
    value(value: unknown, parent: Node, at: Node | null, end: Node | null, hidden?: Map<Text, Comment>): Node | null;
    /** The comment that closes the block `start` opens, past nested blocks of the same kind. */
    close(start: Comment, open: string, close: string): Comment;
    /** The comment `at` must be, or the hydration stops. */
    expect(at: Node | null, data: string): Comment;
    /** Stop the hydration: the markup is not what the render says. */
    fail(what: string): never;
    /** Adopt a block's content between its markers `start` and `end`, all of what lies there. */
    between(content: unknown, parent: Node, start: Comment, end: Comment): void;
    /** `node` as the client builds it, out of a hydration: a template, with the values it holds, or a block. */
    build(node: Node): Node;
}

/**
 * A block's adoption: it takes over the server's nodes for it, from `at` on in `parent` and before
 * `end`, sets up what keeps them current, and returns the node after the ones it took.
 */
export type BlockAdopt = (adopter: Adopter, parent: Node, at: Node | null, end: Node | null) => Node | null;

/**
 * A helper's block while hydrating: a DocumentFragment, as the helpers return, that holds how to
 * build the block (the client's call, run outside the hydration) and, for a helper that can, how to
 * take over the nodes the server wrote for it. Without `adopt` the block is built, and replaces what
 * lies between its `markers`, the comments the client and the server bracket it with.
 */
export type HydrationBlock = DocumentFragment & {
    readonly markers: readonly [string, string | null];
    readonly build: (adopter: Adopter) => DocumentFragment;
    readonly adopt: BlockAdopt | null;
};

let HydrationBlockClass: (new (markers: readonly [string, string | null], build: (adopter: Adopter) => DocumentFragment, adopt: BlockAdopt | null) => HydrationBlock) | null = null;

/** The HydrationBlock a helper returns while hydrating. */
export function hydrationBlock(markers: readonly [string, string | null], build: (adopter: Adopter) => DocumentFragment, adopt: BlockAdopt | null = null): HydrationBlock {
    HydrationBlockClass ??= class extends DocumentFragment {
        constructor(
            readonly markers: readonly [string, string | null],
            readonly build: (adopter: Adopter) => DocumentFragment,
            readonly adopt: BlockAdopt | null,
        ) { super(); }
    };
    return new HydrationBlockClass(markers, build, adopt);
}

/** Whether `value` is a HydrationBlock. */
export function isHydrationBlock(value: unknown): value is HydrationBlock {
    return HydrationBlockClass !== null && value instanceof HydrationBlockClass;
}
