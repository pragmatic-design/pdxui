// pdx-avatar — User avatar with image, initials fallback, auto-color from name.
// Sizes: xs(24) sm(32) md(40) lg(48) xl(64). Shapes: circle, square.
// Auto-color: generates consistent background color from name hash.

import { component, html, signal } from '@pdxui/core';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/avatar';

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
 *
 * @cssstate broken - Its image failed to load: the initials show in its place.
 * @csspart root - The avatar's box, `role="img"` when it has a name.
 * @csspart image - The picture, when `src` is set and has loaded.
 * @csspart fallback - The initials, shown without a picture or when it fails.
 */
component('pdx-avatar', {
    // The axes avatar.css keys by (#291), reflected on the host: it draws the box at the same sizes it
    // had inline. No native class is kept: the CSS-only avatar is `.pdx-avatar`, a different element.
    variants: {
        /** xs (24px), sm (32px), md (40px, the default), lg (48px) or xl (64px). */
        size: ['md', 'xs', 'sm', 'lg', 'xl'],
        /** circle (the default) or square (the theme's medium radius). */
        shape: ['circle', 'square'],
    },
    states: ['broken'],
    parts: ['root', 'image', 'fallback'],
    props: {
        src: { type: String, default: '' },
        /** The person's name: initials, accessible name and auto color. Without it the avatar is decorative (aria-hidden). */
        alt: { type: String, default: '' },
        /** 'auto' generates color from name. Or pass a CSS color. Default: 'auto'. */
        color: { type: String, default: 'auto' },
    },
    setup(ctx) {
        const imgError = signal(false);
        // A new source is a new chance: the failure of the last one does not keep the initials up.
        ctx.track(() => { void ctx.src(); imgError.set(false); });
        ctx.track(() => { ctx.state('broken', imgError()); });

        function initials(): string {
            const name = ctx.alt() as string;
            if (!name) return '?';
            const parts = name.trim().split(/\s+/);
            if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
            return name.slice(0, 2).toUpperCase();
        }

        function onImgError() { imgError.set(true); }
        function showImage(): boolean { return !!(ctx.src() && !imgError()); }

        /** The colours, handed to avatar.css as custom properties; unset, it uses the theme's. */
        function colorStyle(): string {
            const c = ctx.color() as string;
            if (c === 'auto') {
                const name = ctx.alt() as string;
                return `--pdx-avatar-bg:${autoColor(name)};--pdx-avatar-fg:${autoTextColor(name)}`;
            }
            return c ? `--pdx-avatar-bg:${c}` : '';
        }

        return { initials, onImgError, showImage, colorStyle };
    },
    // With a name, an image named by it; without one, decorative — hidden, no role. An unnamed
    // role="img" showing "?" fails axe's role-img-alt.
    // `pdx-avatar-box` is how pdx.reset sees the element, and keeps a page's bare `span { border }` off
    // it (#413); avatar.css draws it by its part. `.pdx-avatar` is the CSS-only avatar.
    render: (ctx) => html`
        <span class="pdx-avatar-box" data-part="root" :style="${ctx.colorStyle}"
            :role="${() => ctx.alt() ? 'img' : null}"
            :aria-label="${() => ctx.alt() || null}"
            :aria-hidden="${() => ctx.alt() ? null : 'true'}">
            ${() => ctx.showImage()
                ? html`<img data-part="image" src="${ctx.src}" alt="${ctx.alt}" @error="${ctx.onImgError}" />`
                : html`<span data-part="fallback">${ctx.initials}</span>`
            }
        </span>
    `,
});
