// The variants a script declares against the `@variant` rules its styles write (#153).
//
// PDX_VARIANT_UNKNOWN — an `@variant` naming an axis `@variants` does not declare, or a value its axis
// does not have: the rule would select an attribute value the host never takes, silently.
// PDX_VARIANT_UNSTYLED — a declared value, other than the axis's default, that no `@variant` rule
// names: choosing it renders the component exactly as the default does. The default is styled by the
// component's base rules, so it is never reported.
//
// A rule names an axis by the attribute it is reflected under, its kebab-case (#834): `connectorStyle`
// is `connector-style(dashed)`, and the camelCase name is not one.
//
// A library component (a `pdx-` tag) is drawn by `@pdxui/design` (#986): its values count as styled by
// that package's rules too, and, as the design build counts them, a value styles every value that
// shares its native selector, and a value that shares the default's is never reported.

import type { SFCStyle } from '../parser/sfc';
import type { ValidationWarning } from './validate';
import { variantTests, type VariantAxis } from './variants';
import { axisAttribute } from './variant-css';
import { RESERVED_TAG_PREFIX } from './tag-prefix';
import { designStyledValues } from './library-variants';

/**
 * The two variant checks over every style block of a file; `source` is the whole file, for lines. `tag`
 * is the element the file registers: a library one's values are styled by `@pdxui/design` as well.
 */
export function validateVariants(axes: VariantAxis[] | undefined, styles: SFCStyle[], source: string, tag?: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    const declared = axes ?? [];
    const styled = new Set<string>();
    const library = tag?.startsWith(RESERVED_TAG_PREFIX) && declared.length > 0 ? designStyledValues(tag) : null;
    if (library) for (const test of library) styled.add(test);
    for (const style of styles) {
        for (const test of variantTests(style.content)) {
            styled.add(`${test.axis}(${test.value})`);
            const axis = declared.find((a) => axisAttribute(a.name) === test.axis);
            if (axis && axis.values.includes(test.value)) continue;
            const line = source.slice(0, style.start + test.at).split('\n').length;
            warnings.push({
                code: 'PDX_VARIANT_UNKNOWN',
                severity: 'error',
                line,
                message: !axis
                    ? `@variant ${test.axis}(${test.value}): '${test.axis}' is not an axis of @variants (${declared.map((a) => axisAttribute(a.name)).join(', ') || 'none declared'}).`
                    : `@variant ${test.axis}(${test.value}): '${test.value}' is not a value of the axis '${test.axis}' (${axis.values.join(', ')}).`,
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
        const attribute = axisAttribute(axis.name);
        const native = axis.native;
        // A value styles every value of its axis that shares its native selector (#626), the default's
        // included: a value drawn by the default's selector has the default's look.
        const sharesStyled = (value: string) => native !== undefined
            && (native[value] === native[axis.default] || axis.values.some((v) => native[v] === native[value] && styled.has(`${attribute}(${v})`)));
        for (const value of axis.values) {
            if (value === axis.default || styled.has(`${attribute}(${value})`) || sharesStyled(value)) continue;
            warnings.push({
                code: 'PDX_VARIANT_UNSTYLED',
                severity: 'warn',
                ...(line === undefined ? {} : { line }),
                message: library
                    ? `@variants declares ${axis.name}: ${value}, and no @variant rule of the <style scoped> or of @pdxui/design styles it.`
                    : `@variants declares ${axis.name}: ${value}, and no @variant rule styles it.`,
                hint: library
                    ? `Add a rule to packages/design/variant-sources: @variant ${tag} ${attribute}(${value}) { … }, or remove '${value}' from the axis.`
                    : `Add a rule to the <style scoped>: @variant ${attribute}(${value}) { … }, or remove '${value}' from the axis.`,
            });
        }
    }
    return warnings;
}
