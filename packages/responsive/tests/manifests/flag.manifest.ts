/**
 * MANIFEST — pdx-flag (#1091)
 *
 * DOM: <pdx-flag> (host, inline-flex) > <img data-part="root" class="pdx-flag" src="blob:…">. The image
 * is the region's 4:3 SVG, from its own module (packages/ui/src/flag/flags/<xx>.ts), loaded when shown.
 * flag.css draws it --pdx-flag-size tall (the component writes it: xs 12, sm 16, md 20, lg 24, xl 32)
 * and four thirds of it wide, with a thin ring of the theme's border so a white flag stays visible.
 *
 * ARIA: named by the region (`alt`, Intl.DisplayNames in the page's language) or, `decorative`, an empty
 * `alt` and aria-hidden, the name said beside it.
 *
 * Selectors ALWAYS scoped `section:not([hidden]) ...`.
 */
import type { ComponentManifest } from './_types';

// A flag's module loads after the mount, then its image decodes: ready when every flag of the section
// has an image that has decoded.
const WAIT_FLAGS = `await new Promise((r) => { let n = 0; const c = () => { const flags = Array.from(document.querySelectorAll('section:not([hidden]) pdx-flag')); const done = flags.length && flags.every((f) => { const i = f.querySelector('img'); return i && i.complete && i.naturalWidth > 0; }); if (done || n++ > 120) r(); else requestAnimationFrame(c); }; c(); });`;

const SEL = (t: string) => `section:not([hidden]) [data-test="${t}"] [data-part="root"]`;

export const flag: ComponentManifest = {
    name: 'flag',
    tag: 'pdx-flag',
    tier: '1A',
    status: 'wip',
    imports: ['@pdxui/ui/flag'],

    scenarios: [
        {
            id: 'flag-named',
            title: 'Flag — Named by its region',
            html: `
                <div class="row">
                    <pdx-flag data-test="flag-it" region="IT" locale="en"></pdx-flag>
                    <pdx-flag data-test="flag-jp" region="JP" locale="en"></pdx-flag>
                    <pdx-flag data-test="flag-br" region="BR" locale="en"></pdx-flag>
                </div>`,
            setup: WAIT_FLAGS,
        },
        {
            id: 'flag-decorative',
            title: 'Flag — Decorative, beside its name',
            html: `
                <div class="row">
                    <span data-test="flag-label"><pdx-flag data-test="flag-de" region="DE" decorative></pdx-flag> Deutsch</span>
                </div>`,
            setup: WAIT_FLAGS,
        },
        {
            id: 'flag-sizes',
            title: 'Flag — Sizes (sm / md / lg)',
            html: `
                <div class="row">
                    <pdx-flag data-test="flag-sm" region="FR" size="sm" locale="en"></pdx-flag>
                    <pdx-flag data-test="flag-md" region="FR" size="md" locale="en"></pdx-flag>
                    <pdx-flag data-test="flag-lg" region="FR" size="lg" locale="en"></pdx-flag>
                </div>`,
            setup: WAIT_FLAGS,
        },
    ],

    contracts: {
        scenarios: {
            'flag-named': {
                standalone: [
                    { selector: SEL('flag-it'), description: 'md flag is 20px tall', height: { op: '>=', value: 19.5 } },
                    { selector: SEL('flag-it'), description: 'md flag is at most 20.5px tall', height: { op: '<=', value: 20.5 } },
                    // 4:3: 20 × 4/3 = 26.67.
                    { selector: SEL('flag-it'), description: 'md flag is four thirds as wide as tall (>= 26.2px)', width: { op: '>=', value: 26.2 } },
                    { selector: SEL('flag-it'), description: 'md flag is four thirds as wide as tall (<= 27.2px)', width: { op: '<=', value: 27.2 } },
                ],
            },
            'flag-decorative': {
                composition: [
                    {
                        // The flag sits on the line of its name: its centre within a pixel of the text's line box centre.
                        description: 'a decorative flag is inside the label it decorates',
                        parent: 'section:not([hidden]) [data-test="flag-label"]',
                        children: {
                            label: 'section:not([hidden]) [data-test="flag-label"]',
                            flag: SEL('flag-de'),
                        },
                        relations: [
                            { description: 'flag within the label', left: 'flag', op: 'contained-in', right: 'label', tolerance: 1 },
                        ],
                    },
                ],
            },
            'flag-sizes': {
                composition: [
                    {
                        description: 'size hierarchy: sm < md < lg',
                        parent: 'section:not([hidden]) .row',
                        children: { sm: SEL('flag-sm'), md: SEL('flag-md'), lg: SEL('flag-lg') },
                        relations: [
                            { description: 'sm height < md height', left: 'sm.height', op: '<', right: 'md.height' },
                            { description: 'md height < lg height', left: 'md.height', op: '<', right: 'lg.height' },
                            { description: 'sm width < md width', left: 'sm.width', op: '<', right: 'md.width' },
                            { description: 'md width < lg width', left: 'md.width', op: '<', right: 'lg.width' },
                        ],
                    },
                ],
            },
        },
    },

    // A named flag is an image with an alt; a decorative one is aria-hidden with an empty alt.
    a11y: {
        scenarios: ['flag-named', 'flag-decorative'],
    },

    isolation: {
        scenario: 'flag-named',
        targets: [
            { selector: SEL('flag-it'), tolerancePx: 4 },
        ],
    },

    // An image, not interactive.
    keyboard: {
        scenario: 'flag-named',
    },

    // Three flags, one of them white (Japan): the ring is what keeps it on the page.
    visual: {
        scenarios: ['flag-named'],
    },
};

export default flag;
