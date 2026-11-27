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
// 1.01×). What is left, per construct, is in the pull request of #1207 and in PILOT.md. select 7741 →
// 7746 B after #1237: one of its two lists is a value row (eachStatic, no item signal per row), the
// other keeps eachRow, and the module imports both. 1204 → 1243 B and 7746 → 7787 B with #1246 (3c):
// a module names the features its declarations use, `defineComponent(…, { expose: exposeOnElement,
// host: bindHost })`, so an app whose components use neither does not carry them (hello: 8064 → 7508 B).
// Weighed here with every import external, the module pays the two imports' names; in an app's bundle
// they are local identifiers, and the showcase's whole JavaScript grew 0.2 KB. 1243 → 1255 B and
// 7787 → 7800 B with #1246's form base: both are form components, and name `{ form: FormPdxElement }`,
// the class whose form API leaves every component that is not one (hello: 7505 → 7237 B). The switch
// 1255 → 1273 B with #1246's slot projection: its template renders a <slot>, and it names
// `projection: slotProjection`, which leaves every component whose template renders none (hello: 7237 →
// 6784 B); the select renders none, and did not move. The select 7800 → 7806 B with #1240: its two
// `:style="…"` write `style.cssText` through `bindStyleText`, shorter calls than the property binding
// they were, and the module names one more import (its other bindings still use
// `bindAttributeOrProperty`): the six bytes are that name, which an app's bundle makes a local identifier.
// With #1268 a @part nothing reads has no ref, no signal and no bindRef: the switch 1273 → 1258 B (its
// root, label and description), the select 7806 → 7699 B (five of its eight parts are unread).
// With #1270 a value that cannot change is core's binding given the value and its once flag, with no
// effect: the select's four bindings of its `listboxId`, a `const` template literal, went from
// `()=>t.listboxId` to `t.listboxId,1` — fewer bytes raw, four more gzip (7699 → 7703 B) because the
// getter's shape repeats through the module and compresses better — for four effects fewer at each mount.
// With #1346 a component's prop and a URL are core's binding too (`bindComponentProp`, `bindUrl`), no
// longer an effect written out each: the select 7703 → 7389 B (its bindings on its own child components),
// the switch 1258 → 1256 B.
// With #1407 an `onDestroy` is core's hook, not an effect returning the callback as its cleanup: the
// select 7389 → 7391 B, the name `onDestroy` imported and called where `ctx.track(() => () => …)` was
// — two bytes, for one effect fewer created and run at each mount.
// With #1210 the select is the library's, src/select/pdx-select.pdx, and the pilot's rewrite is gone:
// the select is weighed there, 7627 B against the TypeScript version's 7648 B weighed the same way. It
// was written again from the TypeScript version, and weighed 7878 B with its list in three templates,
// one per mode, as the TypeScript version drew it, and 7899 B with the two defects fixed with the move
// (a key dropped, a filter left on its source); one list over the rows of the three modes, as the
// pilot's rewrite had it, took it to 7627 B. The pilot's rewrite weighed 7391 B: the 236 B between
// the two are not established here (#1287).
// With #1461 the select's caret rules moved to their own stylesheet, caret.css, which the cascader and
// the tree-select share: the select imports `@pdxui/design/components/caret`, one more import line,
// 7627 → 7632 B. Not codegen: the module's own import, which an app's bundle resolves to the stylesheet.
// With #1259 an `@if` compiles to `whenBlock`, which carries no animation, where it was `when`: 7632 →
// 7633 B, the longer name, imported and called; weighed here with every import external it stays as
// written, and in an app's bundle it is a local identifier.
// With #1275 a block's bindings run in one effect: each binding passes the block's group, `__g`, and the
// block declares it and runs it with `bindGroup`, where each binding made its own effect. The switch
// 1256 → 1276 B, the select 7633 → 7703 B: the group's declaration and run per block, `, __g` per
// binding, and `bindGroup`/`bindText` imported. The trade is the effects: pdx-fieldset written
// declaratively went from 1.41× its TypeScript version's mount to 1.01×. Then the values the bindings
// have with the props at their defaults go into the static markup and to `bindGroup`, which writes only
// what differs: the switch 1276 → 1287 B, the select 7703 → 7725 B, for the fieldset's whole mount,
// the frame after it included, 0.70–0.76× its TypeScript version's.
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
    'src/switch-toggle/pdx-switch.pdx': 1287,
    'src/select/pdx-select.pdx': 7725,
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
