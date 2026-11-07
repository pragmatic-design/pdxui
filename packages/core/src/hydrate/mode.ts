// Whether a pre-rendered component is being hydrated (#160, part 4). The client path reads only this:
// while it is set, html`` returns a template not built (DeferredTemplate) and each helper its call
// (renderer/deferred-block.ts), because a template's values are evaluated before the template that
// holds them, and built at once there would be nothing left to adopt. adopt.ts walks the server's
// nodes against them.

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

/** What a block's adoption (hydrate/blocks.ts) is handed: the adopter's own walk. */
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
