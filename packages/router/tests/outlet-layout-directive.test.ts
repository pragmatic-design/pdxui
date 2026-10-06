// What `@layout 'admin'` does at RUNTIME, compiled by the real compiler.
//
// `outlet-layouts.test.ts` measures the stack with route tables written by hand, so it passes even
// when the directive does nothing — when no analyser assigns `layouts`, the machinery it exercises
// is reachable only from a table no compiler produces. A test on the emitted TEXT would not catch
// that either: `layout:'admin'` can be emitted without ever reaching `layouts`.
//
// So this one starts at the `.pdx` and ends at the DOM: compile a page that declares a layout, hand
// the router the registration that compilation produced, and look at where the page element is.
//
// Same bridge as `parity.test.ts`, which imports the compiler by relative path: the router may not
// depend on `@pdxui/compiler` (it is an optional peer), and reaching across the source tree in
// a test is how this repository holds the two ends of a seam to one behaviour.
import { describe, it, expect, beforeAll } from 'vitest';
import { compile } from '../../compiler/src/plugin';

/** The layout: chrome and a slot the page goes into. It counts its mounts like the layouts do. */
let layoutMounts = 0;
class AdminLayout extends HTMLElement {
    connectedCallback() {
        layoutMounts++;
        if (!this.querySelector('slot')) this.appendChild(document.createElement('slot'));
    }
}
customElements.define('pdx-admin-layout', AdminLayout);
customElements.define('pdx-ld-users', class extends HTMLElement {});
customElements.define('pdx-ld-bare', class extends HTMLElement {});

/**
 * The registration a page module pushes, read out of its own compiled output.
 *
 * Evaluating the object literal rather than importing the module: the module imports
 * `@pdxui/core` and defines a custom element, and none of that is what is under test. What is
 * under test is that the compiler put the layout chain into the registration the outlet reads.
 */
function registrationOf(source: string, file: string): Record<string, unknown> {
    const { code } = compile(source, file, undefined, undefined, {
        importPathOf: (tag) => (tag === 'pdx-admin-layout' ? './admin/_layout.pdx' : null),
    });
    const literal = code.match(/__pdx_pushRoute\((\{.*?\})\);/s);
    expect(literal, `no route registration in the output of ${file} — this test is reading nothing`)
        .not.toBeNull();
    return new Function(`return ${literal![1]}`)() as Record<string, unknown>;
}

const page = (path: string, tag: string, layout?: string) => `<template><h1>Users</h1></template>
<script setup>
@page '${path}';
@tag '${tag}';
${layout ? `@layout '${layout}';` : ''}
</script>`;

const withLayout = registrationOf(page('/admin/users', 'pdx-ld-users', 'admin'), 'pages/users.pdx');
const without = registrationOf(page('/plain', 'pdx-ld-bare'), 'pages/plain.pdx');

// The page is not lazily imported here: these registrations stand in for modules that have already
// loaded, which is what a page module's own `__pdx_pushRoute` means.
(globalThis as Record<string, unknown>).__pdx_routes = [
    { ...withLayout, lazy: false, file: undefined },
    { ...without, lazy: false, file: undefined },
];

import { navigate } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise((r) => setTimeout(r, 0));
let outlet: HTMLElement;

beforeAll(async () => {
    history.replaceState(null, '', '/admin/users');
    outlet = document.createElement('pdx-router-outlet');
    document.body.appendChild(outlet);
    await tick();
});

describe('a page that declares @layout', () => {
    it('renders inside the layout it named', () => {
        const el = document.querySelector('pdx-ld-users');
        expect(el, 'the page did not render at all').not.toBeNull();
        expect(el!.closest('pdx-admin-layout'),
            '@layout is parsed, emitted and read by nobody: the page rendered with no shell around it')
            .not.toBeNull();
    });

    it('mounts the layout once, upgraded, not as an empty element', () => {
        expect(layoutMounts, 'the layout element never connected').toBe(1);
        expect(document.querySelector('pdx-admin-layout')).toBeInstanceOf(AdminLayout);
    });

    it('control — a page that declares none renders in the outlet itself', async () => {
        navigate('/plain');
        await tick();

        const el = document.querySelector('pdx-ld-bare')!;
        expect(el.parentElement, 'a layout was built for a page that declared none').toBe(outlet);
        expect(document.querySelector('pdx-admin-layout'), 'the shell survived the route that had one')
            .toBeNull();
    });
});
