// The menu builders (menu, context-menu, dropdown-menu, menubar, split-button) read an item's kind
// from `type` only. `{ divider: true }` renders a blank, focusable menuitem, and `checked` or
// `radioGroup` with no `type` a plain menuitem with no check state — and nothing else says so, because
// a .pdx script is not type-checked. Dev builds only, once per item object.

import { DEV } from '@pdxui/core';
import type { MenuItem } from '../menu/pdx-menu';
import { isDevEnv } from './dev-env';

const warned = new WeakSet<object>();

export function warnMisshapenMenuItem(tag: string, item: MenuItem): void {
    if (!item || typeof item !== 'object' || warned.has(item) || !isDevEnv()) return;
    let fix = '';
    if ('divider' in item && item.type !== 'separator') fix = "type: 'separator' (divider is not read)";
    else if (!item.type && item.radioGroup !== undefined) fix = "type: 'radio' (radioGroup alone renders a plain item)";
    else if (!item.type && item.checked !== undefined) fix = "type: 'checkbox' (checked alone renders a plain item)";
    if (!DEV || !fix) return;
    warned.add(item);
    console.warn(`[${tag}] menu item "${item.key}" needs ${fix}.`);
}
