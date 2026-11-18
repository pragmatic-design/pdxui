// What the published packages ship for source maps (#1208).
//
// core, compiler and router publish `src/` beside `dist/`, and every map also embedded the sources it
// maps, once per map: core's `sourcesContent` was 4.5 MB against a `src/` of 1.6. Their maps keep
// `sources`, which point into the `src/` the package ships, so a debugger still opens the TypeScript;
// they drop `sourcesContent`. lsp's maps mapped a bundle of TypeScript and vscode-languageserver whose
// sources are not in the package, for code that is not minified: it publishes none.
//
// Read off `npm pack --dry-run`, the file list a publish would ship, against the built `dist/`.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

const PACKAGES = join(__dirname, '..', '..');

interface Packed { unpackedSize: number; files: { path: string }[] }

function pack(name: string): Packed {
    const dir = join(PACKAGES, name);
    // npm, not pnpm: `--dry-run --json` lists the files without writing a tarball. `--prefix` keeps npm
    // from walking up to the workspace root.
    const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts', '--prefix', dir, dir], { encoding: 'utf8', shell: true });
    return (JSON.parse(out) as Packed[])[0];
}

const MAPPED = ['core', 'compiler', 'router'];
const packed = new Map<string, Packed>();
const packOf = (name: string) => {
    if (!packed.has(name)) packed.set(name, pack(name));
    return packed.get(name)!;
};

describe('the source maps the packages publish', () => {
    it('lsp publishes none', () => {
        const lsp = packOf('lsp');
        console.log(`[package-maps] lsp: ${(lsp.unpackedSize / 1e6).toFixed(1)} MB unpacked`);
        expect(lsp.files.some((f) => f.path === 'dist/server.cjs'), 'lsp packs no server — the check below proves nothing').toBe(true);
        expect(lsp.files.filter((f) => f.path.endsWith('.map')).map((f) => f.path)).toEqual([]);
    }, 60_000);

    it.each(MAPPED)('%s keeps its maps, without the sources it already ships', (name) => {
        const pkg = packOf(name);
        console.log(`[package-maps] ${name}: ${(pkg.unpackedSize / 1e6).toFixed(1)} MB unpacked`);
        const maps = pkg.files.map((f) => f.path).filter((p) => p.startsWith('dist/') && p.endsWith('.map'));
        expect(maps.length, `${name} packs no map — the check below proves nothing`).toBeGreaterThan(0);
        const withContent = maps.filter((p) => {
            const map = JSON.parse(readFileSync(join(PACKAGES, name, p), 'utf8')) as { sourcesContent?: (string | null)[] };
            return (map.sourcesContent ?? []).some((s) => s !== null && s !== '');
        });
        expect(withContent, `${name}'s maps embed the sources the package already ships`).toEqual([]);
    }, 60_000);

    it.each(MAPPED)('%s: every source a map names is a file the package ships', (name) => {
        const pkg = packOf(name);
        const shipped = new Set(pkg.files.map((f) => f.path));
        // The largest map: the one that names the most sources.
        const largest = pkg.files.filter((f) => f.path.endsWith('.map')).map((f) => f.path)
            .map((p) => ({ p, map: JSON.parse(readFileSync(join(PACKAGES, name, p), 'utf8')) as { sources: string[] } }))
            .sort((a, b) => b.map.sources.length - a.map.sources.length)[0];
        expect(largest.map.sources.length, 'too few sources to sample').toBeGreaterThan(5);
        const missing = largest.map.sources
            .map((s) => posix.normalize(posix.join(dirname(largest.p).replace(/\\/g, '/'), s)))
            .filter((s) => !shipped.has(s));
        expect(missing, `${largest.p} names sources the package does not ship`).toEqual([]);
    }, 60_000);
});
