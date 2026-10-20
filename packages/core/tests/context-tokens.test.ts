// Typed context tokens (#495): `context<T>(name)` is the key a value is provided and injected by,
// compared by identity — by `inject` and by the Web Components context protocol (#103). The runtime
// API is two functions, `provide(token, value, host)` and `inject(token, host, fallback?)`; the seven
// others leave `@pdxui/core`.

import { describe, it, expect, afterEach } from 'vitest';
import * as core from '../src/index';
import { context, provide, inject, type Context, type ContextValue } from '../src/index';

afterEach(() => { document.body.innerHTML = ''; });

/** A host element in the page, and an element inside it. */
function tree(tag = 'app-card'): { host: HTMLElement; inner: HTMLElement } {
    const host = document.createElement('div');
    const inner = document.createElement(tag);
    host.appendChild(inner);
    document.body.appendChild(host);
    return { host, inner };
}

describe('context<T>(name)', () => {
    it('is a frozen token carrying its name, and two calls are two tokens', () => {
        const a = context<number>('count');
        const b = context<number>('count');
        expect(a.name).toBe('count');
        expect(Object.isFrozen(a)).toBe(true);
        expect(a).not.toBe(b);
    });

    it("types its value: ContextValue<typeof token> is the token's T", () => {
        const User = context<{ name: string }>('current-user');
        const value: ContextValue<typeof User> = { name: 'Ann' };
        const token: Context<{ name: string }> = User;
        expect(value.name).toBe('Ann');
        expect(token.name).toBe('current-user');
    });
});

describe('inject(token, host)', () => {
    it('reads what the nearest provider of that token provides', () => {
        const Theme = context<string>('theme');
        const { host, inner } = tree();
        provide(Theme, 'dark', host);
        expect(inject(Theme, inner)).toBe('dark');
    });

    it('with no provider and no fallback throws, naming the token and the component', () => {
        const User = context<string>('current-user');
        const { inner } = tree('app-card');
        expect(() => inject(User, inner)).toThrow('No provider for context "current-user" above <app-card>');
    });

    it('with a fallback returns it instead, undefined included', () => {
        const User = context<string>('current-user');
        const { inner } = tree();
        expect(inject(User, inner, 'guest')).toBe('guest');
        expect(inject(User, inner, undefined)).toBeUndefined();
        expect(inject(User, inner, null)).toBeNull();
    });

    it("injecting from a host that provides the token itself never reads its own value", () => {
        // A nested field group: it provides its path and reads the enclosing group's under one token,
        // and may set up before that group provides anything.
        const Path = context<string>('path');
        const { host, inner } = tree();
        provide(Path, 'inner', inner);
        expect(inject(Path, inner, 'none'), 'it read the value its own host provides').toBe('none');
        provide(Path, 'outer', host);
        expect(inject(Path, inner)).toBe('outer');
    });

    it('does not read a value provided under another token of the same name', () => {
        const A = context<string>('theme');
        const B = context<string>('theme');
        const { host, inner } = tree();
        provide(A, 'dark', host);
        expect(inject(B, inner, 'none')).toBe('none');
    });
});

describe('the context protocol', () => {
    /** A `context-request` for `key`, dispatched from `el`: the value it is answered with, if any. */
    function request(el: HTMLElement, key: unknown): unknown {
        let answer: unknown = 'unanswered';
        const event = Object.assign(new Event('context-request', { bubbles: true, composed: true }), {
            context: key, contextTarget: el, callback: (v: unknown) => { answer = v; }, subscribe: false,
        });
        el.dispatchEvent(event);
        return answer;
    }

    it('a provider answers a request carrying the same token, and not one carrying another token of the same name', () => {
        const Theme = context<string>('theme');
        const { host, inner } = tree();
        provide(Theme, 'dark', host);
        expect(request(inner, Theme)).toBe('dark');
        expect(request(inner, context<string>('theme'))).toBe('unanswered');
    });
});

describe("@pdxui/core's exports", () => {
    it('no longer hold the seven functions', () => {
        const gone = ['tryInject', 'useProvided', 'tryUseProvided', 'requestContext', 'provideWritable', 'useWritable', 'tryUseWritable'];
        expect(gone.filter((name) => name in core)).toEqual([]);
        // The control: the two that stay, and the token builder, are there.
        expect(['provide', 'inject', 'context'].filter((name) => !(name in core))).toEqual([]);
    });

    it('no longer hold the untyped messaging APIs (#144)', () => {
        const gone = ['createBus', 'createChannel', 'createCommands', 'createCompoundParent'];
        expect(gone.filter((name) => name in core)).toEqual([]);
        // The control: what the channel and compound modules keep for the library stays exported.
        expect(['exposeOnElement', 'discoverChildren'].filter((name) => !(name in core))).toEqual([]);
    });
});
