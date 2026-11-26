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
    'pdx-alert-dialog': 'src/alert-dialog/pdx-alert-dialog.pdx',
    'pdx-auto-form':'src/auto-form/pdx-auto-form.pdx',
    'pdx-avatar': 'src/avatar/pdx-avatar.pdx',
    'pdx-avatar-group': 'src/avatar-group/pdx-avatar-group.pdx',
    'pdx-badge': 'src/badge/pdx-badge.pdx',
    'pdx-accordion': 'src/accordion/pdx-accordion.pdx',
    'pdx-breadcrumb': 'src/breadcrumb/pdx-breadcrumb.pdx',
    'pdx-command': 'src/command/pdx-command.pdx',
    'pdx-button':'src/button/pdx-button.pdx',
    'pdx-button-group': 'src/button-group/pdx-button-group.pdx',
    'pdx-card': 'src/card/pdx-card.pdx',
    'pdx-chart': 'src/chart/pdx-chart.pdx',
    'pdx-checkbox': 'src/checkbox/pdx-checkbox.pdx',
    'pdx-checkbox-group': 'src/checkbox-group/pdx-checkbox-group.pdx',
    'pdx-chip': 'src/chip/pdx-chip.pdx',
    'pdx-color-picker': 'src/color-picker/pdx-color-picker.pdx',
    'pdx-data-source': 'src/data-source/pdx-data-source.pdx',
    'pdx-description-list': 'src/description-list/pdx-description-list.pdx',
    'pdx-dialog': 'src/dialog/pdx-dialog.pdx',
    'pdx-drawer': 'src/drawer/pdx-drawer.pdx',
    'pdx-mention': 'src/mention/pdx-mention.pdx',
    'pdx-overlay-outlet': 'src/overlay/pdx-overlay-outlet.pdx',
    'pdx-rich-text': 'src/rich-text/pdx-rich-text.pdx',
    'pdx-date-picker': 'src/date-picker/pdx-date-picker.pdx',
    'pdx-tree-select': 'src/tree-select/pdx-tree-select.pdx',
    'pdx-cascader': 'src/cascader/pdx-cascader.pdx',
    'pdx-carousel': 'src/carousel/pdx-carousel.pdx',
    'pdx-calendar': 'src/calendar/pdx-calendar.pdx',
    'pdx-transfer': 'src/transfer/pdx-transfer.pdx',
    'pdx-edit-drawer': 'src/edit-drawer/pdx-edit-drawer.pdx',
    'pdx-entity-grid':'src/entity-grid/pdx-entity-grid.pdx',
    'pdx-error-boundary':'src/error-boundary/pdx-error-boundary.pdx',
    'pdx-divider': 'src/divider/pdx-divider.pdx',
    'pdx-field-list': 'src/field-list/pdx-field-list.pdx',
    'pdx-fieldset': 'src/fieldset/pdx-fieldset.pdx',
    'pdx-form': 'src/form/pdx-form.pdx',
    'pdx-form-actions': 'src/form-actions/pdx-form-actions.pdx',
    'pdx-form-field': 'src/form-field/pdx-form-field.pdx',
    'pdx-input': 'src/input/pdx-input.pdx',
    'pdx-json-editor': 'src/json-editor/pdx-json-editor.pdx',
    'pdx-inline-edit': 'src/inline-edit/pdx-inline-edit.pdx',
    'pdx-infinite-scroll': 'src/infinite-scroll/pdx-infinite-scroll.pdx',
    'pdx-sortable-list': 'src/sortable-list/pdx-sortable-list.pdx',
    'pdx-list': 'src/list/pdx-list.pdx',
    'pdx-empty-state': 'src/empty-state/pdx-empty-state.pdx',
    'pdx-statistic': 'src/statistic/pdx-statistic.pdx',
    'pdx-split-button': 'src/split-button/pdx-split-button.pdx',
    'pdx-fab': 'src/fab/pdx-fab.pdx',
    'pdx-icon': 'src/icon/pdx-icon.pdx',
    'pdx-image':'src/image/pdx-image.pdx',
    'pdx-navbar': 'src/navbar/pdx-navbar.pdx',
    'pdx-dropdown-menu': 'src/dropdown-menu/pdx-dropdown-menu.pdx',
    'pdx-file-upload': 'src/file-upload/pdx-file-upload.pdx',
    'pdx-filter-builder': 'src/filter-builder/pdx-filter-builder.pdx',
    'pdx-menu': 'src/menu/pdx-menu.pdx',
    'pdx-aspect-ratio': 'src/aspect-ratio/pdx-aspect-ratio.pdx',
    'pdx-provide': 'src/provide/pdx-provide.pdx',
    'pdx-sidebar': 'src/sidebar/pdx-sidebar.pdx',
    'pdx-row': 'src/row/pdx-row.pdx',
    'pdx-col': 'src/col/pdx-col.pdx',
    'pdx-bottom-nav': 'src/bottom-nav/pdx-bottom-nav.pdx',
    'pdx-relation-picker': 'src/relation-picker/pdx-relation-picker.pdx',
    'pdx-relative-time': 'src/relative-time/pdx-relative-time.pdx',
    'pdx-scroll-spy': 'src/scroll-spy/pdx-scroll-spy.pdx',
    'pdx-banner': 'src/banner/pdx-banner.pdx',
    'pdx-field-group': 'src/field-group/pdx-field-group.pdx',
    'pdx-form-section': 'src/form-section/pdx-form-section.pdx',
    'pdx-masonry': 'src/masonry/pdx-masonry.pdx',
    'pdx-page-header': 'src/page-header/pdx-page-header.pdx',
    'pdx-input-group': 'src/input-group/pdx-input-group.pdx',
    'pdx-kbd': 'src/kbd/pdx-kbd.pdx',
    'pdx-label': 'src/label/pdx-label.pdx',
    'pdx-masked-input': 'src/masked-input/pdx-masked-input.pdx',
    'pdx-number-input': 'src/number-input/pdx-number-input.pdx',
    'pdx-otp-input': 'src/otp-input/pdx-otp-input.pdx',
    'pdx-pagination':'src/pagination/pdx-pagination.pdx',
    'pdx-password-input': 'src/password-input/pdx-password-input.pdx',
    'pdx-popover': 'src/popover/pdx-popover.pdx',
    'pdx-progress':'src/progress/pdx-progress.pdx',
    'pdx-radio': 'src/radio/pdx-radio.pdx',
    'pdx-radio-group': 'src/radio-group/pdx-radio-group.pdx',
    'pdx-search-input': 'src/search-input/pdx-search-input.pdx',
    'pdx-rating': 'src/rating/pdx-rating.pdx',
    'pdx-segmented': 'src/segmented/pdx-segmented.pdx',
    'pdx-slider': 'src/slider/pdx-slider.pdx',
    'pdx-sparkline': 'src/chart/pdx-sparkline.pdx',
    'pdx-spinner':'src/spinner/pdx-spinner.pdx',
    'pdx-tag-input': 'src/tag-input/pdx-tag-input.pdx',
    'pdx-textarea': 'src/textarea/pdx-textarea.pdx',
    'pdx-time-picker': 'src/time-picker/pdx-time-picker.pdx',
    'pdx-timeline': 'src/timeline/pdx-timeline.pdx',
    'pdx-toast': 'src/toast/pdx-toast.pdx',
    'pdx-toggle': 'src/toggle/pdx-toggle.pdx',
    'pdx-toolbar': 'src/toolbar/pdx-toolbar.pdx',
    'pdx-tooltip':'src/tooltip/pdx-tooltip.pdx',
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
