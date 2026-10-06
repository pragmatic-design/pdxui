/** Remove the directory the e2e suite saved its themes into (see custom-themes-dir.ts). */
import { rmSync } from 'node:fs';
import { CUSTOM_THEMES_DIR } from './custom-themes-dir';

export default function removeCustomThemesDir(): void {
    rmSync(CUSTOM_THEMES_DIR, { recursive: true, force: true });
}
