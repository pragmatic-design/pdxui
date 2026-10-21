// The names a component's props, models and typed snippets may not take (#542): the members of the
// element class component() defines, from its own class up to HTMLElement. A prop of one of these
// names replaces it — a typed snippet `body` replaced the render method, and the component rendered
// nothing. The compiler's list (`RESERVED_ELEMENT_NAMES`) is held to the class here, so a member
// added to PdxElement is reserved without anyone remembering to.

import { describe, it, expect, vi } from 'vitest';
import { component, prop } from '../src/index';
import { RESERVED_ELEMENT_NAMES, ELEMENT_NAMES_KEPT } from '../../compiler/src/compiler/reserved-element-names';
import { RESERVED_DOM_MEMBERS as COMPILER_DOM_MEMBERS, DOM_EVENT_HANDLERS } from '../../compiler/src/compiler/reserved-dom-names';
import { RESERVED_DOM_MEMBERS } from '../src/component/reserved-dom-members';

/** Every member name on the prototype chain of `cls`, below HTMLElement. */
function membersBelowHTMLElement(cls: CustomElementConstructor): Set<string> {
    const names = new Set<string>();
    for (let p = cls.prototype; p && p !== HTMLElement.prototype; p = Object.getPrototypeOf(p)) {
        for (const name of Object.getOwnPropertyNames(p)) if (name !== 'constructor') names.add(name);
    }
    return names;
}

describe("the compiler's reserved names", () => {
    it("are the element class's members, less the ones kept on purpose", () => {
        component('x-reserved-probe', { render: () => document.createDocumentFragment() });
        const members = membersBelowHTMLElement(customElements.get('x-reserved-probe')!);
        // The control: the walk reached PdxElement's members, not only the component's own class.
        expect(members.has('track') && members.has('emit') && members.has('body')).toBe(true);
        const expected = [...members].filter(n => !ELEMENT_NAMES_KEPT.has(n)).sort();
        expect([...RESERVED_ELEMENT_NAMES].sort()).toEqual(expected);
    });
});

/** Every member name on HTMLElement's prototype chain. */
function htmlElementMembers(): Set<string> {
    const names = new Set<string>();
    for (let p = HTMLElement.prototype; p; p = Object.getPrototypeOf(p)) {
        for (const name of Object.getOwnPropertyNames(p)) names.add(name);
    }
    return names;
}

describe("the HTMLElement members a prop may not take (#545)", () => {
    it("are HTMLElement's members, and the compiler refuses the same ones core warns about", () => {
        const members = htmlElementMembers();
        expect([...RESERVED_DOM_MEMBERS].filter(n => !members.has(n))).toEqual([]);
        expect([...COMPILER_DOM_MEMBERS].sort()).toEqual([...RESERVED_DOM_MEMBERS].sort());
    });

    it("the compiler's handlers include every on* handler of the DOM the tests run in", () => {
        const handlers = [...htmlElementMembers()].filter(n => /^on[a-z]+$/.test(n));
        // The control: the walk found handlers at all.
        expect(handlers).toContain('onclick');
        expect(handlers.filter(n => !DOM_EVENT_HANDLERS.has(n))).toEqual([]);
    });
});

describe('a descriptor that names a prop after an element member', () => {
    it("is reported in development for HTMLElement's style and an on* handler (#545)", () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            component('x-dom-style-prop', { props: { style: prop<string>(), onclick: prop<string>() }, render: () => document.createDocumentFragment() });
            const said = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('x-dom-style-prop'));
            expect(said.some(m => m.includes("'style'")), `nothing named 'style': ${said.join(' / ')}`).toBe(true);
            expect(said.some(m => m.includes("'onclick'")), `nothing named 'onclick': ${said.join(' / ')}`).toBe(true);
        } finally {
            warn.mockRestore();
        }
    });

    it("is not for HTMLElement's members kept on purpose, or a name that only starts with on", () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            component('x-dom-kept-prop', { props: { id: prop<string>(), prefix: prop<string>(), once: prop<boolean>(), onSelect: prop<string>() }, render: () => document.createDocumentFragment() });
            expect(warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('x-dom-kept-prop'))).toEqual([]);
        } finally {
            warn.mockRestore();
        }
    });

    it('is reported in development, and names the prop', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            component('x-reserved-prop', { props: { emit: prop<string>() }, render: () => document.createDocumentFragment() });
            const said = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('x-reserved-prop'));
            expect(said.some(m => m.includes("'emit'")), `nothing named 'emit': ${said.join(' / ')}`).toBe(true);
        } finally {
            warn.mockRestore();
        }
    });

    it('is not, for a name the element does not have', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            component('x-plain-prop', { props: { label: prop<string>() }, render: () => document.createDocumentFragment() });
            expect(warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('x-plain-prop'))).toEqual([]);
        } finally {
            warn.mockRestore();
        }
    });
});
