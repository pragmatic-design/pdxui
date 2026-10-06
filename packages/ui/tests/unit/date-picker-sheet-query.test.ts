// The width at which pdx-date-picker's panel becomes a bottom sheet is decided in one place.
//
// Two systems position that panel: the stylesheet (a sheet pinned to the bottom, below a
// breakpoint) and the popover composable (a floating panel, above it). The component tells the
// popover to stand down below DATE_PICKER_SHEET_QUERY; the stylesheet turns the sheet on with its own
// @media. If the two queries drift apart, both systems act at once in the band between them —
// an 8px overflow and a ResizeObserver loop. This test is what keeps them one.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATE_PICKER_SHEET_QUERY } from '../../src/date-picker/pdx-date-picker';

const CSS = readFileSync(join(__dirname, '..', '..', '..', 'design', 'src', 'components', 'date-picker.css'), 'utf-8');

/** The query of every @media block that makes `.pdx-date-picker-panel` a fixed sheet. */
function sheetQueries(css: string): string[] {
    const starts = [...css.matchAll(/@media\s*([^{]+)\{/g)];
    const out: string[] = [];
    starts.forEach((m, i) => {
        const body = css.slice(m.index! + m[0].length, starts[i + 1]?.index ?? css.length);
        const panelRule = body.match(/\.pdx-date-picker-panel\s*\{([^}]*)\}/);
        if (panelRule && /position:\s*fixed/.test(panelRule[1])) out.push(m[1].trim());
    });
    return out;
}

describe('pdx-date-picker sheet breakpoint', () => {
    it('the stylesheet turns the sheet on at exactly the query the component hands the popover', () => {
        expect(sheetQueries(CSS)).toEqual([DATE_PICKER_SHEET_QUERY]);
    });

    it('the control: the scan reads a drifted query as a different one', () => {
        const drifted = CSS.replace(DATE_PICKER_SHEET_QUERY, '(max-width: 600px)');
        expect(sheetQueries(drifted)).toEqual(['(max-width: 600px)']);
    });
});
