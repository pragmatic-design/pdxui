// The variants a script declares against the `@variant` rules its styles write (#153).
//
// PDX_VARIANT_UNKNOWN — an `@variant` naming an axis `@variants` does not declare, or a value its axis
// does not have: the rule would select an attribute value the host never takes, silently.
// PDX_VARIANT_UNSTYLED — a declared value, other than the axis's default, that no `@variant` rule
// names: choosing it renders the component exactly as the default does. The default is styled by the
// component's base rules, so it is never reported.

import type { SFCStyle } from '../parser/sfc';
import type { ValidationWarning } from './validate';
import { variantTests, type VariantAxis } from './variants';

/** The two variant checks over every style block of a file; `source` is the whole file, for lines. */
export function validateVariants(axes: VariantAxis[] | undefined, styles: SFCStyle[], source: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    const declared = axes ?? [];
    const styled = new Set<string>();
    for (const style of styles) {
        for (const test of variantTests(style.content)) {
            styled.add(`${test.axis}(${test.value})`);
            const axis = declared.find((a) => a.name === test.axis);
            if (axis && axis.values.includes(test.value)) continue;
            const line = source.slice(0, style.start + test.at).split('\n').length;
            warnings.push({
                code: 'PDX_VARIANT_UNKNOWN',
                severity: 'error',
                line,
                message: !axis
                    ? `@variant ${test.axis}(${test.value}): '${test.axis}' is not an axis of @variants (${declared.map((a) => a.name).join(', ') || 'none declared'}).`
                    : `@variant ${test.axis}(${test.value}): '${test.value}' is not a value of the axis '${axis.name}' (${axis.values.join(', ')}).`,
                hint: !axis
                    ? `Declare the axis in the script: @variants { ${test.axis}: { ${test.value} }; }`
                    : `Use one of ${axis.values.join(', ')}, or add '${test.value}' to the axis in @variants.`,
            });
        }
    }
    const block = source.indexOf('@variants');
    for (const axis of declared) {
        // The line the axis is declared on, inside the @variants block.
        // Match: the axis's name, then its `:` and `{`. Groups: none
        const declaredAt = block < 0 ? -1 : source.slice(block).search(new RegExp(`\\b${axis.name}\\s*:\\s*\\{`));
        const line = declaredAt < 0 ? undefined : source.slice(0, block + declaredAt).split('\n').length;
        for (const value of axis.values) {
            if (value === axis.default || styled.has(`${axis.name}(${value})`)) continue;
            warnings.push({
                code: 'PDX_VARIANT_UNSTYLED',
                severity: 'warn',
                ...(line === undefined ? {} : { line }),
                message: `@variants declares ${axis.name}: ${value}, and no @variant rule styles it.`,
                hint: `Add a rule to the <style scoped>: @variant ${axis.name}(${value}) { … }, or remove '${value}' from the axis.`,
            });
        }
    }
    return warnings;
}
