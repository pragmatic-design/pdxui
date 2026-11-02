/**
 * MANIFEST — pdx-data-source (a non-rendering provider)
 *
 * ── DOM (packages/ui/src/data-source/pdx-data-source.ts) ──
 *   <pdx-data-source :data="…">                ← renders nothing of its own: it projects its children
 *     <pdx-list>                               ← here, the list it feeds
 *
 * It draws nothing, so geometry rules go on what it wraps (#292: «its scenario wraps a pdx-list over
 * static data, so axe and hostile CSS run over it and geometry rules go on the list»). The scenario's
 * `setup` sets `data` — an array, which an attribute cannot carry — and hands the source the element
 * creates to the list, the way a page binds `el.source()`.
 *
 * ── Contracts ──
 *   · the list renders the provider's rows: one item per row;
 *   · the provider adds no box of its own: the list fills the container as it would alone.
 */
import type { ComponentManifest } from './_types';

const SETUP = `
    const host = document.querySelector('section:not([hidden]) [data-test="ds"]');
    const list = document.querySelector('section:not([hidden]) [data-test="ds-list"]');
    if (host && list) {
        // The name first: a list with no item slot shows a record's first value.
        host.data = [
            { name: 'Northwind Traders', id: 1 },
            { name: 'Contoso', id: 2 },
            { name: 'Fabrikam', id: 3 },
        ];
        // The source is created in the provider's track; it is read once it exists.
        await new Promise(r => requestAnimationFrame(r));
        list.source = host.source();
    }
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
`;

export const dataSource: ComponentManifest = {
    name: 'data-source',
    tag: 'pdx-data-source',
    tier: '5B',
    status: 'wip',
    imports: ['@pdxui/ui/data-source', '@pdxui/ui/list'],

    scenarios: [
        {
            id: 'data-source-list',
            title: 'Data source — three static rows, fed to a list',
            html: `
                <div data-test="box" style="width: 360px;">
                    <pdx-data-source data-test="ds">
                        <pdx-list data-test="ds-list" aria-label="Customers"></pdx-list>
                    </pdx-data-source>
                </div>`,
            setup: SETUP,
        },
    ],

    contracts: {
        scenarios: {
            'data-source-list': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="ds-list"] [data-part="item"]',
                        description: 'the list shows the provider\'s three rows',
                        count: { op: '==', value: 3 },
                    },
                ],
                composition: [
                    {
                        description: 'the provider adds no box: the list fills the container',
                        parent: 'section:not([hidden]) [data-test="box"]',
                        children: {
                            list: 'section:not([hidden]) [data-test="ds-list"]',
                        },
                        relations: [
                            { description: 'the list is as wide as the container', left: 'list.width', op: '>=', right: 'parent.width', tolerance: 1 },
                            { description: 'the list is inside the container', left: 'list.right', op: '<=', right: 'parent.right', tolerance: 1 },
                        ],
                    },
                ],
            },
        },
    },

    a11y: {
        scenarios: ['data-source-list'],
    },

    isolation: {
        scenario: 'data-source-list',
        targets: [
            { selector: 'section:not([hidden]) [data-test="ds-list"]', tolerancePx: 8, skipHeight: true },
        ],
    },
};

export default dataSource;
