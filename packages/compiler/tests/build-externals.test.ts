// Every Node builtin the plugin imports is external to the package's own build.
//
// The compiler is a library built by Vite, and Vite treats an unlisted builtin as a BROWSER import:
// it swaps the module for an empty stub, and a named import from it fails the build ("relative" is
// not exported by "__vite-browser-external"). The suites import the sources directly and never see
// it; only `pnpm build` does, and the pre-push gate does not run it. `import … from 'node:path'`
// in a new file broke CI that way, beside six files importing the listed `'path'`.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';
import config from '../vite.config';

const SRC = join(__dirname, '..', 'src');

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return sources(full);
        return /\.(ts|mjs|js)$/.test(name) && !name.endsWith('.d.ts') ? [full] : [];
    });
}

// Match: `from 'x'` and `import('x')` / `require('x')` with a literal specifier. Groups: [1]=specifier
const SPECIFIER = /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

const builtins = new Set(builtinModules);

function isBuiltin(spec: string): boolean {
    return spec.startsWith('node:') || builtins.has(spec.split('/')[0]);
}

describe('the compiler package build', () => {
    const external = config.build?.rollupOptions?.external;

    it('lists its externals as names', () => {
        expect(Array.isArray(external), 'build.rollupOptions.external is not a list').toBe(true);
    });

    it('keeps every Node builtin the sources import external', () => {
        const listed = new Set(external as string[]);
        const files = sources(SRC);
        expect(files.length, 'no sources found — this test measures nothing').toBeGreaterThan(10);

        const missing: string[] = [];
        for (const file of files) {
            const text = readFileSync(file, 'utf-8');
            for (const m of text.matchAll(SPECIFIER)) {
                const spec = m[1];
                if (isBuiltin(spec) && !listed.has(spec)) missing.push(`${file.slice(SRC.length + 1)}: ${spec}`);
            }
        }
        expect(missing, 'builtins the build would stub out for the browser').toEqual([]);
    });
});
