// The component-design rules a compiler can decide from one file.
//
// `docs/PDX-COMPONENT-DESIGN.md` marks four rules as precise and per-file:
//   CD-A1  a component reaches its own elements through a `:ref`, not `document.querySelector`;
//   CD-A2  a component does not write its own props;
//   CD-D3  a document/window listener is removed when the component goes;
//   CD-C2  an app's styles do not reach into a library element's internal classes.
// Each is a warning with the rule id in its message and the line it is on, so `pdx check` and the
// editor can point at it. Every row has a control: a check that fires on everything passes the
// first half of each pair.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const warningsOf = (source: string, code: string) => compile(source, 'piece.pdx').warnings.filter(w => w.code === code);

describe('CD-A1 — PDX_DOCUMENT_QUERY', () => {
    const sfc = (script: string) => `<template><div class="list"><a class="first">x</a></div></template>
<script setup>
let open = $signal(false);
${script}
</script>
`;

    it('document.querySelector in a component is reported, on its line, naming the rule', () => {
        const [w] = warningsOf(sfc(`function focusFirst() {\n  document.querySelector('.first')?.focus();\n}`), 'PDX_DOCUMENT_QUERY');
        expect(w, 'nothing said about document.querySelector').toBeDefined();
        expect(w.message).toContain('CD-A1');
        expect(w.message).toContain(':ref');
        expect(w.line).toBe(5);
    });

    it('and getElementById, and querySelectorAll', () => {
        expect(warningsOf(sfc(`const a = document.getElementById('x');`), 'PDX_DOCUMENT_QUERY')).toHaveLength(1);
        expect(warningsOf(sfc(`const a = document.querySelectorAll('.x');`), 'PDX_DOCUMENT_QUERY')).toHaveLength(1);
    });

    it('control — a :ref, and a query on an element the component holds, are not reported', () => {
        expect(warningsOf(sfc(`let firstEl = $signal(null);\nfunction f(el) { el.querySelector('.first'); }`), 'PDX_DOCUMENT_QUERY')).toHaveLength(0);
    });

    it('control — the words in a comment or a string are not reported', () => {
        expect(warningsOf(sfc(`// document.querySelector is what we avoid\nconst s = 'document.querySelector';`), 'PDX_DOCUMENT_QUERY')).toHaveLength(0);
    });
});

describe('CD-A2 — PDX_PROP_WRITE', () => {
    const sfc = (script: string) => `<template><span>{{ label }}</span></template>
<script setup>
@prop label: string = 'Hello';
@prop count: number = 0;
${script}
</script>
`;

    it('assigning a prop inside its own component is reported, naming the rule', () => {
        const [w] = warningsOf(sfc(`function reset() {\n  label = 'x';\n}`), 'PDX_PROP_WRITE');
        expect(w, 'nothing said about writing a prop').toBeDefined();
        expect(w.message).toContain('CD-A2');
        expect(w.message).toContain('label');
        expect(w.line).toBe(6);
    });

    it('and a compound or an increment', () => {
        expect(warningsOf(sfc(`function up() { count++; }`), 'PDX_PROP_WRITE')).toHaveLength(1);
        expect(warningsOf(sfc(`function up() { count += 2; }`), 'PDX_PROP_WRITE')).toHaveLength(1);
    });

    it('control — reading a prop, a same-named object key, and a shadowing parameter are not reported', () => {
        const script = `const n = count + 1;\nconst o = { label: 'x' };\nfunction f(label) { label = 'y'; return label; }`;
        expect(warningsOf(sfc(script), 'PDX_PROP_WRITE')).toHaveLength(0);
    });
});

