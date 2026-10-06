// `_watchLateSlots` (component/element.ts) relocates children appended to the host AFTER
// connectedCallback into a still-empty <slot> — the Angular/zone.js case.
//
// It must not call `insertBefore(node, slot)` when the node is ALREADY before the slot.
// A no-op move still emits a childList record, the observer runs
// again, relocates again — forever, starving the microtask queue and freezing the page.
// Any component that builds its own UI imperatively onto its host while an empty <slot>
// exists would trigger it (that is exactly what pdx-rich-text does with its toolbar/editor).
//
// The tests below bound the loop with a circuit-breaker on insertBefore, so a regression
// fails with a count instead of hanging CI.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { html } from '../src/renderer/template';
import { when } from '../src/renderer/helpers';
import { signal } from '../src/reactivity/signal';
import { component } from '../src/component/component';

let tagId = 0;
const uniqueTag = () => `late-slot-${tagId++}`;

const LIMIT = 40;
let moves = 0;
const origInsert = Node.prototype.insertBefore;

beforeEach(() => {
    document.body.innerHTML = '';
    moves = 0;
    // Circuit-breaker: past LIMIT, stop performing the move so the observer stops being
    // fed and the loop dies. The assertion then reports the count.
    Node.prototype.insertBefore = function (this: Node, node: Node, ref: Node | null) {
        if (++moves > LIMIT) return node;
        return origInsert.call(this, node, ref) as Node;
    } as typeof Node.prototype.insertBefore;
});

afterEach(() => { Node.prototype.insertBefore = origInsert; });

/** Let MutationObserver callbacks (microtasks) drain. */
const settle = () => new Promise(r => setTimeout(r, 0));

describe('late-slot relocation', () => {
    it('relocates a late child once, not forever', async () => {
        const tag = uniqueTag();
        component(tag, { render: () => html`<div class="shell"><slot></slot></div>` });

        const host = document.createElement(tag);
        document.body.appendChild(host);           // no children → the slot stays empty

        const late = document.createElement('span');
        late.textContent = 'late';
        host.appendChild(late);                    // the Angular case

        await settle();
        await settle();

        expect(moves, 'insertBefore calls caused by relocation').toBeLessThan(5);
    });

    it('a component appending its own UI to the host settles', async () => {
        // The pdx-rich-text shape: render is just a <slot>, and setup appends real UI onto
        // the host after mount. Both appended nodes must end up before the slot, once.
        const tag = uniqueTag();
        component(tag, {
            render: () => html`<slot></slot>`,
            setup(ctx: { el: HTMLElement }) {
                queueMicrotask(() => {
                    const toolbar = document.createElement('div');
                    toolbar.className = 'toolbar';
                    ctx.el.appendChild(toolbar);
                    const editor = document.createElement('div');
                    editor.className = 'editor';
                    ctx.el.appendChild(editor);
                });
            },
        });

        const host = document.createElement(tag);
        document.body.appendChild(host);

        await settle();
        await settle();

        expect(moves, 'insertBefore calls caused by relocation').toBeLessThan(10);
        expect(host.querySelector('.toolbar')).not.toBeNull();
        expect(host.querySelector('.editor')).not.toBeNull();
    });

    it('still projects a late child into the empty slot (the behaviour it exists for)', async () => {
        const tag = uniqueTag();
        component(tag, { render: () => html`<div class="shell"><slot></slot></div>` });

        const host = document.createElement(tag);
        document.body.appendChild(host);

        const late = document.createElement('b');
        late.textContent = 'projected';
        host.appendChild(late);

        await settle();
        await settle();

        const slot = host.querySelector('slot')!;
        // The node must sit before its slot — that is what "projected" means here.
        expect(slot.previousSibling).toBe(late);
    });
});

// The observer must not take every node added to the host for a late child: the component's OWN
// template redraws nodes there too, and a top-level reactive part beside a top-level slot would
// have its new nodes moved into the slot — hidden, and in Chromium a redraw that followed them
// freezes the page. A node a template part placed is where its template wants it.
//
// The late child is appended and the part redrawn in the same task as the mount, which is when
// the observer is armed: happy-dom holds an observer's callback weakly, and a GC between the two
// would silence it (see the memory note on happy-dom's MutationObserver).
describe('late-slot relocation leaves the component\'s own redrawn nodes alone', () => {
    const shapes = {
        'a reactive part': (flag: () => boolean) =>
            html`<span data-holder hidden><slot></slot></span>${() => flag() ? html`<b>x</b>` : html`<i>y</i>`}`,
        'a when()': (flag: () => boolean) =>
            html`<span data-holder hidden><slot></slot></span>${when(flag, () => html`<b>x</b>`, () => html`<i>y</i>`)}`,
    };

    for (const [shape, render] of Object.entries(shapes)) {
        it(`${shape} beside the slot: the late text goes to the slot, the redraw stays on the host`, async () => {
            const tag = uniqueTag();
            const flag = signal(true);
            component(tag, { render: () => render(flag) });

            const host = document.createElement(tag);
            document.body.appendChild(host);        // no children: the slot stays empty, the observer arms
            const late = document.createTextNode('late');
            host.appendChild(late);                 // a foreign late child
            flag.set(false);                        // the component redraws: <i> on the host

            await settle();
            await settle();

            const holder = host.querySelector('[data-holder]')!;
            expect(holder.contains(late), 'the late text is projected into the slot').toBe(true);
            expect(host.querySelector('i')?.parentNode, 'the redrawn <i> was moved off the host').toBe(host);

            flag.set(true);                          // and it keeps redrawing where it belongs
            await settle();
            await settle();
            expect(host.querySelector('b')?.parentNode, 'the redrawn <b> is not on the host').toBe(host);
            expect(holder.querySelector('b, i')).toBeNull();
            expect(moves, 'insertBefore calls: a relocation loop').toBeLessThan(LIMIT);
        });
    }
});
