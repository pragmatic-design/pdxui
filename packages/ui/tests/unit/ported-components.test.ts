// The library moves to .pdx one component at a time (#1210, after pdx-switch, #1008). A move changes
// where the component lives and nothing it declares: custom-elements.json is what the compiler's
// auto-import, the LSP, the site, the skill catalogue and the certification registry read, so a field
// lost on the way would be lost in all of them.
//
// The oracle for each moved tag is the declaration its TypeScript version had, recorded from the
// manifest just before the move in tests/fixtures/ts-declarations/<tag>.json. A tag joins PORTED in
// the pull request that moves it.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const UI = join(__dirname, '..', '..');
const read = (rel: string) => JSON.parse(readFileSync(join(UI, rel), 'utf-8'));

interface Declaration { tagName?: string; [key: string]: unknown }
interface Module { path: string; declarations: Declaration[]; exports: { declaration: { module: string } }[] }

/** Each moved tag, and the .pdx it lives in now. */
const PORTED: Record<string, string> = {
    'pdx-avatar': 'src/avatar/pdx-avatar.pdx',
    'pdx-badge': 'src/badge/pdx-badge.pdx',
    'pdx-button': 'src/button/pdx-button.pdx',
    'pdx-button-group': 'src/button-group/pdx-button-group.pdx',
    'pdx-checkbox': 'src/checkbox/pdx-checkbox.pdx',
    'pdx-chip': 'src/chip/pdx-chip.pdx',
    'pdx-divider': 'src/divider/pdx-divider.pdx',
    'pdx-input': 'src/input/pdx-input.pdx',
    'pdx-kbd': 'src/kbd/pdx-kbd.pdx',
    'pdx-progress': 'src/progress/pdx-progress.pdx',
    'pdx-radio': 'src/radio/pdx-radio.pdx',
    'pdx-spinner': 'src/spinner/pdx-spinner.pdx',
};

const manifest = read('custom-elements.json') as { modules: Module[] };

describe('a component moved to .pdx (#1210)', () => {
    for (const [tag, path] of Object.entries(PORTED)) {
        describe(tag, () => {
            const module = manifest.modules.find((m) => m.declarations.some((d) => d.tagName === tag));

            it(`is ${path} in the manifest`, () => {
                expect(module?.path).toBe(path);
                expect(module?.exports.map((e) => e.declaration.module)).toEqual([path]);
            });

            it('declares what its TypeScript version declared, field by field', () => {
                const recorded = read(`tests/fixtures/ts-declarations/${tag}.json`) as Declaration;
                const now = module!.declarations.find((d) => d.tagName === tag)!;
                const keys = [...new Set([...Object.keys(recorded), ...Object.keys(now)])].sort();
                const differing = keys
                    .filter((key) => JSON.stringify(now[key]) !== JSON.stringify(recorded[key]))
                    .map((key) => ({ key, recorded: recorded[key], now: now[key] }));
                expect(differing).toEqual([]);
            });
        });
    }
});
