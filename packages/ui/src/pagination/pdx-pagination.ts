// pdx-pagination — Page navigation with page numbers, prev/next, first/last.
// Supports DataSource binding: auto-reads total/page/pageSize from DataSource.
// Priority: explicit props > :source prop > injected DataSource from context.

import { component, html, signal, inject, slot, snippetOrSlot, model } from '@pdxui/core';
import { DataSourceContext } from '../data-source/data-source-context';
import type { SlotFunction } from '@pdxui/core';
import type { DataSource } from '@pdxui/core';
import { uiString, format, uiAttr} from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/pagination';

type SizeSelect = HTMLElement & { options: { value: string; label: string }[]; value: string | null };

/**
 * Page navigation with numbered buttons, previous/next and first/last, collapsing large ranges
 * behind an ellipsis.
 *
 * @slot item - Renders one page button, as a snippet `item(page, active)`: named apart from the `page` prop.
 * @slot page - The scoped slot for one page button, which receives `{ page, isActive }`; the snippet `item` is its typed form.
 *
 * @csspart nav - The `role="navigation"` element that holds the controls (`.pdx-pagination`).
 * @csspart page - A page button; the current one is `aria-current="page"`.
 * @csspart first - The button to the first page.
 * @csspart prev - The button to the previous page.
 * @csspart next - The button to the next page.
 * @csspart last - The button to the last page.
 * @csspart ellipsis - The gap drawn for the pages left out of a long range.
 * @csspart range - The "1–10 of 47" text, with `show-total`.
 * @csspart position - The "3 / 10" text of `simple`.
 * @csspart size - The rows-per-page select, with `show-page-size`.
 *
 * @alphaevent pdx-change
 * @alphadetail page $event.detail.value
 * @alphadetail pageSize $event.currentTarget.pageSize
 */
