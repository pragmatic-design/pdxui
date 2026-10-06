// pdx-page-header — Standard page header: breadcrumb + title (+ subtitle) + an actions slot.
// Replaces the hand-assembled "breadcrumb + <h1> + buttons" row repeated on every list/detail screen.
// Declarative render (no imperative DOM poking) so the `actions` slot projects and props stay reactive.
// Slot: "actions" — right-aligned action area (buttons). Emits `pdx-crumb` when a breadcrumb link is clicked.
//
// Usage:
//   <pdx-page-header title="Patients" :crumbs="${crumbs}">
//     <pdx-button slot="actions">New</pdx-button>
//   </pdx-page-header>

import { component, html } from '@pdxui/core';
import { uiString } from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/page-header';

export interface PageHeaderCrumb {
    key: string;
    label: string;
    href?: string;
}

/**
 * The standard header of a page: a breadcrumb, the title with an optional subtitle, and an area for
 * the page's actions.
 *
 * @slot actions - Commands shown in the header's actions area (e.g. the page's primary action).
 */
component('pdx-page-header', {
    props: {
        title: { type: String, default: '' },
        subtitle: { type: String, default: '' },
        crumbs: { type: Array, default: () => [] },
        /** The title's heading level, 1-6. Default 1; lower it for a header inside a dialog or a section. */
        headingLevel: { type: Number, default: 1 },
    },
    setup(ctx) {
        /**
         * The title, an h1…h6 by `headingLevel`, so a page that has its own h1 does not get two, and
         * one inside a dialog or a section can be demoted. A real heading element,
         * so the level is native; the class carries the look.
         */
        function heading(): HTMLElement {
            const level = Math.min(6, Math.max(1, Math.round(Number(ctx.headingLevel()) || 1)));
            const h = document.createElement(`h${level}`);
            h.className = 'pdx-page-header-title';
            h.textContent = ctx.title() as string;
            return h;
        }
        function onCrumb(c: PageHeaderCrumb) {
            return (e: Event) => {
                if (!c.href) e.preventDefault();
                ctx.emit('pdx-crumb', { key: c.key, item: c });
            };
        }
        // A `:crumbs` binding reaches the prop as the array: core's bindProperty calls the compiled getter
        // and assigns its value, so it is read as a value, not called.
        function crumbList(): PageHeaderCrumb[] {
            const v = ctx.crumbs() as unknown;
            return Array.isArray(v) ? (v as PageHeaderCrumb[]) : [];
        }
        return { onCrumb, crumbList, heading };
    },
    render: (ctx) => html`
        <header class="pdx-page-header">
            ${() => ctx.crumbList().length ? html`
                <nav class="pdx-breadcrumb" :aria-label="${() => uiString('page-header', 'breadcrumb')}">
                    <ol class="pdx-breadcrumb-list" role="list">
                        ${() => ctx.crumbList().map((c: PageHeaderCrumb, i: number, arr: PageHeaderCrumb[]) => html`
                            <li class="pdx-breadcrumb-item">
                                ${i === arr.length - 1
                                    ? html`<span class="pdx-breadcrumb-current" aria-current="page">${c.label}</span>`
                                    : html`<a class="pdx-breadcrumb-link" href="${c.href || ''}" @click="${ctx.onCrumb(c)}">${c.label}</a>`}
                                ${i < arr.length - 1 ? html`<span class="pdx-breadcrumb-sep" aria-hidden="true">/</span>` : ''}
                            </li>
                        `)}
                    </ol>
                </nav>
            ` : ''}
            <div class="pdx-page-header-row">
                <div class="pdx-page-header-titles">
                    ${() => ctx.heading()}
                    ${() => ctx.subtitle() ? html`<p class="pdx-page-header-subtitle">${() => ctx.subtitle()}</p>` : ''}
                </div>
                <div class="pdx-page-header-actions"><slot name="actions"></slot></div>
            </div>
        </header>
    `,
});
