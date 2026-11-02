/**
 * MANIFEST — pdx-bulk-actions (the action bar of a multi-selection)
 *
 * ── DOM (light DOM, packages/ui/src/bulk-actions/pdx-bulk-actions.ts) ──
 *   <pdx-bulk-actions>
 *     <div data-part="root" role="toolbar">                      ← inline-flex while count > 0, hidden at 0
 *       <span data-part="count">3 selected</span>
 *       <div class="pdx-bulk-buttons">
 *         <button data-part="action">…</button> × actions      ← a refused one is aria-disabled, not disabled
 *       <span id="…-why">reason</span>                           ← off-screen, what aria-describedby points at
 *       <button data-part="clear" aria-label="Clear selection">✕</button>
 *
 * ── DETERMINISTIC DATA ──
 *   `actions` is an array of objects, set in the scenario's `setup`: Archive, Delete (danger) and
 *   Export, refused with a reason. `count` is an attribute.
 *
 * ── Contracts ──
 *   · the bar shows at count > 0 and is gone at 0 — the two scenarios are each other's control;
 *   · its count sits before its actions, and it stays inside a narrow container, wrapping;
 *   · a refused action stays in the tab order, marked aria-disabled, and names its reason.
 *
 * No visual block: the bar draws only with tokens the button and surface manifests already hold.
 */
import type { ComponentManifest } from './_types';

const SETUP = (test: string): string => `
    const host = document.querySelector('section:not([hidden]) [data-test="${test}"]');
    if (host) host.actions = [
        { key: 'archive', label: 'Archive' },
        { key: 'delete', label: 'Delete', tone: 'danger' },
        { key: 'export', label: 'Export', disabled: true, disabledReason: 'You need the export permission' },
    ];
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
`;

const BAR = 'section:not([hidden]) [data-test="ba"] [data-part="root"]';

export const bulkActions: ComponentManifest = {
    name: 'bulk-actions',
    tag: 'pdx-bulk-actions',
    tier: '5B',
    status: 'wip',
    imports: ['@pdxui/ui/bulk-actions'],

    scenarios: [
        {
            id: 'bulk-actions-basic',
            title: 'Bulk actions — 3 selected, three actions, one refused with a reason',
            html: `
                <div data-test="box" style="width: 360px;">
                    <pdx-bulk-actions data-test="ba" count="3"></pdx-bulk-actions>
                </div>`,
            setup: SETUP('ba'),
        },
        {
            id: 'bulk-actions-empty',
            title: 'Bulk actions — nothing selected: no bar',
            html: `
                <div style="width: 360px;">
                    <pdx-bulk-actions data-test="ba0" count="0"></pdx-bulk-actions>
                </div>`,
            setup: SETUP('ba0'),
        },
    ],

    contracts: {
        scenarios: {
            'bulk-actions-basic': {
                standalone: [
                    {
                        selector: BAR,
                        description: 'with items selected the bar shows, as a flex row',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="ba"] [data-part="action"]',
                        description: 'one button per action',
                        count: { op: '==', value: 3 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="ba"] [data-part="action"][aria-disabled="true"]',
                        description: 'the refused action stays, marked aria-disabled',
                        count: { op: '==', value: 1 },
                    },
                    {
                        // A `disabled` button would leave the tab order and take its reason with it.
                        selector: 'section:not([hidden]) [data-test="ba"] [data-part="action"][disabled]',
                        description: 'no action uses the disabled attribute',
                        count: { op: '==', value: 0 },
                    },
                ],
                composition: [
                    {
                        description: 'the bar stays inside its narrow container, its count before its actions',
                        parent: 'section:not([hidden]) [data-test="box"]',
                        children: {
                            bar: BAR,
                            count: 'section:not([hidden]) [data-test="ba"] [data-part="count"]',
                            first: 'section:not([hidden]) [data-test="ba"] [data-part="action"]',
                        },
                        relations: [
                            { description: 'the bar is no wider than its container', left: 'bar.width', op: '<=', right: 'parent.width', tolerance: 1 },
                            // In reading order: on one row the count is to the left; in a theme whose
                            // wider type wraps the actions, the first one starts a row under it, at the
                            // same left edge. Either way never to its right, never below it.
                            { description: 'the count is not to the right of the first action', left: 'count.left', op: '<=', right: 'first.left' },
                            { description: 'the count is not below the first action', left: 'count.bottom', op: '<=', right: 'first.bottom', tolerance: 1 },
                        ],
                    },
                ],
            },
            'bulk-actions-empty': {
                standalone: [
                    {
                        // The control: at count 0 there is no bar, not one saying "0 selected".
                        selector: 'section:not([hidden]) [data-test="ba0"] [data-part="root"]',
                        description: 'with nothing selected the bar is not shown',
                        display: { op: 'is', value: 'none' },
                    },
                ],
            },
        },
    },

    a11y: {
        // The bar is a named toolbar; the refused action is described by its reason.
        scenarios: ['bulk-actions-basic', 'bulk-actions-empty'],
    },

    isolation: {
        scenario: 'bulk-actions-basic',
        targets: [
            { selector: BAR, tolerancePx: 8, skipHeight: true },
        ],
    },

    // Tab walks the actions, the refused one included — it is aria-disabled, and still reachable with
    // its reason — then the clear button.
    keyboard: {
        scenario: 'bulk-actions-basic',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="ba"] [data-part="action"]:nth-child(1)' },
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="ba"] [data-part="action"]:nth-child(2)' },
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="ba"] [data-part="action"]:nth-child(3)' },
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="ba"] [data-part="clear"]' },
        ],
    },
};

export default bulkActions;
