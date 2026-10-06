// pdx-avatar — User avatar with image, initials fallback, auto-color from name.
// Sizes: xs(24) sm(32) md(40) lg(48) xl(64). Shapes: circle, square.
// Auto-color: generates consistent background color from name hash.

import { component, html, signal } from '@pdxui/core';

const SIZES: Record<string, string> = { xs: '24px', sm: '32px', md: '40px', lg: '48px', xl: '64px' };

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

/**
 * A user avatar that shows an image, or falls back to initials colored from the name.
 */
component('pdx-avatar', {
    props: {
        src: { type: String, default: '' },
        /** The person's name: initials, accessible name and auto color. Without it the avatar is decorative (aria-hidden). */
        alt: { type: String, default: '' },
        size: { type: String, default: 'md' },
        shape: { type: String, default: 'circle' },
        /** 'auto' generates color from name. Or pass a CSS color. Default: 'auto'. */
        color: { type: String, default: 'auto' },
    },
    setup(ctx) {
        const imgError = signal(false);

        function initials(): string {
            const name = ctx.alt() as string;
            if (!name) return '?';
            const parts = name.trim().split(/\s+/);
            if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
            return name.slice(0, 2).toUpperCase();
        }

        function onImgError() { imgError.set(true); }
        function showImage(): boolean { return !!(ctx.src() && !imgError()); }

        function px(): string { return SIZES[ctx.size() as string] || '40px'; }

        function bgColor(): string {
            const c = ctx.color() as string;
            if (c === 'auto') return autoColor(ctx.alt() as string);
            if (c) return c;
            return 'var(--pdx-color-inset)';
        }

        function txtColor(): string {
            const c = ctx.color() as string;
            if (c === 'auto') return autoTextColor(ctx.alt() as string);
            return 'var(--pdx-color-text)';
        }

        function baseStyle(): string {
            const s = px();
            const r = (ctx.shape() as string) === 'square' ? 'var(--pdx-radius-md)' : '50%';
            return `display:inline-flex;align-items:center;justify-content:center;width:${s};height:${s};border-radius:${r};overflow:hidden;background:${bgColor()};color:${txtColor()};font-size:calc(${s} * 0.38);font-weight:600;flex-shrink:0;user-select:none`;
        }

        return { initials, onImgError, showImage, baseStyle };
    },
    // With a name, an image named by it; without one, decorative — hidden, no role. An unnamed
    // role="img" showing "?" fails axe's role-img-alt.
    render: (ctx) => html`
        <span :style="${ctx.baseStyle}"
            :role="${() => ctx.alt() ? 'img' : null}"
            :aria-label="${() => ctx.alt() || null}"
            :aria-hidden="${() => ctx.alt() ? null : 'true'}">
            ${() => ctx.showImage()
                ? html`<img src="${ctx.src}" alt="${ctx.alt}" style="width:100%;height:100%;object-fit:cover" @error="${ctx.onImgError}" />`
                : html`<span>${ctx.initials}</span>`
            }
        </span>
    `,
});
