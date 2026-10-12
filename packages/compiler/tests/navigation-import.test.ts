// `navigation` from `@pdxui/router` is auto-imported in a .pdx that reads it (#149):
// `@if (navigation.pending()) { … }` works with no import written, on both render paths.
//
// It matters more than for the router's other readers: `navigation` is ALSO a browser global (the
// Navigation API's `window.navigation`), so a template that reached it unimported would call
// `pending()` on the wrong object, and the import is what makes the name mean the router's.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const PATHS = { 'template path': {}, 'inline path': { production: true, inlineBindings: true } } as const;
const IMPORT = /import \{[^}]*\bnavigation\b[^}]*\} from '@pdxui\/router';/;

const sfc = (template: string, script = 'let n = $signal(0);') =>
    `<template>\n  ${template}\n</template>\n<script setup>\n${script}\n</script>\n`;

for (const [path, opts] of Object.entries(PATHS)) {
    describe(`navigation is auto-imported — ${path}`, () => {
        const run = (template: string, script?: string) => compile(sfc(template, script), 'shell.pdx', [], undefined, opts);

        it('imports it for a template that reads navigation.pending()', () => {
            const { code, warnings } = run('@if (navigation.pending()) { <div class="route-progress" role="progressbar"></div> }');
            expect(code).toMatch(IMPORT);
            expect(code, 'the template reaches it through the component context').not.toContain('ctx.navigation');
            expect(warnings.map(w => w.code), 'navigation reported as undeclared').not.toContain('PDX_UNDECLARED_REF');
        });

        it('imports it for a template that reads navigation.to()', () => {
            expect(run('<p>{{ navigation.to() }}</p>').code).toMatch(IMPORT);
        });

        it('imports it for a script that reads it', () => {
            const { code } = run('<p>{{ busy }}</p>', 'const busy = $derived(navigation.pending());');
            expect(code).toMatch(IMPORT);
        });

        it('control — imports nothing for a component that does not read it', () => {
            const { code } = run('<p>The navigation. pending() is a word here, {{ n }}</p>');
            expect(code, 'a component that never reads navigation was made to import the router')
                .not.toContain('@pdxui/router');
        });

        it('does not import it twice when the author already did', () => {
            const { code } = run('<p>{{ navigation.pending() }}</p>',
                "import { navigation } from '@pdxui/router';\nlet n = $signal(0);");
            expect((code.match(/import \{[^}]*\bnavigation\b/g) ?? []).length).toBe(1);
        });

        it('leaves a name the component declares itself to the component', () => {
            const { code } = run('<p>{{ navigation.pending() }}</p>',
                'const navigation = { pending: () => false };');
            expect(code).not.toMatch(IMPORT);
        });
    });
}
