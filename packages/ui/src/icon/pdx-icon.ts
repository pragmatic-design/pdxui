// pdx-icon — agnostic icon component with theme-reactive weight,
// optical size compensation, RTL mirroring, and accessibility.
// Renders SVG from registered icon sets, inline SVG, or URL.

import { signal, effect, component, html } from '@pdxui/core';
import { resolveIcon } from '@pdxui/core';
import { sanitizeSVG } from '../shared/sanitize';
import { registerPragmaticIcons } from './pragmatic-icons';

// Register the "pragmatic" set BEFORE component() (= before the customElements.define, which does
// the synchronous upgrade of the <pdx-icon>s already in the DOM). If the registration happened after
// (from the body of index.ts, say, which runs after ALL the imports), the first resolveIcon of the icons
// already mounted would return null and the <svg> would never be rendered (the effect does not re-run). It is the
// default set → `<pdx-icon name="...">` works out of the box.
registerPragmaticIcons();

const SIZES: Record<string, number> = { xs: 12, sm: 16, md: 20, lg: 24, xl: 32 };

/**
 * An icon drawn as SVG from a registered set, inline markup or a URL, with accessibility built in.
 */
component('pdx-icon', {
    props: {
        name: { type: String, default: '' },
        set: { type: String, default: '' },
        svg: { type: String, default: '' },
        src: { type: String, default: '' },
        size: { type: String, default: 'md' },
        label: { type: String, default: '' },
        /** Weight override: thin(1) light(1.5) regular(2) bold(2.5). Default: inherit from --pdx-icon-weight or 'regular'. */
        weight: { type: String, default: '', enum: ['thin', 'light', 'regular', 'bold'] },
        /** RTL behavior: 'mirror' flips in RTL context, 'none' keeps as-is. Default: 'none'. */
        rtl: { type: String, default: 'none', enum: ['none', 'mirror'] },
        /** Spin animation for loading indicators. */
        spin: { type: Boolean, default: false },
    },
    setup(ctx) {
        const containerRef = signal<HTMLElement | null>(null);

        // Weight map → stroke-width
        const WEIGHTS: Record<string, number> = { thin: 1, light: 1.5, regular: 2, bold: 2.5, fill: 0 };

        effect(() => {
            const el = containerRef();
            if (!el) return;

            const svgProp = ctx.svg() as string;
            const srcProp = ctx.src() as string;
            const nameProp = ctx.name() as string;
            const setProp = ctx.set() as string;
            const sizeName = (ctx.size() as string) || 'md';
            const sizePx = SIZES[sizeName] ?? 20;
            const labelVal = ctx.label() as string;
            const weightVal = ctx.weight() as string;
            const rtlVal = ctx.rtl() as string;

            // Sizing
            el.style.setProperty('--pdx-icon-size', `${sizePx}px`);
            el.style.width = `${sizePx}px`;
            el.style.height = `${sizePx}px`;

            // Spin animation
            if (ctx.spin()) {
                el.style.animation = 'pdx-spin 1s linear infinite';
            } else {
                el.style.animation = '';
            }

            // RTL mirroring
            if (rtlVal === 'mirror') {
                el.style.setProperty('--pdx-icon-rtl', 'scaleX(-1)');
            } else {
                el.style.removeProperty('--pdx-icon-rtl');
            }

            // ARIA
            if (labelVal) {
                el.setAttribute('role', 'img');
                el.setAttribute('aria-label', labelVal);
                el.removeAttribute('aria-hidden');
            } else {
                el.removeAttribute('role');
                el.removeAttribute('aria-label');
                el.setAttribute('aria-hidden', 'true');
            }

            // Resolve SVG source
            if (svgProp) {
                el.innerHTML = sanitizeSVG(svgProp);
                applySvgAttrs(el, sizePx, weightVal);
                return;
            }

            if (srcProp) {
                fetch(srcProp)
                    .then(r => r.text())
                    .then(text => {
                        el.innerHTML = sanitizeSVG(text);
                        applySvgAttrs(el, sizePx, weightVal);
                    })
                    .catch(() => { el.innerHTML = ''; });
                return;
            }

            if (nameProp) {
                resolveIcon(nameProp, setProp || undefined).then(result => {
                    if (!result) { el.innerHTML = ''; return; }
                    if (typeof result === 'string') {
                        el.innerHTML = sanitizeSVG(result);
                    } else {
                        el.innerHTML = '';
                        el.appendChild(result.cloneNode(true));
                    }
                    applySvgAttrs(el, sizePx, weightVal);
                });
                return;
            }

            el.innerHTML = '';
        });

        function applySvgAttrs(el: HTMLElement, sizePx: number, weight: string): void {
            const svg = el.querySelector('svg');
            if (!svg) return;

            // Normalize viewBox and size
            svg.style.width = '100%';
            svg.style.height = '100%';
            svg.removeAttribute('width');
            svg.removeAttribute('height');

            // Detect icon type: stroke-based or fill-based
            const hasStroke = svg.querySelector('[stroke]') !== null || svg.getAttribute('stroke') !== null;
            const hasFillNone = svg.getAttribute('fill') === 'none';
            const isStrokeBased = hasStroke || hasFillNone;

            if (isStrokeBased) {
                // Stroke icon (Lucide, Heroicons outline, Tabler, Pragmatic outline)
                svg.setAttribute('stroke', 'currentColor');
                svg.setAttribute('fill', 'none');

                // Weight: explicit prop > CSS variable > optical compensation
                if (weight && WEIGHTS[weight] !== undefined) {
                    svg.setAttribute('stroke-width', String(WEIGHTS[weight]));
                } else {
                    // Optical size compensation: smaller icons get thicker strokes
                    const baseStroke = parseFloat(svg.getAttribute('stroke-width') || '2');
                    const opticalFactor = 24 / sizePx; // normalize to 24px reference
                    const compensated = Math.min(baseStroke * Math.sqrt(opticalFactor), baseStroke * 1.5);
                    svg.setAttribute('stroke-width', String(Math.round(compensated * 100) / 100));
                }
            } else {
                // Fill icon (Material, Heroicons solid)
                svg.setAttribute('fill', 'currentColor');
            }
        }

        return { containerRef };
    },
    render: (ctx) => html`
        <span
            :ref=${ctx.containerRef}
            class="pdx-icon-container"
            style="display:inline-flex;align-items:center;justify-content:center;line-height:0;"
        ></span>
    `,
});
