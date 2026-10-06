// The heuristic component-design rules, one file at a time.
//
//   CD-B1  PDX_SEVERAL_PIECES     more than one connected group of signals in one script
//   CD-B2  PDX_ROUTE_RENDERS      a route stacking structural blocks with no component among them
//   CD-S3  PDX_VERSION_COUNTER    a $signal only bumped, and only read to be discarded
//   CD-C1  PDX_SHARED_STYLES      one <style scoped> whose selectors follow separate CD-B1 groups
//   CD-C3  PDX_COLOUR_LITERAL     a colour written as a value, not a token
//
// They run in `pdx check`, not in compile(): a heuristic is a question for a review, not a line in
// the dev server's console on every save. The known cases are shapes of the showcase, reproduced here
// (docs/PDX-COMPONENT-DESIGN.md).
import { describe, it, expect } from 'vitest';
import { designHeuristics } from '../src/compiler/design-heuristics';

const codes = (source: string, code: string) => designHeuristics(source).filter(w => w.code === code);

describe('CD-B1 — PDX_SEVERAL_PIECES', () => {
    // The shell's shape: the profile menu, the rail + the catalogue joined by the Escape handler,
    // favourites + recents joined by `pins`.
    const SHELL = [
        '<template><div></div></template>',
        '<script setup>',
        "let side = $signal('expanded');",
        'let menuOpen = $signal(false);',
        'let catalogOpen = $signal(false);',
        "let catalogQuery = $signal('');",
        'let pins = $signal([]);',
        'let recentsVersion = $signal(0);',
        'let profileOpen = $signal(false);',
        "let profileTab = $signal('me');",
        'function toggleSide() { side = side === "collapsed" ? "expanded" : "collapsed"; menuOpen = false; }',
        'function onShellKey(e) { if (e.key === "Escape") { if (catalogOpen) catalogOpen = false; else menuOpen = false; } }',
        "function openCatalog() { catalogOpen = true; catalogQuery = ''; }",
        'const recents = $derived(pins.length + recentsVersion);',
        'function pin(p) { pins = [...pins, p]; recentsVersion++; }',
        "function openProfile() { profileOpen = true; profileTab = 'me'; }",
        '</script>',
    ].join('\n');

    it('the shell: three groups, each named', () => {
        const ws = codes(SHELL, 'PDX_SEVERAL_PIECES');
        expect(ws, 'the three pieces were not reported').toHaveLength(1);
        expect(ws[0].message).toContain('CD-B1');
        expect(ws[0].message).toMatch(/heuristic/);
        expect(ws[0].message).toContain('3 groups');
        for (const name of ['side', 'catalogOpen', 'pins', 'recentsVersion', 'profileOpen']) expect(ws[0].message).toContain(name);
    });

    it('control — one piece, whatever its size', () => {
        expect(codes([
            '<template><div></div></template>', '<script setup>',
            'let a = $signal(0);', 'let b = $signal(0);', 'let c = $signal(0);',
            'function f() { a = b + 1; }', 'const d = $derived(b * c);',
            '</script>',
        ].join('\n'), 'PDX_SEVERAL_PIECES')).toHaveLength(0);
    });

    it('control — a lone signal beside a piece is not a second piece', () => {
        expect(codes([
            '<template><div></div></template>', '<script setup>',
            'let a = $signal(0);', 'let b = $signal(0);', 'let flag = $signal(false);',
            'function f() { a = b + 1; }',
            '</script>',
        ].join('\n'), 'PDX_SEVERAL_PIECES')).toHaveLength(0);
    });
});

describe('CD-S3 — PDX_VERSION_COUNTER', () => {
    it('the recents counter: bumped, and read only as `void version`', () => {
        const ws = codes([
            '<template><p>{{ recents.length }}</p></template>', '<script setup>',
            "let path = $signal('/');",
            'let recentsVersion = $signal(0);',
            'function readRecents(version) {',
            '  void version;',
            "  return JSON.parse(localStorage.getItem('recents') ?? '[]');",
            '}',
            'const recents = $derived(readRecents(recentsVersion));',
            "function noteRecent(p) { localStorage.setItem('recents', p); recentsVersion++; }",
            '</script>',
        ].join('\n'), 'PDX_VERSION_COUNTER');
        expect(ws).toHaveLength(1);
        expect(ws[0].message).toContain('recentsVersion');
        expect(ws[0].message).toContain('CD-S3');
        expect(ws[0].line, 'reported on another line than the declaration').toBe(4);
    });

    it('control — a counter someone reads for its value', () => {
        expect(codes([
            '<template><p>{{ count }}</p></template>', '<script setup>',
            'let count = $signal(0);',
            'function bump() { count++; }',
            'const label = $derived(`clicked ${count} times`);',
            '</script>',
        ].join('\n'), 'PDX_VERSION_COUNTER')).toHaveLength(0);
    });
});

