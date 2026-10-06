// Tests for external src= support and TypeScript/lang handling

import { describe, it, expect } from 'vitest';
import { parseSFC } from '../src/parser/sfc';
import { compile, pdx } from '../src/plugin';
import type { FileResolver } from '../src/plugin';
import { resolve, join, relative, isAbsolute } from 'path';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';

// ─── SFC Parser: src= and lang= ───────────────────────────────────

describe('SFC parser src= support', () => {
    it('detects src= on script tag', () => {
        const result = parseSFC('<template><div>test</div></template>\n<script setup src="./counter.ts" />');
        expect(result.script?.src).toBe('./counter.ts');
        expect(result.script?.setup).toBe(true);
        expect(result.script?.content).toBe(''); // self-closing, no inline content
    });

    it('detects src= on style tag', () => {
        const result = parseSFC('<template><div>test</div></template>\n<style scoped src="./counter.css" />');
        expect(result.style?.src).toBe('./counter.css');
        expect(result.style?.scoped).toBe(true);
    });

    it('detects src= with single quotes', () => {
        const result = parseSFC("<template><div/></template>\n<script setup src='./logic.ts' />");
        expect(result.script?.src).toBe('./logic.ts');
    });

    it('inline script has src=null', () => {
        const result = parseSFC('<template><div/></template>\n<script setup>const x = 1;</script>');
        expect(result.script?.src).toBeNull();
        expect(result.script?.content).toBe('const x = 1;');
    });
});

describe('SFC parser lang= support', () => {
    it('defaults script lang to ts', () => {
        const result = parseSFC('<template><div/></template>\n<script setup>code</script>');
        expect(result.script?.lang).toBe('ts');
    });

    it('detects explicit lang="js"', () => {
        const result = parseSFC('<template><div/></template>\n<script setup lang="js">code</script>');
        expect(result.script?.lang).toBe('js');
    });

    it('detects explicit lang="ts"', () => {
        const result = parseSFC('<template><div/></template>\n<script setup lang="ts">code</script>');
        expect(result.script?.lang).toBe('ts');
    });

    it('defaults style lang to css', () => {
        const result = parseSFC('<template><div/></template>\n<style>.x{}</style>');
        expect(result.style?.lang).toBe('css');
    });

    it('detects style lang="scss"', () => {
        const result = parseSFC('<template><div/></template>\n<style lang="scss">.x{}</style>');
        expect(result.style?.lang).toBe('scss');
    });
});

// ─── Compile with external src= ───────────────────────────────────

describe('compile with external src=', () => {
    const mockResolver: FileResolver = (srcPath) => {
        const files: Record<string, string> = {
            './counter.ts': `
                @prop label: string = 'Counter';
                @prop initial: number = 0;
                let count = $signal(initial);
                function inc() { count++; }
            `,
            './counter.css': `.card { padding: 1rem; }`,
        };
        const content = files[srcPath];
        if (!content) throw new Error(`Mock file not found: ${srcPath}`);
        return content;
    };

    it('resolves external script src=', () => {
        const { code } = compile(
            '<template><div>{{ count }}</div></template>\n<script setup src="./counter.ts" />',
            '/app/counter.pdx',
            [],
            mockResolver
        );
        expect(code).toContain("label: { type: String, default: 'Counter' }");
        expect(code).toContain('__count');
        expect(code).toContain('inc');
    });

    it('resolves external style src=', () => {
        const { code } = compile(
            '<template><div>test</div></template>\n<script setup>\n  @prop x: number = 0;\n</script>\n<style scoped src="./counter.css" />',
            '/app/counter.pdx',
            [],
            mockResolver
        );
        expect(code).toContain('.card');
        expect(code).toContain('__pdx_style');
    });

    it('throws clear error when src= file not found', () => {
        expect(() => compile(
            '<template><div/></template>\n<script setup src="./missing.ts" />',
            '/app/test.pdx',
            [],
            (src) => { throw new Error(`File not found: ${src}`); }
        )).toThrow('File not found');
    });

    it('throws clear error when no resolver provided for src=', () => {
        expect(() => compile(
            '<template><div/></template>\n<script setup src="./counter.ts" />',
            '/app/test.pdx'
        )).toThrow('requires a file resolver');
    });
});

describe('vite plugin src= security guard', () => {
    it('rejects sibling paths that only share the project-root prefix', () => {
        const plugin = pdx();
        const transform = plugin.transform as (this: { error(message: string): never }, code: string, id: string) => unknown;
        const source = '<template><div/></template>\n<script setup src="../../ui-framework-evil/secret.ts" />';
        const id = resolve(process.cwd(), 'src', 'guard-test.pdx');

        expect(() => transform.call({
            error(message: string): never {
                throw new Error(message);
            },
        }, source, id)).toThrow('resolves outside the project root');
    });
});

describe('vite plugin DevTools injection (dev only)', () => {
    it('does NOT inject DevTools in a production build', () => {
        const plugin = pdx();
        (plugin.config as (c: object, e: { command: string }) => void)({}, { command: 'build' });
        const out = (plugin.transformIndexHtml as (h: string) => string)('<html><body></body></html>');
        expect(String(out)).not.toContain('initDevTools');
    });

    it('injects DevTools in dev (serve)', () => {
        // `initDevTools` lives in a virtual module the plugin serves, not inline in the page, because
        // an inline script is not import-rewritten and its bare specifier would reach the browser
        // unresolved.
        // So: the page must reference the module, AND the module must be the devtools bootstrap.
        const plugin = pdx();
        (plugin.config as (c: object, e: { command: string }) => void)({}, { command: 'serve' });
        const out = String((plugin.transformIndexHtml as (h: string) => string)('<html><body></body></html>'));
        expect(out).toContain('virtual:pdx-devtools');

        const id = 'virtual:pdx-devtools';
        const resolved = (plugin.resolveId as (i: string) => string | undefined)(id);
        expect(resolved).toBeTruthy();
        const code = (plugin.load as (i: string) => string | undefined)(resolved!);
        expect(code).toContain('initDevTools');
    });
});

