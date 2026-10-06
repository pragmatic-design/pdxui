/**
 * Radio names shared across the scenarios of one generated page.
 *
 * Every scenario of a tier is a <section> of the SAME document, and a native radio group is every
 * radio with the same `name` in the same form owner — hidden sections included. Two scenarios that
 * both use name="plan" are one group: the last radio checked on the page unchecks the others, so
 * `radio-basic` renders its `checked` radio empty and `radio-group-basic` (value="pro") renders no
 * radio checked at all. Both Dimension 5 baselines would be taken in that state, and the keyboard
 * contract's Tab would land on the first radio instead of the selected one.
 *
 * A name repeated INSIDE one scenario is the point of a radio group and is not reported.
 */

export interface ScenarioHtml {
    id: string;
    html: string;
}

export interface SharedRadioName {
    name: string;
    scenarios: string[];
}

/**
 * The radio group names a scenario's markup declares: `name` on <pdx-radio-group> (its children take
 * it), on a standalone <pdx-radio>, and on <input type="radio">.
 */
export function radioNames(html: string): string[] {
    const names = new Set<string>();
    for (const m of html.matchAll(/<(pdx-radio-group|pdx-radio|input)\b([^>]*)>/g)) {
        const attrs = m[2];
        if (m[1] === 'input' && !/\btype\s*=\s*["']radio["']/.test(attrs)) continue;
        const name = /\bname\s*=\s*["']([^"']+)["']/.exec(attrs);
        if (name) names.add(name[1]);
    }
    return [...names];
}

/** The names declared by more than one scenario of the same page, with the scenarios that declare them. */
export function sharedRadioNames(scenarios: ScenarioHtml[]): SharedRadioName[] {
    const owners = new Map<string, string[]>();
    for (const s of scenarios) {
        for (const name of radioNames(s.html)) {
            const list = owners.get(name) ?? [];
            list.push(s.id);
            owners.set(name, list);
        }
    }
    return [...owners]
        .filter(([, ids]) => ids.length > 1)
        .map(([name, ids]) => ({ name, scenarios: ids }));
}
