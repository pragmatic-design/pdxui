// pdx-button's rules in a design language's `cssOverrides` (#512).
//
// Everywhere else in @pdxui/design a rule for a button variant is written once, as
// `@variant pdx-button variant(primary) { :scope > [data-part="root"] { … } }`, and the design build
// compiles it. The engine's output does not go through that build: `createTheme().toCSS()` reaches
// the CLI and the builder as it is. So a design language writes the compiled form directly, through
// this helper, and packages/cli/tests/engine-variant-parity.test.ts holds every selector it gives
// equal to what the design build compiles from the `@variant` rule, against the real manifest.

/**
 * The selector list of a host-anchored rule for one of pdx-button's variants, each selector after
 * the theme root `&`: pdx-button's root part under the variant's attribute test, then the native
 * class. `suffix` follows both (`:hover`). `solid` shares `primary`'s class, so `primary` names both.
 */
export function buttonVariantRule(variant: string, suffix = ''): string {
    const values = variant === 'primary' ? ['primary', 'solid'] : [variant];
    const attrs = values.map((v) => `[variant="${v}"]`);
    const test = attrs.length > 1 ? `:is(${attrs.join(',')})` : attrs[0];
    return `& :where(pdx-button${test}) > [data-part="root"]${suffix}, & .pdx-${variant}${suffix}`;
}
