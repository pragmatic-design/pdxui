/**
 * MANIFEST — pdx-progress
 *
 * Contracts WRITTEN by inspecting the source (packages/ui/src/progress/pdx-progress.ts)
 * and the CSS (packages/design/src/components/progress.css). Progress is a NON-interactive
 * indicator (no keyboard).
 *
 * DOM structure (linear mode):
 *   <div role="progressbar" aria-label aria-valuemin=0 aria-valuemax> ← wrapper, no class
 *     <div class="pdx-progress">                ← track (rail)
 *       <div class="pdx-progress-bar"></div>    ← fill, width = percent
 *     </div>
 *   </div>
 *   In indeterminate (value<0 o omesso): aria-valuenow rimosso, .pdx-progress-bar
 *   width 30% via CSS + animazione slide.
 *
 * The base geometry (progress.css, independent of the theme):
 *  - .pdx-progress      width 100% (grande), height 0.5rem (8px), radius full, overflow hidden
 *  - .pdx-progress-bar  height 100%, radius full; width valore-driven
 *
 * The strategy (lessons from wave 2): no exact px on the fill (it depends on the value).
 * A relative composition is used instead: fill.width <= track.width. Scoped selectors.
 * role="progressbar" + aria-valuemin/max + aria-label garantiscono a11y equa.
 */
import type { ComponentManifest } from './_types';

export const progress: ComponentManifest = {
    name: 'progress',
    tag: 'pdx-progress',
    tier: '1C',
    status: 'wip',
    imports: ['@pdxui/ui/progress'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'progress-determinate',
            title: 'Progress — Determinate',
            // value=60 → a proportional fill, aria-valuenow is there. An explicit aria-label.
            html: `
                <div style="max-width: 400px; padding: 16px;">
                    <pdx-progress data-test="progress" value="60" max="100"
                        aria-label="Upload progress"></pdx-progress>
                </div>`,
        },
        {
            id: 'progress-indeterminate',
            title: 'Progress — Indeterminate',
            // value omesso → default -1 → indeterminate (animazione CSS, no aria-valuenow).
            html: `
                <div style="max-width: 400px; padding: 16px;">
                    <pdx-progress data-test="progress" aria-label="Loading"></pdx-progress>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'progress-determinate': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="progress"] .pdx-progress',
                        description: 'progress track is wide (spans container)',
                        width: { op: '>=', value: 100 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="progress"] .pdx-progress',
                        description: 'progress track has a height (thin rail)',
                        height: { op: '>=', value: 2 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="progress"] .pdx-progress',
                        description: 'progress track radius >= 0',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="progress"] .pdx-progress-bar',
                        description: 'progress bar (fill) has a width when value > 0',
                        width: { op: '>=', value: 1 },
                    },
                ],
                composition: [
                    {
                        // The fill is value-driven: NOT an exact px, only containment in the track.
                        description: 'fill is no wider than the track',
                        parent: 'section:not([hidden]) [data-test="progress"]',
                        children: {
                            track: 'section:not([hidden]) [data-test="progress"] .pdx-progress',
                            fill: 'section:not([hidden]) [data-test="progress"] .pdx-progress-bar',
                        },
                        relations: [
                            {
                                description: 'fill.width <= track.width',
                                left: 'fill.width',
                                op: '<=',
                                right: 'track.width',
                                tolerance: 2,
                            },
                            {
                                description: 'fill is contained in track',
                                left: 'fill',
                                op: 'contained-in',
                                right: 'track',
                            },
                        ],
                    },
                ],
            },
            'progress-indeterminate': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="progress"] .pdx-progress',
                        description: 'indeterminate track still spans container',
                        width: { op: '>=', value: 100 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
// role="progressbar" + aria-valuemin/max + aria-label (given in the scenarios) → fair.
    a11y: {
        scenarios: ['progress-determinate', 'progress-indeterminate'],
    },

    // ── Dim. 3: style isolation ──
    // The track must keep its large width and thin height under hostile CSS.
    isolation: {
        scenario: 'progress-determinate',
        targets: [
            { selector: 'section:not([hidden]) [data-test="progress"] .pdx-progress', tolerancePx: 10 },
        ],
    },

    // ── Dim. 4: keyboard ──
    // Progress is NOT interactive → no keyboard spec (deliberately omitted).

    // ── Dim. 5: visual regression (Docker) ──
    // The determinate scenario is static (the bar has only a width transition, not a
    // loop). The indeterminate one animates forever → NOT included in the visual dimension (the runner
    // freezes it, but the phase it starts from is not deterministic).
    visual: {
        scenarios: ['progress-determinate'],
    },
};

export default progress;
