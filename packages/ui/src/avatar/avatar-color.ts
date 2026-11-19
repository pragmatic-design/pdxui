// pdx-avatar's auto colour: a consistent background and text colour from a name's hash. A module of
// its own: the component's script runs once per instance, and the hues are one for all of them.

// 10 distinct hues for auto-color generation (OKLCH)
const COLOR_HUES = [210, 340, 140, 30, 270, 180, 50, 310, 100, 230];

function hashName(name: string): number {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
    return Math.abs(h);
}

function autoColor(name: string): string {
    if (!name) return 'var(--pdx-color-inset)';
    const hue = COLOR_HUES[hashName(name) % COLOR_HUES.length];
    return `oklch(0.75 0.12 ${hue})`;
}

function autoTextColor(name: string): string {
    if (!name) return 'var(--pdx-color-text)';
    const hue = COLOR_HUES[hashName(name) % COLOR_HUES.length];
    return `oklch(0.3 0.12 ${hue})`;
}

/** The colours, handed to avatar.css as custom properties; unset, it uses the theme's. */
export function colorStyle(color: string, name: string): string {
    if (color === 'auto') return `--pdx-avatar-bg:${autoColor(name)};--pdx-avatar-fg:${autoTextColor(name)}`;
    return color ? `--pdx-avatar-bg:${color}` : '';
}

/** Two initials from a name, its first and last word; one word gives its first two letters; none, '?'. */
export function initialsOf(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}