describe('CD-D3 — PDX_LISTENER_LEAK', () => {
    const sfc = (script: string) => `<template><div></div></template>
<script setup>
let open = $signal(false);
${script}
</script>
`;

    it('a document listener with no removal is reported, naming the event and the rule', () => {
        const [w] = warningsOf(sfc(`onMount(() => {\n  document.addEventListener('pointerdown', close);\n});`), 'PDX_LISTENER_LEAK');
        expect(w, 'nothing said about a listener that is never removed').toBeDefined();
        expect(w.message).toContain('CD-D3');
        expect(w.message).toContain('pointerdown');
        expect(w.line).toBe(5);
    });

    it('and a window one', () => {
        expect(warningsOf(sfc(`onMount(() => { window.addEventListener('resize', f); });`), 'PDX_LISTENER_LEAK')).toHaveLength(1);
    });

    it('control — removed in onDestroy, or registered once, is not reported', () => {
        const removed = `onMount(() => {\n  document.addEventListener('pointerdown', close);\n  onDestroy(() => document.removeEventListener('pointerdown', close));\n});`;
        expect(warningsOf(sfc(removed), 'PDX_LISTENER_LEAK')).toHaveLength(0);
        expect(warningsOf(sfc(`document.addEventListener('keydown', f, { once: true });`), 'PDX_LISTENER_LEAK')).toHaveLength(0);
    });

    it('control — a removal on the other target does not count', () => {
        const other = `document.addEventListener('resize', f);\nwindow.removeEventListener('resize', f);`;
        expect(warningsOf(sfc(other), 'PDX_LISTENER_LEAK')).toHaveLength(1);
    });
});

describe('CD-C2 — PDX_LIBRARY_INTERNALS', () => {
    const sfc = (style: string, template = '<div class="page pdx-txt-small"><pdx-data-grid></pdx-data-grid></div>') => `<template>${template}</template>
<script setup>
let n = $signal(0);
</script>
<style scoped>
${style}
</style>
`;

    it('a scoped style reaching a pdx-* class the template never writes is reported, naming the rule', () => {
        const [w] = warningsOf(sfc(`.page { gap: 4px; }\n.page .pdx-dg-row { cursor: pointer; }`), 'PDX_LIBRARY_INTERNALS');
        expect(w, 'nothing said about styling the grid from outside').toBeDefined();
        expect(w.message).toContain('CD-C2');
        expect(w.message).toContain('.pdx-dg-row');
        expect(w.line).toBe(7);
    });

    it('control — a pdx-* class the template itself writes is the app\'s own, and not reported', () => {
        expect(warningsOf(sfc(`.page .pdx-txt-small { opacity: .8; }`), 'PDX_LIBRARY_INTERNALS')).toHaveLength(0);
    });

    it('control — custom properties and plain classes are not reported', () => {
        expect(warningsOf(sfc(`.page { --pdx-space-md: 8px; color: var(--pdx-color-text); }`), 'PDX_LIBRARY_INTERNALS')).toHaveLength(0);
    });

    it('one report per class per rule, even when the selector names it twice', () => {
        expect(warningsOf(sfc(`.page .pdx-nav-row:hover .x,\n.page .pdx-nav-row:focus-within .x { opacity: 1; }`), 'PDX_LIBRARY_INTERNALS')).toHaveLength(1);
    });

    it('control — a state class the library documents on the app\'s own element is API, and not reported', () => {
        // useScrollAnimation adds pdx-in-view to the element the app gave it: the composables docs
        // say so, and styling it is how the animation is meant to live in CSS.
        expect(warningsOf(sfc(`.card.pdx-in-view { opacity: 1; }`), 'PDX_LIBRARY_INTERNALS')).toHaveLength(0);
    });

    it('control — a pdx-* class inside :not() excludes the library, and is not reported', () => {
        expect(warningsOf(sfc(`nav:not(:where(.pdx-nav)) a { color: inherit; }`), 'PDX_LIBRARY_INTERNALS')).toHaveLength(0);
    });

    it('control — a pdx-* inside a comment is not reported', () => {
        expect(warningsOf(sfc(`/* .pdx-dg-row */ .page { gap: 4px; }`), 'PDX_LIBRARY_INTERNALS')).toHaveLength(0);
    });
});
