// pdx-pagination — Page navigation with page numbers, prev/next, first/last.
// Supports DataSource binding: auto-reads total/page/pageSize from DataSource.
// Priority: explicit props > :source prop > injected DataSource from context.

import { component, html, signal, tryInject } from '@pdxui/core';
import type { SlotFunction } from '@pdxui/core';
import type { DataSource } from '@pdxui/core';
import { uiString, format, uiAttr} from '../shared/i18n';
import { setOwnProp } from '../shared/own-prop';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/pagination';
// The rows-per-page control.
import '../select/pdx-select';

type SizeSelect = HTMLElement & { options: { value: string; label: string }[]; value: string | null };

/**
 * Page navigation with numbered buttons, previous/next and first/last, collapsing large ranges
 * behind an ellipsis.
 *
 * @slot page - Scoped — renders one page button. Receives `{ page, isActive }`.
 */
component('pdx-pagination', {
    props: {
        /** DataSource instance — auto-binds total, page, pageSize */
        source: { type: Object, default: null },
        /** Total number of items (overrides DataSource) */
        total: { type: Number, default: -1 },
        /** Items per page (overrides DataSource) */
        pageSize: { type: Number, default: -1 },
        /** Current page 1-based (overrides DataSource) */
        page: { type: Number, default: -1 },
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
    setup(ctx) {
        const _page = signal(1);
        let _built = false;
        function getPageSlot(): SlotFunction | undefined {
            return (ctx as any).__slots?.['page'] as SlotFunction | undefined;
        }
        let _ds: DataSource<unknown> | null = null;

        // Resolve DataSource: explicit :source prop > context inject
        function resolveDS(): DataSource<unknown> | null {
            const explicitSource = ctx.source() as DataSource<unknown> | null;
            if (explicitSource) return explicitSource;
            // Try inject from pdx-data-source ancestor
            if (!_ds) {
                try { _ds = tryInject('dataSource', ctx.el) as DataSource<unknown> | null; } catch { _ds = null; }
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
         * `page` / `pageSize` are the live values, already when pdx-change is dispatched,
         * not their initial ones. Not while they are left to a DataSource (the -1
         * default with a source): there the source holds them, and writing the prop would pin it.
         */
        function reflect(name: 'page' | 'pageSize', value: number): void {
            const current = (name === 'page' ? ctx.page() : ctx.pageSize()) as number;
            if (current >= 0 || !resolveDS()) setOwnProp(ctx.el, name, value);
        }

        function goTo(pageNum: number): void {
            const tp = totalPages();
            const clamped = Math.max(1, Math.min(pageNum, tp));
            _page.set(clamped);
            // If bound to DataSource, update it directly
            const ds = resolveDS();
            if (ds) ds.setPage(clamped);
            reflect('page', clamped);
            ctx.emit('pdx-change', { page: clamped, pageSize: getPageSize() });
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
                        ellipsis.textContent = '…';
                        // Drawn, not read: a gap in the numbers, which the page names already say.
                        ellipsis.setAttribute('aria-hidden', 'true');
                        nav.appendChild(ellipsis);
                    } else {
                        const pageSlot = getPageSlot();
                        if (pageSlot) {
                            const content = pageSlot({ page: p, isActive: p === page });
                            const wrapper = document.createElement('span');
                            wrapper.className = 'pdx-page-btn' + (p === page ? ' pdx-page-active' : '');
                            if (p === page) wrapper.setAttribute('aria-current', 'page');
                            wrapper.addEventListener('click', () => goTo(p));
                            wrapper.appendChild(content instanceof DocumentFragment ? content : content);
                            nav.appendChild(wrapper);
                        } else {
                            // "Page 2", not the bare number.
                            const btn = makeBtn(String(p), () => goTo(p), false,
                                format(uiString('pagination', 'page'), { n: p }), `page:${p}`);
                            if (p === page) {
                                btn.classList.add('pdx-page-active');
                                btn.setAttribute('aria-current', 'page');
                            }
                            nav.appendChild(btn);
                        }
                    }
                }
            } else {
                // Simple: show "Page X of Y"
                const info = document.createElement('span');
                info.className = 'pdx-pagination-simple-info';
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
            const select = document.createElement('pdx-select') as SizeSelect;
            select.className = 'pdx-pagination-size';
            select.setAttribute('size', 'sm');
            select.setAttribute('data-page-key', 'size');
            uiAttr(select, 'label', () => uiString('pagination', 'pageSize'));
            select.addEventListener('pdx-change', (e) => {
                // The pager's pdx-change is the one its listeners read; the select's stops here.
                e.stopPropagation();
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
                ctx.emit('pdx-change', { page: 1, pageSize: next });
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
            if (key) btn.setAttribute('data-page-key', key);
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

        // Imperative API — exposed on host for parent ref access.
        // NOTE: cannot expose a `page` member: it would shadow the `page` PROP setter
        // (exposeOnElement redefines the property getter-only). Use `currentPage` instead.
        ctx.expose({
            /** Go to a page, clamped to 1..total. Emits `pdx-change`, and moves the bound DataSource with it. */
            goto: (p: number) => goTo(p),
            next: () => goTo(_page.peek() + 1),
            prev: () => goTo(_page.peek() - 1),
            /** The first page, through the same path as `goto`. */
            first: () => goTo(1),
            /** The last page, through the same path as `goto`. */
            last: () => goTo(totalPages()),
            get currentPage() { return _page.peek(); },
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
