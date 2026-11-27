// A block's bindings in one effect (#1275).
//
// Each binding of a block was core's binding call with an effect of its own; the cost of a declarative
// template was those effects (pdx-fieldset: 13 at every mount, 1.4× its TypeScript version). A block
// now passes its bindings a group, and core's `bindGroup` runs them in one effect (bound-attribute.ts).
// The generator does not know, writing a binding, how many the block will have: it writes the group as
// GROUP and counts. When the block is done, `groupLines` names the group and runs it when the block has
// two or more, and gives a lone binding back its own call — its effect is the group's effect already.

/** The group's name in a binding line until the block knows whether it has one. */
export const GROUP = '__PDX_BIND_GROUP__';

/**
 * The name of a block's group: the same in every block. Each block is a function of its own — the
 * render, a branch, a row, a snippet — so a group is local to its block, and a block inside it declares
 * its own. A name of its own per block would take an index from the generator and renumber every
 * name after it.
 */
const NAME = '__g';

// Match: the group argument of a binding call. Groups: none.
const GROUP_ARG = new RegExp(`, ?${GROUP}\\)`, 'g');

/**
 * A block's lines with its group resolved. `count` bindings were written with GROUP: two or more get a
 * group, declared first and run last, after every binding is in it; one gets its call as it was before
 * groups — a text binding `bindInterpolation`, the call core has for one alone; none leaves the lines
 * as they are. `held`: for each grouped binding, the JS literal of the value the markup holds for it,
 * or null — given to `bindGroup` when any is known, a hole for each that is not. `imports` gets what
 * the lines call.
 */
export function groupLines(lines: readonly string[], count: number, held: ReadonlyArray<string | null>, imports: Set<string>): string[] {
    if (count === 0) return [...lines];
    if (count === 1) {
        return lines.map((l) => {
            if (!l.includes(GROUP)) return l;
            if (l.includes('bindText(')) imports.add('bindInterpolation');
            return l.replace('bindText(', 'bindInterpolation(').replace(GROUP_ARG, ')');
        });
    }
    imports.add('bindGroup');
    if (lines.some((l) => l.includes(GROUP) && l.includes('bindText('))) imports.add('bindText');
    return [`const ${NAME}=[];`, ...lines.map((l) => l.split(GROUP).join(NAME)), `bindGroup(${NAME}${heldArgument(held)});`];
}

/** `,[a,,b]`: the values the markup holds, a hole for each not known, none after the last known. */
function heldArgument(held: ReadonlyArray<string | null>): string {
    let last = held.length - 1;
    while (last >= 0 && held[last] === null) last--;
    if (last < 0) return '';
    return `,[${held.slice(0, last + 1).map((h) => h ?? '').join(',')}]`;
}
