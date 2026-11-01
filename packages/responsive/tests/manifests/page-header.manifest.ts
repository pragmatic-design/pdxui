/**
 * MANIFEST — pdx-page-header (Tier 6)
 *
 * Written by inspecting the source (packages/ui/src/page-header/pdx-page-header.ts) and the CSS
 * (packages/design/src/components/page-header.css; the crumbs are drawn by nav.css, which base.css
 * carries). Selected by its parts (#289):
 *   - `root`, the `<header class="pdx-page-header">`, a column: the breadcrumb above the title row;
 *   - `breadcrumb`, the `<nav>` of the crumbs, only when there are any — a crumb with an href is an
 *     `<a>`, one without a `<button>`, the last the current page (aria-current="page"), the separators
 *     empty so the theme's glyph fills them;
 *   - `title`, the h1…h6 `heading-level` names; `subtitle`, under it, only when set;
 *   - `actions`, the area the `actions` slot lands in, at the end of the title row.
 *
 * The scenarios pin `heading-level="2"`: a page has one h1, and these sit under the scenario's own.
 */
import type { ComponentManifest } from './_types';

const CRUMBS = '[{"key":"home","label":"Home","href":"#home"},{"key":"clinic","label":"Clinic"},{"key":"patients","label":"Patients"}]';

export const pageHeader: ComponentManifest = {
    name: 'page-header',
    tag: 'pdx-page-header',
    tier: '6',
    status: 'wip',
    imports: ['@pdxui/ui/page-header', '@pdxui/ui/button'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'page-header-full',
            title: 'Page header — breadcrumb, title, subtitle and actions',
            html: `
                <div style="width: 760px; max-width: 100%;">
                    <pdx-page-header data-test="ph" title="Patients" subtitle="1,204 records" heading-level="2" crumbs='${CRUMBS}'>
                        <pdx-button slot="actions" variant="outline" data-test="ph-export">Export</pdx-button>
                        <pdx-button slot="actions" variant="primary" data-test="ph-new">New patient</pdx-button>
                    </pdx-page-header>
                </div>`,
        },
        {
            id: 'page-header-title',
            title: 'Page header — the title alone',
            html: `
                <div style="width: 760px; max-width: 100%;">
                    <pdx-page-header data-test="ph-title" title="Dashboard" heading-level="2"></pdx-page-header>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'page-header-full': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="ph"] [data-part="title"]',
                        description: 'the title is drawn, at least a line high',
                        height: { op: '>=', value: 20 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="ph"] [data-part="breadcrumb"] [aria-current="page"]',
                        description: 'one current page in the trail',
                        count: { op: '==', value: 1 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="ph"] [data-part="breadcrumb"] button.pdx-breadcrumb-link',
                        description: 'a crumb without an href is a button, and looks clickable',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="ph"] [data-part="subtitle"]',
                        description: 'the subtitle is drawn',
                        height: { op: '>', value: 0 },
                    },
                ],
                composition: [
                    {
                        description: 'breadcrumb above the title, the title above its subtitle',
                        parent: 'section:not([hidden]) [data-test="ph"] [data-part="root"]',
                        children: {
                            crumbs: 'section:not([hidden]) [data-test="ph"] [data-part="breadcrumb"]',
                            title: 'section:not([hidden]) [data-test="ph"] [data-part="title"]',
                            subtitle: 'section:not([hidden]) [data-test="ph"] [data-part="subtitle"]',
                        },
                        relations: [
                            { description: 'crumbs end above the title', left: 'crumbs.bottom', op: '<=', right: 'title.top', tolerance: 2 },
                            { description: 'title ends above the subtitle', left: 'title.bottom', op: '<=', right: 'subtitle.top', tolerance: 2 },
                        ],
                    },
                    {
                        description: 'the actions sit at the end of the title row, inside the header',
                        parent: 'section:not([hidden]) [data-test="ph"] [data-part="root"]',
                        children: {
                            root: 'section:not([hidden]) [data-test="ph"] [data-part="root"]',
                            title: 'section:not([hidden]) [data-test="ph"] [data-part="title"]',
                            actions: 'section:not([hidden]) [data-test="ph"] [data-part="actions"]',
                        },
                        relations: [
                            { description: 'actions right of the title', left: 'actions.left', op: '>', right: 'title.right' },
                            { description: 'actions end at the header\'s end', left: 'actions.right', op: '<=', right: 'root.right', tolerance: 2 },
                        ],
                    },
                ],
            },
            'page-header-title': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="ph-title"] [data-part="title"]',
                        description: 'the title is drawn',
                        height: { op: '>=', value: 20 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="ph-title"] [data-part="breadcrumb"]',
                        description: 'no crumbs, no breadcrumb',
                        count: { op: '==', value: 0 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        scenarios: ['page-header-full', 'page-header-title'],
    },

    // ── Dim. 3: style isolation ── the title keeps its box under hostile global CSS.
    isolation: {
        scenario: 'page-header-full',
        targets: [
            { selector: 'section:not([hidden]) [data-test="ph"] [data-part="title"]', tolerancePx: 10 },
        ],
    },

    // ── Dim. 4: keyboard ── the link, the crumb button, then the two actions: one tab stop each.
    keyboard: {
        scenario: 'page-header-full',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="ph"] a.pdx-breadcrumb-link' },
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="ph"] button.pdx-breadcrumb-link' },
            { key: 'Tab', expectFocusWithin: 'section:not([hidden]) [data-test="ph-export"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['page-header-full'],
    },
};

export default pageHeader;
