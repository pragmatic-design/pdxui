// pdx-aspect-ratio — Maintains a fixed aspect ratio on its content.
// Uses native CSS aspect-ratio. Content fills the container.

import { component, html } from '@pdxui/core';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/aspect-ratio';

/**
 * Keeps its content at a fixed aspect ratio, using the native CSS aspect-ratio.
 */
component('pdx-aspect-ratio', {
    props: {
        /** Aspect ratio as "width/height" string (e.g. "16/9", "4/3", "1/1") or number */
        ratio: { type: String, default: '16/9' },
    },
    setup(ctx) {
        let _built = false;
        ctx.track(() => {
            const ratio = ctx.ratio() as string;
            if (!_built) {
                _built = true;
                requestAnimationFrame(() => {
                    ctx.el.classList.add('pdx-aspect-ratio');
                    ctx.el.style.aspectRatio = ratio;
                });
                return;
            }
            requestAnimationFrame(() => {
                ctx.el.style.aspectRatio = ratio;
            });
        });
        return {};
    },
    render: () => html`<slot></slot>`,
});