component('pdx-pagination', {
    // The current page and the page size are positions the pager changes itself (#289): models, so a
    // click writes them and announces `page-change` / `page-size-change` { value }. -1 leaves each to
    // the DataSource, which then holds it and is not written.
    models: {
        /** Current page 1-based (overrides DataSource) */
        page: model<number>(-1, { type: Number }),
        /** Items per page (overrides DataSource) */
        pageSize: model<number>(-1, { type: Number }),
    },
    parts: ['nav', 'page', 'first', 'prev', 'next', 'last', 'ellipsis', 'range', 'position', 'size'],
    props: {
        /** DataSource instance — auto-binds total, page, pageSize */
        source: { type: Object, default: null },
        /** Total number of items (overrides DataSource) */
        total: { type: Number, default: -1 },
        /** Show first/last buttons */
        showEdges: { type: Boolean, default: true },
        /** Show page size selector */
        showPageSize: { type: Boolean, default: false },
        /** Page size options */
        pageSizes: { type: Array, default: [10, 20, 50, 100] },
        /** Simple mode (prev/next only, no page numbers) */
        simple: { type: Boolean, default: false },
        /** Show total info text */
        showTotal: { type: Boolean, default: false },
    },
    // A parent's `@snippet` sets this, positional arguments; the alpha scoped slot stays (#595). The
    // `page` slot shares its name with the prop above, so its snippet is `item`.
    slots: {
        item: slot<(page: number, active: boolean) => Node>(),
    },
    setup(ctx) {
        const _page = signal(1);
        let _built = false;
        function getPageSlot(): SlotFunction | undefined {
            return snippetOrSlot(ctx, 'item', (s) => [s.page, s.isActive], 'page');
        }
        let _ds: DataSource<unknown> | null = null;

        // Resolve DataSource: explicit :source prop > context inject
        function resolveDS(): DataSource<unknown> | null {
            const explicitSource = ctx.source() as DataSource<unknown> | null;
            if (explicitSource) return explicitSource;
            // Try inject from pdx-data-source ancestor
            if (!_ds) {
                _ds = inject(DataSourceContext, ctx.el, null) as DataSource<unknown> | null;
            }
            return _ds;
        }

        // Read values: explicit props override DataSource values
        function getTotal(): number {
            const prop = ctx.total() as number;
            if (prop >= 0) return prop;
            const ds = resolveDS();
            return ds ? ds.total() : 0;
        }

        function getPageSize(): number {
            const prop = ctx.pageSize() as number;
            if (prop >= 0) return prop;
            const ds = resolveDS() as any;
            if (ds && typeof ds.pageSize === 'function') return ds.pageSize() || 10;
            return 10;
        }

        function getPage(): number {
            const prop = ctx.page() as number;
            if (prop >= 0) return prop;
            const ds = resolveDS();
            return ds ? ds.page() : 1;
        }

        function totalPages(): number {
            return Math.max(1, Math.ceil(getTotal() / getPageSize()));
        }

        /**
         * Write the model, which announces it when it changed. Not while it is left to a DataSource
         * (the -1 default with a source): there the source holds it, and writing it would pin it.
         */
        function reflect(name: 'page' | 'pageSize', value: number): void {
            const m = name === 'page' ? ctx.page : ctx.pageSize;
            if ((m.peek() as number) >= 0 || !resolveDS()) m.set(value);
        }

        function goTo(pageNum: number): void {
            const tp = totalPages();
            const clamped = Math.max(1, Math.min(pageNum, tp));
            _page.set(clamped);
            // If bound to DataSource, update it directly
            const ds = resolveDS();
            if (ds) ds.setPage(clamped);
            reflect('page', clamped);
            rebuild();
        }

        // What the last build drew from. The track below rebuilds only when it changed, so the
        // component's own reflection of `page` / `pageSize` does not rebuild the buttons a second time.
        let _builtFrom = '';
        function buildInputs(): string {
            return [_page.peek(), getTotal(), getPageSize(), ctx.simple(), ctx.showEdges(), ctx.showTotal(), ctx.showPageSize()].join('|');
        }

        function rebuild(): void {
            _builtFrom = buildInputs();
            const el = ctx.el;
            const nav = el.querySelector('.pdx-pagination') || document.createElement('nav');
            nav.className = 'pdx-pagination';
            nav.setAttribute('data-part', 'nav');
            nav.setAttribute('role', 'navigation');
            uiAttr(nav, 'aria-label', () => uiString('pagination', 'label'));
            // The control that had focus, by what it does: the rebuild replaces every button, and focus
            // would fall to <body> on each page change. It goes back to the same control below.
            const active = document.activeElement as HTMLElement | null;
            const focusKey = active && nav.contains(active) ? active.getAttribute('data-page-key') : null;
            // Everything but the size select, which stays connected: a pdx-select taken out and put
            // back is set up again, and would lose its focus and its open list with it.
            for (const child of [...nav.childNodes]) if (child !== sizeSelect) child.remove();

            const page = _page.peek();
            const tp = totalPages();
            const isSimple = ctx.simple() as boolean;
            const showEdges = ctx.showEdges() as boolean;
            const showTotal = ctx.showTotal() as boolean;
            const total = getTotal();
            const pageSize = getPageSize();

            // Total info
            if (showTotal) {
                const info = document.createElement('span');
                info.className = 'pdx-pagination-info';
                info.setAttribute('data-part', 'range');
                const start = (page - 1) * pageSize + 1;
                const end = Math.min(page * pageSize, total);
                // Nothing to show is "0 of 0", not "1–0 of 0".
                info.textContent = total > 0
                    ? format(uiString('pagination', 'range'), { from: start, to: end, total })
                    : uiString('pagination', 'none');
                // Before the size select, which may have stayed from the last build.
                nav.insertBefore(info, nav.firstChild);
            }

            // Page size — `showPageSize` and `pageSizes`, the pair a reader looks for first on a pager.
            const sizes = ctx.showPageSize() as boolean && !isSimple ? (ctx.pageSizes() as number[]) ?? [] : [];
            if (sizes.length) {
                if (!sizeSelect) nav.appendChild(sizeSelect = createSizeSelect());
                const options = sizes.map((size) => ({ value: String(size), label: String(size) }));
                if (JSON.stringify(sizeSelect.options) !== JSON.stringify(options)) sizeSelect.options = options;
                sizeSelect.value = sizes.includes(pageSize) ? String(pageSize) : null;
            } else if (sizeSelect) {
                sizeSelect.remove();
                sizeSelect = null;
            }

            // First
            if (showEdges && !isSimple) {
                nav.appendChild(makeBtn('«', () => goTo(1), page <= 1, uiString('pagination', 'first'), 'first'));
            }

            // Prev
            nav.appendChild(makeBtn('‹', () => goTo(page - 1), page <= 1, uiString('pagination', 'previous'), 'prev'));

            // Page numbers (not in simple mode) — none when there is nothing to page: an empty set does
            // not show an active page "1".
            if (!isSimple) {
                const pages = total > 0 ? getPageRange(page, tp) : [];
                for (const p of pages) {
                    if (p === -1) {
                        const ellipsis = document.createElement('span');
                        ellipsis.className = 'pdx-page-ellipsis';
                        ellipsis.setAttribute('data-part', 'ellipsis');
                        ellipsis.textContent = '…';
                        // Drawn, not read: a gap in the numbers, which the page names already say.
                        ellipsis.setAttribute('aria-hidden', 'true');
                        nav.appendChild(ellipsis);
                    } else {
                        const pageSlot = getPageSlot();
                        if (pageSlot) {
                            const content = pageSlot({ page: p, isActive: p === page });
                            const wrapper = document.createElement('span');
                            // The current page is its `aria-current`, which the CSS selects: no class.
                            wrapper.className = 'pdx-page-btn';
                            wrapper.setAttribute('data-part', 'page');
                            if (p === page) wrapper.setAttribute('aria-current', 'page');
                            wrapper.addEventListener('click', () => goTo(p));
                            wrapper.appendChild(content instanceof DocumentFragment ? content : content);
                            nav.appendChild(wrapper);
                        } else {
                            // "Page 2", not the bare number.
                            const btn = makeBtn(String(p), () => goTo(p), false,
                                format(uiString('pagination', 'page'), { n: p }), `page:${p}`);
                            if (p === page) btn.setAttribute('aria-current', 'page');
                            nav.appendChild(btn);
                        }
                    }
                }
            } else {
                // Simple: show "Page X of Y"
                const info = document.createElement('span');
                info.className = 'pdx-pagination-simple-info';
                info.setAttribute('data-part', 'position');
                info.textContent = total > 0 ? `${page} / ${tp}` : '0 / 0';
                nav.appendChild(info);
            }

            // Next
            nav.appendChild(makeBtn('›', () => goTo(page + 1), page >= tp, uiString('pagination', 'next'), 'next'));

            // Last
            if (showEdges && !isSimple) {
                nav.appendChild(makeBtn('»', () => goTo(tp), page >= tp, uiString('pagination', 'last'), 'last'));
            }

            if (!el.contains(nav)) el.appendChild(nav);
            if (focusKey) restoreFocus(nav, focusKey);
        }

        /**
         * The rows-per-page control: a pdx-select, never the browser's `<select>` — the one native
         * dropdown on a list would break the rule that keeps them out.
         */
        let sizeSelect: SizeSelect | null = null;
        function createSizeSelect(): SizeSelect {
            // Loaded the first time a pager offers sizes: one that offers none never fetches it.
            // The element is upgraded when it arrives, keeping what is set on it below.
            if (!customElements.get('pdx-select')) void import('../select/pdx-select');
            const select = document.createElement('pdx-select') as SizeSelect;
            select.className = 'pdx-pagination-size';
            select.setAttribute('data-part', 'size');
            select.setAttribute('size', 'sm');
            select.setAttribute('data-page-key', 'size');
            uiAttr(select, 'label', () => uiString('pagination', 'pageSize'));
            // The select's model event (#481), which does not bubble: the pager's own model events
            // are the ones its listeners read.
            select.addEventListener('value-change', (e) => {
                const next = Number((e as CustomEvent<{ value: string | null }>).detail.value);
                if (!next) return;
                const ds = resolveDS() as any;
                // Page 1: staying on page 9 of 20 while the size triples lands past the end.
                if (ds && typeof ds.setPageSize === 'function') ds.setPageSize(next);
                _page.set(1);
                // Without it the size does not stick: an explicit page-size prop, or none and
                // no source, gives the rebuild the old size back.
                reflect('pageSize', next);
                reflect('page', 1);
                rebuild();
            });
            return select;
        }

        /** The same control again; if it is gone or disabled (Next on the last page), the current page. */
        function restoreFocus(nav: Element, key: string): void {
            const same = nav.querySelector<HTMLElement>(`[data-page-key="${key}"]`);
            if (same && !(same as HTMLButtonElement).disabled) { same.focus(); return; }
            const current = nav.querySelector<HTMLElement>('button[aria-current="page"]')
                ?? nav.querySelector<HTMLElement>('button:not(:disabled), select');
            current?.focus();
        }

        function makeBtn(text: string, onClick: () => void, disabled: boolean, label?: string, key?: string): HTMLButtonElement {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pdx-page';
            btn.textContent = text;
            btn.disabled = disabled;
            if (label) btn.setAttribute('aria-label', label);
            if (key) {
                btn.setAttribute('data-page-key', key);
                // `page:3` is a page button; the others are named by what they do.
                btn.setAttribute('data-part', key.startsWith('page:') ? 'page' : key);
            }
            btn.addEventListener('click', onClick);
            return btn;
        }

        function getPageRange(current: number, total: number): number[] {
            if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
            const pages: number[] = [];
            pages.push(1);
            if (current > 3) pages.push(-1); // ellipsis
            const start = Math.max(2, current - 1);
            const end = Math.min(total - 1, current + 1);
            for (let i = start; i <= end; i++) pages.push(i);
            if (current < total - 2) pages.push(-1); // ellipsis
            pages.push(total);
            return pages;
        }

        // The navigation verbs of the library (#289): `next()`, `prev()`, `goTo(n)`, and `first()` /
        // `last()`. The current page is the `page` model itself.
        ctx.expose({
            /** Go to a page, clamped to 1..total. Writes `page`, and moves the bound DataSource with it. */
            goTo: (p: number) => goTo(p),
            next: () => goTo(_page.peek() + 1),
            prev: () => goTo(_page.peek() - 1),
            /** The first page, through the same path as `goTo`. */
            first: () => goTo(1),
            /** The last page, through the same path as `goTo`. */
            last: () => goTo(totalPages()),
        });

        ctx.track(() => {
            // Subscribe to explicit props
            void ctx.page();
            void ctx.total();
            void ctx.pageSize();
            void ctx.simple();
            void ctx.showEdges();
            void ctx.showTotal();
            void ctx.source();
            // Subscribe to DataSource signals if available
            const ds = resolveDS();
            if (ds) { void ds.page(); void ds.total(); }

            const currentPage = getPage();

            if (!_built) {
                _built = true;
                _page.set(currentPage || 1);
                requestAnimationFrame(rebuild);
                return;
            }

            _page.set(currentPage || 1);
            // Checked again in the frame: a click rebuilds at once, after its reflection ran this.
            if (buildInputs() === _builtFrom) return;
            requestAnimationFrame(() => { if (buildInputs() !== _builtFrom) rebuild(); });
        });

        return {};
    },
    render: () => html``,
});
