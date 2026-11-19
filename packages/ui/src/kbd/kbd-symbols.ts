// The symbols pdx-kbd shows for a modifier or a named key, with `symbols`. A module of its own: the
// component's script runs once per instance, and the table is one for all of them.

const SYMBOLS: Record<string, string> = {
    cmd: '⌘', command: '⌘', meta: '⌘',
    alt: '⌥', option: '⌥',
    ctrl: '⌃', control: '⌃',
    shift: '⇧',
    enter: '↵', return: '↵',
    backspace: '⌫', delete: '⌦',
    tab: '⇥', escape: 'Esc', esc: 'Esc',
    up: '↑', down: '↓', left: '←', right: '→',
};

/** The key as shown: its symbol when `symbols` is on and it has one, else as written. */
export function displayKey(key: string, symbols: boolean): string {
    return (symbols && SYMBOLS[key.toLowerCase()]) || key;
}
