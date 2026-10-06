/**
 * Expands the Component Test Manifests into units of work for Dimension 1 (contract math).
 * One unit = (scenario, theme) with the rule block resolved (universal + theme override).
 */
import { manifests, scenarioPage } from './generated/manifests';
import { THEMES } from '../../../manifests/_themes';
import type { ContractBlock } from '../../../manifests/_types';

export interface ContractUnit {
    component: string;
    scenario: string;
    theme: string;
    /** the slug of the tier page that holds the scenario */
    page: string;
    block: ContractBlock;
}

function mergeBlocks(base: ContractBlock, extra?: ContractBlock): ContractBlock {
    if (!extra) return base;
    return {
        standalone: [...(base.standalone ?? []), ...(extra.standalone ?? [])],
        composition: [...(base.composition ?? []), ...(extra.composition ?? [])],
        states: [...(base.states ?? []), ...(extra.states ?? [])],
        positioning: [...(base.positioning ?? []), ...(extra.positioning ?? [])],
        overlay: [...(base.overlay ?? []), ...(extra.overlay ?? [])],
        responsive: [...(base.responsive ?? []), ...(extra.responsive ?? [])],
    };
}

export function buildContractUnits(): ContractUnit[] {
    const units: ContractUnit[] = [];
    for (const m of manifests) {
        if (!m.contracts) continue;
        const themes = m.themes ?? THEMES;
        for (const [scenario, baseBlock] of Object.entries(m.contracts.scenarios)) {
            for (const theme of themes) {
                const ov = m.contracts.themeOverrides?.[theme]?.[scenario];
                units.push({
                    component: m.name,
                    scenario,
                    theme,
                    page: scenarioPage[scenario],
                    block: mergeBlocks(baseBlock, ov),
                });
            }
        }
    }
    return units;
}
