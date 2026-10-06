// The mock-backend recipe's page example runs as written.
//
// Its `<script setup>` uses no rune — an import, two consts and an onMount. Compiled in the legacy
// mode it would have no auto-return (`:source="rows"` bound undefined) and onMount not imported
// (ReferenceError at setup) — and still compile, so compiling is not enough. This takes both of the
// recipe's own blocks — the `makeSource` module and the page — compiles the page with the real
// compiler, and mounts it against the real core and components.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import '../../src/index';
import { cleanup } from './helpers';

const RECIPES = join(__dirname, '../../../../marketplace/plugins/pdxui/skills/pdxui/references/recipes.md');
const TEXT = readFileSync(RECIPES, 'utf8').replace(/\r\n/g, '\n');

/** The ```js recipe:mock-backend module. */
const moduleBlock = TEXT.match(/^```js recipe:mock-backend\n([\s\S]*?)^```[ \t]*$/m)?.[1] ?? null;
/** The page: the first ```html block after "Then, in a page:". */
const pageBlock = TEXT.match(/Then, in a page:\n+```html\n([\s\S]*?)^```[ \t]*$/m)?.[1] ?? null;

/** The recipe's module, evaluated against the real core: its `makeSource`. */
function loadMakeSource(): (o?: Record<string, unknown>) => unknown {
    const body = moduleBlock!
        .replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/g, 'const {$1} = __core;')
        .replace(/^export\s+/gm, '');
    return new Function('__core', `${body}\nreturn makeSource;`)(core);
}

const TAG = 'pdx-mock-backend-page';

beforeAll(() => {
    if (!moduleBlock || !pageBlock) return;
    const makeSource = loadMakeSource();
    const { code } = compile(pageBlock, 'mock-backend-page.pdx', [], undefined, {});
    const body = code
        .replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/g, 'const {$1} = __core;')
        // The page imports makeSource from './lib/mock-backend': that is the module above.
        .replace(/^import\s*\{\s*makeSource\s*\}\s*from\s*'\.\/lib\/mock-backend';?$/m, '')
        .replace(/^import\s+'@pdxui\/ui[^']*';?$/gm, ''); // the components are registered above
    new Function('__core', 'makeSource', body)(core, makeSource);
});
afterEach(() => cleanup());

describe('recipe: a mock backend — the page example', () => {
    it('finds both of the recipe\'s blocks', () => {
        expect(moduleBlock, 'no ```js recipe:mock-backend block').not.toBeNull();
        expect(pageBlock, 'no page block after "Then, in a page:"').not.toBeNull();
        expect(pageBlock).toContain('<script setup>');
        expect(pageBlock, 'the page is the rune-less setup this test is about').not.toMatch(/\$signal|\$derived|@prop/);
    });

    it('mounts, and the grid shows the seeded rows', async () => {
        const el = document.createElement(TAG);
        document.body.appendChild(el);

        // The transport answers after its simulated latency (250 ms ± 20%): wait for the rows
        // themselves, not for a clock.
        await vi.waitFor(() => {
            expect(el.querySelectorAll('.pdx-dg-row').length, 'the grid has no rows').toBe(7);
        }, { timeout: 3000, interval: 25 });
        expect(el.textContent).toContain('Katherine');
    });
});
