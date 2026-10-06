// pdx-rich-text mounts without freezing the browser — a bare <pdx-rich-text> with no
// attributes is enough to show it. Its render is `<slot></slot>` and its setup appends the
// toolbar and editor onto the host in rAF; a late-slot watcher that relocated those nodes
// before the slot on every mutation, including when they were already there, would feed the
// observer again with each no-op move. Cause-level tests:
// core/tests/late-slot-relocation.test.ts.
//
// The rest of the rich-text unit suite tests the document model (join/list/normalize) and never
// mounts the element, so a total freeze would go unnoticed there. This is that test.
//
// A regression would starve the microtask queue, so the circuit-breaker below caps the
// damage: the test then fails on the count instead of hanging the run.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../../src/rich-text/pdx-rich-text';

const LIMIT = 100;
let moves = 0;
const origInsert = Node.prototype.insertBefore;

beforeEach(() => {
    document.body.innerHTML = '';
    moves = 0;
    Node.prototype.insertBefore = function (this: Node, node: Node, ref: Node | null) {
        if (++moves > LIMIT) return node;
        return origInsert.call(this, node, ref) as Node;
    } as typeof Node.prototype.insertBefore;
});

afterEach(() => { Node.prototype.insertBefore = origInsert; });

/** The component builds its DOM in requestAnimationFrame — give it a few turns. */
const settle = () => new Promise(r => setTimeout(r, 50));

describe('pdx-rich-text mount', () => {
    it('a bare <pdx-rich-text> mounts without looping', async () => {
        const el = document.createElement('pdx-rich-text');
        document.body.appendChild(el);

        await settle();

        expect(moves, 'insertBefore calls during mount').toBeLessThan(LIMIT);
        expect(el.isConnected).toBe(true);
        expect(el.classList.contains('pdx-rich-text')).toBe(true);
        expect(el.querySelector('.pdx-rt-wrapper')).not.toBeNull();
    });

    it('mounts with a toolbar and a value without looping', async () => {
        const el = document.createElement('pdx-rich-text');
        el.setAttribute('toolbar', 'minimal');
        document.body.appendChild(el);

        await settle();

        expect(moves, 'insertBefore calls during mount').toBeLessThan(LIMIT);
        expect(el.querySelector('.pdx-rt-wrapper')).not.toBeNull();
    });
});
