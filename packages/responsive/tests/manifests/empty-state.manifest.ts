/**
 * MANIFEST — pdx-empty-state
 *
 * Contracts written by inspecting the source and the CSS:
 *  - packages/ui/src/empty-state/pdx-empty-state.ts → a container with an icon, a title, a description and an action
 *  - packages/design/src/components/empty-state.css  (the .pdx-empty-state* block)
 *
 * DOM structure (host vs inner):
 *   <pdx-empty-state>                            ← HOST: gets .pdx-empty-state (ctx.el.classList.add)
 *     render: <slot></slot>                      ← no inner wrapper
 *     children appended DIRECTLY to the host (an imperative rAF):
 *       <pdx-icon class="pdx-empty-state-icon">          (when icon)
 *       <div class="pdx-empty-state-title">              (always)
 *       <div class="pdx-empty-state-desc">               (when description)
 *       <button class="pdx-primary pdx-empty-state-action"> (when actionLabel)
 * So the measurable container IS the host itself ([data-test] === .pdx-empty-state).
 * CSS: display:flex column, center, padding 2xl/lg → a content-driven height (the 48px icon +
 * the title, the description and the padding). Conservative: display oneOf, height >= a minimum, no exact px.
 *
 * a11y notes: the title is a <div> (NOT a heading or a role). It is NOT interactive in itself;
 * only the action button (a <button>) is focusable and clickable. See the a11y and keyboard blocks.
 */
import type { ComponentManifest } from './_types';

export const emptyState: ComponentManifest = {
    name: 'empty-state',
    tag: 'pdx-empty-state',
    tier: '5B',
    status: 'wip',
    imports: ['@pdxui/ui/empty-state'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'empty-state-basic',
            title: 'Empty State — Basic (icon + title + desc)',
            html: `
                <div style="max-width: 480px;">
                    <pdx-empty-state
                        data-test="empty"
                        icon="inbox"
                        title="No results"
                        description="Try adjusting your filters or search query.">
                    </pdx-empty-state>
                </div>`,
        },
        {
            id: 'empty-state-action',
            title: 'Empty State — With action button',
            html: `
                <div style="max-width: 480px;">
                    <pdx-empty-state
                        data-test="empty-action"
                        icon="inbox"
                        title="No items yet"
                        description="Create your first item to get started."
                        action-label="Create item">
                    </pdx-empty-state>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'empty-state-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="empty"]',
                        description: 'empty-state container is a flex/block box (display set)',
                        display: { op: 'oneOf', value: ['flex', 'block', 'grid'] },
                    },
                    {
                        // A 48px icon + title + desc + 2xl padding: a generous height, but
                        // content-driven. A conservative minimum threshold.
                        selector: 'section:not([hidden]) [data-test="empty"]',
                        description: 'empty-state is tall enough to hold icon+title+desc',
                        height: { op: '>=', value: 80 },
                    },
                ],
                // Composition: the icon, the title and the description are contained in the container.
                composition: [
                    {
                        description: 'empty-state content is contained within the container box',
                        parent: 'section:not([hidden]) [data-test="empty"]',
                        children: {
                            box: 'section:not([hidden]) [data-test="empty"]',
                            icon: 'section:not([hidden]) [data-test="empty"] .pdx-empty-state-icon',
                            title: 'section:not([hidden]) [data-test="empty"] .pdx-empty-state-title',
                            desc: 'section:not([hidden]) [data-test="empty"] .pdx-empty-state-desc',
                        },
                        relations: [
                            { description: 'icon within container', left: 'icon', op: 'contained-in', right: 'box' },
                            { description: 'title within container', left: 'title', op: 'contained-in', right: 'box' },
                            { description: 'desc within container', left: 'desc', op: 'contained-in', right: 'box' },
                            {
                                description: 'icon sits above title (vertical stack)',
                                left: 'icon.bottom',
                                op: '<=',
                                right: 'title.bottom',
                            },
                            {
                                description: 'title sits above description',
                                left: 'title.bottom',
                                op: '<=',
                                right: 'desc.bottom',
                            },
                        ],
                    },
                ],
            },
            'empty-state-action': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="empty-action"] .pdx-empty-state-action',
                        description: 'action button has cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
                composition: [
                    {
                        description: 'action button is contained within the empty-state container',
                        parent: 'section:not([hidden]) [data-test="empty-action"]',
                        children: {
                            box: 'section:not([hidden]) [data-test="empty-action"]',
                            action: 'section:not([hidden]) [data-test="empty-action"] .pdx-empty-state-action',
                        },
                        relations: [
                            { description: 'action within container', left: 'action', op: 'contained-in', right: 'box' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // The main scenario. NO disableRules. Note: the title is a <div> (not a heading):
    // axe does not ask for one, but it stays an a11y quality note (see the report).
    a11y: {
        scenarios: ['empty-state-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'empty-state-basic',
        targets: [
            // A content-driven container (the icon, the text and the padding): a wider tolerance.
            { selector: 'section:not([hidden]) [data-test="empty"]', tolerancePx: 16 },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    // The empty-state is NOT interactive in itself: the keyboard is testable ONLY when there is an action button.
    // The scenario with an action: Tab → the focus lands on the button.
    keyboard: {
        scenario: 'empty-state-action',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="empty-action"] .pdx-empty-state-action' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['empty-state-basic'],
    },
};

export default emptyState;
