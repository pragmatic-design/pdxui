// Lucide icon set registration — user provides a curated icon map.
// The app creates a subset file (e.g. via lucide-static extraction) and passes it here.
// Zero runtime dependency on lucide-static.

import { registerIconSet } from '@pdxui/core';

/**
 * Register a lucide icon set from a pre-built icon map.
 * @param icons Record<kebab-name, svg-string> — curated subset of lucide icons
 */
export function registerLucideIcons(icons: Record<string, string>): void {
    registerIconSet('lucide', (name: string) => icons[name] ?? '');
}
