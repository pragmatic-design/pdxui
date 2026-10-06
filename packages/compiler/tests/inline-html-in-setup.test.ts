// A production module imports `html` when its SCRIPT uses it, not only when its render does.
//
// `html` is a name a .pdx script may use without importing it: the compiler imports it for the
// template, and a `@snippet` is lowered to a setup function that returns html``. With
// `inlineBindings` on — the default of a production build — the render does not need it, and an
// import decided by asking the render alone is dropped. A function in the script that builds an
// item template with html`` then throws on first use, in production only:
//
//     [pdx] Unhandled effect error: ReferenceError: html is not defined
//         at Object.g [as renderItemContent] …
//
// A render that uses html`` for something else carries the import by accident and hides it; a
// render that is all inline shows it.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const SCRIPT_USES_HTML = `<template>
  <pdx-select label="Team member" :options="people" :item-template="renderItem"></pdx-select>
</template>

<script setup>
const people = [{ id: 1, name: 'Ada' }];
function renderItem(item) {
  return html\`<span class="who">\${item.label}</span>\`;
}
</script>`;

const PLAIN = `<template><p :title="t">{{ t }}</p></template>
<script setup>
@prop t: string = '';
</script>`;

const emitted = (source: string): string =>
    compile(source, 'team.pdx', [], undefined, { production: true, inlineBindings: true }).code;

/** The names the module imports from `@pdxui/core`. */
function importedNames(code: string): string[] {
    const m = /import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core'/.exec(code);
    return m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
}

describe('production, inline bindings: html is imported when the script uses it', () => {
    it('a script function that returns html`` keeps the import', () => {
        const code = emitted(SCRIPT_USES_HTML);
        // Guard the premise: the render must not be what keeps the import, or this passes for the
        // old reason. The only html`` left in the module is the script's.
        expect(code.match(/html`/g)?.length, 'the render uses html`` again — re-read this test').toBe(1);
        expect(importedNames(code), 'the script calls html and the module does not import it').toContain('html');
    });

    it('control — a component that uses html nowhere still drops it', () => {
        const code = emitted(PLAIN);
        expect(code).not.toMatch(/\bhtml\b/);
        expect(importedNames(code), 'an unused html import came back').not.toContain('html');
    });
});
