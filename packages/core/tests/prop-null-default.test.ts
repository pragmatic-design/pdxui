// A prop declared `default: null` sees null.
//
// Resolving the default as `def.default ?? typeDefault(def.type)` cannot work: `??` cannot tell an
// author who wrote `null` from one who wrote nothing, so `{ type: Number, default: null }` would
// arrive at the component as **0**, and `{ type: Array, default: null }` as `[]`.
//
// That is not a nicety. `<pdx-popover>`'s `offsetPx` prop defaults to null — the sentinel that
// means "nobody asked for an offset, so read the `--pdx-float-offset` token". Arriving as 0,
// `0 ?? undefined` is 0, and the composable is handed an explicit offset of zero on every open: the
// token is reachable, resolved correctly, and moves nothing. Measured in a browser on the
// `popover-bottom` scenario — the floating element sits at a gap of 0 from its trigger.
//
// So the resolver asks whether a default was DECLARED rather than whether it is truthy-ish.
// `packages/ui/src` carries 61 `default: null` declarations, so this is the answer to all of them.

import { describe, it, expect, beforeEach } from 'vitest';
import { component } from '../src/component/component';
import { prop } from '../src/component/component-descriptor';
import type { PropSpec } from '../src/component/component-descriptor';
import { html } from '../src/renderer/template';

let tagId = 0;
const uniqueTag = () => `null-default-${tagId++}`;

/** Define a component with one prop, mount it, and hand back the value that prop arrived with. */
function propValue(def: PropSpec<unknown>, attrs: Record<string, string> = {}): unknown {
    const tag = uniqueTag();
    let seen: unknown = Symbol('never read');
    component(tag, {
        props: { thing: def },
        setup(ctx) { seen = (ctx as unknown as { thing: () => unknown }).thing(); },
        render: () => html`<i></i>`,
    });
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    return seen;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('a declared default of null is the default', () => {
    it('keeps null on a Number prop', () => {
        // The one that cost a feature: 0 is a legitimate offset, so the component cannot tell it
        // apart from "not provided" and can never fall back to the token.
        expect(propValue(prop<number | null>(null, { type: Number })),
            'the declared null was replaced by the type default').toBeNull();
    });

    it('keeps null on an Array prop', () => {
        // `[]` and null answer different questions: "an empty list" and "no list was given".
        expect(propValue(prop<unknown[] | null>(null, { type: Array }))).toBeNull();
    });

    it('keeps null on a String prop', () => {
        expect(propValue(prop<string | null>(null, { type: String }))).toBeNull();
    });

    it('keeps null on a Boolean prop', () => {
        expect(propValue(prop<boolean | null>(null, { type: Boolean }))).toBeNull();
    });
});

describe('what has to keep working', () => {
    it('a prop with NO default still gets its type default', () => {
        // The control. Reading the declared null correctly is easy to do by dropping the fallback
        // entirely, which would hand every undeclared Number prop `undefined`.
        expect(propValue(prop.optional<number>({ type: Number }))).toBe(0);
        expect(propValue(prop.optional<string>({ type: String }))).toBe('');
        expect(propValue(prop.optional<boolean>({ type: Boolean }))).toBe(false);
        expect(propValue(prop.optional<unknown[]>({ type: Array }))).toEqual([]);
    });

    it('an ordinary default still wins over the type default', () => {
        expect(propValue(prop(7))).toBe(7);
        expect(propValue(prop('hi'))).toBe('hi');
    });

    it('an attribute still wins over the declared null', () => {
        // A default is what applies when nothing was asked for; the attribute is the asking.
        expect(propValue(prop<number | null>(null, { type: Number }), { thing: '12' })).toBe(12);
    });

    it('removing the attribute falls back to the declared null, not to the type default', () => {
        const tag = uniqueTag();
        let seen: unknown = Symbol('never read');
        component(tag, {
            props: { thing: prop<number | null>(null, { type: Number }) },
            setup(ctx) {
                const read = (ctx as unknown as { thing: () => unknown }).thing;
                (ctx as unknown as { track: (fn: () => void) => void }).track(() => { seen = read(); });
            },
            render: () => html`<i></i>`,
        });
        const el = document.createElement(tag);
        el.setAttribute('thing', '12');
        document.body.appendChild(el);
        expect(seen).toBe(12);

        el.removeAttribute('thing');

        expect(seen, 'the second resolution of the default forgot the declared null').toBeNull();
    });
});
