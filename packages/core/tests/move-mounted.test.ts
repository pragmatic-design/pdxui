// Moving a mounted component does not set it up again.
//
// A DOM move is a disconnect and a connect. A PdxElement treats the disconnect as its end: it disposes
// its effects and, on the connect, mounts again — and a second mount that took the first render, still
// in the element, for light-DOM children would project it into the new <slot>. A component inside a
// container that something wraps after mounting would come out with its content twice: pdx-toggle a
// button inside a button, pdx-mention three textareas. useScrollbar wraps its container (overlay mode)
// and pdx-scroll-area uses it, so every component in a scroll area is exposed.
//
// `moveMounted(root, move)` runs a move that takes a subtree out and puts it back without
// unmounting the components in it; the movers use it. A real removal still destroys.

import { describe, it, expect, beforeEach } from 'vitest';
import { html } from '../src/renderer/template';
import { component } from '../src/component/component';
import { onDestroy } from '../src/component/lifecycle';
import { moveMounted } from '../src/component/element';
import { useScrollbar } from '../src/component/scrollbar';

let tagId = 0;
const counts = { setup: 0, destroy: 0 };

function defineKid(): string {
    const tag = `test-move-kid-${tagId++}`;
    component(tag, {
        setup() {
            counts.setup++;
            onDestroy(() => { counts.destroy++; });
        },
        render: () => html`<b class="kid">k</b><slot></slot>`,
    });
    return tag;
}

beforeEach(() => {
    document.body.innerHTML = '';
    counts.setup = 0;
    counts.destroy = 0;
});

describe('moveMounted', () => {
    it('moves a mounted component into another parent without setting it up again', () => {
        const tag = defineKid();
        const host = document.createElement('div');
        host.innerHTML = `<${tag}></${tag}>`;
        document.body.appendChild(host);
        const target = document.createElement('section');
        document.body.appendChild(target);
        expect(counts.setup).toBe(1);

        moveMounted(host, () => target.appendChild(host));

        expect(target.contains(host)).toBe(true);
        expect(counts.setup, 'the move mounted the component again').toBe(1);
        expect(counts.destroy, 'the move destroyed the component').toBe(0);
        expect(host.querySelectorAll('.kid').length, 'the component holds its render twice').toBe(1);
    });

    it('a real removal still destroys the component — the control', () => {
        const tag = defineKid();
        const el = document.createElement(tag);
        document.body.appendChild(el);
        el.remove();
        expect(counts.destroy).toBe(1);
    });

    it('a component moved without it is set up again, and still renders once — why the helper exists', () => {
        // The setup runs twice: a plain move is a destroy and a mount, and destroy stays synchronous.
        // moveMounted is the cheap path that skips both. What a plain move must not do is keep the
        // first render and project it into the second: the content twice.
        const tag = defineKid();
        const host = document.createElement('div');
        host.innerHTML = `<${tag}></${tag}>`;
        document.body.appendChild(host);
        document.body.appendChild(document.createElement('section')).appendChild(host);
        expect(counts.setup).toBe(2);
        expect(host.querySelectorAll('.kid').length, 'the remount projected its own first render').toBe(1);
    });
});

