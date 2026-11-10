// A component written in .pdx is built, published and typed as the library's TypeScript components are
// (#1004). The fixture library under tests/fixtures/pdx-lib is built with the package's own build
// (library-config.ts) and its own declaration step (scripts/gen-pdx-dts.mjs): what this measures is
// what `pnpm --dir packages/ui build` does.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { libraryBuild, libraryPlugins } from '../../library-config';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { writePdxDeclarations } from '../../scripts/gen-pdx-dts.mjs';

const ROOT = join(__dirname, '..', 'fixtures', 'pdx-lib');
const DIST = join(ROOT, 'dist');
const read = (rel: string) => readFileSync(join(DIST, rel), 'utf-8');

beforeAll(async () => {
    rmSync(DIST, { recursive: true, force: true });
    await build({ root: ROOT, configFile: false, logLevel: 'silent', plugins: libraryPlugins(), ...libraryBuild(ROOT, DIST) });
    writePdxDeclarations(ROOT, DIST);
}, 120_000);

afterAll(() => { rmSync(DIST, { recursive: true, force: true }); });

describe('the library build of a .pdx component', () => {
    it('emits the compiled module at the export\'s path, and the TypeScript one beside it (the control)', () => {
        expect(existsSync(join(DIST, 'probe', 'pdx-probe.js')), 'no dist/probe/pdx-probe.js').toBe(true);
        expect(existsSync(join(DIST, 'plain', 'pdx-plain.js')), 'no dist/plain/pdx-plain.js').toBe(true);
    });

    it('imports @pdxui/core, external, instead of carrying a copy of it', () => {
        const code = read('probe/pdx-probe.js');
        expect(code).toMatch(/from\s*["']@pdxui\/core["']/);
        // Core's own definition of component(), inlined, would be a second core instance in an app.
        expect(code).not.toMatch(/function component\(/);
    });

    it('registers <pdx-probe> with its declared prop, once imported', async () => {
        await import(/* @vite-ignore */ pathToFileURL(join(DIST, 'probe', 'pdx-probe.js')).href);
        expect(customElements.get('pdx-probe'), '<pdx-probe> is not defined').toBeDefined();
        const el = document.createElement('pdx-probe') as HTMLElement & { label: string };
        document.body.appendChild(el);
        await new Promise((r) => setTimeout(r, 0));
        expect(el.textContent).toContain('probe');
        el.label = 'set';
        await new Promise((r) => setTimeout(r, 0));
        expect(el.textContent).toContain('set');
        el.remove();
    });

    it('writes its declaration: the prop, the model, the event, the exposed method and the exposed part', () => {
        const dts = read('probe/pdx-probe.d.ts');
        expect(dts).toContain('  label?: string;');
        expect(dts).toContain('  count?: number;');
        expect(dts).toContain('  ping: { n: number };');
        expect(dts).toContain("  'count-change': { value: number };");
        expect(dts).toContain('  readonly trigger: HTMLElement | null;');
        expect(dts).toContain('  bump(by?: number): number;');
        expect(dts).toContain("'pdx-probe': HTMLElement & PdxProbeProps & PdxProbeExposed;");
    });
});
