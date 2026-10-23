// Certification generates one scenario per declared variant value (#512): tooling/variant-scenarios.ts
// turns the axes `custom-elements.json` lists for a manifest's tag into scenarios, each with the
// universal rule that the host reflects its value.

import { describe, it, expect } from 'vitest';
import {
    variantScenarios, withVariantScenarios, variantScenarioId,
} from '../../responsive/tests/tooling/variant-scenarios';
import type { ComponentManifest } from '../../responsive/tests/manifests/_types';

const manifest = (extra: Partial<ComponentManifest> = {}): ComponentManifest => ({
    name: 'widget', tag: 'pdx-widget', tier: '1A', status: 'wip', imports: ['@pdxui/ui/widget'],
    scenarios: [{ id: 'widget-basic', title: 'Widget', html: '<pdx-widget data-test="w"></pdx-widget>' }],
    contracts: { scenarios: { 'widget-basic': { standalone: [] } } },
    ...extra,
});

const axes = [
    { name: 'variant', values: ['primary', 'ghost'], default: 'primary', native: { primary: '.pdx-primary', ghost: '.pdx-ghost' } },
    { name: 'size', values: ['md', 'sm'], default: 'md' },
];

describe('the scenarios generated from a component\'s variants', () => {
    it('are one per value of every axis, the bare tag by default', () => {
        const s = variantScenarios(manifest(), axes);
        expect(s.map(x => x.id)).toEqual(['widget-variant-primary', 'widget-variant-ghost', 'widget-size-md', 'widget-size-sm']);
        expect(s[1].html).toBe('<pdx-widget data-test="variant" variant="ghost"></pdx-widget>');
    });

    it('take the manifest\'s markup when it gives one', () => {
        const s = variantScenarios(manifest({ variantHtml: '<pdx-widget {attrs}>Save</pdx-widget>' }), axes);
        expect(s[3].html).toBe('<pdx-widget data-test="variant" size="sm">Save</pdx-widget>');
    });

    it('each carry the rule that the host reflects the value', () => {
        const m = withVariantScenarios(manifest(), axes);
        const rule = m.contracts!.scenarios[variantScenarioId('widget', 'size', 'sm')].standalone![0];
        expect(rule.selector).toBe('section:not([hidden]) pdx-widget[data-test="variant"][size="sm"]');
        expect(rule.count).toEqual({ op: '==', value: 1 });
    });

    it('join the manifest\'s own scenarios and rules, which stay as written', () => {
        const own = { id: 'widget-size-sm', title: 'Own', html: '<pdx-widget size="sm"></pdx-widget>' };
        const m = withVariantScenarios(manifest({ scenarios: [own] }), axes);
        expect(m.scenarios.filter(s => s.id === 'widget-size-sm')).toEqual([own]);
        expect(m.scenarios).toHaveLength(4);
        expect(m.contracts!.scenarios['widget-size-sm']).toBeUndefined();
        expect(m.contracts!.scenarios['widget-basic']).toEqual({ standalone: [] });
    });

    it('leave a component without variants as it is', () => {
        const m = manifest();
        expect(withVariantScenarios(m, undefined)).toBe(m);
        expect(withVariantScenarios(m, [])).toBe(m);
    });
});
