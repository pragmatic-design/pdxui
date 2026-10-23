/**
 * One scenario per declared variant value (#512), generated from the axes `custom-elements.json` lists
 * for the manifest's tag, so a value added to a descriptor is certified without a hand-written scenario.
 *
 * Each scenario renders the component with that value — the manifest's `variantHtml`, or the bare tag —
 * and carries one universal Dim 1 rule: the host reflects the value. The reflected attribute is what the
 * design CSS's `@variant` rules key on; a value core does not take (the axis falls back to its default)
 * leaves no element with it, and the rule fails on every theme.
 *
 * Used by tooling/generate.ts for the pages and the catalogue, and by the registry it writes, so the
 * runners see the same scenarios the pages hold.
 */
import type { ComponentManifest, ContractBlock, ScenarioDef } from '../manifests/_types';

/** An axis as the manifest of `@pdxui/ui` lists it. */
export interface ManifestVariantAxis {
    name: string;
    values: string[];
    default: string;
    native?: Record<string, string>;
}

/** The selector every generated scenario marks its component with. */
export const VARIANT_TEST = 'variant';

/** The id of the scenario for one value: `<component>-<axis>-<value>`. */
export function variantScenarioId(component: string, axis: string, value: string): string {
    return `${component}-${axis}-${value}`;
}

/** The scenarios, one per value of every axis, in the axes' order. */
export function variantScenarios(manifest: ComponentManifest, axes: ManifestVariantAxis[]): ScenarioDef[] {
    const template = manifest.variantHtml ?? `<${manifest.tag} {attrs}></${manifest.tag}>`;
    return axes.flatMap((axis) => axis.values.map((value) => ({
        id: variantScenarioId(manifest.name, axis.name, value),
        title: `${manifest.tag} — ${axis.name}="${value}"`,
        html: template.replace('{attrs}', `data-test="${VARIANT_TEST}" ${axis.name}="${value}"`),
    })));
}

/** The universal rule of each generated scenario: the host reflects its value. */
export function variantContracts(manifest: ComponentManifest, axes: ManifestVariantAxis[]): Record<string, ContractBlock> {
    const blocks: Record<string, ContractBlock> = {};
    for (const axis of axes) {
        for (const value of axis.values) {
            blocks[variantScenarioId(manifest.name, axis.name, value)] = {
                standalone: [{
                    selector: `section:not([hidden]) ${manifest.tag}[data-test="${VARIANT_TEST}"][${axis.name}="${value}"]`,
                    description: `${manifest.tag} reflects ${axis.name}="${value}" on its host`,
                    count: { op: '==', value: 1 },
                }],
            };
        }
    }
    return blocks;
}

/**
 * The manifest with its generated scenarios and their rules added. A scenario the manifest already
 * writes under a generated id is kept as written, with its own rules.
 */
export function withVariantScenarios(manifest: ComponentManifest, axes: ManifestVariantAxis[] | undefined): ComponentManifest {
    if (!axes?.length) return manifest;
    const own = new Set(manifest.scenarios.map((s) => s.id));
    const scenarios = variantScenarios(manifest, axes).filter((s) => !own.has(s.id));
    const generated = variantContracts(manifest, axes);
    const contracts = { ...manifest.contracts, scenarios: { ...manifest.contracts?.scenarios } };
    for (const s of scenarios) contracts.scenarios[s.id] = generated[s.id];
    return { ...manifest, scenarios: [...manifest.scenarios, ...scenarios], contracts };
}
