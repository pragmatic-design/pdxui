// What a component compiled from .pdx weighs (#1207). The library is moving to .pdx, so what the
// compiler emits for a component is paid by every app that uses it.
//
// Each module is built as packages/ui/PILOT.md weighs one: Vite in library mode, the package's own
// plugins (library-config.ts), esbuild's minifier as the library build runs it, every import external
// so only the module's own code counts, then gzip at level 9.
//
// The target is the TypeScript version's gzip, measured the same way: pdx-switch.ts 1120 B before #1008
// removed it, src/select/pdx-select.ts, still in the tree, 7650 B on 2026-11-19. On 2026-11-19 the
// compiled modules were 1411 B and 8981 B (1.26×, 1.17×); after #1207, 1204 B and 7741 B (1.07×,
// 1.01×). What is left, per construct, is in the pull request of #1207 and in PILOT.md.
//
// A ratchet, at what was measured: a codegen change that makes either module heavier fails here, and a
// change that makes it lighter lowers the ceiling in the same pull request.

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { libraryPlugins } from '../../library-config';

const UI = join(__dirname, '..', '..');

/** The gzip ceiling of each module, in bytes: its weight when the ratchet last moved. */
const CEILINGS = {
    'src/switch-toggle/pdx-switch.pdx': 1204,
    'pilot/select.pdx': 7741,
} as const;

/** Build `entry` alone, as the pilot weighed it, and return its minified code. */
async function compiled(entry: string): Promise<string> {
    const outDir = mkdtempSync(join(tmpdir(), 'pdx-weight-'));
    try {
        await build({
            root: UI, configFile: false, logLevel: 'silent', plugins: libraryPlugins(),
            build: {
                target: 'es2022', minify: 'esbuild', outDir, emptyOutDir: true,
                lib: { entry, formats: ['es'], fileName: 'out' },
                rollupOptions: {
                    // Every import external: only the module's own code is weighed. A virtual module
                    // (`\0…`) and a query (`?pdx-style`) are the compiler's own parts of the module.
                    external: (id, importer) => importer !== undefined && id !== entry && !id.startsWith('\0') && !id.includes('?'),
                },
            },
        });
        const file = readdirSync(outDir).find((f) => f.endsWith('.js'))!;
        return readFileSync(join(outDir, file), 'utf-8');
    } finally {
        rmSync(outDir, { recursive: true, force: true });
    }
}

const weights = new Map<string, number>();

beforeAll(async () => {
    for (const rel of Object.keys(CEILINGS)) {
        const code = await compiled(join(UI, rel));
        weights.set(rel, gzipSync(code, { level: 9 }).length);
    }
}, 120_000);

describe('the gzip of a component compiled from .pdx', () => {
    for (const [rel, ceiling] of Object.entries(CEILINGS)) {
        it(`${rel} is at most ${ceiling} B`, () => {
            const weight = weights.get(rel)!;
            // The control: a build that weighed nothing would pass any ceiling.
            expect(weight, 'the build weighed nothing').toBeGreaterThan(500);
            expect(weight, `${rel}: ${weight} B gzip`).toBeLessThanOrEqual(ceiling);
        });
    }
});
