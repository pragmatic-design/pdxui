// Every import statement in the published documentation must resolve.
//
// `docs/testing.md` opened with `import { mount, tick, fireEvent, cleanup } from '@pdxui/core'`
// and `docs/devtools.md` with `import { initDevTools } from '@pdxui/core'`. Neither symbol is
// exported by that entry — they live in `@pdxui/core/testing` and `@pdxui/core/devtools`,
// deliberately, so test utilities never reach an application bundle. Nothing compiled the snippets,
// and no markdown file in the repository ever wrote the correct sub-path, so there was nothing to
// notice the divergence against.
//
// This resolves each specifier through the package's own `exports` map and checks the named symbols
// against what that entry actually exports. A new sub-path needs no change here.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');
const DOCS = join(REPO, 'packages', 'site', 'content', 'docs');

interface DocImport { doc: string; specifier: string; names: string[] }

/** `import { a, b as c } from '@pdxui/x'` in any fenced block of any doc page. */
function docImports(): DocImport[] {
    const out: DocImport[] = [];
    for (const f of readdirSync(DOCS).filter(n => n.endsWith('.md'))) {
        const txt = readFileSync(join(DOCS, f), 'utf8');
        for (const m of txt.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"](@pdxui\/[^'"]+)['"]/g)) {
            const names = m[1]
                .split(',')
                .map(s => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
                .filter(s => /^[A-Za-z_$][\w$]*$/.test(s));
            if (names.length) out.push({ doc: f, specifier: m[2], names });
        }
    }
    return out;
}

/** The source file a specifier resolves to, via the package's own exports map. */
function sourceOf(specifier: string): string | null {
    // '@pdxui/core'        -> ['@pdxui', 'core']
    // '@pdxui/core/testing'-> ['@pdxui', 'core', 'testing']
    const [, name, ...rest] = specifier.split('/');
    if (!name) return null;
    const pkgDir = join(REPO, 'packages', name);
    const pkgJson = join(pkgDir, 'package.json');
    if (!existsSync(pkgJson)) return null;
    const pkg = JSON.parse(readFileSync(pkgJson, 'utf8')) as { exports?: Record<string, unknown> };
    const subpath = rest.length ? `./${rest.join('/')}` : '.';
    const entry = pkg.exports?.[subpath];
    if (entry === undefined) return null;

    // Every condition names the same module through a different artefact, and the build mirrors
    // src/ into dist/. So take whichever condition exists and map it back to its source, which is
    // the only form readable without a build. This is the normalisation the compiler's own
    // ComponentResolver applies for the same reason (`normalizeModulePath`).
    const firstString = (v: unknown): string | null => {
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object') {
            const o = v as Record<string, unknown>;
            for (const k of ['development', 'types', 'import', 'default', 'require']) {
                const got = firstString(o[k]);
                if (got) return got;
            }
        }
        return null;
    };
    const rel = firstString(entry);
    if (!rel) return null;
    const asSource = rel
        .replace(/^\.\/dist\//, './src/')
        .replace(/\.(d\.ts|js|cjs|mjs)$/, '.ts');
    const file = resolve(pkgDir, asSource);
    // A bundle has no 1:1 source (core ships one file per format); fall back to the barrel.
    return existsSync(file) ? file : resolve(pkgDir, 'src', 'index.ts');
}

/** Every name a module exports, following one level of `export … from './x'` re-exports. */
function exportsOf(file: string, seen = new Set<string>()): Set<string> {
    const names = new Set<string>();
    if (seen.has(file) || !existsSync(file)) return names;
    seen.add(file);
    const src = readFileSync(file, 'utf8');

    for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}(?:\s*from\s*['"]([^'"]+)['"])?/g)) {
        for (const raw of m[1].split(',')) {
            const n = raw.trim().replace(/^type\s+/, '');
            const alias = n.split(/\s+as\s+/).pop()!.trim();
            if (/^[A-Za-z_$][\w$]*$/.test(alias)) names.add(alias);
        }
    }
    for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) {
        names.add(m[1]);
    }
    // `export * from './x'` — follow it, or the barrel looks empty.
    for (const m of src.matchAll(/export\s+\*\s+from\s*['"](\.[^'"]+)['"]/g)) {
        const target = resolve(dirname(file), m[1]);
        for (const cand of [`${target}.ts`, join(target, 'index.ts')]) {
            if (existsSync(cand)) for (const n of exportsOf(cand, seen)) names.add(n);
        }
    }
    return names;
}

describe('documentation imports resolve', () => {
    const imports = docImports();

    it('finds import statements in the docs', () => {
        // A zero here would make every case below pass by iterating nothing.
        expect(imports.length).toBeGreaterThan(5);
    });

    for (const { doc, specifier, names } of imports) {
        it(`${doc}: ${specifier} exports ${names.join(', ')}`, () => {
            const file = sourceOf(specifier);
            expect(file, `${specifier} is not in that package's "exports" map`).not.toBeNull();
            const exported = exportsOf(file!);
            expect(exported.size, `read no exports from ${file}`).toBeGreaterThan(0);
            const missing = names.filter(n => !exported.has(n));
            expect(missing, `${doc} imports ${missing.join(', ')} from ${specifier}, which does not export them`)
                .toEqual([]);
        });
    }
});
