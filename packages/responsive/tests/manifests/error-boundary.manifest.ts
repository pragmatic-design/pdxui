/**
 * MANIFEST — pdx-error-boundary (#290)
 *
 * Contracts written by inspecting the source (packages/ui/src/error-boundary/pdx-error-boundary.ts):
 *   - it renders its children; when one throws it renders a fallback in their place:
 *       <div class="pdx-error-boundary" role="alert" data-part="fallback">
 *         <div class="pdx-error-boundary-icon">⚠</div>
 *         <div class="pdx-error-boundary-message" data-part="message">…</div>
 *         <div class="pdx-error-boundary-detail" data-part="detail">the error's message</div>
 *         <button data-part="retry">Retry</button>   (or a note when no retry is left)
 *       </div>
 *   - while the fallback shows, the host is :state(error) (#290); `pdx-error` is declared.
 *
 * It draws no box of its own until a child fails, which is why it had no manifest. The one scenario
 * wraps a CONSUMER that fails: the setup defines a child whose computed throws, builds the boundary
 * around it, and breaks it — the way a widget's data source fails after the screen is up. axe and
 * hostile CSS then run over the fallback, and the geometry rules go on it. Retry and the event are
 * measured in wrappers-beta-contract.spec.ts.
 *
 * Keyboard: the Retry button is a native button → OMITTED. No visual baseline: the fallback's text is
 * the error message, which the scenario fixes, but a baseline is left to the visual dimension's own row.
 */
import type { ComponentManifest } from './_types';

export const errorBoundary: ComponentManifest = {
    name: 'error-boundary',
    tag: 'pdx-error-boundary',
    tier: '6',
    status: 'wip',
    imports: ['@pdxui/ui/error-boundary'],

    scenarios: [
        {
            id: 'error-boundary-fallback',
            title: 'Error boundary — a child that throws, and the fallback',
            html: `<div data-test="eb-wrap" style="width: 360px;"></div>`,
            // The child is defined BEFORE the boundary is built around it, then broken: its error reaches
            // the boundary that rendered it.
            setup: `
                const { component, html, signal, computed } = await import('@pdxui/core');
                const broken = signal(false);
                const status = computed(() => {
                    if (broken()) throw new Error('The data source failed');
                    return 'healthy';
                });
                if (!customElements.get('scenario-flaky-child')) {
                    component('scenario-flaky-child', { render: () => html\`<p data-test="eb-child">\${() => status()}</p>\` });
                }
                const wrap = document.querySelector('section:not([hidden]) [data-test="eb-wrap"]');
                wrap.innerHTML = '<pdx-error-boundary data-test="eb" max-retries="2"><scenario-flaky-child></scenario-flaky-child></pdx-error-boundary>';
                for (let i = 0; i < 30 && !wrap.querySelector('[data-test="eb-child"]'); i++) {
                    await new Promise((r) => requestAnimationFrame(r));
                }
                broken.set(true);
                for (let i = 0; i < 30 && !wrap.querySelector('[data-part="fallback"]'); i++) {
                    await new Promise((r) => requestAnimationFrame(r));
                }`,
        },
    ],

    contracts: {
        scenarios: {
            'error-boundary-fallback': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="eb"] [data-part="retry"]',
                        description: 'the retry part is a pointer target while retries are left',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
                composition: [
                    {
                        description: 'the fallback and its pieces stay inside the boundary\'s wrapper',
                        parent: 'section:not([hidden]) [data-test="eb-wrap"]',
                        children: {
                            wrap: 'section:not([hidden]) [data-test="eb-wrap"]',
                            fallback: 'section:not([hidden]) [data-test="eb"] [data-part="fallback"]',
                            message: 'section:not([hidden]) [data-test="eb"] [data-part="message"]',
                            retry: 'section:not([hidden]) [data-test="eb"] [data-part="retry"]',
                        },
                        relations: [
                            { description: 'the fallback is within the wrapper', left: 'fallback', op: 'contained-in', right: 'wrap' },
                            { description: 'the message is within the fallback', left: 'message', op: 'contained-in', right: 'fallback' },
                            { description: 'the retry is within the fallback', left: 'retry', op: 'contained-in', right: 'fallback' },
                            { description: 'the message comes before the retry', left: 'message.bottom', op: '<=', right: 'retry.top', tolerance: 1 },
                        ],
                    },
                ],
                states: [
                    {
                        description: 'a child that threw puts the boundary in :state(error)',
                        selector: 'section:not([hidden]) [data-test="eb"] [data-part="fallback"]',
                        trigger: 'attribute',
                        customState: { host: 'section:not([hidden]) [data-test="eb"]', name: 'error' },
                        changes: {},
                    },
                ],
            },
        },
    },

    a11y: {
        scenarios: ['error-boundary-fallback'],
    },

    isolation: {
        scenario: 'error-boundary-fallback',
        targets: [
            { selector: 'section:not([hidden]) [data-test="eb"] [data-part="fallback"]', tolerancePx: 12, skipHeight: true },
        ],
    },
};

export default errorBoundary;
