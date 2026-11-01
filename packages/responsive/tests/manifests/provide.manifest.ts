/**
 * MANIFEST — pdx-provide (#290)
 *
 * Contracts written by inspecting the source (packages/ui/src/provide/pdx-provide.ts):
 *   - it renders `<slot></slot>` and nothing of its own: no class, no state, no part;
 *   - it provides `value` under `token` (or every entry of `values`) to the elements it wraps, through
 *     the hierarchical Context Protocol: the nearest provider wins.
 *
 * It draws no box, which is why it had no manifest. The one scenario wraps a CONSUMER: a reader the
 * setup defines, which shows the value it injects. So axe and hostile CSS run over the provider with
 * real content inside it, and the geometry rules go on what it wraps. What the reader reads, and the
 * nested override, are measured in wrappers-beta-contract.spec.ts.
 *
 * Not interactive → keyboard OMITTED. No box of its own → no visual baseline.
 */
import type { ComponentManifest } from './_types';

export const provide: ComponentManifest = {
    name: 'provide',
    tag: 'pdx-provide',
    tier: '6',
    status: 'wip',
    imports: ['@pdxui/ui/provide'],

    scenarios: [
        {
            id: 'provide-consumer',
            title: 'Provide — a reader of the provided value inside',
            html: `
                <div data-test="provide-wrap" style="width: 320px;">
                    <pdx-provide data-test="provide"></pdx-provide>
                </div>`,
            // The token and the reader are a page's own: defined here, the value provided, the reader
            // put inside.
            setup: `
                const { component, html, context, inject } = await import('@pdxui/core');
                const Theme = context('scenario-theme');
                if (!customElements.get('scenario-theme-reader')) {
                    component('scenario-theme-reader', {
                        render: (ctx) => html\`<p data-test="provide-read" style="margin: 0; padding: 8px;">Theme: \${() => String(inject(Theme, ctx.el, 'none'))}</p>\`,
                    });
                }
                const host = document.querySelector('section:not([hidden]) [data-test="provide"]');
                host.token = Theme;
                host.value = 'dark';
                host.appendChild(document.createElement('scenario-theme-reader'));
                for (let i = 0; i < 30 && !host.querySelector('[data-test="provide-read"]'); i++) {
                    await new Promise((r) => requestAnimationFrame(r));
                }`,
        },
    ],

    contracts: {
        scenarios: {
            'provide-consumer': {
                composition: [
                    {
                        // What it wraps lays out inside it: the provider adds no box that clips or offsets it.
                        description: 'the consumer it wraps is contained in its wrapper',
                        parent: 'section:not([hidden]) [data-test="provide-wrap"]',
                        children: {
                            wrap: 'section:not([hidden]) [data-test="provide-wrap"]',
                            read: 'section:not([hidden]) [data-test="provide-read"]',
                        },
                        relations: [
                            { description: 'the reader is within the wrapper', left: 'read', op: 'contained-in', right: 'wrap' },
                            { description: 'the reader starts at the wrapper left edge', left: 'read.left', op: '==', right: 'wrap.left', tolerance: 1 },
                        ],
                    },
                ],
            },
        },
    },

    a11y: {
        scenarios: ['provide-consumer'],
    },

    isolation: {
        scenario: 'provide-consumer',
        targets: [
            // The provider itself: the reader is the page's own <p>, which hostile CSS is free to reach.
            // A content-driven wrapper, so its height is the reader's.
            { selector: 'section:not([hidden]) [data-test="provide"]', tolerancePx: 12, skipHeight: true },
        ],
    },
};

export default provide;
