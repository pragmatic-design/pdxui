// A native property bound on a component and going to null is cleared, as on a plain element (#1263).
//
// `el.tabIndex = null` coerces to 0: a bound `:tabindex="on ? '0' : null"` on a component gave every
// instance a tab stop it must not have. A name the component does not declare but HTMLElement has
// (`tabIndex`, `hidden`, `title`…) follows the plain element's null rule, `clearBoundProperty`; a prop
// the component declares still receives null, which it may hold.

import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { bindComponentProp } from '../src/renderer/bound-attribute';
import { assignBoundProperty } from '../src/renderer/template';
import { component } from '../src/component/component';
import { prop } from '../src/component/component-descriptor';

let n = 0;
const tag = () => `native-null-${n++}`;

beforeEach(() => { document.body.innerHTML = ''; });

describe('a native property bound on a component, going to null', () => {
    it('tabIndex: no attribute while null, tabindex="0" while on, removed again', () => {
        const t = tag();
        component(t, { render: () => html`<span>x</span>` });
        const el = document.createElement(t);
        document.body.appendChild(el);
        const on = signal(false);
        bindComponentProp(el, 'tabIndex', () => (on() ? '0' : null));
        expect(el.hasAttribute('tabindex'), 'null gave the component a tab stop').toBe(false);
        on.set(true);
        expect(el.getAttribute('tabindex')).toBe('0');
        on.set(false);
        expect(el.hasAttribute('tabindex'), 'null left the tab stop in place').toBe(false);
    });

    it('also before the component is defined: the name is HTMLElement\'s until then', () => {
        const el = document.createElement(tag());
        assignBoundProperty(el, 'tabIndex', null);
        expect(el.hasAttribute('tabindex')).toBe(false);
    });

    it('hidden: null is false, as on a plain element', () => {
        const t = tag();
        component(t, { render: () => html`<span>x</span>` });
        const el = document.createElement(t) as HTMLElement;
        document.body.appendChild(el);
        el.hidden = true;
        assignBoundProperty(el, 'hidden', null);
        expect(el.hidden).toBe(false);
    });

    it('control — a prop the component declares takes the null itself: back to its default', () => {
        const t = tag();
        component(t, { props: { tabIndex: prop<number | null>(3) }, render: () => html`<span>x</span>` });
        const el = document.createElement(t) as unknown as { tabIndex: unknown };
        document.body.appendChild(el as unknown as Node);
        assignBoundProperty(el as unknown as Element, 'tabIndex', 5);
        assignBoundProperty(el as unknown as Element, 'tabIndex', null);
        // Cleared as a platform property instead, it would have kept 5.
        expect(el.tabIndex).toBe(3);
    });

    it('control — a name neither declares is stored as given', () => {
        const t = tag();
        component(t, { render: () => html`<span>x</span>` });
        const el = document.createElement(t) as unknown as { rows: unknown };
        document.body.appendChild(el as unknown as Node);
        assignBoundProperty(el as unknown as Element, 'rows', null);
        expect(el.rows).toBeNull();
    });
});
