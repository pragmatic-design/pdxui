/**
 * The demo scaffolding of a gallery that computes the browser's DEFAULT style.
 *
 * The component and design galleries are the showcase's pages, ported. They lay out their demos with
 * classes from `showcase-new/showcase-shared.css` — the Reference/Props tables (`.opt-header`/`.opt-row`
 * rows, or a real `<table>`), `.demo-grid`, `.comp-card`, `.demo-box`, `.api-table`, `.console-panel` — and a site
 * that loads none of it shows its Reference tables as run-together text ("PropDescription"),
 * a four-box grid stacked into a 2516 px column.
 *
 * "Default" is the one thing each class must not be: a grid or grid row that is `display: block`, a
 * card with neither border nor padding, a table whose cells have no padding, a console with no
 * background. A page that styles one of them its own way passes: this looks for "not styled at all".
 *
 * Runs in the page (`page.evaluate(unstyledScaffolding)`), so it is self-contained.
 */
export function unstyledScaffolding(): string[] {
    const root = document.querySelector('.cmp-gallery, .design-gallery');
    if (!root) return ['no gallery on the page'];
    const out: string[] = [];
    const name = (el: Element): string => el.tagName.toLowerCase() + '.' + Array.from(el.classList).join('.');
    for (const el of Array.from(root.querySelectorAll('.demo-grid, .opt-header, .opt-row'))) {
        if (getComputedStyle(el).display === 'block') out.push(`${name(el)}: display block`);
    }
    for (const el of Array.from(root.querySelectorAll('.comp-card, .demo-box'))) {
        const cs = getComputedStyle(el);
        if (cs.borderTopStyle === 'none' && cs.paddingTop === '0px') out.push(`${name(el)}: no border, no padding`);
    }
    // A table's own border-collapse says nothing: something global already collapses them. What an
    // unstyled table has is cells with no padding — "offsettopNumber0".
    for (const el of Array.from(root.querySelectorAll('table.api-table, table.options-table, .options-table > table'))) {
        const td = el.querySelector('td');
        if (td && getComputedStyle(td).paddingLeft === '0px') out.push(`${name(el)}: cells with no padding`);
    }
    for (const el of Array.from(root.querySelectorAll('.console-panel'))) {
        if (getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)') out.push(`${name(el)}: no background`);
    }
    return Array.from(new Set(out));
}
