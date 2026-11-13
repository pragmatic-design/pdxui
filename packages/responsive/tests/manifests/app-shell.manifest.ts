/**
 * MANIFEST — pdx-app-shell (#1023)
 *
 * Derived from:
 *  - source: packages/ui/src/app-shell/pdx-app-shell.pdx
 *      the HOST <pdx-app-shell> :state(collapsed|catalog|drawer) → an inner
 *        <div class="pdx-app-shell" data-part="root" data-side="expanded|collapsed" [data-open]>
 *          <pdx-sidebar data-part="rail"> brand slot · <pdx-nav-menu data-part="railNav"> · <button data-part="allButton"> · foot slot
 *          <div data-part="catalog" role="dialog" hidden> search · <pdx-nav-menu data-part="catalogNav">
 *          <div data-part="frame"> <button data-part="railToggle"> · <header data-part="bar"> bar slot · <main data-part="main"> page
 *  - CSS: packages/design/src/components/app-shell.css
 *      .pdx-app-shell → flex row; the rail 300px expanded, 80px collapsed; the frame takes the rest.
 *
 * Behaviour (navigation, favourites, recents, permissions, drawer) is app-shell-beta-contract.spec.ts.
 * Conservative rules: only invariants true on all themes, no exact px.
 */
import type { ComponentManifest } from './_types';

const ITEMS = `[{"key":"work","label":"Work","items":[{"key":"tickets","label":"Tickets","href":"#tickets","icon":"list","badge":"12"},{"key":"board","label":"Board","href":"#board","icon":"grid"}]},{"key":"you","label":"You","items":[{"key":"settings","label":"Settings","href":"#settings","icon":"settings"}]}]`;
const HOME = `{"key":"home","label":"Dashboard","href":"#home","icon":"home"}`;
const shell = (id: string, attrs = '') =>
    `<pdx-app-shell data-test="shell" storage-key="cert-${id}" ${attrs} items='${ITEMS}' home='${HOME}' default-favourites='["tickets"]'>`
    + `<strong slot="brand">PDX</strong><span slot="bar">Tickets</span><span slot="foot">v1.0</span><p>The page</p></pdx-app-shell>`;

export const appShell: ComponentManifest = {
    name: 'app-shell',
    tag: 'pdx-app-shell',
    tier: '3C',
    status: 'wip',
    imports: ['@pdxui/ui/app-shell'],

    scenarios: [
        { id: 'app-shell-basic', title: 'App shell — Basic', html: shell('basic') },
        { id: 'app-shell-collapsed', title: 'App shell — Collapsed', html: shell('collapsed', 'collapsed') },
    ],

    contracts: {
        scenarios: {
            'app-shell-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="shell"] [data-part="root"]',
                        description: 'the rail and the frame sit side by side',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="shell"] [data-part="rail"]',
                        description: 'the expanded rail has room for labels (>= 240px)',
                        width: { op: '>=', value: 240 },
                    },
                ],
                composition: [
                    {
                        description: 'the frame starts where the rail ends',
                        parent: 'body',
                        children: {
                            rail: 'section:not([hidden]) [data-test="shell"] [data-part="rail"]',
                            frame: 'section:not([hidden]) [data-test="shell"] [data-part="frame"]',
                        },
                        relations: [
                            { description: 'frame.left >= rail.right', left: 'frame.left', op: '>=', right: 'rail.right', tolerance: 1 },
                        ],
                    },
                ],
            },
            'app-shell-collapsed': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="shell"] [data-part="rail"]',
                        description: 'the collapsed rail is icons only (<= 96px)',
                        width: { op: '<=', value: 96 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ── two named navigation landmarks, a named search, a named handle.
    a11y: {
        scenarios: ['app-shell-basic', 'app-shell-collapsed'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'app-shell-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="shell"] [data-part="rail"]', tolerancePx: 12 },
        ],
    },

    // ── Dim. 4: keyboard ── the rail's entries are one tab stop (home first; the arrows walk them),
    // the pin beside a favourite is its own (pdx-nav-menu's itemActions), then «All» and the handle.
    keyboard: {
        scenario: 'app-shell-basic',
        steps: [
            { key: 'Tab', expectFocus: '[data-test="shell"] [data-part="railNav"] a[data-nav-key="home"]' },
            { key: 'Tab', expectFocus: '[data-test="shell"] [data-part="pin"]' },
            { key: 'Tab', expectFocus: '[data-test="shell"] [data-part="allButton"]' },
            { key: 'Tab', expectFocus: '[data-test="shell"] [data-part="railToggle"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['app-shell-basic', 'app-shell-collapsed'],
    },
};

export default appShell;
