// The themes page's live measurement: the contrast section shows its rows, the DTCG section its
// JSON, and the page re-runs it when the theme changes.
@store themeMeasure;

import { THEME_CONTRACT, wcagContrast, parseColorToken, toDTCGJson } from '@pdxui/design/engine';

// The fills that carry a label. `warning` is in the list precisely because it is the exception:
// showing it beside the others is what makes the rule legible instead of asserted.
const PAIRS = [
    ['--pdx-color-primary', '--pdx-color-primary-text'],
    ['--pdx-color-danger', '--pdx-color-danger-text'],
    ['--pdx-color-success', '--pdx-color-success-text'],
    ['--pdx-color-info', '--pdx-color-info-text'],
    ['--pdx-color-warning', '--pdx-color-warning-text'],
];

let contrast = $signal([]);
let dtcg = $signal('');

/**
 * Read the tokens off the live document and measure them.
 *
 * Custom properties are NOT resolved per scheme — `getPropertyValue` hands back the authored text,
 * `light-dark(a, b)` included — so the scheme has to be chosen explicitly. Light is used here and
 * in the site's test, so the number on screen and the number the test recomputes are the same
 * question asked once.
 */
function measure() {
    const cs = getComputedStyle(document.documentElement);
    const rows = [];
    for (const pair of PAIRS) {
        const fill = parseColorToken(cs.getPropertyValue(pair[0]).trim(), 'light');
        const label = parseColorToken(cs.getPropertyValue(pair[1]).trim(), 'light');
        if (!fill || !label) continue;
        const ratio = Math.round(wcagContrast(fill, label) * 100) / 100;
        rows.push({ token: pair[0], textToken: pair[1], ratio, pass: ratio >= 4.5 });
    }
    contrast = rows;

    const tokens = {};
    for (const name of THEME_CONTRACT) {
        const v = cs.getPropertyValue(name).trim();
        if (v) tokens[name] = v;
    }
    dtcg = toDTCGJson(tokens, { root: 'pdx' });
}
