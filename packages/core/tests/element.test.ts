import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { PdxElement } from '../src/component/element';
import { define } from '../src/component/define';

let tagCounter = 0;

/** Creates a unique test counter class + tag (CE registry requires unique class per tag). */
function createTestCounter() {
    const tag = `test-counter-${tagCounter++}`;

    class Counter extends PdxElement {
        static attrs = ['initial'];
        count = signal(0);

        body() {
            const init = this.attr('initial');
            if (init() !== null) {
                this.count.set(parseInt(init()!, 10));
            }

            return html`
                <span class="value">${this.count}</span>
                <button @click=${() => this.count.set(v => v + 1)}>+</button>
            `;
        }
    }

    define(tag, Counter as unknown as new () => PdxElement);
    return { tag, Counter };
}

describe('PdxElement', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('renders body() content on connect (Light DOM)', () => {
        const { tag } = createTestCounter();
        const el = document.createElement(tag);
        document.body.appendChild(el);

        expect(el.querySelector('.value')).not.toBeNull();
        expect(el.querySelector('.value')!.textContent).toBe('0');
        expect(el.querySelector('button')).not.toBeNull();
    });

    it('updates reactively when signal changes', () => {
        const { tag, Counter } = createTestCounter();
        const el = document.createElement(tag) as InstanceType<typeof Counter>;
        document.body.appendChild(el);

        expect(el.querySelector('.value')!.textContent).toBe('0');

        el.count.set(10);
        expect(el.querySelector('.value')!.textContent).toBe('10');
    });

    it('maps attributes to signals', () => {
        const { tag } = createTestCounter();
        const el = document.createElement(tag);
        el.setAttribute('initial', '5');
        document.body.appendChild(el);

        expect(el.querySelector('.value')!.textContent).toBe('5');
    });

    it('handles click events', () => {
        const { tag, Counter } = createTestCounter();
        const el = document.createElement(tag) as InstanceType<typeof Counter>;
        document.body.appendChild(el);

        expect(el.querySelector('.value')!.textContent).toBe('0');

        el.querySelector('button')!.click();
        expect(el.querySelector('.value')!.textContent).toBe('1');

        el.querySelector('button')!.click();
        el.querySelector('button')!.click();
        expect(el.querySelector('.value')!.textContent).toBe('3');
    });
});

// The route-change listener across a remount, and children that are not projected.

import { component as componentFx } from '../src/component/component';
import { onDestroy as onDestroyFx, onRouteChange as onRouteChangeFx } from '../src/component/lifecycle';

let elFixTag = 0;
const nextFixTag = () => 'el-fix-' + (elFixTag++);

describe('pdx-route-change across a remount', () => {
    it('the onRouteChange callbacks run once, remount or no remount', () => {
        const tag = nextFixTag();
        let calls = 0;
        componentFx(tag, {
            setup() { onRouteChangeFx(() => { calls++; }); return {}; },
            render: () => html`<span></span>`,
        });
        const a = document.createElement('div');
        const b = document.createElement('div');
        document.body.append(a, b);
        const el = document.createElement(tag);
        a.appendChild(el);
        b.appendChild(el); // remount (destroy+mount)

        el.dispatchEvent(new CustomEvent('pdx-route-change', { detail: { id: '1' } }));
        expect(calls).toBe(1);
    });
});

describe('children that are not projected', () => {
    it('a MOUNTED child PdxElement that is dropped (a template with no slot) is destroyed', () => {
        const childTag = nextFixTag();
        let destroyed = 0;
        componentFx(childTag, {
            setup() { onDestroyFx(() => { destroyed++; }); return {}; },
            render: () => html`<i></i>`,
        });

        // The upgrade scenario: the parent is DEFINED after the child is already mounted
        // inside it — at the parent's connectedCallback the child is frozen (keepAlive)
        // during the capture and then dropped, because the template has no <slot>.
        const parentTag = nextFixTag();
        const parent = document.createElement(parentTag);
        const child = document.createElement(childTag);
        parent.appendChild(child);
        document.body.appendChild(parent); // the child mounts (the parent has not upgraded yet)
        expect(child.isConnected).toBe(true);

        componentFx(parentTag, { render: () => html`<div class="no-slot-here"></div>` }); // upgrade

        expect(child.isConnected).toBe(false);
        expect(destroyed).toBe(1); // without the fix: 0 (frozen and never disposed)
    });
});