describe('a plain move by app code', () => {
    it('renders once and projects the author\'s children, not the previous render', () => {
        const tag = defineKid();
        const host = document.createElement('div');
        host.innerHTML = `<${tag}><i class="mine">mine</i></${tag}>`;
        document.body.appendChild(host);
        const el = host.querySelector(tag)!;
        expect(el.querySelectorAll('.kid').length).toBe(1);

        document.body.appendChild(document.createElement('section')).appendChild(host);

        expect(el.querySelectorAll('.kid').length, 'the render is there twice').toBe(1);
        expect(el.querySelectorAll('.mine').length, 'the author\'s child was lost or doubled').toBe(1);
        expect(el.querySelector('.kid')!.nextElementSibling, 'the child is not where the slot was')
            .toBe(el.querySelector('.mine'));
    });

    it('moving it twice still renders once', () => {
        const tag = defineKid();
        const el = document.createElement(tag);
        el.innerHTML = '<i class="mine">mine</i>';
        document.body.appendChild(el);
        const a = document.body.appendChild(document.createElement('section'));
        const b = document.body.appendChild(document.createElement('section'));
        a.appendChild(el);
        b.appendChild(el);
        expect(counts.setup).toBe(3);
        expect(el.querySelectorAll('.kid').length).toBe(1);
        expect(el.querySelectorAll('.mine').length).toBe(1);
    });

    it('a removed component holds the children it was written with, and no render', () => {
        const tag = defineKid();
        const el = document.createElement(tag);
        el.innerHTML = '<i class="mine">mine</i>';
        document.body.appendChild(el);
        el.remove();
        expect(counts.destroy, 'destroy is still synchronous on removal').toBe(1);
        expect(el.querySelector('.kid'), 'the render outlived the component').toBeNull();
        expect(Array.from(el.children).map(c => c.className)).toEqual(['mine']);
    });

    it('a child the app removed while the component was mounted is not brought back', () => {
        const tag = defineKid();
        const el = document.createElement(tag);
        el.innerHTML = '<i class="mine">mine</i><i class="gone">gone</i>';
        document.body.appendChild(el);
        el.querySelector('.gone')!.remove();
        document.body.appendChild(document.createElement('section')).appendChild(el);
        expect(el.querySelector('.gone')).toBeNull();
        expect(el.querySelectorAll('.mine').length).toBe(1);
    });
});

describe('ctx.frame: a build scheduled by a destroyed setup does not run', () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

    /** A component that builds its DOM in a frame, the way pdx-list and pdx-mention do. */
    function defineFrameBuilder(useCtxFrame: boolean): string {
        const tag = `test-frame-kid-${tagId++}`;
        component(tag, {
            setup(ctx) {
                const build = () => {
                    const b = document.createElement('u');
                    b.className = 'built';
                    ctx.el.appendChild(b);
                };
                if (useCtxFrame) ctx.frame(build);
                else requestAnimationFrame(build);
            },
            render: () => html``,
        });
        return tag;
    }

    it('moved before its frame, it builds once', async () => {
        const tag = defineFrameBuilder(true);
        const el = document.createElement(tag);
        document.body.appendChild(el);
        document.body.appendChild(document.createElement('section')).appendChild(el); // same task
        await frame();
        await frame();
        expect(el.querySelectorAll('.built').length, 'the destroyed setup still built').toBe(1);
    });

    it('left in place, it builds once — the control', async () => {
        const tag = defineFrameBuilder(true);
        const el = document.createElement(tag);
        document.body.appendChild(el);
        await frame();
        await frame();
        expect(el.querySelectorAll('.built').length).toBe(1);
    });

    it('removed before its frame, it does not build at all', async () => {
        const tag = defineFrameBuilder(true);
        const el = document.createElement(tag);
        document.body.appendChild(el);
        el.remove();
        await frame();
        await frame();
        expect(el.querySelectorAll('.built').length).toBe(0);
    });

    it('why it exists: with a bare requestAnimationFrame the same move builds twice', async () => {
        const tag = defineFrameBuilder(false);
        const el = document.createElement(tag);
        document.body.appendChild(el);
        document.body.appendChild(document.createElement('section')).appendChild(el);
        await frame();
        await frame();
        expect(el.querySelectorAll('.built').length).toBe(2);
    });
});

describe('useScrollbar in overlay mode', () => {
    it('wraps its container without setting up the components inside it again', () => {
        const tag = defineKid();
        const box = document.createElement('div');
        box.style.maxHeight = '100px';
        box.innerHTML = `<${tag}></${tag}>`;
        document.body.appendChild(box);
        expect(counts.setup).toBe(1);

        const sb = useScrollbar(() => box, { axis: 'vertical', mode: 'overlay' });
        expect(box.parentElement, 'the container was not wrapped: the case measures nothing').not.toBe(document.body);
        expect(counts.setup, 'wrapping the container mounted the component again').toBe(1);
        expect(box.querySelectorAll('.kid').length).toBe(1);

        sb.dispose(); // unwraps: the same move back
        expect(counts.setup).toBe(1);
        expect(counts.destroy).toBe(0);
    });
});
