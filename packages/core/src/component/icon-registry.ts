// Icon registry — agnostic icon set management.
// Register any SVG icon set (Lucide, Heroicons, Material, Phosphor, Tabler).
// Used by: pdx-icon component and any component that needs icons.

/** Resolver function: takes icon name, returns SVG markup/element or a Promise for lazy loading. */
export type IconResolver = (iconName: string) => string | SVGElement | Promise<string | SVGElement>;

const _registry = new Map<string, IconResolver>();
let _defaultSet: string | null = null;

/**
 * Register an icon set with a resolver function.
 * The first registered set becomes the default.
 *
 * @example
 * ```ts
 * // Sync resolver (icons bundled)
 * registerIconSet('lucide', (name) => lucideIcons[name]);
 *
 * // Async resolver (lazy loaded)
 * registerIconSet('heroicons', async (name) =>
 *   (await import(`@heroicons/24/outline/${name}.svg`)).default
 * );
 * ```
 */
export function registerIconSet(name: string, resolver: IconResolver): void {
    _registry.set(name, resolver);
    if (_defaultSet === null) _defaultSet = name;
}

/**
 * Resolve an icon by name from a registered set.
 * Returns SVG markup string, SVGElement, or null if not found.
 */
export async function resolveIcon(
    iconName: string,
    setName?: string,
): Promise<string | SVGElement | null> {
    const name = setName ?? _defaultSet;
    if (!name) return null;

    const resolver = _registry.get(name);
    if (!resolver) return null;

    try {
        return await resolver(iconName);
    } catch {
        return null;
    }
}

/** Get the name of the default icon set. */
export function getDefaultIconSet(): string | null {
    return _defaultSet;
}

/** Set the default icon set by name. */
export function setDefaultIconSet(name: string): void {
    if (_registry.has(name)) _defaultSet = name;
}

/** Check if an icon set is registered. */
export function hasIconSet(name: string): boolean {
    return _registry.has(name);
}

/** Remove all registered icon sets. Useful for testing. */
export function clearIconSets(): void {
    _registry.clear();
    _defaultSet = null;
}