describe('vite plugin src= symlink guard', () => {
    // The project is a temporary root, handed to the plugin as Vite's root. A link in this package's
    // own src/ would be listed by core's token scan, walking packages/ in the same gate, and then
    // found gone: a red on a clean tree.
    it('rejects a symlink that resolves outside the project root', () => {
        const root = mkdtempSync(join(tmpdir(), 'pdx-symlink-root-'));
        const external = join(tmpdir(), `pdx-secret-${Date.now()}.css`);
        try {
            const link = join(root, 'src', '__symlink_guard_test.css');
            const rel = relative(resolve(__dirname, '..', '..'), link);
            expect(rel.startsWith('..') || isAbsolute(rel), 'the link is written inside packages/').toBe(true);
            try {
                mkdirSync(join(root, 'src'));
                writeFileSync(external, '.secret { color: red; }');
                symlinkSync(external, link);
            } catch {
                // symlink creation not permitted on this platform → skip
                return;
            }
            const plugin = pdx();
            (plugin.configResolved as (c: { root: string; server: { fs: { allow: string[] } } }) => void)(
                { root, server: { fs: { allow: [] } } });
            const transform = plugin.transform as (this: { error(m: string): never }, code: string, id: string) => unknown;
            const source = '<template><div/></template>\n<script setup>@prop x: number = 0;</script>\n<style scoped src="./__symlink_guard_test.css" />';
            const id = join(root, 'src', '__symlink_test.pdx');
            expect(() => transform.call({ error(m: string): never { throw new Error(m); } }, source, id)).toThrow(/symlink/i);
        } finally {
            rmSync(root, { recursive: true, force: true });
            rmSync(external, { force: true });
        }
    });
});

// ─── TypeScript erasure ────────────────────────────────────────────
//
// Vite/esbuild does not strip the types of a .pdx: through a real dev server (transformRequest), an
// interface, an `as` and a parameter annotation reach the module as written, and the browser rejects
// them. The compiler erases them, positions kept; what these protect is that the runtime code
// around the types survives.

describe('TypeScript-safe compilation', () => {
    it('preserves interface declarations in script body', () => {
        const { code } = compile(`
<template><div>{{ name }}</div></template>
<script setup>
  @prop name: string = 'World';

  interface User {
    id: number;
    name: string;
  }

  let user = $signal<User>({ id: 1, name: 'Alice' });
</script>`, 'test.pdx');

        // The interface is erased; the signal it typed is still declared, with its value.
        expect(code).not.toContain('interface User');
        expect(code).not.toContain('id: number');
        expect(code).toContain("signal({ id: 1, name: 'Alice' }");
    });

    it('preserves type imports in user imports', () => {
        const { code } = compile(`
<template><div>test</div></template>
<script setup>
  import type { User } from './types';
  @prop name: string = 'World';
</script>`, 'test.pdx');

        // A type-only import has no runtime: erased, not requested from the server.
        expect(code).not.toContain("import type { User } from './types'");
        expect(code).not.toContain("from './types'");
    });

    it('preserves generic type annotations', () => {
        const { code } = compile(`
<template><div>{{ items }}</div></template>
<script setup>
  @prop items: string[] = [];

  const map = new Map<string, number>();
  let selected = $signal<string | null>(null);
</script>`, 'test.pdx');

        // The type arguments go; the Map and the signal stay.
        expect(code).not.toContain('Map<string, number>');
        expect(code).toMatch(/new Map\s*\(\)/);
        expect(code).toContain('signal(null');
    });
});

// ─── SFC Parser: </script> inside strings (regression #2) ────────

describe('SFC parser tokenizer-aware close tag', () => {
    it('does not truncate on </script> inside single-quoted string', () => {
        const source = `<template><div>test</div></template>
<script setup>
const tmpl = '</script>';
let count = $signal(0);
</script>`;
        const result = parseSFC(source);
        expect(result.script).not.toBeNull();
        expect(result.script!.content).toContain('let count = $signal(0)');
        expect(result.script!.content).toContain("'</script>'");
    });

    it('does not truncate on </script> inside double-quoted string', () => {
        const source = `<template><div>test</div></template>
<script setup>
const x = "</script>";
let name = $signal('hello');
</script>`;
        const result = parseSFC(source);
        expect(result.script!.content).toContain("let name = $signal('hello')");
    });

    it('does not truncate on </script> inside template literal', () => {
        const source = `<template><div>test</div></template>
<script setup>
const html = \`<div></script></div>\`;
let active = $signal(true);
</script>`;
        const result = parseSFC(source);
        expect(result.script!.content).toContain('let active = $signal(true)');
    });

    it('does not truncate on </style> inside CSS string', () => {
        const source = `<template><div>test</div></template>
<script setup>
let x = $signal(0);
</script>
<style scoped>
.test::before { content: '</style>'; }
.real { color: red; }
</style>`;
        const result = parseSFC(source);
        expect(result.style!.content).toContain('.real { color: red; }');
    });

    it('handles </script> inside a line comment', () => {
        const source = `<template><div>test</div></template>
<script setup>
// This is not a close tag: </script>
let count = $signal(42);
</script>`;
        const result = parseSFC(source);
        expect(result.script!.content).toContain('let count = $signal(42)');
    });
});
