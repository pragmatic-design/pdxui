// The theme's boot module restores the stored theme as it loads (#1246).
//
// Restoring the theme is what an app with the design system relies on without calling anything. It
// ran when `component/style.ts` loaded, in every app; it runs now when `boot/theme.ts` loads, which
// the pdx() plugin imports into an app that imports the design system's themes, with the same precedence: the
// user's saved choice, then the author's `<html pdx-scheme>`, then the OS preference.
import { describe, it, expect, vi, afterEach } from 'vitest';

async function boot(): Promise<void> {
    vi.resetModules();
    await import('../src/boot/theme');
}

afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('pdx-scheme');
    document.documentElement.removeAttribute('pdx-theme');
    localStorage.clear();
});

describe('boot/theme', () => {
    it('restores the saved theme and scheme on <html> as it loads', async () => {
        localStorage.setItem('pdx-theme', 'fluent');
        localStorage.setItem('pdx-scheme', 'dark');
        await boot();
        expect(document.documentElement.getAttribute('pdx-theme')).toBe('fluent');
        expect(document.documentElement.getAttribute('pdx-scheme')).toBe('dark');
    });

    it('leaves the author\'s scheme as it is, over the OS preference', async () => {
        document.documentElement.setAttribute('pdx-scheme', 'light');
        vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
        await boot();
        expect(document.documentElement.getAttribute('pdx-scheme')).toBe('light');
    });

    it('with nothing saved or authored, follows the OS preference', async () => {
        vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
        await boot();
        expect(document.documentElement.getAttribute('pdx-scheme')).toBe('dark');
    });
});
