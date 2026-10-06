/**
 * MANIFEST — pdx-input-group
 *
 * The mathematical contracts reproduce the ones already validated in contracts/universal.ts
 * (the component: 'input-group' and component: 'input-group-3' blocks). Parity is
 * guaranteed while migrating away from the monolith.
 */
import type { ComponentManifest } from './_types';

export const inputGroup: ComponentManifest = {
    name: 'input-group',
    tag: 'pdx-input-group',
    tier: '1B',
    status: 'wip',
    imports: ['@pdxui/ui/input-group'],

// ── Scenarios (markup taken from the component-contracts.html monolith) ──
    scenarios: [
        {
            id: 'input-group',
            title: 'Input Group — Button',
            html: `
                <pdx-input-group data-test="group">
                    <pdx-input data-test="group-input" placeholder="Search..."></pdx-input>
                    <pdx-button data-test="group-btn" variant="solid">Search</pdx-button>
                </pdx-input-group>`,
        },
        {
            id: 'input-group-3',
            title: 'Input Group — Addon + Input + Button',
            html: `
                <pdx-input-group data-test="group3">
                    <span class="pdx-input-addon">$</span>
                    <pdx-input data-test="group3-input" placeholder="Amount"></pdx-input>
                    <pdx-button data-test="group3-btn" variant="solid">Go</pdx-button>
                </pdx-input-group>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (rules scoped to their scenario) ──
    contracts: {
        scenarios: {
            'input-group': {
                composition: [
                    {
                        description: 'children stretch to same height',
                        parent: '[data-test="group"]',
                        children: {
                            input: '[data-test="group"] .pdx-input-wrap',
                            button: '[data-test="group"] button',
                        },
                        relations: [
                            {
                                description: 'input height == button height',
                                left: 'input.height',
                                op: '==',
                                right: 'button.height',
                                tolerance: 2,
                            },
                        ],
                    },
                    {
                        description: 'children contained within group bounds',
                        parent: '[data-test="group"]',
                        children: {
                            input: '[data-test="group"] .pdx-input-wrap',
                            button: '[data-test="group"] button',
                        },
                        relations: [
                            {
                                description: 'input left >= group left',
                                left: 'input.left',
                                op: '>=',
                                right: 'parent.left',
                                tolerance: 1,
                            },
                            {
                                description: 'button right <= group right',
                                left: 'button.right',
                                op: '<=',
                                right: 'parent.right',
                                tolerance: 1,
                            },
                        ],
                    },
                    {
                        description: 'middle children have zero border-radius',
                        parent: '[data-test="group"]',
                        children: {
                            // In a 2-child group the input is first and button is last,
                            // so this rule is more relevant for 3+ children groups.
                            // For 2-child: input has left radius, button has right radius.
                            input: '[data-test="group"] .pdx-input-wrap',
                        },
                        relations: [
                            {
                                description: 'first child has zero right radius',
                                left: 'input.borderTopRightRadius',
                                op: '==',
                                right: '0',
                                tolerance: 1,
                            },
                            {
                                description: 'first child has zero bottom-right radius',
                                left: 'input.borderBottomRightRadius',
                                op: '==',
                                right: '0',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
            'input-group-3': {
                composition: [
                    {
                        description: 'all 3 children same height',
                        parent: '[data-test="group3"]',
                        children: {
                            addon: '[data-test="group3"] .pdx-input-addon',
                            input: '[data-test="group3"] .pdx-input-wrap',
                            button: '[data-test="group3"] button',
                        },
                        relations: [
                            {
                                description: 'addon == input height',
                                left: 'addon.height',
                                op: '==',
                                right: 'input.height',
                                tolerance: 2,
                            },
                            {
                                description: 'input == button height',
                                left: 'input.height',
                                op: '==',
                                right: 'button.height',
                                tolerance: 2,
                            },
                        ],
                    },
                    {
                        description: 'middle child (input) has zero radius all corners',
                        parent: '[data-test="group3"]',
                        children: {
                            input: '[data-test="group3"] .pdx-input-wrap',
                        },
                        relations: [
                            {
                                description: 'input radius TL = 0',
                                left: 'input.borderTopLeftRadius',
                                op: '==',
                                right: '0',
                                tolerance: 1,
                            },
                            {
                                description: 'input radius TR = 0',
                                left: 'input.borderTopRightRadius',
                                op: '==',
                                right: '0',
                                tolerance: 1,
                            },
                            {
                                description: 'input radius BL = 0',
                                left: 'input.borderBottomLeftRadius',
                                op: '==',
                                right: '0',
                                tolerance: 1,
                            },
                            {
                                description: 'input radius BR = 0',
                                left: 'input.borderBottomRightRadius',
                                op: '==',
                                right: '0',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
        },
        // Material 3 filled field: the GROUP is the field (inset fill, bottom indicator, top-rounded),
        // and the input and button inside it carry none of that themselves.
        themeOverrides: {
            material: {
                'input-group': {
                    standalone: [
                        {
                            selector: '[data-test="group"]',
                            description: 'material: group has inset background',
                            backgroundColor: { op: 'isNot', value: 'rgba(0, 0, 0, 0)' },
                        },
                        {
                            selector: '[data-test="group"]',
                            description: 'material: group bottom border >= 1px (M3 active indicator)',
                            border: { bottom: { width: { op: '>=', value: 1 } } },
                        },
                        {
                            selector: '[data-test="group"]',
                            description: 'material: group top-rounded only',
                            radius: {
                                bottomLeft: { op: '==', value: 0, tolerance: 1 },
                                bottomRight: { op: '==', value: 0, tolerance: 1 },
                                topLeft: { op: '>=', value: 4 },
                                topRight: { op: '>=', value: 4 },
                            },
                        },
                    ],
                    composition: [
                        {
                            description: 'material: input-wrap inside the group has no border of its own',
                            parent: '[data-test="group"]',
                            children: { inputWrap: '[data-test="group"] .pdx-input-wrap' },
                            relations: [
                                { description: 'border-top = 0', left: 'inputWrap.borderTopWidth', op: '==', right: '0', tolerance: 0.5 },
                                { description: 'border-bottom = 0', left: 'inputWrap.borderBottomWidth', op: '==', right: '0', tolerance: 0.5 },
                                { description: 'border-left = 0', left: 'inputWrap.borderLeftWidth', op: '==', right: '0', tolerance: 0.5 },
                                { description: 'border-right = 0', left: 'inputWrap.borderRightWidth', op: '==', right: '0', tolerance: 0.5 },
                            ],
                        },
                        {
                            description: 'material: input-wrap is transparent (the group provides the fill)',
                            parent: '[data-test="group"]',
                            children: { inputWrap: '[data-test="group"] .pdx-input-wrap' },
                            relations: [
                                { description: 'input-wrap bg is transparent', left: 'inputWrap.backgroundColor', op: '==', right: '"rgba(0, 0, 0, 0)"' },
                            ],
                        },
                        {
                            description: 'material: button does not cross the group bottom border',
                            parent: '[data-test="group"]',
                            children: { button: '[data-test="group"] button' },
                            relations: [
                                { description: 'button bottom <= group bottom', left: 'button.bottom', op: '<=', right: 'parent.bottom', tolerance: 1 },
                            ],
                        },
                        {
                            description: 'material: button and input-wrap have a flat bottom',
                            parent: '[data-test="group"]',
                            children: {
                                button: '[data-test="group"] button',
                                inputWrap: '[data-test="group"] .pdx-input-wrap',
                            },
                            relations: [
                                { description: 'button BR radius = 0', left: 'button.borderBottomRightRadius', op: '==', right: '0', tolerance: 1 },
                                { description: 'button BL radius = 0', left: 'button.borderBottomLeftRadius', op: '==', right: '0', tolerance: 1 },
                                { description: 'input-wrap BL radius = 0', left: 'inputWrap.borderBottomLeftRadius', op: '==', right: '0', tolerance: 1 },
                                { description: 'input-wrap BR radius = 0', left: 'inputWrap.borderBottomRightRadius', op: '==', right: '0', tolerance: 1 },
                            ],
                        },
                    ],
                },
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        scenarios: ['input-group'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'input-group',
        targets: [
            { selector: '[data-test="group"]', tolerancePx: 6 },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['input-group'],
    },
};

export default inputGroup;
