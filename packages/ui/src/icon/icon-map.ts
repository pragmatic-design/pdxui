// The «pragmatic» icons this page has, by name. An icon's module (`pragmatic/<name>.ts`, generated) is
// data — its SVG as the default export — and whoever imports it adds it here: the compiler, for an icon
// a template names (`defineIcons({ check })`, emitted beside the import); a component, for the icons it
// always draws; the resolver, for a name that arrived through data and loaded on demand.
// `registerPragmaticIcons()` adds the whole set at once.

const svgs = new Map<string, string>();

/** Add an icon of the «pragmatic» set to the page. */
export function defineIcon(name: string, svg: string): void {
    svgs.set(name, svg);
}

/** Add icons of the «pragmatic» set to the page, by name: `defineIcons({ check, 'alert-circle': alertCircle })`. */
export function defineIcons(icons: Record<string, string>): void {
    for (const [name, svg] of Object.entries(icons)) svgs.set(name, svg);
}

/** The SVG of a «pragmatic» icon the page has, or undefined when it has not been loaded yet. */
export function definedIcon(name: string): string | undefined {
    return svgs.get(name);
}
