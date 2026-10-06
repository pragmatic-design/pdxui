// A list's filter in its address, both ways.
//
// A filtered list that cannot be linked is a demo, not an application. The query carries the two
// filters the tickets list puts in it — `status`, and `assignee`, because the dashboard's «Unassigned»
// count links there — in and out.
//
// The address and the SOURCE are kept in step both ways: the grid's toolbar is the one filter
// control. Each direction checks before it writes: the source only takes a filter that differs from
// its own, and `setQueryParam` does not publish a value that has not changed — without both checks
// the URL and the source feed each other in a reactive loop with nothing to stop them.
import { computed, signal, watch, onMount } from '@pdxui/core';
import type { DataSource, FilterDescriptor, CompositeFilter } from '@pdxui/core';

type Filter = FilterDescriptor | CompositeFilter;

/** The condition on one field, when the filters hold one (a composite names no field). */
function onField(filters: Filter[], field: string): FilterDescriptor | undefined {
    return filters.find((f): f is FilterDescriptor => 'field' in f && f.field === field);
}
import { currentQuery, setQueryParam } from '@pdxui/router';
import { isViewFilter } from './views';

/**
 * «Nobody» is written `none` in an address: an empty `?assignee=` reads as no filter at all, and the
 * unassigned ticket is exactly the one a link has to be able to name. In the filter it is `isnull`,
 * not `eq ''`: a condition with an empty value is an unfinished one to the builder, which drops it —
 * with it, the dashboard's «Unassigned» lands on all 12 open tickets.
 */
export const NOBODY = 'none';

/** The address's parameters that carry a filter: what the list header asks before it puts a view back. */
export const FILTER_PARAMS = ['status', 'assignee'];

/** The filters an address names. */
export function queryFilter(query: Record<string, string | undefined>): FilterDescriptor[] {
    const filters: FilterDescriptor[] = [];
    if (query.status) filters.push({ field: 'status', operator: 'eq', value: query.status });
    if (query.assignee === NOBODY) filters.push({ field: 'assignee', operator: 'isnull', value: null });
    else if (query.assignee) filters.push({ field: 'assignee', operator: 'eq', value: query.assignee });
    return filters;
}

/** The address a set of filters names. */
export function writeFilterToUrl(filters: Filter[]): void {
    const status = onField(filters, 'status');
    setQueryParam('status', status ? String(status.value) : null);
    const assignee = onField(filters, 'assignee');
    setQueryParam('assignee', !assignee ? null : assignee.operator === 'isnull' ? NOBODY : String(assignee.value));
}

export interface UrlFilter {
    /**
     * How many filters are narrowing the list. The COUNT, not a boolean: «no result» with nothing
     * else is the message the list's empty state exists to replace, and a reader who cannot see what
     * is filtering cannot undo it. Read from the source, which is where a filter actually lives — the
     * URL carries one of them and the grid can add more.
     */
    activeCount: () => number;
    /** No filter, in the source and in the address. */
    clearFilters(): void;
}

/** Keep `source`'s filter and the address in step. Call it during a component's setup. */
export function createUrlFilter<T>(source: DataSource<T>): UrlFilter {
    // DERIVED, not read once: `currentQuery()` is empty while a directly-loaded page's setup runs, so
    // reading it there would produce no filter at all.
    const urlFilter = computed(() => queryFilter(currentQuery()));
    watch(urlFilter, (filters) => {
        const current = source.filter.peek();
        if (JSON.stringify(filters) === JSON.stringify(current)) return;
        // An address that names no filter leaves a VIEW's filter alone: that one is named by `?view=`,
        // and the address has none of its own for it (below). Read as «no filter», it would erase the
        // view the moment the view is put on the list.
        if (filters.length === 0 && isViewFilter(source, current)) return;
        source.setFilter(filters);
    }, { immediate: true });

    // The URL is only written once the screen is live: written while the page is wiring itself up, it
    // ERASES the filter the URL arrived with — "?status=closed" becomes "" before the source has read
    // it.
    const urlReady = signal(false);
    onMount(() => { urlReady.set(true); });
    watch(source.filter, (filters) => {
        if (!urlReady()) return;
        // A view's own filter is named by `?view=`, not written out as well: the address
        // then says the view, and nothing that could disagree with it. What the reader sets is theirs.
        writeFilterToUrl(isViewFilter(source, filters) ? [] : filters ?? []);
    });

    const activeCount = computed(() => (source.filter() ?? []).length);
    return {
        activeCount,
        clearFilters() {
            source.setFilter([]);
            // And the URL with it: a filter left in the address bar comes back on the next visit,
            // which is the opposite of what the reader just asked for.
            setQueryParam('status', null);
        },
    };
}
