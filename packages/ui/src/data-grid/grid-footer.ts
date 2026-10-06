// Grid footer — pdx-pagination integration + row count info.

import type { GridContext } from './grid-context';
import { t } from './grid-i18n';

export function buildFooter(gc: GridContext): HTMLElement {
    const footer = document.createElement('div');
    footer.className = 'pdx-dg-footer';

    // Row count info
    const info = document.createElement('span');
    info.className = 'pdx-dg-footer-info';
    footer.appendChild(info);

    // pdx-pagination — binds directly to DataSource
    const pagination = document.createElement('pdx-pagination') as HTMLElement;
    pagination.setAttribute('show-total', '');
    pagination.setAttribute('show-edges', '');
    // Rows per page: the pager draws the control when the grid asks it to.
    const sizes = gc.pageSizes();
    if (sizes.length) {
        pagination.setAttribute('show-page-size', '');
        (pagination as HTMLElement & { pageSizes: number[] }).pageSizes = sizes;
    }
    if (gc.grid) {
        // Set source via JS property (next frame, after CE upgrades)
        requestAnimationFrame(() => {
            (pagination as any).source = gc.grid!.source;
        });
    }
    footer.appendChild(pagination);

    return footer;
}

export function updateFooter(gc: GridContext, footer: HTMLElement): void {
    if (!gc.grid) return;
    const info = footer.querySelector('.pdx-dg-footer-info');
    if (info) {
        const total = gc.grid.total.peek();
        const rows = gc.grid.rows.peek();
        const count = total < 0 ? rows.length : total;
        const key = count === 1 ? 'pagination.row' : 'pagination.rows';
        info.textContent = t(key).replace('{count}', String(count));
    }
}
