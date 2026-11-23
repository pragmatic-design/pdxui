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
    'pdx-checkbox-group': 'src/checkbox-group/pdx-checkbox-group.pdx',
    'pdx-chip': 'src/chip/pdx-chip.pdx',
    'pdx-color-picker': 'src/color-picker/pdx-color-picker.pdx',
    'pdx-divider': 'src/divider/pdx-divider.pdx',
    'pdx-field-list': 'src/field-list/pdx-field-list.pdx',
    'pdx-form': 'src/form/pdx-form.pdx',
    'pdx-form-actions': 'src/form-actions/pdx-form-actions.pdx',
    'pdx-form-field': 'src/form-field/pdx-form-field.pdx',
    'pdx-input': 'src/input/pdx-input.pdx',
    'pdx-inline-edit': 'src/inline-edit/pdx-inline-edit.pdx',
    'pdx-infinite-scroll': 'src/infinite-scroll/pdx-infinite-scroll.pdx',
    'pdx-sortable-list': 'src/sortable-list/pdx-sortable-list.pdx',
    'pdx-list': 'src/list/pdx-list.pdx',
    'pdx-empty-state': 'src/empty-state/pdx-empty-state.pdx',
    'pdx-statistic': 'src/statistic/pdx-statistic.pdx',
    'pdx-split-button': 'src/split-button/pdx-split-button.pdx',
    'pdx-input-group': 'src/input-group/pdx-input-group.pdx',
    'pdx-kbd': 'src/kbd/pdx-kbd.pdx',
    'pdx-masked-input': 'src/masked-input/pdx-masked-input.pdx',
    'pdx-number-input': 'src/number-input/pdx-number-input.pdx',
    'pdx-password-input': 'src/password-input/pdx-password-input.pdx',
    'pdx-progress': 'src/progress/pdx-progress.pdx',
    'pdx-radio': 'src/radio/pdx-radio.pdx',
    'pdx-radio-group': 'src/radio-group/pdx-radio-group.pdx',
    'pdx-search-input': 'src/search-input/pdx-search-input.pdx',
    'pdx-rating': 'src/rating/pdx-rating.pdx',
    'pdx-segmented': 'src/segmented/pdx-segmented.pdx',
    'pdx-slider': 'src/slider/pdx-slider.pdx',
    'pdx-spinner': 'src/spinner/pdx-spinner.pdx',
    'pdx-tag-input': 'src/tag-input/pdx-tag-input.pdx',
    'pdx-textarea': 'src/textarea/pdx-textarea.pdx',
    'pdx-toggle': 'src/toggle/pdx-toggle.pdx',
    // Its own module since its move (#1210): it was a second component() in pdx-toggle.ts.
    'pdx-toggle-group': 'src/toggle-group/pdx-toggle-group.pdx',
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
