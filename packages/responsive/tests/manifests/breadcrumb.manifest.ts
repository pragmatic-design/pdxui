/**
 * MANIFEST — pdx-breadcrumb (Tier 6)
 *
 * Two things are certified here. `breadcrumb-basic` is the CSS-only markup,
 * `<nav class="pdx-breadcrumb">`, the contract taken from contracts/universal.ts. `breadcrumb-element`
 * and `breadcrumb-collapsed` are the custom element itself (#289), selected by its parts: the
 * `<nav>` (`nav`), its `<ol>` (`list`), each `<li>` (`item`), a crumb that leads somewhere (`link`,
 * an `<a>` with an href, a `<button>` without), the page you are on (`current`, aria-current="page"),
 * the separators (`separator`, aria-hidden) and, with `max-items`, the button that stands for the
 * crumbs it collapsed (`ellipsis`).
 */
import type { ComponentManifest } from './_types';

export const breadcrumb: ComponentManifest = {
    name: 'breadcrumb',
    tag: 'pdx-breadcrumb',
    tier: '6',
    status: 'wip',
    imports: ['@pdxui/ui/breadcrumb'],

    // ── Scenarios ──
    scenarios: [
        {
            // The CSS-only markup (from the component-contracts.html monolith).
            id: 'breadcrumb-basic',
            title: 'Breadcrumb — Basic',
            html: `
                <nav class="pdx-breadcrumb" data-test="breadcrumb">
                    <a href="#">Home</a>
                    <a href="#">Products</a>
                    <span>Details</span>
                </nav>`,
        },
        {
            // The element: a link, a crumb with no href (a button), and the current page.
            id: 'breadcrumb-element',
            title: 'Breadcrumb — the element',
            html: `
                <pdx-breadcrumb data-test="crumbs" items='[{"key":"home","label":"Home","href":"#home"},{"key":"products","label":"Products"},{"key":"detail","label":"Detail"}]'></pdx-breadcrumb>`,
        },
        {
            // max-items collapses the middle of a long trail behind an ellipsis button.
            id: 'breadcrumb-collapsed',
            title: 'Breadcrumb — a long trail, collapsed',
            html: `
                <pdx-breadcrumb data-test="crumbs-long" max-items="3" items='[{"key":"a","label":"Home","href":"#a"},{"key":"b","label":"Catalogue","href":"#b"},{"key":"c","label":"Shoes","href":"#c"},{"key":"d","label":"Running","href":"#d"},{"key":"e","label":"Detail"}]'></pdx-breadcrumb>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (from universal.ts, the 'breadcrumb' block) ──
    contracts: {
        scenarios: {
            'breadcrumb-basic': {
                standalone: [
                    {
                        selector: '[data-test="breadcrumb"]',
                        description: 'breadcrumb has height >= 20px',
                        height: { op: '>=', value: 20 },
                    },
                    {
                        selector: '[data-test="breadcrumb"] a',
                        description: 'breadcrumb link has cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
            },
            'breadcrumb-element': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="crumbs"] [data-part="nav"]',
                        description: 'the element draws its nav, at least a line high',
                        height: { op: '>=', value: 20 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="crumbs"] [data-part="item"]',
                        description: 'three crumbs',
                        count: { op: '==', value: 3 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="crumbs"] [data-part="separator"]',
                        description: 'a separator between each two crumbs, none after the last',
                        count: { op: '==', value: 2 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="crumbs"] a[data-part="link"]',
                        description: 'a crumb with an href is a link, and looks clickable',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="crumbs"] button[data-part="link"]',
                        description: 'a crumb without an href is a button, and looks clickable',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
                composition: [
                    {
                        description: 'the crumbs sit on one row, in order',
                        parent: 'section:not([hidden]) [data-test="crumbs"] [data-part="list"]',
                        children: {
                            first: 'section:not([hidden]) [data-test="crumbs"] a[data-part="link"]',
                            second: 'section:not([hidden]) [data-test="crumbs"] button[data-part="link"]',
                            current: 'section:not([hidden]) [data-test="crumbs"] [data-part="current"]',
                        },
                        relations: [
                            { description: 'second right of first', left: 'second.left', op: '>', right: 'first.left' },
                            { description: 'current right of second', left: 'current.left', op: '>', right: 'second.left' },
                            { description: 'first and current on one row', left: 'first.top', op: '==', right: 'current.top', tolerance: 4 },
                        ],
                    },
                ],
            },
            'breadcrumb-collapsed': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="crumbs-long"] [data-part="ellipsis"]',
                        description: 'the collapsed crumbs are one ellipsis button',
                        count: { op: '==', value: 1 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="crumbs-long"] [data-part="item"]',
                        description: 'Home, the ellipsis and the last two crumbs',
                        count: { op: '==', value: 4 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="crumbs-long"] [data-part="ellipsis"]',
                        description: 'the ellipsis looks clickable',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        scenarios: ['breadcrumb-basic', 'breadcrumb-element', 'breadcrumb-collapsed'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'breadcrumb-basic',
        targets: [
            { selector: '[data-test="breadcrumb"]', tolerancePx: 6 },
        ],
    },

    // ── Dim. 4: keyboard ──
    // Native links and buttons, one tab stop each; the current page is text, not a stop.
    keyboard: {
        scenario: 'breadcrumb-element',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="crumbs"] a[data-part="link"]' },
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="crumbs"] button[data-part="link"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['breadcrumb-basic', 'breadcrumb-element'],
    },
};

export default breadcrumb;