describe('CD-B2 — PDX_ROUTE_RENDERS', () => {
    const route = (body: string, page = "@page '/intake';") =>
        `<template>\n<pdx-wizard>\n${body}\n</pdx-wizard>\n</template>\n<script setup>\n${page}\nlet step = $signal(0);\n</script>\n`;
    const step = (n: number) => `  <div data-wizard-step="${n}"><pdx-form-field name="f${n}"><pdx-input></pdx-input></pdx-form-field></div>`;

    it('intake: four wizard steps inline in the route', () => {
        const ws = codes(route([1, 2, 3, 4].map(step).join('\n')), 'PDX_ROUTE_RENDERS');
        expect(ws).toHaveLength(1);
        expect(ws[0].message).toContain('CD-B2');
        expect(ws[0].message).toContain('4');
    });

    it('intake as it is: the steps split across two forms still belong to one wizard', () => {
        // The wizard finds its steps with querySelectorAll, not among its children: three inside the
        // `intake` form, the fourth inside `billing`.
        const body = `  <pdx-form name="intake">\n${[1, 2, 3].map(step).join('\n')}\n  </pdx-form>\n  <pdx-form name="billing">\n${step(4)}\n  </pdx-form>`;
        const ws = codes(route(body), 'PDX_ROUTE_RENDERS');
        expect(ws).toHaveLength(1);
        expect(ws[0].message).toContain('4');
    });

    it('control — the same steps as components', () => {
        expect(codes(route([1, 2, 3, 4].map(n => `  <pdx-step-${n} data-wizard-step="${n}"></pdx-step-${n}>`).join('\n')), 'PDX_ROUTE_RENDERS')).toHaveLength(0);
    });

    it('control — a component that is not a route may hold its own sections', () => {
        expect(codes(route([1, 2, 3, 4].map(step).join('\n'), ''), 'PDX_ROUTE_RENDERS')).toHaveLength(0);
    });
});

describe('CD-C1 — PDX_SHARED_STYLES', () => {
    const file = (style: string) => [
        '<template>',
        '  <nav class="rail" :data-side="side"><button class="rail-toggle" @click="toggle">≡</button></nav>',
        '  <div class="profile" :show="profileOpen"><p class="profile-name">me</p></div>',
        '</template>',
        '<script setup>',
        "let side = $signal('expanded');", 'let collapsed = $signal(false);',
        'let profileOpen = $signal(false);', "let profileTab = $signal('me');",
        "function toggle() { side = side === 'expanded' ? 'collapsed' : 'expanded'; collapsed = !collapsed; }",
        "function openProfile() { profileOpen = true; profileTab = 'me'; }",
        '</script>',
        `<style scoped>\n${style}\n</style>`,
    ].join('\n');

    it('one stylesheet for the rail and the profile menu, which the script keeps apart', () => {
        const ws = codes(file('.rail { width: 240px; }\n.rail-toggle { border: 0; }\n.profile-name { font-weight: 600; }'), 'PDX_SHARED_STYLES');
        expect(ws).toHaveLength(1);
        expect(ws[0].message).toContain('CD-C1');
        expect(ws[0].message).toContain('.rail');
        expect(ws[0].message).toContain('.profile-name');
    });

    it('control — styles that follow one of the groups only', () => {
        expect(codes(file('.rail { width: 240px; }\n.rail-toggle { border: 0; }'), 'PDX_SHARED_STYLES')).toHaveLength(0);
    });
});

describe('CD-C3 — PDX_COLOUR_LITERAL', () => {
    const styled = (css: string) => `<template><p class="x">x</p></template>\n<script setup>\nlet a = $signal(0);\n</script>\n<style scoped>\n${css}\n</style>\n`;

    it('a hex, an rgb() and a `white` as values', () => {
        const ws = codes(styled('.x { color: #3366ff; }\n.x:hover { background: rgb(0 0 0 / 10%); }\n.y { border-color: white; }'), 'PDX_COLOUR_LITERAL');
        expect(ws.map(w => w.line)).toEqual([6, 7, 8]);
        expect(ws[0].message).toContain('#3366ff');
        expect(ws[0].message).toContain('CD-C3');
    });

    it('control — tokens, an id selector, and white-space are not colours', () => {
        expect(codes(styled('#main .x { color: var(--pdx-color-text); white-space: nowrap; }\n.x { background: transparent; border-color: currentColor; }'), 'PDX_COLOUR_LITERAL')).toHaveLength(0);
    });
});
