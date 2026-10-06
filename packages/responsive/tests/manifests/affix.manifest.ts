/**
 * MANIFEST — pdx-affix
 *
 * Contracts written by inspecting the source (packages/ui/src/affix/pdx-affix.ts).
 * Note: there is NO .pdx-affix CSS in the design system. The component is purely behavioural
 * (sticky/fixed on scroll) and has no box styling of its own.
 *
 * DOM structure (host vs inner):
 *   <pdx-affix>                         ← HOST: gets .pdx-affix-root (ctx.el.classList.add, in rAF)
 *     <slot></slot>                     ← the developer's content is projected directly
 *
 * There is NO inner div: the render is `<slot></slot>`. The measurable element IS the HOST
 * <pdx-affix> (display:block from the custom-element reset / no dedicated rule → block).
 * `position` is set inline (sticky/fixed) ONLY after a scroll or with a target → at rest the
 * position is the default one. We do NOT test the scroll (it needs a dynamic simulation, outside
 * the scope of the static mathematical contracts).
 *
 * a11y: a pass-through wrapper with no semantics → NO role or landmark is expected (which is
 * right: this is positioning, not a region). The base scenario is scanned by axe to make sure the
 * projected content stays accessible. No disableRules.
 *
 * Not interactive → keyboard OMITTED.
 * A wrapper whose height is its projected content → isolation with skipHeight: true.
 */
import type { ComponentManifest } from './_types';

export const affix: ComponentManifest = {
    name: 'affix',
    tag: 'pdx-affix',
    tier: '6',
    status: 'wip',
    imports: ['@pdxui/ui/affix'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'affix-basic',
            title: 'Affix — Basic (static, content wrapper)',
            html: `
                <div style="max-width: 480px;">
                    <pdx-affix data-test="affix" offset-top="16">
                        <div data-test="affix-content" class="pdx-surface pdx-surface-card" style="padding: 12px;">
                            Affixed content
                        </div>
                    </pdx-affix>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'affix-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="affix"]',
                        description: 'affix host is a block-ish box (display set)',
                        display: { op: 'oneOf', value: ['block', 'flex', 'grid', 'inline-block'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="affix"]',
                        description: 'affix host is tall enough to wrap its content',
                        height: { op: '>=', value: 20 },
                    },
                ],
                // Composition: the projected content stays INSIDE the host's box.
                composition: [
                    {
                        description: 'projected content is contained within the affix host',
                        parent: 'section:not([hidden]) [data-test="affix"]',
                        children: {
                            host: 'section:not([hidden]) [data-test="affix"]',
                            content: 'section:not([hidden]) [data-test="affix-content"]',
                        },
                        relations: [
                            { description: 'content within host', left: 'content', op: 'contained-in', right: 'host' },
                            {
                                description: 'content right edge does not overflow host right edge',
                                left: 'content.right',
                                op: '<=',
                                right: 'host.right',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // A pass-through wrapper: no semantics of its own, so what we guarantee is that the projected
    // content stays accessible. The main scenario, no disableRules.
    a11y: {
        scenarios: ['affix-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'affix-basic',
        targets: [
            // A content-driven wrapper (height = the content): skip the height, there is no box
            // styling of its own.
            { selector: 'section:not([hidden]) [data-test="affix"]', tolerancePx: 12, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard ──
    // Not interactive (sticky/scroll positioning). Omitted.

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['affix-basic'],
    },
};

export default affix;
